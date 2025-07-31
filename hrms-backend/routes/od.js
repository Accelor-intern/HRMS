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
      hod: req.user.role === "Employee" ? "Pending" : req.user.role === "HOD" ? "Submitted" : "N/A",
      admin: req.user.role === "Employee" || req.user.role === "HOD" ? "Pending" : "Acknowledged",
      ceo: "N/A"
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
      initialStatus: "Pending",
      status,
      statusHistory: [{
        stage: 'initial',
        status: 'Pending',
        reason: 'OD request submitted',
        changedBy: user._id,
        changedAt: new Date()
      }]
    });

    await od.save();

    if (req.user.role === 'HOD' || req.user.role === 'Admin') {
      const admin = await Employee.findOne({ loginType: 'Admin' });
      if (admin) {
        await Notification.create({ userId: admin.employeeId, message: `New OD request from ${user.name} awaiting Admin acknowledgment` });
        if (global._io) global._io.to(admin.employeeId).emit('notification', { message: `New OD request from ${user.name} awaiting Admin acknowledgment` });
      }
    } else {
      const hod = await Employee.findOne({ department: user.department, loginType: 'HOD' });
      if (hod) {
        await Notification.create({ userId: hod.employeeId, message: `New OD request from ${user.name} awaiting initial approval` });
        if (global._io) global._io.to(hod.employeeId).emit('notification', { message: `New OD request from ${user.name} awaiting initial approval` });
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
        { 'initialStatus': status },
        { 'status.hod': status },
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
      .select('employeeId name designation department dateOut dateIn timeOut timeIn purpose placeUnitVisit actualPunchTimes initialStatus status statusHistory');

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


//final router function
// router.put(
//   "/:id/approve",
//   auth,
//   role(["HOD", "Admin", "CEO"]),
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

//       const { status, reason } = req.body;
//       const currentStage = req.user.role.toLowerCase();
//       const validStatuses = {
//         hod: ["Allowed", "Denied", "Approved", "Rejected"],
//         ceo: ["Approved", "Rejected"],
//         admin: ["Acknowledged"]
//       }[currentStage];

//       if (!validStatuses.includes(status)) {
//         return res
//           .status(400)
//           .json({
//             message: `Invalid status. Must be one of ${validStatuses.join(", ")} for ${currentStage.toUpperCase()}`,
//           });
//       }

//       const thirtyDaysAgo = new Date();
//       thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
//       if (new Date(od.dateOut) < thirtyDaysAgo && od.initialStatus !== "Pending" && od.status[currentStage] !== "Pending") {
//         return res.status(403).json({ message: "Cannot modify status after 30 days" });
//       }

//       // Authorization checks
//       if (req.user.role === "HOD" && user.department.toString() !== od.department.toString()) {
//         return res.status(403).json({ message: "Not authorized to modify ODs for this department" });
//       }
//       if (req.user.role === "CEO" && od.status.hod !== "Approved") {
//         return res.status(400).json({ message: "OD must be approved by HOD first" });
//       }
//       if (req.user.role === "Admin" && od.status.ceo !== "Approved") {
//         return res.status(400).json({ message: "OD must be approved by CEO first" });
//       }

//       // Update initialStatus or status
//       if (req.user.role === "HOD" && ["Allowed", "Denied"].includes(status)) {
//         od.initialStatus = status;
//         if (status === "Allowed") {
//           od.status.hod = "Pending"; // Reset to Pending for HOD approval
//           od.status.ceo = "N/A";
//           od.status.admin = "Pending";
//         } else if (status === "Denied") {
//           od.status.hod = "N/A";
//           od.status.ceo = "N/A";
//           od.status.admin = "N/A";
//         }
//       } else if (req.user.role === "HOD" && ["Approved", "Rejected"].includes(status)) {
//         if (od.initialStatus !== "Allowed") {
//           return res.status(400).json({ message: "OD must be allowed before approving or rejecting" });
//         }
//         od.status.hod = status;
//         if (status === "Rejected") {
//           od.status.ceo = "N/A";
//           od.status.admin = "N/A";
//         } else if (status === "Approved") {
//           od.status.ceo = "Pending";
//         }
//       } else if (req.user.role === "CEO" && ["Approved", "Rejected"].includes(status)) {
//         if (od.status.hod !== "Approved") {
//           return res.status(400).json({ message: "OD must be approved by HOD before CEO action" });
//         }
//         od.status.ceo = status;
//         if (status === "Rejected") {
//           od.status.admin = "N/A";
//         } else if (status === "Approved") {
//           od.status.admin = "Pending";
//         }
//       } else if (req.user.role === "Admin") {
//         od.status.admin = status;
//       }

//       // Add to status history
//       od.statusHistory.push({
//         stage: currentStage === "hod" && ["Allowed", "Denied"].includes(status) ? "initial" : currentStage,
//         status,
//         reason: reason || "No reason provided",
//         changedBy: user._id,
//         changedAt: new Date()
//       });

//       await od.save();

//       // Create audit log
//       await Audit.create({
//         user: user.employeeId,
//         action: `${status} OD`,
//         details: `${status} OD request for ${od.name} with reason: ${reason || "No reason provided"}`
//       });

//       // Notify employee
//       const employee = await Employee.findById(od.employee);
//       if (employee) {
//         await Notification.create({
//           userId: employee.employeeId,
//           message: `Your OD request has been ${status.toLowerCase()} by ${currentStage.toUpperCase()}. Reason: ${reason || "No reason provided"}`
//         });
//         if (global._io) {
//           global._io.to(employee.employeeId).emit('notification', {
//             message: `Your OD request has been ${status.toLowerCase()} by ${currentStage.toUpperCase()}. Reason: ${reason || "No reason provided"}`
//           });
//         }
//       }

//       // Notify admin for HOD actions
//       if (req.user.role === "HOD" && status === "Allowed") {
//         const admin = await Employee.findOne({ loginType: "Admin" });
//         if (admin) {
//           await Notification.create({
//             userId: admin.employeeId,
//             message: `OD request from ${od.name} awaiting Admin acknowledgment`
//           });
//           if (global._io) {
//             global._io.to(admin.employeeId).emit('notification', {
//               message: `OD request from ${od.name} awaiting Admin acknowledgment`
//             });
//           }
//         }
//       }

//       // Notify CEO for HOD approval
//       if (req.user.role === "HOD" && status === "Approved") {
//         const ceo = await Employee.findOne({ loginType: "CEO" });
//         if (ceo) {
//           await Notification.create({
//             userId: ceo.employeeId,
//             message: `OD request from ${od.name} awaiting CEO approval`
//           });
//           if (global._io) {
//             global._io.to(ceo.employeeId).emit('notification', {
//               message: `OD request from ${od.name} awaiting CEO approval`
//             });
//           }
//         }
//       }

//       // Notify admin of status change
//       const admin = await Employee.findOne({ loginType: "Admin" });
//       if (admin && req.user.role !== "Admin") {
//         await Notification.create({
//           userId: admin.employeeId,
//           message: `OD request status for ${od.name} changed to ${status} by ${currentStage.toUpperCase()}. Reason: ${reason || "No reason provided"}`
//         });
//         if (global._io) {
//           global._io.to(admin.employeeId).emit('notification', {
//             message: `OD request status for ${od.name} changed to ${status} by ${currentStage.toUpperCase()}. Reason: ${reason || "No reason provided"}`
//           });
//         }
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
  role(["HOD", "Admin", "CEO"]),
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
     let currentStage = req.user.role.toLowerCase();

if (req.user.role === "Admin") {
  if (od.status.admin === "Pending" && od.initialStatus === "Allowed") {
    currentStage = "admin";
  } else if (od.status.finalAdmin === "Pending" && od.status.ceo === "Approved") {
    currentStage = "finalAdmin";
  }
}

      const validStatuses = {
        hod: ["Allowed", "Denied", "Approved", "Rejected"],
        ceo: ["Approved", "Rejected"],
        admin: ["Allowed", "Denied"],
        finalAdmin: ["Acknowledged"]
      }[currentStage];

      if (!validStatuses.includes(status)) {
        return res
          .status(400)
          .json({
            message: `Invalid status. Must be one of ${validStatuses.join(", ")} for ${currentStage.toUpperCase()}`,
          });
      }

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      if (new Date(od.dateOut) < thirtyDaysAgo && od.initialStatus !== "Pending" && od.status[currentStage] !== "Pending") {
        return res.status(403).json({ message: "Cannot modify status after 30 days" });
      }

      // Authorization checks
      if (req.user.role === "HOD" && user.department.toString() !== od.department.toString()) {
        return res.status(403).json({ message: "Not authorized to modify ODs for this department" });
      }
      if (req.user.role === "Admin" && currentStage === "admin" && od.initialStatus !== "Allowed") {
        return res.status(400).json({ message: "OD must be allowed by HOD first" });
      }
      if (req.user.role === "HOD" && ["Approved", "Rejected"].includes(status) && od.status.admin !== "Allowed") {
        return res.status(400).json({ message: "OD must be allowed by Admin before HOD approval" });
      }
      if (req.user.role === "CEO" && od.status.hod !== "Approved") {
        return res.status(400).json({ message: "OD must be approved by HOD before CEO action" });
      }
      if (req.user.role === "Admin" && currentStage === "finalAdmin" && od.status.ceo !== "Approved") {
        return res.status(400).json({ message: "OD must be approved by CEO before final Admin acknowledgment" });
      }

      // Update initialStatus or status
      if (req.user.role === "HOD" && ["Allowed", "Denied"].includes(status)) {
        od.initialStatus = status; // This remains the initial HOD decision
        if (status === "Allowed") {
          od.status.admin = "Pending";
          od.status.hod = "Pending"; // HOD's next action
          od.status.ceo = "N/A";
          od.status.finalAdmin = "N/A";
        } else if (status === "Denied") {
          od.status.admin = "N/A";
          od.status.hod = "N/A";
          od.status.ceo = "N/A";
          od.status.finalAdmin = "N/A";
        }
      } else if (req.user.role === "Admin" && ["Allowed", "Denied"].includes(status)) {
        od.status.admin = status;
        if (status === "Allowed") {
          od.status.hod = "Pending";
          od.status.ceo = "N/A";
          od.status.finalAdmin = "N/A";
        } else if (status === "Denied") {
          od.status.hod = "N/A";
          od.status.ceo = "N/A";
          od.status.finalAdmin = "N/A";
        }
      } else if (req.user.role === "HOD" && ["Approved", "Rejected"].includes(status)) {
        od.status.hod = status;
        if (status === "Approved") {
          od.status.ceo = "Pending";
          od.status.finalAdmin = "N/A";
        } else if (status === "Rejected") {
          od.status.ceo = "N/A";
          od.status.finalAdmin = "N/A";
        }
      } else if (req.user.role === "CEO" && ["Approved", "Rejected"].includes(status)) {
        od.status.ceo = status;
        if (status === "Approved") {
          od.status.finalAdmin = "Pending";
        } else if (status === "Rejected") {
          od.status.finalAdmin = "N/A";
        }
      } else if (req.user.role === "Admin" && status === "Acknowledged") {
        od.status.finalAdmin = status;
      }

      // Add to status history with correct stage
      od.statusHistory.push({
        stage: req.user.role.toLowerCase() === "hod" && ["Allowed", "Denied"].includes(status) ? "hod" : currentStage,
        status,
        reason: reason || undefined, // Only store reason if provided
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

      // Notify admin for HOD initial allow
      if (req.user.role === "HOD" && status === "Allowed") {
        const admin = await Employee.findOne({ loginType: "Admin" });
        if (admin) {
          await Notification.create({
            userId: admin.employeeId,
            message: `OD request from ${od.name} awaiting Admin permission`
          });
          if (global._io) {
            global._io.to(admin.employeeId).emit('notification', {
              message: `OD request from ${od.name} awaiting Admin permission`
            });
          }
        }
      }

      // Notify HOD for Admin allow
      if (req.user.role === "Admin" && status === "Allowed") {
        const hod = await Employee.findOne({ loginType: "HOD", department: od.department });
        if (hod) {
          await Notification.create({
            userId: hod.employeeId,
            message: `OD request from ${od.name} awaiting HOD approval`
          });
          if (global._io) {
            global._io.to(hod.employeeId).emit('notification', {
              message: `OD request from ${od.name} awaiting HOD approval`
            });
          }
        }
      }

      // Notify CEO for HOD approval
      if (req.user.role === "HOD" && status === "Approved") {
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
      }

      // Notify admin for CEO approval
      if (req.user.role === "CEO" && status === "Approved") {
        const admin = await Employee.findOne({ loginType: "Admin" });
        if (admin) {
          await Notification.create({
            userId: admin.employeeId,
            message: `OD request from ${od.name} awaiting final Admin acknowledgment`
          });
          if (global._io) {
            global._io.to(admin.employeeId).emit('notification', {
              message: `OD request from ${od.name} awaiting final Admin acknowledgment`
            });
          }
        }
      }

      // Notify admin of status change (except for Admin's own actions)
      const admin = await Employee.findOne({ loginType: "Admin" });
      if (admin && req.user.role !== "Admin") {
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


