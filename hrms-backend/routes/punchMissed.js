import express from 'express';
import moment from 'moment-timezone';
import PunchMissed from '../models/PunchMissed.js';
import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import Notification from '../models/Notification.js';
import auth from '../middleware/auth.js';
import role from '../middleware/role.js';
import {
  toIST,
  startOfDay,
  formatForDB,
  formatForDisplay,
  parseDate,
  validateDate,
  now,
  IST_TIMEZONE,
} from '../utils/dateUtils.js';

const router = express.Router();

// Helper function to parse and validate time input (e.g., "10:30 AM") in IST
const parseTimeInput = (timeString, dateIST) => {
  try {
    const timeMoment = moment.tz(timeString, 'h:mm A', IST_TIMEZONE);
    if (!timeMoment.isValid()) {
      throw new Error('Invalid time format');
    }
    // Combine with dateIST to create a full datetime in IST
    const date = toIST(dateIST);
    timeMoment.set({
      year: date.year(),
      month: date.month(),
      date: date.date(),
    });
    return timeMoment;
  } catch (error) {
    throw new Error('Failed to parse time input: ' + error.message);
  }
};

router.get('/check-limit', auth, role(['Employee', 'HOD', 'Admin']), async (req, res) => {
  try {
    const employee = await Employee.findOne({ employeeId: req.user.employeeId });
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    const today = startOfDay(now()); // Set to IST midnight
    const currentMonth = today.month();
    const currentYear = today.year();
    const lastSubmission = employee.lastPunchMissedSubmission
      ? toIST(employee.lastPunchMissedSubmission)
      : null;
    const canSubmit =
      !lastSubmission ||
      lastSubmission.month() !== currentMonth ||
      lastSubmission.year() !== currentYear;
    res.json({ canSubmit });
  } catch (err) {
    console.error('Error checking submission limit:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.post('/', auth, role(['Employee', 'HOD', 'Admin']), async (req, res) => {
  try {
    const { punchMissedDate, when, yourInput, reason } = req.body;
    const employee = await Employee.findOne({ employeeId: req.user.employeeId });
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    const today = startOfDay(now()); // Set to IST midnight
    const currentMonth = today.month();
    const currentYear = today.year();
    const lastSubmission = employee.lastPunchMissedSubmission
      ? toIST(employee.lastPunchMissedSubmission)
      : null;
    if (
      lastSubmission &&
      lastSubmission.month() === currentMonth &&
      lastSubmission.year() === currentYear
    ) {
      return res.status(400).json({ message: 'Submission limit reached for this month' });
    }
    let punchMissedDateIST;
    try {
      punchMissedDateIST = parseDate(punchMissedDate);
      if (!validateDate(punchMissedDateIST)) {
        return res.status(400).json({ message: 'Invalid punchMissedDate format' });
      }
    } catch (error) {
      return res.status(400).json({ message: 'Invalid punchMissedDate format' });
    }
    if (punchMissedDateIST.isAfter(today)) {
      return res.status(400).json({ message: 'Punch Missed Date cannot be in the future' });
    }
    if (!/^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/i.test(yourInput)) {
      return res.status(400).json({ message: 'Invalid time format for Your Input' });
    }
    // Parse yourInput as IST time
    const yourInputIST = parseTimeInput(yourInput, punchMissedDateIST);
    const status = {
      hod: req.user.loginType === 'Employee' ? 'Pending' : req.user.loginType === 'HOD' ? 'Submitted' : 'Approved',
      admin: req.user.loginType === 'Admin' ? 'Approved' : 'Pending',
      ceo: 'Pending',
    };
    const adminInput = req.user.loginType === 'Admin' ? yourInput : undefined;
    const punchMissed = new PunchMissed({
      employeeId: req.user.employeeId,
      name: employee.name,
      department: employee.department,
      punchMissedDate: formatForDB(punchMissedDateIST),
      when,
      yourInput,
      reason,
      adminInput,
      status,
    });
    await punchMissed.save();
    employee.lastPunchMissedSubmission = formatForDB(today);
    await employee.save();

    // Send notification to the next pending approver
    if (status.hod === 'Pending') {
      const hod = await Employee.findOne({ department: employee.department, loginType: 'HOD' });
      if (hod) {
        const message = `New Punch Missed Form submitted by ${employee.name} (${employee.employeeId}) for ${formatForDisplay(punchMissedDateIST)}.`;
        await Notification.create({
          userId: hod.employeeId,
          message,
        });
        if (global._io && global._io.to) {
          global._io.to(hod.employeeId).emit('notification', { message });
        }
      }
    } else if (["Approved", "Submitted"].includes(status.hod) && status.admin === 'Pending') {
      const admin = await Employee.findOne({ loginType: 'Admin' });
      if (admin) {
        const message = `Punch Missed Form by ${employee.name} (${employee.employeeId}) awaits your approval for ${formatForDisplay(punchMissedDateIST)}.`;
        await Notification.create({
          userId: admin.employeeId,
          message,
        });
        if (global._io && global._io.to) {
          global._io.to(admin.employeeId).emit('notification', { message });
        }
      }
    } else if (["Approved", "Submitted"].includes(status.hod) && status.admin === 'Approved' && status.ceo === 'Pending') {
      const ceo = await Employee.findOne({ loginType: 'CEO' });
      if (ceo) {
        const message = `Punch Missed Form by ${employee.name} (${employee.employeeId}) awaits your approval for ${formatForDisplay(punchMissedDateIST)}.`;
        await Notification.create({
          userId: ceo.employeeId,
          message,
        });
        if (global._io && global._io.to) {
          global._io.to(ceo.employeeId).emit('notification', { message });
        }
      }
    }

    res.json({ message: 'Punch Missed Form submitted successfully' });
  } catch (err) {
    console.error('Error submitting Punch Missed Form:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    let filter = {};
    if (req.user.loginType === 'HOD') {
      const user = await Employee.findById(req.user.id).populate('department');
      filter.department = user.department._id;
    } else if (req.user.loginType === 'Employee') {
      filter.employeeId = req.user.employeeId;
    } else if (req.query.employeeId) {
      filter.employeeId = req.query.employeeId;
    } else if (req.query.departmentId) {
      filter.department = req.query.departmentId;
    }
    if (req.query.status && req.query.status !== 'all') {
      filter.$or = [
        { 'status.hod': req.query.status },
        { 'status.admin': req.query.status },
        { 'status.ceo': req.query.status },
      ];
    }
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const punchMissedForms = await PunchMissed.find(filter)
      .skip(skip)
      .limit(limit)
      .lean();
    // Convert punchMissedDate to IST for frontend
    punchMissedForms.forEach(form => {
      form.punchMissedDate = formatForDisplay(form.punchMissedDate);
    });
    const total = await PunchMissed.countDocuments(filter);
    res.json({ punchMissedForms, total });
  } catch (err) {
    console.error('Error fetching Punch Missed Forms:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.put('/:id/approve', auth, role(['HOD', 'Admin', 'CEO']), async (req, res) => {
  try {
    const { adminInput, action } = req.body;
    const punchMissed = await PunchMissed.findById(req.params.id);
    if (!punchMissed) {
      return res.status(404).json({ message: 'Punch Missed Form not found' });
    }
    const employee = await Employee.findOne({ employeeId: punchMissed.employeeId });
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    if (action === 'reject') {
      if (req.user.loginType === 'HOD' && punchMissed.status.hod === 'Pending') {
        punchMissed.status.hod = 'Rejected';
      } else if (
        req.user.loginType === 'Admin' &&
        ["Approved", "Submitted"].includes(punchMissed.status.hod) &&
        punchMissed.status.admin === 'Pending'
      ) {
        punchMissed.status.admin = 'Rejected';
      } else if (
        req.user.loginType === 'CEO' &&
        ["Approved", "Submitted"].includes(punchMissed.status.hod) &&
        punchMissed.status.admin === 'Approved' &&
        punchMissed.status.ceo === 'Pending'
      ) {
        punchMissed.status.ceo = 'Rejected';
      } else {
        return res.status(400).json({ message: 'Cannot reject at this stage' });
      }
      await punchMissed.save();
      const message = `Your Punch Missed Form for ${formatForDisplay(punchMissed.punchMissedDate)} has been rejected by ${req.user.loginType}.`;
      await Notification.create({
        userId: employee.employeeId,
        message,
      });
      if (global._io && global._io.to) {
        global._io.to(employee.employeeId).emit('notification', { message });
      }
      return res.json({ message: 'Form rejected successfully' });
    }

    if (req.user.loginType === 'HOD') {
      if (punchMissed.status.hod !== 'Pending') {
        return res.status(400).json({ message: 'HOD approval already processed' });
      }
      punchMissed.status.hod = 'Approved';
      await punchMissed.save();
      const admin = await Employee.findOne({ loginType: 'Admin' });
      if (admin) {
        const message = `Punch Missed Form by ${employee.name} (${employee.employeeId}) approved by HOD for ${formatForDisplay(punchMissed.punchMissedDate)}.`;
        await Notification.create({
          userId: admin.employeeId,
          message,
        });
        if (global._io && global._io.to) {
          global._io.to(admin.employeeId).emit('notification', { message });
        }
      }
    } else if (req.user.loginType === 'Admin') {
      if (!["Approved", "Submitted"].includes(punchMissed.status.hod) || punchMissed.status.admin !== 'Pending') {
        return res.status(400).json({ message: 'Admin approval not allowed yet' });
      }
      if (!adminInput || !/^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/i.test(adminInput)) {
        return res.status(400).json({ message: 'Invalid time format for Admin Input' });
      }
      // Parse adminInput as IST time
      const adminInputIST = parseTimeInput(adminInput, punchMissed.punchMissedDate);
      punchMissed.adminInput = adminInput; // Store as string for consistency
      punchMissed.status.admin = 'Approved';
      await punchMissed.save();
      const ceo = await Employee.findOne({ loginType: 'CEO' });
      if (ceo) {
        const message = `Punch Missed Form by ${employee.name} (${employee.employeeId}) approved by Admin for ${formatForDisplay(punchMissed.punchMissedDate)}.`;
        await Notification.create({
          userId: ceo.employeeId,
          message,
        });
        if (global._io && global._io.to) {
          global._io.to(ceo.employeeId).emit('notification', { message });
        }
      }
    } else if (req.user.loginType === 'CEO') {
      if (
        !["Approved", "Submitted"].includes(punchMissed.status.hod) ||
        punchMissed.status.admin !== 'Approved' ||
        punchMissed.status.ceo !== 'Pending'
      ) {
        return res.status(400).json({ message: 'CEO approval not allowed yet' });
      }
      punchMissed.status.ceo = 'Approved';
      await punchMissed.save();

      // Normalize punchMissedDate to UTC midnight, accounting for IST
      const punchMissedDateIST = toIST(punchMissed.punchMissedDate);
      const logDateUTC = formatForDB(punchMissedDateIST.startOf('day'));

      // Parse adminInput as IST time for attendance
      const adminInputIST = parseTimeInput(punchMissed.adminInput, punchMissedDateIST);
      const adminInputFormatted = adminInputIST.format('HH:mm:ss');

      // Check for existing attendance record
      const existingAttendance = await Attendance.findOne({
        employeeId: punchMissed.employeeId,
        logDate: logDateUTC,
      });

      if (existingAttendance) {
        // Update existing record
        const updateFields = {
          [punchMissed.when === 'Time IN' ? 'timeIn' : 'timeOut']: adminInputFormatted,
          status: 'Present',
        };

        // Only update timeIn or timeOut if not already set to avoid overwriting
        if (punchMissed.when === 'Time IN' && existingAttendance.timeIn) {
          delete updateFields.timeIn;
        } else if (punchMissed.when === 'Time OUT' && existingAttendance.timeOut) {
          delete updateFields.timeOut;
        }

        await Attendance.updateOne(
          { _id: existingAttendance._id },
          { $set: updateFields }
        );
      } else {
        // Create new attendance record
        await Attendance.create({
          employeeId: punchMissed.employeeId,
          userId: employee.userId,
          name: punchMissed.name,
          logDate: logDateUTC,
          [punchMissed.when === 'Time IN' ? 'timeIn' : 'timeOut']: adminInputFormatted,
          status: 'Present',
          halfDay: null,
          ot: 0,
        });
      }

      const message = `Your Punch Missed Form for ${formatForDisplay(punchMissed.punchMissedDate)} has been approved by CEO.`;
      await Notification.create({
        userId: employee.employeeId,
        message,
      });
      if (global._io && global._io.to) {
        global._io.to(employee.employeeId).emit('notification', { message });
      }
    }
    res.json({ message: 'Form approved successfully' });
  } catch (err) {
    console.error('Error approving Punch Missed Form:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

export default router;