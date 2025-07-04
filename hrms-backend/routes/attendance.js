import express from 'express';
import Attendance from '../models/Attendance.js';
import Employee from '../models/Employee.js';
import Leave from '../models/Leave.js';
import OD from '../models/OD.js';
import Department from '../models/Department.js';
import Notification from '../models/Notification.js';
import auth from '../middleware/auth.js';
import role from '../middleware/role.js';
import XLSX from 'xlsx';
import RawPunchlog from '../models/RawPunchlog.js';
const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    let filter = {};

    // Apply role-based restrictions
    if (req.user.loginType === 'Employee') {
      filter = { employeeId: req.user.employeeId };
    } else if (req.user.loginType === 'HOD') {
      const user = await Employee.findById(req.user.id).populate('department');
      if (!user.department?._id) {
        return res.status(400).json({ message: 'HOD department not found' });
      }
      const employees = await Employee.find({ department: user.department._id }).select('employeeId');
      filter = { employeeId: { $in: employees.map(e => e.employeeId) } };
    }

    // Apply employeeId filter if provided
    if (req.query.employeeId) {
      const employee = await Employee.findOne({ employeeId: req.query.employeeId });
      if (!employee) {
        return res.status(404).json({ message: 'Employee ID not found' });
      }
      if (req.query.departmentId) {
        const department = await Department.findById(req.query.departmentId);
        if (!department) {
          return res.status(400).json({ message: 'Invalid department ID' });
        }
        if (!employee.department.equals(req.query.departmentId)) {
          return res.status(400).json({ message: 'Employee does not belong to the selected department' });
        }
      }
      filter.employeeId = req.query.employeeId;
    } else if (req.query.departmentId) {
      const department = await Department.findById(req.query.departmentId);
      if (!department) {
        return res.status(400).json({ message: 'Invalid department ID' });
      }
      const deptEmployees = await Employee.find({ department: req.query.departmentId }).select('employeeId');
      if (deptEmployees.length === 0) {
        return res.status(404).json({ message: 'No employees found in the selected department' });
      }
      filter.employeeId = { $in: deptEmployees.map(e => e.employeeId) };
    }

    // Apply date range filter
    if (req.query.fromDate) {
      const fromDate = new Date(req.query.fromDate);
      if (isNaN(fromDate)) {
        return res.status(400).json({ message: 'Invalid fromDate format' });
      }
      // Adjust to UTC equivalent of IST start of day
      const fromDateUTC = new Date(fromDate.getTime() - (5.5 * 60 * 60 * 1000));
      fromDateUTC.setUTCHours(0, 0, 0, 0);
      const toDate = req.query.toDate ? new Date(req.query.toDate) : new Date(fromDate);
      if (isNaN(toDate)) {
        return res.status(400).json({ message: 'Invalid toDate format' });
      }
      // Adjust to UTC equivalent of IST end of day
      const toDateUTC = new Date(toDate.getTime() - (5.5 * 60 * 60 * 1000));
      toDateUTC.setUTCHours(23, 59, 59, 999);
      filter.logDate = { $gte: fromDateUTC, $lte: toDateUTC };
    }

    // Apply status filter
    if (req.query.status && req.query.status !== 'all') {
      filter.status = req.query.status;
    }
    console.log('Final filter being used:', JSON.stringify(filter, null, 2));
    console.log('Status filter value:', req.query.status);
    console.log('Date range:', {
      fromDate: req.query.fromDate,
      toDate: req.query.toDate || req.query.fromDate
    });
    // Debug query to check what status values exist
    const matchStage = {
      logDate: { $gte: filter.logDate.$gte, $lte: filter.logDate.$lte }
    };

    // Handle both string and array employeeId cases
    if (filter.employeeId?.$in) {
      matchStage.employeeId = { $in: filter.employeeId.$in };
    } else if (filter.employeeId) {
      matchStage.employeeId = filter.employeeId;
    }

    const statusCounts = await Attendance.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          dates: { $push: { date: "$logDate", employeeId: "$employeeId" } }
        }
      }
    ]);
    
 
    const attendance = await Attendance.find(filter).lean();

    
    // Log duplicates for debugging
    const keyCounts = {};
    attendance.forEach((record) => {
      const key = `${record.employeeId}-${new Date(record.logDate).toISOString().split('T')[0]}`;
      keyCounts[key] = (keyCounts[key] || 0) + 1;
      if (keyCounts[key] > 1) {
        console.warn(`Duplicate attendance record found in backend for key: ${key}`, record);
      }
    });

    console.log(`Fetched ${attendance.length} attendance records for filter:`, filter);
    res.json({ attendance, total: attendance.length });
  } catch (err) {
    console.error('Error fetching attendance:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/absence-alerts', auth, role(['Admin']), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fiveDaysAgo = new Date(today);
    fiveDaysAgo.setDate(today.getDate() - 5);

    const employees = await Employee.find({ status: 'Working' }).select('employeeId department');
    const alerts = [];

    for (const employee of employees) {
      const attendanceRecords = await Attendance.find({
        employeeId: employee.employeeId,
        logDate: { $gte: fiveDaysAgo, $lte: today },
        status: 'Absent',
      }).sort({ logDate: 1 }).lean();

      const leaves = await Leave.find({
        employeeId: employee.employeeId,
        'status.ceo': 'Approved',
        $or: [
          { 'fullDay.from': { $gte: fiveDaysAgo, $lte: today } },
          { 'fullDay.to': { $gte: fiveDaysAgo, $lte: today } },
          { 'halfDay.date': { $gte: fiveDaysAgo, $lte: today } },
        ],
      }).lean();

      const ods = await OD.find({
        employeeId: employee.employeeId,
        'status.ceo': 'Approved',
        dateOut: { $lte: today },
        dateIn: { $gte: fiveDaysAgo },
      }).lean();

      // Create a map of approved leave/OD dates
      const approvedDates = new Set();
      leaves.forEach(leave => {
        if (leave.halfDay?.date) {
          approvedDates.add(new Date(leave.halfDay.date).toISOString().split('T')[0]);
        } else if (leave.fullDay?.from && leave.fullDay?.to) {
          let current = new Date(leave.fullDay.from);
          const to = new Date(leave.fullDay.to);
          while (current <= to) {
            approvedDates.add(current.toISOString().split('T')[0]);
            current.setDate(current.getDate() + 1);
          }
        }
      });
      ods.forEach(od => {
        let current = new Date(od.dateOut);
        const to = new Date(od.dateIn);
        while (current <= to) {
          approvedDates.add(current.toISOString().split('T')[0]);
          current.setDate(current.getDate() + 1);
        }
      });

      // Filter unapproved absences
      const unapprovedAbsences = attendanceRecords.filter(record => {
        const dateStr = new Date(record.logDate).toISOString().split('T')[0];
        return !approvedDates.has(dateStr);
      });

      // Check for consecutive absences
      let consecutiveDays = 0;
      let lastDate = null;
      for (const record of unapprovedAbsences) {
        const currentDate = new Date(record.logDate);
        currentDate.setHours(0, 0, 0, 0);
        if (lastDate && (currentDate - lastDate) / (1000 * 60 * 60 * 24) === 1) {
          consecutiveDays++;
        } else {
          consecutiveDays = 1;
        }
        lastDate = currentDate;
      }

      // Check if a warning notification was already sent for 3-day absence
      const warningSent = consecutiveDays >= 3 ? await Notification.findOne({
        userId: employee.employeeId,
        alertType: 'warning',
        createdAt: { $gte: fiveDaysAgo },
      }) : null;

      if (consecutiveDays === 3 && !warningSent) {
        alerts.push({
          employeeId: employee.employeeId,
          days: consecutiveDays,
        });
      } else if (consecutiveDays === 5) {
        alerts.push({
          employeeId: employee.employeeId,
          days: consecutiveDays,
        });
      }
    }

    res.json(alerts);
  } catch (err) {
    console.error('Error fetching absence alerts:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.post('/send-absence-notification', auth, role(['Admin']), async (req, res) => {
  try {
    const { employeeId, alertType } = req.body;
    if (!employeeId || !['warning', 'termination'].includes(alertType)) {
      return res.status(400).json({ message: 'Invalid employeeId or alertType' });
    }

    const employee = await Employee.findOne({ employeeId }).populate('department');
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    if (alertType === 'warning') {
      await Notification.create({
        userId: employee.employeeId,
        message: `Warning: You have been absent without prior leave approval for 3 consecutive days. Please contact HR immediately.`,
        alertType: 'warning',
      });
      if (global._io) {
        global._io.to(employee.employeeId).emit('notification', {
          message: `Warning: You have been absent without prior leave approval for 3 consecutive days. Please contact HR immediately.`,
        });
      }
    } else if (alertType === 'termination') {
      const hod = await Employee.findOne({ department: employee.department._id, loginType: 'HOD' });
      const ceo = await Employee.findOne({ loginType: 'CEO' });

      await Notification.create([
        {
          userId: employee.employeeId,
          message: `Termination Notice: You have been absent without prior leave approval for 5 consecutive days. Your employment may be terminated. Please contact HR immediately.`,
          alertType: 'termination',
        },
        ...(hod ? [{
          userId: hod.employeeId,
          message: `Termination Notice: Employee ${employee.name} (${employee.employeeId}) has been absent without prior leave approval for 5 consecutive days.`,
          alertType: 'termination',
        }] : []),
        ...(ceo ? [{
          userId: ceo.employeeId,
          message: `Termination Notice: Employee ${employee.name} (${employee.employeeId}) has been absent without prior leave approval for 5 consecutive days.`,
          alertType: 'termination',
        }] : []),
      ]);

      if (global._io) {
        global._io.to(employee.employeeId).emit('notification', {
          message: `Termination Notice: You have been absent without prior leave approval for 5 consecutive days. Your employment may be terminated. Please contact HR immediately.`,
        });
        if (hod) {
          global._io.to(hod.employeeId).emit('notification', {
            message: `Termination Notice: Employee ${employee.name} (${employee.employeeId}) has been absent without prior leave approval for 5 consecutive days.`,
          });
        }
        if (ceo) {
          global._io.to(ceo.employeeId).emit('notification', {
            message: `Termination Notice: Employee ${employee.name} (${employee.employeeId}) has been absent without prior leave approval for 5 consecutive days.`,
          });
        }
      }
    }

    res.json({ message: 'Notification sent successfully' });
  } catch (err) {
    console.error('Error sending absence notification:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/download', auth, async (req, res) => {
  try {
    let filter = {};

    // Apply role-based restrictions
    if (req.user.loginType === 'Employee') {
      filter = { employeeId: req.user.employeeId };
    } else if (req.user.loginType === 'HOD') {
      const user = await Employee.findById(req.user.id).populate('department');
      if (!user.department?._id) {
        return res.status(400).json({ message: 'HOD department not found' });
      }
      const employees = await Employee.find({ department: user.department._id }).select('employeeId');
      filter = { employeeId: { $in: employees.map(e => e.employeeId) } };
    }

    // Apply employeeId filter if provided
    if (req.query.employeeId) {
      const employee = await Employee.findOne({ employeeId: req.query.employeeId });
      if (!employee) {
        return res.status(404).json({ message: 'Employee ID not found' });
      }
      if (req.query.departmentId) {
        const department = await Department.findById(req.query.departmentId);
        if (!department) {
          return res.status(400).json({ message: 'Invalid department ID' });
        }
        if (!employee.department.equals(req.query.departmentId)) {
          return res.status(400).json({ message: 'Employee does not belong to the selected department' });
        }
      }
      filter.employeeId = req.query.employeeId;
    } else if (req.query.departmentId) {
      const department = await Department.findById(req.query.departmentId);
      if (!department) {
        return res.status(400).json({ message: 'Invalid department ID' });
      }
      const deptEmployees = await Employee.find({ department: req.query.departmentId }).select('employeeId');
      if (deptEmployees.length === 0) {
        return res.status(404).json({ message: 'No employees found in the selected department' });
      }
      filter.employeeId = { $in: deptEmployees.map(e => e.employeeId) };
    }

    // Apply date range filter
    if (req.query.fromDate) {
      const fromDate = new Date(req.query.fromDate);
      if (isNaN(fromDate)) {
        return res.status(400).json({ message: 'Invalid fromDate format' });
      }
      // Adjust to UTC equivalent of IST start of day
      const fromDateUTC = new Date(fromDate.getTime() - (5.5 * 60 * 60 * 1000));
      fromDateUTC.setUTCHours(0, 0, 0, 0);
      const toDate = req.query.toDate ? new Date(req.query.toDate) : new Date(fromDate);
      if (isNaN(toDate)) {
        return res.status(400).json({ message: 'Invalid toDate format' });
      }
      // Adjust to UTC equivalent of IST end of day
      const toDateUTC = new Date(toDate.getTime() - (5.5 * 60 * 60 * 1000));
      toDateUTC.setUTCHours(23, 59, 59, 999);
      filter.logDate = { $gte: fromDateUTC, $lte: toDateUTC };
    }

    // Apply status filter
    if (req.query.status && req.query.status !== 'all') {
      filter.status = req.query.status;
    }

    const attendance = await Attendance.find(filter).lean();

    // Log duplicates for debugging
    const keyCounts = {};
    attendance.forEach((record) => {
      const key = `${record.employeeId}-${new Date(record.logDate).toISOString().split('T')[0]}`;
      keyCounts[key] = (keyCounts[key] || 0) + 1;
      if (keyCounts[key] > 1) {
        console.warn(`Duplicate attendance record found in backend for key: ${key}`, record);
      }
    });

    console.log(`Fetched ${attendance.length} attendance records for download with filter:`, filter);

    // Fetch employee details for department information
    const employeeIds = [...new Set(attendance.map(record => record.employeeId))];
    const employees = await Employee.find({ employeeId: { $in: employeeIds } })
      .populate('department')
      .lean();
    const employeeMap = employees.reduce((map, emp) => {
      map[emp.employeeId] = emp.department ? emp.department.name : 'Unknown';
      return map;
    }, {});

    // Fetch approved leaves
    const leaves = await Leave.find({
      $or: [
        { 'fullDay.from': { $gte: filter.logDate?.$gte, $lte: filter.logDate?.$lte } },
        { 'halfDay.date': { $gte: filter.logDate?.$gte, $lte: filter.logDate?.$lte } },
      ],
      'status.ceo': 'Approved',
    }).lean();

    // Fetch approved ODs
    const ods = await OD.find({
      dateOut: { $lte: filter.logDate?.$lte },
      dateIn: { $gte: filter.logDate?.$gte },
      'status.ceo': 'Approved',
    }).lean();

    // Create leave map
    const leaveMap = {};
    leaves.forEach(leave => {
      const dateKey = leave.halfDay?.date
        ? new Date(leave.halfDay.date).toISOString().split('T')[0]
        : new Date(leave.fullDay.from).toISOString().split('T')[0];
      const employeeKey = leave.employeeId;
      if (!leaveMap[employeeKey]) leaveMap[employeeKey] = {};
      leaveMap[employeeKey][dateKey] = leave.halfDay ? `(L) ${leave.halfDay.session === 'forenoon' ? 'First Half' : 'Second Half'}` : '(L)';
    });

    // Create OD map
    const odMap = {};
    ods.forEach(od => {
      const startDate = new Date(od.dateOut);
      const endDate = new Date(od.dateIn);
      const employeeKey = od.employeeId;
      if (!odMap[employeeKey]) odMap[employeeKey] = {};
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateKey = d.toISOString().split('T')[0];
        odMap[employeeKey][dateKey] = '(OD)';
      }
    });

    const data = attendance.map((record, index) => {
      const dateStr = new Date(record.logDate).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      const leaveStatus = leaveMap[record.employeeId]?.[new Date(record.logDate).toISOString().split('T')[0]] || '';
      const odStatus = odMap[record.employeeId]?.[new Date(record.logDate).toISOString().split('T')[0]] || '';
      const status = leaveStatus || odStatus || (record.status === 'Absent' ? '(A)' : '');
      return {
        'Serial Number': index + 1,
        'Name of Employee': record.name,
        'Department': employeeMap[record.employeeId] || 'Unknown',
        'Date': `${dateStr} ${status}`,
        'Time In': record.timeIn || '-',
        'Time Out': record.timeOut || '-',
        'Status': record.status + (record.halfDay ? ` (${record.halfDay})` : ''),
        'OT': record.ot ? `${Math.floor(record.ot / 60)}:${(record.ot % 60).toString().padStart(2, '0')}` : '00:00',
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename=attendance_${req.query.status || 'all'}_${req.query.fromDate}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    console.error('Error generating Excel:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.post('/test', auth, async (req, res) => {
  try {
    const {
      
      UserID,
      LogDate,
     LogTime,
      Direction,
      processed,
      
    } = req.body;

    const newAttendance = new RawPunchlog({
     UserID,
      LogDate,
     LogTime,
      Direction,
      processed,
    });

    const savedAttendance = await newAttendance.save();
    res.status(201).json({
      message: 'Attendance record saved successfully',
      data: savedAttendance,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
});

export default router;
