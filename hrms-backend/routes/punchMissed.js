import express from 'express';
import PunchMissed from '../models/PunchMissed.js';
import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import Notification from '../models/Notification.js';
import auth from '../middleware/auth.js';
import role from '../middleware/role.js';
import Audit from '../models/Audit.js';
const router = express.Router();

router.get('/check-limit', auth, role(['Employee', 'HOD', 'Admin']), async (req, res) => {
  try {
    const employee = await Employee.findOne({ employeeId: req.user.employeeId });
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to IST midnight
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const lastSubmission = employee.lastPunchMissedSubmission
      ? new Date(employee.lastPunchMissedSubmission)
      : null;
    const canSubmit =
      !lastSubmission ||
      lastSubmission.getMonth() !== currentMonth ||
      lastSubmission.getFullYear() !== currentYear;
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
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to IST midnight
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const lastSubmission = employee.lastPunchMissedSubmission
      ? new Date(employee.lastPunchMissedSubmission)
      : null;
    if (
      lastSubmission &&
      lastSubmission.getMonth() === currentMonth &&
      lastSubmission.getFullYear() === currentYear
    ) {
      return res.status(400).json({ message: 'Submission limit reached for this month' });
    }
    const punchMissedDateIST = new Date(punchMissedDate);
    if (isNaN(punchMissedDateIST)) {
      return res.status(400).json({ message: 'Invalid punchMissedDate format' });
    }
    if (punchMissedDateIST > today) {
      return res.status(400).json({ message: 'Punch Missed Date cannot be in the future' });
    }
    if (!/^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/i.test(yourInput)) {
      return res.status(400).json({ message: 'Invalid time format for Your Input' });
    }
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(today.getMonth() - 1);
    if (punchMissedDateIST < oneMonthAgo) {
      return res.status(400).json({ message: 'Punch Missed Date cannot be more than one month in the past' });
    }
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
      punchMissedDate,
      when,
      yourInput,
      reason,
      adminInput,
      status,
    });
    await punchMissed.save();

    // // Validate employee shift before saving
    // const validShifts = ['A Shift', 'B Shift', 'General']; // Adjust based on your Employee schema
    // if (employee.shift && !validShifts.includes(employee.shift)) {
    //   console.warn(`Invalid shift value '${employee.shift}' for employee ${employee.employeeId}. Setting to default.`);
    //   employee.shift = 'General'; // Set a default valid shift
    // }

    employee.lastPunchMissedSubmission = today;
    await employee.save();

    // Send notification to the next pending approver
    if (status.hod === 'Pending') {
      const hod = await Employee.findOne({ department: employee.department, loginType: 'HOD' });
      if (hod) {
        await Notification.create({
          userId: hod.employeeId,
          message: `New Punch Missed Form submitted by ${employee.name} (${employee.employeeId}) for ${punchMissedDate}.`,
        });
        if (global._io) {
          global._io.to(hod.employeeId).emit('notification', {
            message: `New Punch Missed Form submitted by ${employee.name} (${employee.employeeId}) for ${punchMissedDate}.`,
          });
        }
      }
    } else if (["Approved", "Submitted"].includes(status.hod) && status.admin === 'Pending') {
      const admin = await Employee.findOne({ loginType: 'Admin' });
      if (admin) {
        await Notification.create({
          userId: admin.employeeId,
          message: `Punch Missed Form by ${employee.name} (${employee.employeeId}) awaits your approval for ${punchMissedDate}.`,
        });
        if (global._io) {
          global._io.to(admin.employeeId).emit('notification', {
            message: `Punch Missed Form by ${employee.name} (${employee.employeeId}) awaits your approval for ${punchMissedDate}.`,
          });
        }
      }
    } else if (["Approved", "Submitted"].includes(status.hod) && status.admin === 'Approved' && status.ceo === 'Pending') {
      const ceo = await Employee.findOne({ loginType: 'CEO' });
      if (ceo) {
        await Notification.create({
          userId: ceo.employeeId,
          message: `Punch Missed Form by ${employee.name} (${employee.employeeId}) awaits your approval for ${punchMissedDate}.`,
        });
        if (global._io) {
          global._io.to(ceo.employeeId).emit('notification', {
            message: `Punch Missed Form by ${employee.name} (${employee.employeeId}) awaits your approval for ${punchMissedDate}.`,
          });
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
    const total = await PunchMissed.countDocuments(filter);
    res.json({ punchMissedForms, total });
  } catch (err) {
    console.error('Error fetching Punch Missed Forms:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.put(
  '/:id/approve',
  auth,
  role(['HOD', 'Admin', 'CEO']),
  async (req, res) => {
    try {
      const { status, adminInput, reason = '' } = req.body;
      const punchMissed = await PunchMissed.findById(req.params.id);
      if (!punchMissed) {
        return res.status(404).json({ message: 'Punch Missed Form not found' });
      }
      const employee = await Employee.findOne({ employeeId: punchMissed.employeeId });
      if (!employee) {
        return res.status(404).json({ message: 'Employee not found' });
      }

      const currentStage = req.user.loginType.toLowerCase();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      if (new Date(punchMissed.createdAt) < thirtyDaysAgo && status !== 'Pending') {
        return res.status(403).json({ message: 'Cannot modify status after 30 days' });
      }

      if (status === 'Rejected') {
        if (req.user.loginType === 'HOD' && punchMissed.status.hod === 'Pending') {
          punchMissed.status.hod = 'Rejected';
          punchMissed.status.admin = 'N/A';
          punchMissed.status.ceo = 'N/A';
        } else if (
          req.user.loginType === 'Admin' &&
          ['Approved', 'Submitted'].includes(punchMissed.status.hod) &&
          punchMissed.status.admin === 'Pending'
        ) {
          punchMissed.status.admin = 'Rejected';
          punchMissed.status.ceo = 'N/A';
        } else if (
          req.user.loginType === 'CEO' &&
          ['Approved', 'Submitted'].includes(punchMissed.status.hod) &&
          punchMissed.status.admin === 'Approved' &&
          punchMissed.status.ceo === 'Pending'
        ) {
          punchMissed.status.ceo = 'Rejected';
        } else {
          return res.status(400).json({ message: 'Cannot reject at this stage' });
        }
      } else if (status === 'Approved') {
        if (req.user.loginType === 'HOD' && punchMissed.status.hod === 'Pending') {
          punchMissed.status.hod = 'Approved';
          punchMissed.status.admin = 'Pending';
        } else if (
          req.user.loginType === 'Admin' &&
          ['Approved', 'Submitted'].includes(punchMissed.status.hod) &&
          punchMissed.status.admin === 'Pending'
        ) {
          if (!adminInput || !/^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/i.test(adminInput)) {
            return res.status(400).json({ message: 'Invalid time format for Admin Input' });
          }
          punchMissed.adminInput = adminInput;
          punchMissed.status.admin = 'Approved';
          punchMissed.status.ceo = 'Pending';
        } else if (
          req.user.loginType === 'CEO' &&
          ['Approved', 'Submitted'].includes(punchMissed.status.hod) &&
          punchMissed.status.admin === 'Approved' &&
          punchMissed.status.ceo === 'Pending'
        ) {
          punchMissed.status.ceo = 'Approved';
        } else {
          return res.status(400).json({ message: 'Cannot approve at this stage' });
        }
      } else {
        return res.status(400).json({ message: 'Invalid action' });
      }

      // Add to status history
      punchMissed.statusHistory = punchMissed.statusHistory || [];
      punchMissed.statusHistory.push({
        stage: currentStage,
        status,
        reason,
        changedBy: req.user.id,
        changedAt: new Date(),
      });

      await punchMissed.save();

      // Create audit log
      await Audit.create({
        user: employee.employeeId,
        action: `${status} Punch Missed Form`,
        details: `${status} Punch Missed Form for ${employee.name}${reason ? ` (Reason: ${reason})` : ''}`,
      });

      // Notify employee
      const notificationMessage = `Your Punch Missed Form for ${punchMissed.punchMissedDate} has been ${status.toLowerCase()} by ${currentStage.toUpperCase()}${reason ? ` (Reason: ${reason})` : ''}`;
      await Notification.create({
        userId: employee.employeeId,
        message: notificationMessage,
      });
      if (global._io) {
        global._io.to(employee.employeeId).emit('notification', { message: notificationMessage });
      }

      // Notify next stage if approved
      if (status === 'Approved') {
        if (currentStage === 'hod') {
          const admin = await Employee.findOne({ loginType: 'Admin' });
          if (admin) {
            await Notification.create({
              userId: admin.employeeId,
              message: `Punch Missed Form by ${employee.name} (${employee.employeeId}) approved by HOD for ${punchMissed.punchMissedDate}.`,
            });
            if (global._io) {
              global._io.to(admin.employeeId).emit('notification', {
                message: `Punch Missed Form by ${employee.name} (${employee.employeeId}) approved by HOD for ${punchMissed.punchMissedDate}.`,
              });
            }
          }
        } else if (currentStage === 'admin') {
          const ceo = await Employee.findOne({ loginType: 'CEO' });
          if (ceo) {
            await Notification.create({
              userId: ceo.employeeId,
              message: `Punch Missed Form by ${employee.name} (${employee.employeeId}) approved by Admin for ${punchMissed.punchMissedDate}.`,
            });
            if (global._io) {
              global._io.to(ceo.employeeId).emit('notification', {
                message: `Punch Missed Form by ${employee.name} (${employee.employeeId}) approved by Admin for ${punchMissed.punchMissedDate}.`,
              });
            }
          }
        } else if (currentStage === 'ceo') {
          // Update attendance
          const punchMissedDateIST = new Date(punchMissed.punchMissedDate);
          const logDateUTC = new Date(punchMissedDateIST.getTime() - 5.5 * 60 * 60 * 1000);
          logDateUTC.setUTCHours(18, 30, 0, 0);

          const existingAttendance = await Attendance.findOne({
            employeeId: punchMissed.employeeId,
            logDate: logDateUTC,
          });

          if (existingAttendance) {
            const updateFields = {
              [punchMissed.when === 'Time IN' ? 'timeIn' : 'timeOut']: punchMissed.adminInput,
              status: 'Present',
            };
            if (punchMissed.when === 'Time IN' && existingAttendance.timeIn) {
              delete updateFields.timeIn;
            } else if (punchMissed.when === 'Time OUT' && existingAttendance.timeOut) {
              delete updateFields.timeOut;
            }
            await Attendance.updateOne({ _id: existingAttendance._id }, { $set: updateFields });
          } else {
            await Attendance.create({
              employeeId: punchMissed.employeeId,
              userId: employee.userId,
              name: punchMissed.name,
              logDate: logDateUTC,
              [punchMissed.when === 'Time IN' ? 'timeIn' : 'timeOut']: punchMissed.adminInput,
              status: 'Present',
              halfDay: null,
              ot: 0,
            });
          }
        }
      }

      res.json({ message: `${status} successfully`, punchMissed });
    } catch (err) {
      console.error('Error approving Punch Missed Form:', err);
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

router.put('/:id', auth, role(['Admin']), async (req, res) => {
  try {
    const { adminInput } = req.body;
    if (adminInput && !/^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/i.test(adminInput)) {
      return res.status(400).json({ message: 'Invalid time format for Admin Input' });
    }

    const punchMissed = await PunchMissed.findById(req.params.id);
    if (!punchMissed) {
      return res.status(404).json({ message: 'Punch Missed Form not found' });
    }

    if (adminInput) {
      punchMissed.adminInput = adminInput;
    }

    await punchMissed.save();
    res.json({ message: 'Admin input saved successfully', punchMissed });
  } catch (err) {
    console.error('Error saving admin input:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

export default router;
