import express from 'express';
import OD from '../models/OD.js';
import Employee from '../models/Employee.js';
import Notification from '../models/Notification.js';
import Audit from '../models/Audit.js';
import auth from '../middleware/auth.js';
import role from '../middleware/role.js';
import Department from '../models/Department.js';
import Leave from '../models/Leave.js';
import { toIST, formatForDB, formatForDisplay, parseDate, validateDate, startOfDay, endOfDay, now } from '../utils/dateUtils.js';
const router = express.Router();

// Helper function to format OD dates for response
const formatODDates = (od) => {
  return {
    ...od._doc,
    dateOut: formatForDisplay(od.dateOut, 'YYYY-MM-DD'),
    dateIn: formatForDisplay(od.dateIn, 'YYYY-MM-DD'),
    createdAt: formatForDisplay(od.createdAt, 'YYYY-MM-DD HH:mm:ss'),
  };
};

// Validate time format (HH:mm)
const validateTime = (time) => {
  return /^\d{2}:\d{2}$/.test(time);
};

// Submit OD
router.post('/', auth, role(['Employee', 'HOD', 'Admin']), async (req, res) => {
  try {
    const user = await Employee.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    if (!user.designation) {
      return res.status(400).json({ message: 'Employee designation is required' });
    }
    if (!user.department) {
      return res.status(400).json({ message: 'Employee department is required' });
    }

    const { dateOut, dateIn, timeOut, timeIn, purpose, placeUnitVisit } = req.body;
    if (!dateOut || !dateIn || !timeOut || !timeIn || !purpose || !placeUnitVisit) {
      return res.status(400).json({ message: 'All required fields must be provided' });
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOut)) {
      return res.status(400).json({ message: 'Invalid dateOut format (expected YYYY-MM-DD)' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIn)) {
      return res.status(400).json({ message: 'Invalid dateIn format (expected YYYY-MM-DD)' });
    }

    // Validate time format
    if (!validateTime(timeOut)) {
      return res.status(400).json({ message: 'Invalid timeOut format (expected HH:mm)' });
    }
    if (!validateTime(timeIn)) {
      return res.status(400).json({ message: 'Invalid timeIn format (expected HH:mm)' });
    }

    const today = startOfDay(toIST(new Date()));
    const outDate = parseDate(dateOut);
    if (!validateDate(outDate)) {
      return res.status(400).json({ message: 'Invalid Date Out' });
    }
    if (toIST(outDate).isBefore(today)) {
      return res.status(400).json({ message: 'Date Out cannot be in the past' });
    }
    const inDate = parseDate(dateIn);
    if (!validateDate(inDate)) {
      return res.status(400).json({ message: 'Invalid Date In' });
    }
    if (toIST(inDate).isBefore(outDate)) {
      return res.status(400).json({ message: 'Date In cannot be before Date Out' });
    }

    // Check for overlapping OD or Leave requests
    const overlappingRequests = await Promise.all([
      OD.find({
        employee: user._id,
        $or: [
          { dateOut: { $lte: formatForDB(inDate) }, dateIn: { $gte: formatForDB(outDate) } },
          { dateOut: { $gte: formatForDB(outDate), $lte: formatForDB(inDate) } },
          { dateIn: { $gte: formatForDB(outDate), $lte: formatForDB(inDate) } }
        ],
        $or: [
          { 'status.hod': { $in: ['Pending', 'Approved', 'Submitted'] } },
          { 'status.ceo': { $in: ['Pending', 'Approved'] } },
          { 'status.admin': { $in: ['Pending', 'Acknowledged'] } }
        ]
      }),
      Leave.find({
        employee: user._id,
        $or: [
          { 'dates.from': { $lte: formatForDB(inDate) }, 'dates.to': { $gte: formatForDB(outDate) } },
          { 'dates.from': { $gte: formatForDB(outDate), $lte: formatForDB(inDate) } },
          { 'dates.to': { $gte: formatForDB(outDate), $lte: formatForDB(inDate) } }
        ],
        $and: [
          { 'status.hod': { $ne: 'Rejected' } },
          { 'status.ceo': { $ne: 'Rejected' } },
          { 'status.admin': { $in: ['Pending', 'Acknowledged'] } }
        ]
      })
    ]);

    const [overlappingODs, overlappingLeaves] = overlappingRequests;
    if (overlappingODs.length > 0) {
      const odDetails = overlappingODs[0];
      return res.status(400).json({
        message: `You already have an OD request from ${formatForDisplay(odDetails.dateOut, 'YYYY-MM-DD')} to ${formatForDisplay(odDetails.dateIn, 'YYYY-MM-DD')}`
      });
    }
    if (overlappingLeaves.length > 0) {
      const leaveDetails = overlappingLeaves[0];
      return res.status(400).json({
        message: `You have a leave request from ${formatForDisplay(leaveDetails.dates.from, 'YYYY-MM-DD')} to ${formatForDisplay(leaveDetails.dates.to, 'YYYY-MM-DD')}`
      });
    }

    const status = {
      hod: req.user.role === 'Employee' ? 'Pending' : req.user.role === 'HOD' ? 'Submitted' : 'Approved',
      ceo: 'Pending',
      admin: 'Pending'
    };

    const od = new OD({
      employeeId: user.employeeId,
      employee: user._id,
      name: user.name,
      dateOut: formatForDB(outDate),
      dateIn: formatForDB(inDate),
      designation: user.designation,
      department: user.department,
      timeOut,
      timeIn,
      purpose,
      placeUnitVisit,
      status
    });

    await od.save();

    if (req.user.role === 'HOD' || req.user.role === 'Admin') {
      const ceo = await Employee.findOne({ loginType: 'CEO' });
      if (ceo) {
        await Notification.create({
          userId: ceo.employeeId,
          message: `New OD request from ${user.name} for ${formatForDisplay(outDate, 'DD MMMM YYYY')} to ${formatForDisplay(inDate, 'DD MMMM YYYY')}`
        });
        if (global._io) {
          global._io.to(ceo.employeeId).emit('notification', {
            message: `New OD request from ${user.name} for ${formatForDisplay(outDate, 'DD MMMM YYYY')} to ${formatForDisplay(inDate, 'DD MMMM YYYY')}`
          });
        }
      }
    } else {
      const hod = await Employee.findOne({ department: user.department, loginType: 'HOD' });
      if (hod) {
        await Notification.create({
          userId: hod.employeeId,
          message: `New OD request from ${user.name} for ${formatForDisplay(outDate, 'DD MMMM YYYY')} to ${formatForDisplay(inDate, 'DD MMMM YYYY')}`
        });
        if (global._io) {
          global._io.to(hod.employeeId).emit('notification', {
            message: `New OD request from ${user.name} for ${formatForDisplay(outDate, 'DD MMMM YYYY')} to ${formatForDisplay(inDate, 'DD MMMM YYYY')}`
          });
        }
      }
    }

    await Audit.create({ user: user.employeeId, action: 'Submit OD', details: 'Submitted OD request' });

    res.status(201).json(formatODDates(od));
  } catch (err) {
    console.error('OD submit error:', err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get ODs
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
      query.dateOut = { $gte: formatForDB(startDate) };
    }

    if (toDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
        return res.status(400).json({ message: 'Invalid toDate format (expected YYYY-MM-DD)' });
      }
      const endDate = parseDate(toDate);
      if (!validateDate(endDate)) {
        return res.status(400).json({ message: 'Invalid toDate' });
      }
      query.dateIn = { $lte: formatForDB(endDate) };
    }

    const total = await OD.countDocuments(query);
    const odRecords = await OD.find(query)
      .populate('department', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const formattedRecords = odRecords.map(formatODDates);

    res.json({ odRecords: formattedRecords, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('Fetch ODs error:', err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Approve OD
router.put('/:id/approve', auth, role(['HOD', 'CEO', 'Admin']), async (req, res) => {
  try {
    const od = await OD.findById(req.params.id).populate('employee');
    if (!od) {
      return res.status(404).json({ message: 'OD request not found' });
    }

    const user = await Employee.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { status } = req.body;
    const currentStage = req.user.role.toLowerCase();
    const validStatuses = req.user.role === 'Admin' ? ['Acknowledged'] : ['Approved', 'Rejected'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Must be one of ${validStatuses.join(', ')}` });
    }

    if (od.status[currentStage] !== 'Pending') {
      return res.status(400).json({ message: `OD is not pending ${currentStage.toUpperCase()} approval` });
    }

    if (req.user.role === 'HOD' && user.department.toString() !== od.department.toString()) {
      return res.status(403).json({ message: 'Not authorized to approve ODs for this department' });
    }

    if (req.user.role === 'CEO' && !['Approved', 'Submitted'].includes(od.status.hod)) {
      return res.status(400).json({ message: 'OD must be approved or submitted by HOD first' });
    }

    if (req.user.role === 'Admin' && od.status.ceo !== 'Approved') {
      return res.status(400).json({ message: 'OD must be approved by CEO first' });
    }

    od.status[currentStage] = status;

    if (status === 'Approved' && currentStage === 'hod') {
      od.status.ceo = 'Pending';
      const ceo = await Employee.findOne({ loginType: 'CEO' });
      if (ceo) {
        await Notification.create({
          userId: ceo.employeeId,
          message: `OD request from ${od.name} for ${formatForDisplay(od.dateOut, 'DD MMMM YYYY')} to ${formatForDisplay(od.dateIn, 'DD MMMM YYYY')} awaiting CEO approval`
        });
        if (global._io) {
          global._io.to(ceo.employeeId).emit('notification', {
            message: `OD request from ${od.name} for ${formatForDisplay(od.dateOut, 'DD MMMM YYYY')} to ${formatForDisplay(od.dateIn, 'DD MMMM YYYY')} awaiting CEO approval`
          });
        }
      }
    } else if (['Approved', 'Submitted'].includes(status) && currentStage === 'ceo') {
      od.status.admin = 'Pending';
      const admin = await Employee.findOne({ loginType: 'Admin' });
      if (admin) {
        await Notification.create({
          userId: admin.employeeId,
          message: `OD request from ${od.name} for ${formatForDisplay(od.dateOut, 'DD MMMM YYYY')} to ${formatForDisplay(od.dateIn, 'DD MMMM YYYY')} awaiting Admin acknowledgment`
        });
        if (global._io) {
          global._io.to(admin.employeeId).emit('notification', {
            message: `OD request from ${od.name} for ${formatForDisplay(od.dateOut, 'DD MMMM YYYY')} to ${formatForDisplay(od.dateIn, 'DD MMMM YYYY')} awaiting Admin acknowledgment`
          });
        }
      }
    }

    await od.save();
    await Audit.create({ user: user.employeeId, action: `${status} OD`, details: `${status} OD request for ${od.name}` });

    const employee = await Employee.findById(od.employee);
    if (employee) {
      await Notification.create({
        userId: employee.employeeId,
        message: `Your OD request for ${formatForDisplay(od.dateOut, 'DD MMMM YYYY')} to ${formatForDisplay(od.dateIn, 'DD MMMM YYYY')} has been ${status.toLowerCase()} by ${currentStage.toUpperCase()}`
      });
      if (global._io) {
        global._io.to(employee.employeeId).emit('notification', {
          message: `Your OD request for ${formatForDisplay(od.dateOut, 'DD MMMM YYYY')} to ${formatForDisplay(od.dateIn, 'DD MMMM YYYY')} has been ${status.toLowerCase()} by ${currentStage.toUpperCase()}`
        });
      }
    }

    res.json(formatODDates(od));
  } catch (err) {
    console.error('OD approval error:', err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

export default router;