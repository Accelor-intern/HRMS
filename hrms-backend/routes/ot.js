import express from 'express';
import OTClaim from '../models/OTClaim.js';
import Employee from '../models/Employee.js';
import Notification from '../models/Notification.js';
import Audit from '../models/Audit.js';
import Attendance from '../models/Attendance.js';
import Leave from '../models/Leave.js';
import OD from '../models/OD.js';
import auth from '../middleware/auth.js';
import role from '../middleware/role.js';
import Department from '../models/Department.js';
import { toIST, formatForDB, formatForDisplay, parseDate, validateDate, startOfDay, endOfDay, now } from '../utils/dateUtils.js';
const router = express.Router();

// Helper function to format OT dates for response
const formatOTDates = (otClaim) => {
  return {
    ...otClaim._doc,
    date: formatForDisplay(otClaim.date, 'YYYY-MM-DD'),
    createdAt: formatForDisplay(otClaim.createdAt, 'YYYY-MM-DD HH:mm:ss'),
  };
};

// Submit OT
router.post('/', auth, role(['Employee', 'HOD', 'Admin']), async (req, res) => {
  try {
    const user = await Employee.findById(req.user.id).populate('department');
    if (!user) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    if (!user.designation) {
      return res.status(400).json({ message: 'Employee designation is required' });
    }
    if (!user.department) {
      return res.status(400).json({ message: 'Employee department is required' });
    }

    const { date, hours, projectName, description, claimType } = req.body;
    if (!date || !hours || !projectName || !description || !claimType) {
      return res.status(400).json({ message: 'Date, hours, project details, and claim type are required' });
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ message: 'Invalid date format (expected YYYY-MM-DD)' });
    }

    const otDate = parseDate(date);
    if (!validateDate(otDate)) {
      return res.status(400).json({ message: 'Invalid date' });
    }
    if (hours < 1 || hours > 24) {
      return res.status(400).json({ message: 'Hours must be between 1 and 24' });
    }

    // Get start and end of day in IST
    const otDayStart = startOfDay(otDate);
    const otDayEnd = endOfDay(otDate);
    
    // Convert to UTC for database storage and queries
    const otDayStartUTC = formatForDB(otDayStart);
    const otDayEndUTC = formatForDB(otDayEnd);

    // Check for overlapping OT claims or leaves
    const overlappingRequests = await Promise.all([
      OTClaim.find({
        employee: user._id,
        date: { $gte: otDayStartUTC, $lte: otDayEndUTC },
        $or: [
          { 'status.hod': { $in: ['Pending', 'Approved', 'Submitted'] } },
          { 'status.ceo': { $in: ['Pending', 'Approved'] } },
          { 'status.admin': { $in: ['Pending', 'Acknowledged'] } }
        ]
      }),
      Leave.find({
        employee: user._id,
        $or: [
          { 'dates.from': { $lte: otDayEndUTC }, 'dates.to': { $gte: otDayStartUTC } },
          { 'dates.from': { $gte: otDayStartUTC, $lte: otDayEndUTC } },
          { 'dates.to': { $gte: otDayStartUTC, $lte: otDayEndUTC } }
        ],
        $and: [
          { 'status.hod': { $ne: 'Rejected' } },
          { 'status.ceo': { $ne: 'Rejected' } },
          { 'status.admin': { $in: ['Pending', 'Acknowledged'] } }
        ]
      }),
      OD.find({
        employee: user._id,
        $or: [
          { dateOut: { $lte: otDayEndUTC }, dateIn: { $gte: otDayStartUTC } },
          { dateOut: { $gte: otDayStartUTC, $lte: otDayEndUTC } },
          { dateIn: { $gte: otDayStartUTC, $lte: otDayEndUTC } }
        ],
        $or: [
          { 'status.hod': { $in: ['Pending', 'Approved', 'Submitted'] } },
          { 'status.ceo': { $in: ['Pending', 'Approved'] } },
          { 'status.admin': { $in: ['Pending', 'Acknowledged'] } }
        ]
      })
    ]);

    const [overlappingOTs, overlappingLeaves, overlappingODs] = overlappingRequests;
    if (overlappingOTs.length > 0) {
      return res.status(400).json({
        message: `You already have an OT claim on ${formatForDisplay(otDate, 'YYYY-MM-DD')}`
      });
    }
    if (overlappingLeaves.length > 0) {
      const leaveDetails = overlappingLeaves[0];
      return res.status(400).json({
        message: `You have a leave request from ${formatForDisplay(leaveDetails.dates.from, 'YYYY-MM-DD')} to ${formatForDisplay(leaveDetails.dates.to, 'YYYY-MM-DD')}`
      });
    }
    if (overlappingODs.length > 0) {
      const odDetails = overlappingODs[0];
      return res.status(400).json({
        message: `You have an OD request from ${formatForDisplay(odDetails.dateOut, 'YYYY-MM-DD')} to ${formatForDisplay(odDetails.dateIn, 'YYYY-MM-DD')}`
      });
    }

    // Calculate claim deadline (11:59 PM IST of next day)
    const claimDeadline = toIST(otDayEnd).add(1, 'day');
    if (toIST(now()).isAfter(claimDeadline)) {
      return res.status(400).json({
        message: 'OT claim must be submitted by 11:59 PM the next day',
        deadline: formatForDisplay(claimDeadline, 'YYYY-MM-DD HH:mm:ss')
      });
    }

    const eligibleDepartments = ['Production', 'Mechanical', 'AMETL'];
    const eligibleDesignations = ['Technician', 'Sr. Technician', 'Junior Engineer'];
    const isEligible = eligibleDepartments.includes(user.department.name) && eligibleDesignations.includes(user.designation);
    const isSunday = toIST(otDate).day() === 0;

    const attendanceRecord = await Attendance.findOne({
      employeeId: user.employeeId,
      logDate: { $gte: otDayStartUTC, $lte: otDayEndUTC },
    });
    if (!attendanceRecord) {
      return res.status(400).json({
        message: 'No attendance recorded for this date',
        date: formatForDisplay(otDate, 'YYYY-MM-DD'),
        timezone: 'IST'
      });
    }
    const recordedOtHours = attendanceRecord.ot / 60;
    if (hours > recordedOtHours) {
      return res.status(400).json({ message: `Claimed hours (${hours}) exceed recorded OT (${recordedOtHours.toFixed(1)})` });
    }

    let compensatoryHours = 0;
    let paymentAmount = 0;

    if (isEligible) {
      paymentAmount = hours * 500 * 1.5; // Example rate
    } else if (isSunday) {
      if (hours < 4) {
        return res.status(400).json({ message: 'Compensatory leave requires at least 4 hours' });
      }
      compensatoryHours = hours >= 8 ? 8 : 4;
    } else {
      return res.status(400).json({ message: 'OT claims are not allowed for non-eligible employees on non-Sundays' });
    }

    const status = {
      hod: req.user.role === 'Employee' ? 'Pending' : req.user.role === 'HOD' ? 'Submitted' : 'Approved',
      ceo: 'Pending',
      admin: 'Pending'
    };

    const otClaim = new OTClaim({
      employeeId: user.employeeId,
      employee: user._id,
      name: user.name,
      department: user.department,
      date: formatForDB(otDate),
      hours,
      projectName,
      description,
      claimType,
      compensatoryHours,
      paymentAmount,
      status
    });

    await otClaim.save();

    if (req.user.role === 'HOD' || req.user.role === 'Admin') {
      const ceo = await Employee.findOne({ loginType: 'CEO' });
      if (ceo) {
        await Notification.create({
          userId: ceo.employeeId,
          message: `New OT claim from ${user.name} for ${formatForDisplay(otDate, 'DD MMMM YYYY')}`
        });
        if (global._io) {
          global._io.to(ceo.employeeId).emit('notification', {
            message: `New OT claim from ${user.name} for ${formatForDisplay(otDate, 'DD MMMM YYYY')}`
          });
        }
      }
    } else {
      const hod = await Employee.findOne({ department: user.department, loginType: 'HOD' });
      if (hod) {
        await Notification.create({
          userId: hod.employeeId,
          message: `New OT claim from ${user.name} for ${formatForDisplay(otDate, 'DD MMMM YYYY')}`
        });
        if (global._io) {
          global._io.to(hod.employeeId).emit('notification', {
            message: `New OT claim from ${user.name} for ${formatForDisplay(otDate, 'DD MMMM YYYY')}`
          });
        }
      }
    }

    await Audit.create({
      user: user.employeeId,
      action: 'Submit OT',
      details: `Submitted OT claim for ${hours} hours on ${formatForDisplay(otDate, 'YYYY-MM-DD')}`
    });

    res.status(201).json(formatOTDates(otClaim));
  } catch (err) {
    console.error('OT submit error:', err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get OTs
router.get('/', auth, async (req, res) => {
  try {
    const user = await Employee.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    let query = {};
    const {
      employeeId,
      departmentId,
      status,
      fromDate,
      toDate,
      page = 1,
      limit = 10
    } = req.query;

    if (employeeId) {
      if (!/^[A-Za-z0-9]+$/.test(employeeId)) {
        return res.status(400).json({ message: 'Invalid Employee ID format' });
      }
      const employee = await Employee.findOne({ employeeId });
      if (!employee) {
        return res.status(404).json({ message: 'Employee not found' });
      }
      query.employeeId = employeeId;
    }

    if (departmentId && departmentId !== 'all') {
      const department = await Department.findById(departmentId);
      if (!department) {
        return res.status(404).json({ message: 'Department not found' });
      }
      query.department = departmentId;
    }

    if (req.user.role === 'Employee') {
      query.employeeId = user.employeeId;
    } else if (req.user.role === 'HOD') {
      query.department = user.department;
    }

    if (status && status !== 'all') {
      query.$or = [
        { 'status.hod': status },
        { 'status.ceo': status },
        { 'status.admin': status }
      ];
    }

    if (fromDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
        return res.status(400).json({ message: 'Invalid fromDate format (expected YYYY-MM-DD)' });
      }
      const startDate = parseDate(fromDate);
      if (!validateDate(startDate)) {
        return res.status(400).json({ message: 'Invalid fromDate' });
      }
      query.date = { $gte: formatForDB(startDate) };
    }

    if (toDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
        return res.status(400).json({ message: 'Invalid toDate format (expected YYYY-MM-DD)' });
      }
      const endDate = parseDate(toDate);
      if (!validateDate(endDate)) {
        return res.status(400).json({ message: 'Invalid toDate' });
      }
      query.date = query.date || {};
      query.date.$lte = formatForDB(endDate);
    }

    const total = await OTClaim.countDocuments(query);
    const otClaims = await OTClaim.find(query)
      .populate('department', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const formattedClaims = otClaims.map(formatOTDates);

    res.json({
      otClaims: formattedClaims,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error('Fetch OTs error:', err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Approve OT
router.put('/:id/approve', auth, role(['HOD', 'CEO', 'Admin']), async (req, res) => {
  try {
    const otClaim = await OTClaim.findById(req.params.id).populate('employee department');
    if (!otClaim) {
      return res.status(404).json({ message: 'OT claim not found' });
    }

    const user = await Employee.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { status, remarks } = req.body;
    const currentStage = req.user.role.toLowerCase();
    const validStatuses = req.user.role === 'Admin' ? ['Acknowledged'] : ['Approved', 'Rejected'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Must be one of ${validStatuses.join(', ')}` });
    }

    if (otClaim.status[currentStage] !== 'Pending') {
      return res.status(400).json({ message: `OT claim is not pending ${currentStage.toUpperCase()} approval` });
    }

    if (status === 'Rejected' && ['hod', 'ceo'].includes(currentStage) && (!remarks || remarks.trim() === '')) {
      return res.status(400).json({ message: 'Remarks are required for rejection' });
    }

    if (req.user.role === 'HOD' && user.department.toString() !== otClaim.department.toString()) {
      return res.status(403).json({ message: 'Not authorized to approve OT claims for this department' });
    }

    if (req.user.role === 'CEO' && !['Approved', 'Submitted'].includes(otClaim.status.hod)) {
      return res.status(400).json({ message: 'OT claim must be approved or submitted by HOD first' });
    }

    if (req.user.role === 'Admin' && otClaim.status.ceo !== 'Approved') {
      return res.status(400).json({ message: 'OT claim must be approved by CEO first' });
    }

    otClaim.status[currentStage] = status;
    if (status === 'Rejected' && ['hod', 'ceo'].includes(currentStage)) {
      otClaim.remarks = remarks;
    }

    if (['Approved', 'Submitted'].includes(status) && currentStage === 'hod') {
      otClaim.status.ceo = 'Pending';
      const ceo = await Employee.findOne({ loginType: 'CEO' });
      if (ceo) {
        await Notification.create({
          userId: ceo.employeeId,
          message: `OT claim from ${otClaim.name} for ${formatForDisplay(otClaim.date, 'DD MMMM YYYY')} awaiting CEO approval`
        });
        if (global._io) {
          global._io.to(ceo.employeeId).emit('notification', {
            message: `OT claim from ${otClaim.name} for ${formatForDisplay(otClaim.date, 'DD MMMM YYYY')} awaiting CEO approval`
          });
        }
      }
    } else if (status === 'Approved' && currentStage === 'ceo') {
      otClaim.status.admin = 'Pending';
      const admin = await Employee.findOne({ loginType: 'Admin' });
      if (admin) {
        await Notification.create({
          userId: admin.employeeId,
          message: `OT claim from ${otClaim.name} for ${formatForDisplay(otClaim.date, 'DD MMMM YYYY')} awaiting Admin acknowledgment`
        });
        if (global._io) {
          global._io.to(admin.employeeId).emit('notification', {
            message: `OT claim from ${otClaim.name} for ${formatForDisplay(otClaim.date, 'DD MMMM YYYY')} awaiting Admin acknowledgment`
          });
        }
      }
    } else if (status === 'Acknowledged' && currentStage === 'admin') {
      const employee = await Employee.findById(otClaim.employee);
      if (employee && otClaim.compensatoryHours > 0) {
        employee.compensatoryAvailable.push({
          hours: otClaim.compensatoryHours,
          date: otClaim.date,
          status: 'Available'
        });
        await employee.save();
      }
    }

    await otClaim.save();
    await Audit.create({
      user: user.employeeId,
      action: `${status} OT`,
      details: `${status} OT claim for ${otClaim.name} on ${formatForDisplay(otClaim.date, 'YYYY-MM-DD')}`
    });

    const employee = await Employee.findById(otClaim.employee);
    if (employee) {
      await Notification.create({
        userId: employee.employeeId,
        message: `Your OT claim for ${formatForDisplay(otClaim.date, 'DD MMMM YYYY')} has been ${status.toLowerCase()} by ${currentStage.toUpperCase()}`
      });
      if (global._io) {
        global._io.to(employee.employeeId).emit('notification', {
          message: `Your OT claim for ${formatForDisplay(otClaim.date, 'DD MMMM YYYY')} has been ${status.toLowerCase()} by ${currentStage.toUpperCase()}`
        });
      }
    }

    res.json(formatOTDates(otClaim));
  } catch (err) {
    console.error('OT approval error:', err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Test Route (aligned with production logic)
router.post('/test', auth, async (req, res) => {
  try {
    const user = await Employee.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const { employeeId, date, hours, projectDetails } = req.body;
    if (!employeeId || !date || !hours || !projectDetails) {
      return res.status(400).json({ message: 'Employee ID, date, hours, and project details are required' });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ message: 'Invalid date format (expected YYYY-MM-DD)' });
    }

    const targetEmployee = await Employee.findOne({ employeeId });
    if (!targetEmployee) {
      return res.status(404).json({ message: 'Target employee not found' });
    }

    const otDate = parseDate(date);
    if (!validateDate(otDate)) {
      return res.status(400).json({ message: 'Invalid date' });
    }

    const otClaim = new OTClaim({
      employeeId,
      date: formatForDB(otDate),
      hours,
      projectDetails,
      department: targetEmployee.department,
      name: targetEmployee.name,
      employee: targetEmployee._id,
    });

    const savedOT = await otClaim.save();
    res.json({ message: 'Test OT claim saved', data: formatOTDates(savedOT) });
  } catch (err) {
    console.error('OT test error:', err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

export default router;