import express from 'express';
import OD from '../models/OD.js';
import Employee from '../models/Employee.js';
import Notification from '../models/Notification.js';
import Audit from '../models/Audit.js';
import auth from '../middleware/auth.js';
import role from '../middleware/role.js';
import Department from '../models/Department.js';
const router = express.Router();

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
    if (!dateOut || !dateIn || !purpose || !placeUnitVisit) {
      return res.status(400).json({ message: 'All required fields must be provided' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const outDate = new Date(dateOut);
    if (outDate < today) {
      return res.status(400).json({ message: 'Date Out cannot be in the past' });
    }
    if (new Date(dateIn) < outDate) {
      return res.status(400).json({ message: 'Date In cannot be before Date Out' });
    }

    const status = {
      hod: req.user.role === "Employee" ? "Pending" : req.user.role === "HOD" ? "Submitted" : "Approved",
      ceo: 'Pending',
      admin: 'Pending'
    };

    const od = new OD({
      employeeId: user.employeeId,
      employee: user._id,
      name: user.name,
      designation: user.designation,
      department: user.department,
      dateOut,
      dateIn,
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
        await Notification.create({ userId: ceo.employeeId, message: `New OD request from ${user.name}` });
        if (global._io) global._io.to(ceo.employeeId).emit('notification', { message: `New OD request from ${user.name}` });
      }
    } else {
      const hod = await Employee.findOne({ department: user.department, loginType: 'HOD' });
      if (hod) {
        await Notification.create({ userId: hod.employeeId, message: `New OD request from ${user.name}` });
        if (global._io) global._io.to(hod.employeeId).emit('notification', { message: `New OD request from ${user.name}` });
      }
    }

    await Audit.create({ user: user.employeeId, action: 'Submit OD', details: 'Submitted OD request' });

    res.status(201).json(od);
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
      const startDate = new Date(fromDate);
      startDate.setHours(0, 0, 0, 0);
      query.dateOut = { $gte: startDate };
    }

    if (toDate) {
      const endDate = new Date(toDate);
      endDate.setHours(23, 59, 59, 999);
      query.dateIn = { $lte: endDate };
    }

    const total = await OD.countDocuments(query);
   const odRecords = await OD.find(query)
  .populate('department', 'name')
  .sort({ createdAt: -1 })
  .skip((page - 1) * limit)
  .limit(parseInt(limit))
  .select('employeeId name designation department dateOut dateIn timeOut timeIn purpose placeUnitVisit actualPunchTimes status');

    res.json({ odRecords, total });
  } catch (err) {
    console.error('Fetch ODs error:', err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});
// // Approve OD (ORIGINAL OGG)
// router.put('/:id/approve', auth, role(['HOD', 'CEO', 'Admin']), async (req, res) => {
//   try {
//     const od = await OD.findById(req.params.id).populate('employee');
//     if (!od) {
//       return res.status(404).json({ message: 'OD request not found' });
//     }

//     const user = await Employee.findById(req.user.id);
//     if (!user) {
//       return res.status(404).json({ message: 'User not found' });
//     }

//     const { status } = req.body;
//     const currentStage = req.user.role.toLowerCase();
//     const validStatuses = req.user.role === 'Admin' ? ['Acknowledged'] : ['Approved', 'Rejected'];

//     if (!validStatuses.includes(status)) {
//       return res.status(400).json({ message: `Invalid status. Must be one of ${validStatuses.join(', ')}` });
//     }

//     if (od.status[currentStage] !== 'Pending') {
//       return res.status(400).json({ message: `OD is not pending ${currentStage.toUpperCase()} approval` });
//     }

//     if (req.user.role === 'HOD' && user.department.toString() !== od.department.toString()) {
//       return res.status(403).json({ message: 'Not authorized to approve ODs for this department' });
//     }

//     if (req.user.role === "CEO" && !["Approved", "Submitted"].includes(leave.status.hod)) {
//       return res.status(400).json({ message: 'OD must be approved or submitted by HOD first' });
//     }

//     if (req.user.role === 'Admin' && od.status.ceo !== 'Approved') {
//       return res.status(400).json({ message: 'OD must be approved by CEO first' });
//     }

//     od.status[currentStage] = status;

//     if (status === 'Approved' && currentStage === 'hod') {
//       od.status.ceo = 'Pending';
//       const ceo = await Employee.findOne({ loginType: 'CEO' });
//       if (ceo) {
//         await Notification.create({ userId: ceo.employeeId, message: `OD request from ${od.name} awaiting CEO approval` });
//         if (global._io) global._io.to(ceo.employeeId).emit('notification', { message: `OD request from ${od.name} awaiting CEO approval` });
//       }
//     } else if (['Approved', 'Submitted'].includes(status) && currentStage === 'ceo') {
//       od.status.admin = 'Pending';
//       const admin = await Employee.findOne({ loginType: 'Admin' });
//       if (admin) {
//         await Notification.create({ userId: admin.employeeId, message: `OD request from ${od.name} awaiting Admin acknowledgment` });
//         if (global._io) global._io.to(admin.employeeId).emit('notification', { message: `OD request from ${od.name} awaiting Admin acknowledgment` });
//       }
//     }

//     await od.save();
//     await Audit.create({ user: user.employeeId, action: `${status} OD`, details: `${status} OD request for ${od.name}` });

//     const employee = await Employee.findById(od.employee);
//     if (employee) {
//       await Notification.create({ userId: employee.employeeId, message: `Your OD request has been ${status.toLowerCase()} by ${currentStage.toUpperCase()}` });
//       if (global._io) global._io.to(employee.employeeId).emit('notification', { message: `Your OD request has been ${status.toLowerCase()} by ${currentStage.toUpperCase()}` });
//     }

//     res.json(od);
//   } catch (err) {
//     console.error('OD approval error:', err.stack);
//     res.status(500).json({ message: 'Server error', error: err.message });
//   }
// });


// // Approve OD (working correctly but for night changes updating the function 09/07/2025)
// router.put(
//   "/:id/approve",
//   auth,
//   role(["HOD", "CEO", "Admin"]),
//   async (req, res) => {
//     try {
//       const od = await OD.findById(req.params.id).populate("employee");
//       if (!od) {
//         return res.status(404).json({ message: "OD request not found" });
//       }

//       const user = await Employee.findById(req.user.id);
//       if (!user) {
//         return res.status(404).json({ message: "User not found" });
//       }

//       const { status } = req.body;
//       const currentStage = req.user.role.toLowerCase();
//       const validStatuses =
//         req.user.role === "Admin" ? ["Acknowledged"] : ["Approved", "Rejected"];

//       if (!validStatuses.includes(status)) {
//         return res
//           .status(400)
//           .json({
//             message: `Invalid status. Must be one of ${validStatuses.join(", ")}`,
//           });
//       }

//       if (od.status[currentStage] !== "Pending") {
//         return res
//           .status(400)
//           .json({
//             message: `OD is not pending ${currentStage.toUpperCase()} approval`,
//           });
//       }

//       if (
//         req.user.role === "HOD" &&
//         user.department.toString() !== od.department.toString()
//       ) {
//         return res
//           .status(403)
//           .json({
//             message: "Not authorized to approve ODs for this department",
//           });
//       }

//       if (
//         req.user.role === "CEO" &&
//         !["Approved", "Submitted"].includes(od.status.hod)
//       ) {
//         return res
//           .status(400)
//           .json({ message: "OD must be approved or submitted by HOD first" });
//       }

//       if (req.user.role === "Admin" && od.status.ceo !== "Approved") {
//         return res
//           .status(400)
//           .json({ message: "OD must be approved by CEO first" });
//       }

//       od.status[currentStage] = status;

//       if (status === "Approved" && currentStage === "hod") {
//         od.status.ceo = "Pending";
//         const ceo = await Employee.findOne({ loginType: "CEO" });
//         if (ceo) {
//           await Notification.create({
//             userId: ceo.employeeId,
//             message: `OD request from ${od.name} awaiting CEO approval`,
//           });
//           if (global._io)
//             global._io
//               .to(ceo.employeeId)
//               .emit("notification", {
//                 message: `OD request from ${od.name} awaiting CEO approval`,
//               });
//         }
//       } else if (["Approved", "Submitted"].includes(status) && currentStage === "ceo") {
//         od.status.admin = "Pending";
//         const admin = await Employee.findOne({ loginType: "Admin" });
//         if (admin) {
//           await Notification.create({
//             userId: admin.employeeId,
//             message: `OD request from ${od.name} awaiting Admin acknowledgment`,
//           });
//           if (global._io)
//             global._io
//               .to(admin.employeeId)
//               .emit("notification", {
//                 message: `OD request from ${od.name} awaiting Admin acknowledgment`,
//               });
//         }
//       }

//       await od.save();
//       await Audit.create({
//         user: user.employeeId,
//         action: `${status} OD`,
//         details: `${status} OD request for ${od.name}`,
//       });

//       const employee = await Employee.findById(od.employee);
//       if (employee) {
//         await Notification.create({
//           userId: employee.employeeId,
//           message: `Your OD request has been ${status.toLowerCase()} by ${currentStage.toUpperCase()}`,
//         });
//         if (global._io)
//           global._io
//             .to(employee.employeeId)
//             .emit("notification", {
//               message: `Your OD request has been ${status.toLowerCase()} by ${currentStage.toUpperCase()}`,
//             });
//       }

//       res.json(od);
//     } catch (err) {
//       console.error("OD approval error:", err.stack);
//       res.status(500).json({ message: "Server error", error: err.message });
//     }
//   }
// );

router.put(
  "/:id/approve",
  auth,
  role(["HOD", "CEO", "Admin"]),
  async (req, res) => {
    try {
      const od = await OD.findById(req.params.id).populate("employee");
      if (!od) {
        return res.status(404).json({ message: "OD request not found" });
      }

      const user = await Employee.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { status, reason } = req.body;
      const currentStage = req.user.role.toLowerCase();
      const validStatuses =
        req.user.role === "Admin" ? ["Acknowledged"] : ["Approved", "Rejected"];

      if (!validStatuses.includes(status)) {
        return res
          .status(400)
          .json({
            message: `Invalid status. Must be one of ${validStatuses.join(", ")}`,
          });
      }

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      if (new Date(od.dateOut) < thirtyDaysAgo && od.status[currentStage] !== "Pending") {
        return res.status(403).json({ message: "Cannot modify status after 30 days" });
      }

      // Authorization checks
      if (req.user.role === "HOD" && user.department.toString() !== od.department.toString()) {
        return res.status(403).json({ message: "Not authorized to modify ODs for this department" });
      }
      if (req.user.role === "CEO" && !["Approved", "Submitted"].includes(od.status.hod)) {
        return res.status(400).json({ message: "OD must be approved or submitted by HOD first" });
      }
      if (req.user.role === "Admin" && od.status.ceo !== "Approved") {
        return res.status(400).json({ message: "OD must be approved by CEO first" });
      }

      // Update status and handle transitions
      if (status === "Rejected") {
        od.status.hod = currentStage === "hod" ? "Rejected" : od.status.hod;
        od.status.ceo = currentStage === "hod" || currentStage === "ceo" ? "N/A" : od.status.ceo;
        od.status.admin = currentStage === "hod" || currentStage === "ceo" || currentStage === "admin" ? "N/A" : od.status.admin;
      } else {
        od.status[currentStage] = status;
        if (status === "Approved" && currentStage === "hod") {
          od.status.ceo = "Pending";
          od.status.admin = "Pending";
        } else if (["Approved", "Submitted"].includes(status) && currentStage === "ceo") {
          od.status.admin = "Pending";
        }
      }

      // Add to status history
      od.statusHistory.push({
        stage: currentStage,
        status,
        reason: reason || "No reason provided",
        changedBy: user._id,
        changedAt: new Date()
      });

      await od.save();

      // Create audit log
      await Audit.create({
        user: user.employeeId,
        action: `${status} OD`,
        details: `${status} OD request for ${od.name} with reason: ${reason || "No reason provided"}`
      });

      // Notify employee
      const employee = await Employee.findById(od.employee);
      if (employee) {
        await Notification.create({
          userId: employee.employeeId,
          message: `Your OD request has been ${status.toLowerCase()} by ${currentStage.toUpperCase()}. Reason: ${reason || "No reason provided"}`
        });
        if (global._io) {
          global._io.to(employee.employeeId).emit('notification', {
            message: `Your OD request has been ${status.toLowerCase()} by ${currentStage.toUpperCase()}. Reason: ${reason || "No reason provided"}`
          });
        }
      }

      // Notify next approver or admin
      if (status === "Approved" && currentStage === "hod") {
        const ceo = await Employee.findOne({ loginType: "CEO" });
        if (ceo) {
          await Notification.create({
            userId: ceo.employeeId,
            message: `OD request from ${od.name} awaiting CEO approval`
          });
          if (global._io) {
            global._io.to(ceo.employeeId).emit('notification', {
              message: `OD request from ${od.name} awaiting CEO approval`
            });
          }
        }
      } else if (["Approved", "Submitted"].includes(status) && currentStage === "ceo") {
        const admin = await Employee.findOne({ loginType: "Admin" });
        if (admin) {
          await Notification.create({
            userId: admin.employeeId,
            message: `OD request from ${od.name} awaiting Admin acknowledgment`
          });
          if (global._io) {
            global._io.to(admin.employeeId).emit('notification', {
              message: `OD request from ${od.name} awaiting Admin acknowledgment`
            });
          }
        }
      }

      // Notify admin of status change
      const admin = await Employee.findOne({ loginType: "Admin" });
      if (admin) {
        await Notification.create({
          userId: admin.employeeId,
          message: `OD request status for ${od.name} changed to ${status} by ${currentStage.toUpperCase()}. Reason: ${reason || "No reason provided"}`
        });
        if (global._io) {
          global._io.to(admin.employeeId).emit('notification', {
            message: `OD request status for ${od.name} changed to ${status} by ${currentStage.toUpperCase()}. Reason: ${reason || "No reason provided"}`
          });
        }
      }

      res.json(od);
    } catch (err) {
      console.error("OD approval error:", err.stack);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  }
);

export default router;
