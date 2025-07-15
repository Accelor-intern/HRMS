import express from "express";
import Leave from "../models/Leave.js";
import Employee from "../models/Employee.js";
import Notification from "../models/Notification.js";
import Audit from "../models/Audit.js";
import auth from "../middleware/auth.js";
import role from "../middleware/role.js";
import Department from "../models/Department.js";
import { upload, uploadToGridFS, gfsReady } from "../middleware/fileupload.js";
import { getGfs } from "../utils/gridfs.js";
import generateNextCompositeLeaveId from "../utils/generateCompositeLeaveId.js";

const router = express.Router();

router.post(
  "/",
  auth,
  role(["Employee", "HOD", "Admin"]),
  upload.single("medicalCertificate"),
  async (req, res) => {
    try {
      const user = await Employee.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "Employee not found" });
      }
      if (!user.designation) {
        return res
          .status(400)
          .json({ message: "Employee designation is required" });
      }
      if (!user.department) {
        return res
          .status(400)
          .json({ message: "Employee department is required" });
      }

      const currentYear = new Date().getFullYear();
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(today.getDate() - 7);
      const sevenDaysFuture = new Date(today);
      sevenDaysFuture.setDate(today.getDate() + 7);

      const leaveSegments = Array.isArray(req.body) ? req.body : [req.body];

      // Generate compositeLeaveId for multiple segments before processing
      let compositeLeaveId = leaveSegments.length > 1 ? await generateNextCompositeLeaveId() : null;
      if (leaveSegments.length > 1 && !compositeLeaveId) {
        return res.status(500).json({ message: "Failed to generate composite leave ID" });
      }

      const todayStr = today.toISOString().split('T')[0]; // "2025-07-15"
      let isEmergencyContext = leaveSegments.some(segment => {
        const leaveStart = new Date(segment.fullDay.from);
        return leaveStart.toISOString().split('T')[0] === todayStr;
      });

      const savedLeaves = [];
      const errors = [];

      for (const segment of leaveSegments) {
        try {
          let leaveDays = 0;
          let leaveStart, leaveEnd;
          if (segment.fullDay?.from) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(segment.fullDay.from)) {
              return res
                .status(400)
                .json({
                  message: "Invalid full day from date format (expected YYYY-MM-DD)",
                });
            }
            leaveStart = new Date(segment.fullDay.from);
            if (isNaN(leaveStart.getTime())) {
              return res.status(400).json({ message: "Invalid full day from date" });
            }
            const fromDuration = segment.fullDay.fromDuration || 'full';
            const fromSession = segment.fullDay.fromSession;
            if (!['full', 'half'].includes(fromDuration)) {
              return res.status(400).json({ message: "Invalid fromDuration, must be 'full' or 'half'" });
            }
            if (fromDuration === 'half' && !['forenoon', 'afternoon'].includes(fromSession)) {
              return res.status(400).json({ message: "Invalid fromSession, must be 'forenoon' or 'afternoon'" });
            }
            if (fromDuration === 'half' && !fromSession) {
              return res.status(400).json({ message: "fromSession is required for half-day fromDuration" });
            }
            if (fromDuration === 'half') {
              leaveDays = 0.5;
              leaveEnd = new Date(leaveStart);
            } else if (!segment.fullDay?.to) {
              leaveDays = 1;
              leaveEnd = new Date(leaveStart);
            } else {
              if (!/^\d{4}-\d{2}-\d{2}$/.test(segment.fullDay.to)) {
                return res
                  .status(400)
                  .json({
                    message: "Invalid full day to date format (expected YYYY-MM-DD)",
                  });
              }
              leaveEnd = new Date(segment.fullDay.to);
              if (isNaN(leaveEnd.getTime())) {
                return res.status(400).json({ message: "Invalid full day to date" });
              }
              const toDuration = segment.fullDay.toDuration || 'full';
              const toSession = segment.fullDay.toSession;
              if (!['full', 'half'].includes(toDuration)) {
                return res.status(400).json({ message: "Invalid toDuration, must be 'full' or 'half'" });
              }
              if (toDuration === 'half' && toSession !== 'forenoon') {
                return res.status(400).json({ message: "toSession must be 'forenoon' for half-day toDuration" });
              }
              if (toDuration === 'half' && !toSession) {
                return res.status(400).json({ message: "toSession is required for half-day toDuration" });
              }
              if (leaveStart.toISOString().split('T')[0] === leaveEnd.toISOString().split('T')[0]) {
                if (fromDuration === 'full' && toDuration === 'full') {
                  leaveDays = 1;
                } else if (fromDuration === 'half' && toDuration === 'half' && fromSession === 'afternoon' && toSession === 'forenoon') {
                  leaveDays = 0.5;
                } else {
                  return res.status(400).json({ message: "Invalid duration combination for same-day leave" });
                }
              } else {
                leaveDays = (leaveEnd - leaveStart) / (1000 * 60 * 60 * 24) + 1;
                if (fromDuration === 'half') leaveDays -= 0.5;
                if (toDuration === 'half') leaveDays -= 0.5;
              }
            }

            // Validation inside the block after fromDuration is defined
            const leaveStartStr = leaveStart.toISOString().split('T')[0];
            if (isEmergencyContext && fromDuration === 'full' && leaveStartStr !== todayStr) {
              return res
                .status(400)
                .json({
                  message: "Full-day leave under Emergency context must be for the current date only",
                });
            } else if (!isEmergencyContext && segment.fullDay?.from && leaveStart <= today) {
              return res
                .status(400)
                .json({
                  message: "Full day from date must be after today for this leave type",
                });
            }
          } else {
            return res.status(400).json({ message: "Invalid leave dates provided" });
          }

          if (leaveStart > leaveEnd) {
            return res
              .status(400)
              .json({ message: "Leave start date cannot be after end date" });
          }

          if (segment.leaveType === "Medical") {
            if (leaveStart < sevenDaysAgo || leaveStart > sevenDaysFuture) {
              return res
                .status(400)
                .json({
                  message: "Medical leave from date must be within 7 days prior and 7 days future from today",
                });
            }
            if (!segment.fullDay?.to) {
              return res.status(400).json({ message: "To date is required for Medical leave" });
            }
          }

          if (segment.leaveType !== "Emergency") {
            const overlappingChargeAssignments = await Leave.find({
              chargeGivenTo: user._id,
              $or: [
                {
                  "fullDay.from": { $lte: leaveEnd },
                  "fullDay.to": { $gte: leaveStart },
                  $and: [
                    { "status.hod": { $ne: "Rejected" } },
                    { "status.ceo": { $ne: "Rejected" } },
                    { "status.admin": { $in: ["Pending", "Acknowledged"] } },
                  ],
                  $or: [
                    { 'fullDay.fromDuration': 'full' },
                    { 'fullDay.fromDuration': 'half', 'fullDay.fromSession': { $in: ['forenoon', 'afternoon'] } }
                  ],
                  ...(leaveStart.toISOString().split('T')[0] !== leaveEnd.toISOString().split('T')[0] && {
                    $or: [
                      { 'fullDay.toDuration': 'full' },
                      { 'fullDay.toDuration': 'half', 'fullDay.toSession': 'forenoon' }
                    ]
                  })
                }
              ],
            });
            if (overlappingChargeAssignments.length > 0) {
              const leaveDetails = overlappingChargeAssignments[0];
              const dateRangeStr =
                `from ${
                  new Date(leaveDetails.fullDay.from).toISOString().split("T")[0]
                }${leaveDetails.fullDay.fromDuration === 'half' ? ` (${leaveDetails.fullDay.fromSession})` : ''}${leaveDetails.fullDay.to ? ` to ${
                  new Date(leaveDetails.fullDay.to).toISOString().split("T")[0]
                }${leaveDetails.fullDay.toDuration === 'half' ? ` (${leaveDetails.fullDay.toSession})` : ''}` : ''}`;
              return res.status(400).json({
                message: `You are assigned as Charge Given To for a leave ${dateRangeStr} and cannot apply for non-Emergency leaves during this period.`,
              });
            }
          }

          const leaveType = segment.leaveType;
          const isConfirmed = user.employeeType === "Confirmed";
          const joinDate = new Date(user.dateOfJoining);
          const yearsOfService =
            (new Date() - joinDate) / (1000 * 60 * 60 * 24 * 365);

          const chargeGivenToEmployee = await Employee.findById(
            segment.chargeGivenTo
          );
          if (!chargeGivenToEmployee) {
            return res
              .status(400)
              .json({ message: "Selected employee for Charge Given To not found" });
          }
          const startDateOnly = new Date(leaveStart.setHours(0, 0, 0, 0));
          const endDateOnly = new Date(leaveEnd.setHours(0, 0, 0, 0));
          const overlappingLeaves = await Leave.find({
            $or: [
              {
                chargeGivenTo: segment.chargeGivenTo,
                $or: [
                  {
                    "fullDay.from": { $lte: leaveEnd },
                    "fullDay.to": { $gte: leaveStart },
                    $and: [
                      { "status.hod": { $in: ["Pending", "Approved"] } },
                      { "status.ceo": { $in: ["Pending", "Approved"] } },
                      { "status.admin": { $in: ["Pending", "Acknowledged"] } },
                    ],
                    $or: [
                      { 'fullDay.fromDuration': 'full' },
                      { 'fullDay.fromDuration': 'half', 'fullDay.fromSession': { $in: ['forenoon', 'afternoon'] } }
                    ],
                    ...(leaveStart.toISOString().split('T')[0] !== leaveEnd.toISOString().split('T')[0] && {
                      $or: [
                        { 'fullDay.toDuration': 'full' },
                        { 'fullDay.toDuration': 'half', 'fullDay.toSession': 'forenoon' }
                      ]
                    })
                  },
                  {
                    "fullDay.from": { $gte: startDateOnly, $lte: endDateOnly },
                    "fullDay.to": { $gte: startDateOnly, $lte: endDateOnly },
                    "fullDay.fromDuration": 'half',
                    "fullDay.fromSession": { $in: ['forenoon', 'afternoon'] },
                    $and: [
                      { "status.hod": { $in: ["Pending", "Approved"] } },
                      { "status.ceo": { $in: ["Pending", "Approved"] } },
                      { "status.admin": { $in: ["Pending", "Acknowledged"] } },
                    ]
                  }
                ]
              },
              {
                employee: segment.chargeGivenTo,
                $or: [
                  {
                    "fullDay.from": { $lte: leaveEnd },
                    "fullDay.to": { $gte: leaveStart },
                    $and: [
                      { "status.hod": { $in: ["Pending", "Approved"] } },
                      { "status.ceo": { $in: ["Pending", "Approved"] } },
                      { "status.admin": { $in: ["Pending", "Acknowledged"] } },
                    ],
                    $or: [
                      { 'fullDay.fromDuration': 'full' },
                      { 'fullDay.fromDuration': 'half', 'fullDay.fromSession': { $in: ['forenoon', 'afternoon'] } }
                    ],
                    ...(leaveStart.toISOString().split('T')[0] !== leaveEnd.toISOString().split('T')[0] && {
                      $or: [
                        { 'fullDay.toDuration': 'full' },
                        { 'fullDay.toDuration': 'half', 'fullDay.toSession': 'forenoon' }
                      ]
                    })
                  },
                  {
                    "fullDay.from": { $gte: startDateOnly, $lte: endDateOnly },
                    "fullDay.to": { $gte: startDateOnly, $lte: endDateOnly },
                    "fullDay.fromDuration": 'half',
                    "fullDay.fromSession": { $in: ['forenoon', 'afternoon'] },
                    $and: [
                      { "status.hod": { $in: ["Pending", "Approved"] } },
                      { "status.ceo": { $in: ["Pending", "Approved"] } },
                      { "status.admin": { $in: ["Pending", "Acknowledged"] } },
                    ]
                  }
                ]
              }
            ]
          });
          if (overlappingLeaves.length > 0) {
            return res
              .status(400)
              .json({
                message:
                  "Selected employee is either already assigned as Charge Given To or has a pending/approved leave for the specified date range",
              });
          }

          switch (leaveType) {
            case "Casual":
              const canTakeCasualLeave = await user.checkConsecutivePaidLeaves(
                leaveStart,
                leaveEnd
              );
              if (!canTakeCasualLeave) {
                return res
                  .status(400)
                  .json({
                    message: "Cannot take more than 3 consecutive paid leave days.",
                  });
              }
              if (user.paidLeaves < leaveDays) {
                return res
                  .status(400)
                  .json({ message: "Insufficient Casual leave balance." });
              }
              break;
            case "Medical":
              if (!isConfirmed)
                return res
                  .status(400)
                  .json({
                    message: "Medical leave is only for confirmed employees.",
                  });
              if (![3, 4, 7].includes(leaveDays))
                return res
                  .status(400)
                  .json({ message: "Medical leave must be exactly 3, 4, or 7 days." });
              if (user.medicalLeaves < leaveDays)
                return res
                  .status(400)
                  .json({
                    message: "Medical leave already used or insufficient balance for this year.",
                  });
              const medicalLeavesThisYear = await Leave.find({
                employeeId: user.employeeId,
                leaveType: "Medical",
                "status.admin": "Acknowledged",
                'fullDay.from': { $gte: new Date(currentYear, 0, 1) }
              });
              if (medicalLeavesThisYear.length > 0) {
                return res
                  .status(400)
                  .json({
                    message: "Medical leave can only be used once per year.",
                  });
              }
              break;
            case "Maternity":
              if (!isConfirmed || user.gender !== "Female")
                return res
                  .status(400)
                  .json({
                    message:
                      "Maternity leave is only for confirmed female employees.",
                  });
              if (yearsOfService < 1)
                return res
                  .status(400)
                  .json({ message: "Must have completed one year of service." });
              if (leaveDays !== 90)
                return res
                  .status(400)
                  .json({ message: "Maternity leave must be 90 days." });
              if (user.maternityClaims >= 2)
                return res
                  .status(400)
                  .json({
                    message:
                      "Maternity leave can only be availed twice during service.",
                  });
              break;
            case "Paternity":
              if (!isConfirmed || user.gender !== "Male")
                return res
                  .status(400)
                  .json({
                    message:
                      "Paternity leave is only for confirmed male employees.",
                  });
              if (yearsOfService < 1)
                return res
                  .status(400)
                  .json({ message: "Must have completed one year of service." });
              if (leaveDays !== 7)
                return res
                  .status(400)
                  .json({ message: "Paternity leave must be 7 days." });
              if (user.paternityClaims >= 2)
                return res
                  .status(400)
                  .json({
                    message:
                      "Paternity leave can only be availed twice during service.",
                  });
              break;
            case "Restricted Holidays":
              if (leaveDays !== 1)
                return res
                  .status(400)
                  .json({ message: "Restricted Holiday must be 1 day." });
              if (user.restrictedHolidays < 1)
                return res
                  .status(400)
                  .json({
                    message: "Restricted Holiday already used for this year.",
                  });
              const canTakeRestrictedLeave = await user.checkConsecutivePaidLeaves(
                leaveStart,
                leaveEnd
              );
              if (!canTakeRestrictedLeave) {
                return res
                  .status(400)
                  .json({
                    message: "Cannot take more than 3 consecutive paid leave days.",
                  });
              }
              if (!segment.restrictedHoliday)
                return res
                  .status(400)
                  .json({ message: "Restricted holiday name must be provided." });
              const validHolidays = [
                "Raksha Bandhan",
                "Janmashtami",
                "Karva Chauth",
                "Christmas"
              ];
              if (!validHolidays.includes(segment.restrictedHoliday)) {
                return res
                  .status(400)
                  .json({ message: "Invalid restricted holiday name." });
              }
              const existingRestrictedLeave = await Leave.findOne({
                employeeId: user.employeeId,
                leaveType: "Restricted Holidays",
                'fullDay.from': { $gte: new Date(currentYear, 0, 1) },
                $or: [
                  { "status.hod": { $in: ["Pending", "Approved"] } },
                  { "status.ceo": { $in: ["Pending", "Approved"] } },
                  { "status.admin": { $in: ["Pending", "Acknowledged"] } },
                ],
              });
              if (existingRestrictedLeave) {
                return res
                  .status(400)
                  .json({
                    message:
                      "A Restricted Holiday request already exists for this year.",
                  });
              }
              break;
            case "Compensatory":
              if (!segment.compensatoryEntryId || !segment.projectDetails) {
                return res
                  .status(400)
                  .json({
                    message:
                      "Compensatory entry ID and project details are required",
                  });
              }
              const entry = user.compensatoryAvailable.find(
                (e) =>
                  e._id.toString() === segment.compensatoryEntryId &&
                  e.status === "Available"
              );
              if (!entry) {
                return res
                  .status(400)
                  .json({
                    message: "Invalid or unavailable compensatory leave entry",
                  });
              }
              const hoursNeeded = leaveDays === 0.5 ? 4 : 8;
              if (entry.hours !== hoursNeeded) {
                return res
                  .status(400)
                  .json({
                    message: `Selected entry (${entry.hours} hours) does not match leave duration (${leaveDays === 0.5 ? "Half Day (4 hours)" : "Full Day (8 hours)"})`,
                  });
              }
              break;
            case "Emergency":
              if (!user.canApplyEmergencyLeave) {
                return res
                  .status(403)
                  .json({
                    message: "You are not authorized to apply for Emergency leave",
                  });
              }
              if (leaveDays > 1) {
                return res
                  .status(400)
                  .json({
                    message: "Emergency leave must be half day or one full day",
                  });
              }
              if (req.user.role === "HOD") {
                const ceo = await Employee.findOne({ loginType: "CEO" });
                if (!ceo || !ceo.canApplyEmergencyLeave) {
                  return res
                    .status(403)
                    .json({
                      message:
                        "CEO approval required for HOD to apply for Emergency leave",
                    });
                }
              }
              const canTakeEmergencyLeave = await user.checkConsecutivePaidLeaves(
                leaveStart,
                leaveEnd
              );
              if (!canTakeEmergencyLeave) {
                return res
                  .status(400)
                  .json({
                    message: "Cannot take more than 3 consecutive paid leave days.",
                  });
              }
              break;
            case "Leave Without Pay(LWP)":
              break;
            default:
              return res.status(400).json({ message: "Invalid leave type." });
          }

          const status = {
            hod: req.user.role === "Employee" ? "Pending" : req.user.role === "HOD" ? "Submitted" : "Approved",
            ceo: "Pending",
            admin: "Pending",
          };

          let medicalCertificateId = null;
          if (segment.leaveType === "Medical" && req.file) {
            const fileData = await uploadToGridFS(req.file, {
              employeeId: user.employeeId,
              leaveType: "Medical",
            });
            medicalCertificateId = fileData._id;
          }

          const leave = new Leave({
            employeeId: user.employeeId,
            employee: user._id,
            name: user.name,
            designation: user.designation,
            department: user.department,
            leaveType: segment.leaveType,
            fullDay: {
              from: segment.fullDay?.from,
              to: segment.fullDay?.to || segment.fullDay?.from,
              fromDuration: segment.fullDay?.fromDuration || 'full',
              fromSession: segment.fullDay?.fromSession,
              toDuration: segment.fullDay?.toDuration || 'full',
              toSession: segment.fullDay?.toSession,
            },
            reason: segment.reason,
            chargeGivenTo: segment.chargeGivenTo,
            emergencyContact: segment.emergencyContact,
            compensatoryEntryId: segment.compensatoryEntryId,
            projectDetails: segment.projectDetails,
            restrictedHoliday: segment.restrictedHoliday,
            medicalCertificate: medicalCertificateId,
            status,
            compositeLeaveId: req.body.compositeLeaveId || null,
          });
          console.log("Received compositeLeaveId:", req.body.compositeLeaveId);

          await leave.save();
          savedLeaves.push(leave);

          if (savedLeaves.length === 1) {
            const dateRangeStr =
              `from ${segment.fullDay.from}${segment.fullDay.fromDuration === 'half' ? ` (${segment.fullDay.fromSession})` : ''}${segment.fullDay.to ? ` to ${segment.fullDay.to}${segment.fullDay.toDuration === 'half' ? ` (${segment.fullDay.toSession})` : ''}` : ''}`;
            await Notification.create({
              userId: chargeGivenToEmployee.employeeId,
              message: `You have been assigned as Charge Given To for ${user.name}'s leave ${dateRangeStr}. You cannot apply for non-Emergency leaves during this period until the leave is rejected.`,
            });
            if (global._io) {
              global._io.to(chargeGivenToEmployee.employeeId).emit("notification", {
                message: `You have been assigned as Charge Given To for ${user.name}'s leave ${dateRangeStr}. You cannot apply for non-Emergency leaves during this period until the leave is rejected.`,
              });
            }
          }

          if (req.user.role === "HOD" || req.user.role === "Admin") {
            const ceo = await Employee.findOne({ loginType: "CEO" });
            if (ceo && savedLeaves.length === leaveSegments.length) {
              await Notification.create({
                userId: ceo.employeeId,
                message: `New leave request from ${user.name}`,
              });
              if (global._io)
                global._io
                  .to(ceo.employeeId)
                  .emit("notification", {
                    message: `New leave request from ${user.name}`,
                  });
            }
          } else {
            const hod = await Employee.findOne({
              department: user.department,
              loginType: "HOD",
            });
            if (hod && savedLeaves.length === leaveSegments.length) {
              await Notification.create({
                userId: hod.employeeId,
                message: `New leave request from ${user.name}`,
              });
              if (global._io)
                global._io
                  .to(hod.employeeId)
                  .emit("notification", {
                    message: `New leave request from ${user.name}`,
                  });
            }
          }
        } catch (err) {
          errors.push({ segment, message: err.message });
          console.error("Segment processing error:", err.stack);
        }
      }

      if (errors.length > 0) {
        return res.status(400).json({ message: "Some leave segments failed", errors, savedLeaves });
      }

      await Audit.create({
        user: user.employeeId,
        action: "Submit Leave",
        details: "Submitted leave request",
      });

      res.status(201).json(savedLeaves);
    } catch (err) {
      console.error("Leave submit error:", err.stack);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  }
);

router.get('/next-composite-id', auth, async (req, res) => {
  try {
    const compositeLeaveId = await generateNextCompositeLeaveId();
    res.json({ compositeLeaveId });
  } catch (error) {
    res.status(500).json({ message: "Error generating compositeLeaveId", error: error.message });
  }
});


// Edit Leave to Upload Medical Certificate
router.put(
  "/:id/upload-certificate",
  auth,
  role(["Employee"]),
  upload.single("medicalCertificate"),
  async (req, res) => {
    try {
      const leave = await Leave.findById(req.params.id);
      if (!leave) {
        return res.status(404).json({ message: "Leave request not found" });
      }
      if (leave.employee.toString() !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to edit this leave" });
      }
      if (leave.leaveType !== "Medical") {
        return res.status(400).json({ message: "This endpoint is only for Medical leave certificate uploads" });
      }
      if (leave.status.hod !== "Pending" || leave.status.ceo !== "Pending" || leave.status.admin !== "Pending") {
        return res.status(400).json({ message: "Cannot edit certificate after approval process has started" });
      }
      if (!req.file) {
        return res.status(400).json({ message: "Medical certificate file is required" });
      }

      const fileData = await uploadToGridFS(req.file, {
        employeeId: leave.employeeId,
        leaveType: "Medical",
      });

      leave.medicalCertificate = fileData._id;
      await leave.save();

      await Audit.create({
        user: leave.employeeId,
        action: "Upload Medical Certificate",
        details: `Uploaded medical certificate for leave ${leave._id}`,
      });

      res.json({ message: "Medical certificate uploaded successfully", leave });
    } catch (err) {
      console.error("Medical certificate upload error:", err.stack);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  }
);

// Get Leaves
router.get("/", auth, async (req, res) => {
  try {
    if (!gfsReady()) {
      return res.status(500).json({ message: "GridFS is not initialized" });
    }
    const gfs = getGfs();
    const user = await Employee.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "Employee not found" });
    }

    let query = {};
    const {
      employeeId,
      departmentId,
      leaveType,
      status,
      fromDate,
      toDate,
      page = 1,
      limit = 10,
    } = req.query;

    if (employeeId) {
      if (!/^[A-Za-z0-9]+$/.test(employeeId)) {
        return res.status(400).json({ message: "Invalid Employee ID format" });
      }
      const employee = await Employee.findOne({ employeeId });
      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }
      query.employeeId = employeeId;
    }

    if (departmentId && departmentId !== "all") {
      const department = await Department.findById(departmentId);
      if (!department) {
        return res.status(404).json({ message: "Department not found" });
      }
      query.department = departmentId;
    }

    if (req.user.role === "Employee") {
      query.employeeId = user.employeeId;
    } else if (req.user.role === "HOD") {
      query.department = user.department;
    }

    if (leaveType && leaveType !== "all") {
      query.leaveType = leaveType;
    }

    if (status && status !== "all") {
      query.$or = [
        { "status.hod": status },
        { "status.ceo": status },
        { "status.admin": status },
      ];
    }

    if (fromDate) {
      const startDate = new Date(fromDate);
      startDate.setHours(0, 0, 0, 0);
      query['fullDay.from'] = { $gte: startDate };
    }

    if (toDate) {
      const endDate = new Date(toDate);
      endDate.setHours(23, 59, 59, 999);
      query['fullDay.to'] = { $lte: endDate };
    }

    const total = await Leave.countDocuments(query);
    const leaves = await Leave.find(query)
      .populate("department", "name")
      .populate("chargeGivenTo", "name")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const leavesWithCertificates = await Promise.all(
      leaves.map(async (leave) => {
        let medicalCertificate = null;
        if (leave.leaveType === "Medical" && leave.medicalCertificate) {
          try {
            const file = await gfs
              .find({ _id: leave.medicalCertificate })
              .toArray();
            if (file[0]) {
              medicalCertificate = {
                _id: file[0]._id,
                filename: file[0].filename,
              };
            }
          } catch (err) {
            console.error(
              `Error fetching file ${leave.medicalCertificate} for leave ${leave._id}:`,
              err
            );
          }
        }
        return {
          ...leave.toObject(),
          medicalCertificate,
        };
      })
    );

    res.json({ leaves: leavesWithCertificates, total });
  } catch (err) {
    console.error("Fetch leaves error:", err.stack);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Approve Leave
router.put(
  "/:id/approve",
  auth,
  role(["HOD", "CEO", "Admin"]),
  async (req, res) => {
    try {
      const leave = await Leave.findById(req.params.id)
        .populate("employee")
        .populate("chargeGivenTo");
      if (!leave) {
        return res.status(404).json({ message: "Leave request not found" });
      }

      const user = await Employee.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { status, remarks } = req.body;
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

      if (leave.status[currentStage] !== "Pending") {
        return res
          .status(400)
          .json({
            message: `Leave is not pending ${currentStage.toUpperCase()} approval`,
          });
      }

      if (
        status === "Rejected" &&
        ["hod", "ceo"].includes(currentStage) &&
        (!remarks || remarks.trim() === "")
      ) {
        return res
          .status(400)
          .json({ message: "Remarks are required for rejection" });
      }

      if (
        req.user.role === "HOD" &&
        user.department.toString() !== leave.department.toString()
      ) {
        return res
          .status(403)
          .json({
            message: "Not authorized to approve leaves for this department",
          });
      }

      if (req.user.role === "CEO" && !["Approved", "Submitted"].includes(leave.status.hod)) {
        return res
          .status(400)
          .json({ message: "Leave must be approved or Submitted by HOD first" });
      }

      if (req.user.role === "Admin" && leave.status.ceo !== "Approved") {
        return res
          .status(400)
          .json({ message: "Leave must be approved by CEO first" });
      }

      if (req.user.role === "Admin" && leave.leaveType === "Medical" && !leave.medicalCertificate) {
        return res
          .status(400)
          .json({ message: "Medical leave cannot be acknowledged without a medical certificate" });
      }

      leave.status[currentStage] = status;
      if (status === "Rejected" && ["hod", "ceo"].includes(currentStage)) {
        leave.remarks = remarks;
      }

      if (["Approved", "Submitted"].includes(status) && currentStage === "hod") {
        leave.status.ceo = "Pending";
        const ceo = await Employee.findOne({ loginType: "CEO" });
        if (ceo) {
          await Notification.create({
            userId: ceo.employeeId,
            message: `Leave request from ${leave.name} awaiting your approval`,
          });
          if (global._io) {
            global._io
              .to(ceo.employeeId)
              .emit("notification", {
                message: `Leave request from ${leave.name} awaiting your approval`,
              });
          }
        }
      }

      if (status === "Approved" && currentStage === "ceo") {
        leave.status.admin = "Pending";
        const admin = await Employee.findOne({ loginType: "Admin" });
        if (admin) {
          await Notification.create({
            userId: admin.employeeId,
            message: `Leave request from ${leave.name} awaiting your acknowledgment`,
          });
          if (global._io) {
            global._io
              .to(admin.employeeId)
              .emit("notification", {
                message: `Leave request from ${leave.name} awaiting your acknowledgment`,
              });
          }
        }
      }

      if (status === "Acknowledged" && currentStage === "admin") {
        const employee = leave.employee;
        switch (leave.leaveType) {
          case "Casual":
            await employee.deductPaidLeaves(
              leave.fullDay.from,
              leave.fullDay.to,
              leave.leaveType
            );
            break;
          case "Medical":
            await employee.deductMedicalLeaves(
              leave,
              leave.fullDay.fromDuration === "half" && leave.fullDay.from === leave.fullDay.to
                ? 0.5
                : leave.fullDay?.from && leave.fullDay?.to
                ? (new Date(leave.fullDay.to) - new Date(leave.fullDay.from)) /
                    (1000 * 60 * 60 * 24) +
                  1 -
                  (leave.fullDay.fromDuration === "half" ? 0.5 : 0) -
                  (leave.fullDay.toDuration === "half" ? 0.5 : 0)
                : 0
            );
            break;
          case "Maternity":
            await employee.recordMaternityClaim();
            break;
          case "Paternity":
            await employee.recordPaternityClaim();
            break;
          case "Restricted Holidays":
            await employee.deductRestrictedHolidays();
            break;
          case "Compensatory":
            const entry = employee.compensatoryAvailable.find(
              (e) => e._id.toString() === leave.compensatoryEntryId.toString()
            );
            if (entry) {
              entry.status = "Used";
            }
            await employee.deductCompensatoryLeaves(leave.compensatoryEntryId);
            break;
          case "Emergency":
            const leaveDays =
              leave.fullDay.fromDuration === "half" && leave.fullDay.from === leave.fullDay.to
                ? 0.5
                : leave.fullDay?.from && leave.fullDay.to
                ? (new Date(leave.fullDay.to) - new Date(leave.fullDay.from)) /
                    (1000 * 60 * 60 * 24) +
                  1 -
                  (leave.fullDay.fromDuration === "half" ? 0.5 : 0) -
                  (leave.fullDay.toDuration === "half" ? 0.5 : 0)
                : 1;
            if (employee.paidLeaves >= leaveDays) {
              await employee.deductPaidLeaves(
                leave.fullDay.from,
                leave.fullDay.to,
                leave.leaveType
              );
            } else {
              await employee.incrementUnpaidLeaves(
                leave.fullDay.from,
                leave.fullDay.to,
                leave.employee
              );
            }
            break;
          case "Leave Without Pay(LWP)":
            await employee.incrementUnpaidLeaves(
              leave.fullDay.from,
              leave.fullDay.to,
              leave.employee
            );
            break;
          default:
            return res
              .status(400)
              .json({ message: "Invalid leave type for balance update" });
        }

        await employee.save();
      }

      if (status === "Rejected") {
        leave.status.hod = "N/A";
        leave.status.ceo = "N/A";
        leave.status.admin = "N/A";

        await Notification.create({
          userId: leave.employee.employeeId,
          message: `Your ${leave.leaveType} leave request was rejected by ${currentStage.toUpperCase()}`,
        });
        if (global._io) {
          global._io
            .to(leave.employee.employeeId)
            .emit("notification", {
              message: `Your ${leave.leaveType} leave request was rejected by ${currentStage.toUpperCase()}`,
            });
        }

        if (leave.chargeGivenTo) {
          const dateRangeStr = `from ${new Date(leave.fullDay.from).toISOString().split("T")[0]}${leave.fullDay.fromDuration === "half" ? ` (${leave.fullDay.fromSession})` : ""}${new Date(leave.fullDay.to) ? ` to ${new Date(leave.fullDay.to).toISOString().split("T")[0]}${leave.fullDay.toDuration === "half" ? ` (${leave.fullDay.toSession})` : ""}` : ""}`;
          await Notification.create({
            userId: leave.chargeGivenTo.employeeId,
            message: `You are no longer assigned as Charge Given To for ${leave.name}'s leave ${dateRangeStr} due to rejection by ${currentStage.toUpperCase()}. You can now apply for non-Emergency leaves during this period.`,
          });
          if (global._io) {
            global._io.to(leave.chargeGivenTo.employeeId).emit("notification", {
              message: `You are no longer assigned as Charge Given To for ${leave.name}'s leave ${dateRangeStr} due to rejection by ${currentStage.toUpperCase()}. You can now apply for non-Emergency leaves.`,
            });
          }
        }
      }

      await leave.save();
      await Audit.create({
        user: user.employeeId,
        action: `${status} Leave`,
        details: `${status} leave request for ${leave.name}`,
      });

      const employee = await Employee.findById(leave.employee);
      if (employee && status !== "Rejected") {
        await Notification.create({
          userId: employee.employeeId,
          message: `Your leave request has been ${status.toLowerCase()} by ${currentStage.toUpperCase()}`,
        });
        if (global._io)
          global._io
            .to(employee.employeeId)
            .emit("notification", {
              message: `Your leave request has been ${status.toLowerCase()} by ${currentStage.toUpperCase()}`,
            });
      }

      res.json(leave);
    } catch (err) {
      console.error("Leave approval error:", err.stack);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  }
);

export default router;