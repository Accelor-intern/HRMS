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
import { toIST, formatForDB, formatForDisplay, startOfDay, endOfDay, now, validateDate } from '../utils/dateUtils.js';
const router = express.Router();

// Helper function to calculate leave days
const calculateLeaveDays = (leaveStart, leaveEnd, fromDuration, toDuration, fromSession, toSession) => {
  if (!leaveEnd || leaveStart.toISOString().split('T')[0] === leaveEnd.toISOString().split('T')[0]) {
    if (fromDuration === 'full' && toDuration === 'full') return 1;
    if (fromDuration === 'half' && toDuration === 'half' && fromSession === 'afternoon' && toSession === 'forenoon') return 0.5;
    return fromDuration === 'half' ? 0.5 : 1;
  }
  let days = (leaveEnd - leaveStart) / (1000 * 60 * 60 * 24) + 1;
  if (fromDuration === 'half') days -= 0.5;
  if (toDuration === 'half') days -= 0.5;
  return days;
};

// Helper function to format leave dates for response
const formatLeaveDates = (leave) => {
  return {
    ...leave._doc,
    dates: {
      ...leave.dates,
      from: formatForDisplay(leave.dates.from, 'YYYY-MM-DD'),
      to: leave.dates.to ? formatForDisplay(leave.dates.to, 'YYYY-MM-DD') : null,
      fromDuration: leave.dates.fromDuration,
      fromSession: leave.dates.fromSession,
      toDuration: leave.dates.toDuration,
      toSession: leave.dates.toSession,
    },
    createdAt: formatForDisplay(leave.createdAt, 'YYYY-MM-DD HH:mm:ss'),
  };
};

// Submit Leave
router.post(
  "/",
  auth,
  role(["Employee", "HOD", "Admin"]),
  upload.fields([
    { name: 'medicalCertificate', maxCount: 1 },
    { name: 'supportingDocuments', maxCount: 1 }
  ]),
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
      const today = startOfDay(toIST(new Date()));
      const sevenDaysAgo = toIST(new Date()).subtract(7, 'days');

      let leaveDays = 0;
      let leaveStart, leaveEnd;
      if (req.body.dates?.from) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(req.body.dates.from)) {
          return res
            .status(400)
            .json({
              message: "Invalid full day from date format (expected YYYY-MM-DD)",
            });
        }
        leaveStart = toIST(parseDate(req.body.dates.from));
        if (!validateDate(leaveStart)) {
          return res.status(400).json({ message: "Invalid full day from date" });
        }
        const fromDuration = req.body.dates.fromDuration || 'full';
        const fromSession = req.body.dates.fromSession;
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
        } else if (!req.body.dates?.to) {
          leaveDays = 1;
          leaveEnd = new Date(leaveStart);
        } else {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(req.body.dates.to)) {
            return res
              .status(400)
              .json({
                message: "Invalid full day to date format (expected YYYY-MM-DD)",
              });
          }
          leaveEnd = toIST(parseDate(req.body.dates.to));
          if (!validateDate(leaveEnd)) {
            return res.status(400).json({ message: "Invalid full day to date" });
          }
          const toDuration = req.body.dates.toDuration || 'full';
          const toSession = req.body.dates.toSession;
          if (!['full', 'half'].includes(toDuration)) {
            return res.status(400).json({ message: "Invalid toDuration, must be 'full' or 'half'" });
          }
          if (toDuration === 'half' && toSession !== 'forenoon') {
            return res.status(400).json({ message: "toSession must be 'forenoon' for half-day toDuration" });
          }
          if (toDuration === 'half' && !toSession) {
            return res.status(400).json({ message: "toSession is required for half-day toDuration" });
          }
          leaveDays = calculateLeaveDays(leaveStart, leaveEnd, fromDuration, toDuration, fromSession, toSession);
          if (leaveDays === null) {
            return res.status(400).json({ message: "Invalid duration combination for same-day leave" });
          }
        }
      } else {
        return res.status(400).json({ message: "Invalid leave dates provided" });
      }

      if (req.body.leaveType === "Medical") {
        if (leaveStart < sevenDaysAgo || leaveStart > today) {
          return res
            .status(400)
            .json({
              message:
                `Medical leave from date must be within today (${formatForDisplay(today)}) and 7 days prior`,
            });
        }
        if (!req.body.dates?.to) {
          return res.status(400).json({ message: "To date is required for Medical leave" });
        }
      } else if (req.body.leaveType === "Emergency") {
        if (!startOfDay(leaveStart).equals(startOfDay(today)) || (leaveEnd && !startOfDay(leaveEnd).equals(startOfDay(today)))) {
          return res
            .status(400)
            .json({
              message: "Emergency leave must be for the current date only",
            });
        }
      } else if (req.body.dates?.from && leaveStart <= today) {
        return res
          .status(400)
          .json({
            message:
              "Full day from date must be after today for this leave type",
          });
      }
      if (leaveStart > leaveEnd) {
        return res
          .status(400)
          .json({ message: "Leave start date cannot be after end date" });
      }

      // Check if user is assigned as Charge Given To for any non-rejected leaves overlapping with the requested period (except for Emergency leave)
      if (req.body.leaveType !== "Emergency") {
        const overlappingChargeAssignments = await Leave.find({
          chargeGivenTo: user._id,
          $or: [
            {
              "dates.from": { $lte: formatForDB(leaveEnd) },
              "dates.to": { $gte: formatForDB(leaveStart) },
              $and: [
                { "status.hod": { $ne: "Rejected" } },
                { "status.ceo": { $ne: "Rejected" } },
                { "status.admin": { $in: ["Pending", "Acknowledged"] } },
              ],
              $or: [
                { 'dates.fromDuration': 'full' },
                { 'dates.fromDuration': 'half', 'dates.fromSession': { $in: ['forenoon', 'afternoon'] } }
              ],
              ...(formatForDB(leaveStart).toISOString().split('T')[0] !== formatForDB(leaveEnd).toISOString().split('T')[0] && {
                $or: [
                  { 'dates.toDuration': 'full' },
                  { 'dates.toDuration': 'half', 'dates.toSession': 'forenoon' }
                ]
              })
            }
          ],
        });
        if (overlappingChargeAssignments.length > 0) {
          const leaveDetails = overlappingChargeAssignments[0];
          const dateRangeStr =
            `from ${
              formatForDisplay(leaveDetails.dates.from, 'YYYY-MM-DD')
            }${leaveDetails.dates.fromDuration === 'half' ? ` (${leaveDetails.dates.fromSession})` : ''}${leaveDetails.dates.to ? ` to ${
              formatForDisplay(leaveDetails.dates.to, 'YYYY-MM-DD')
            }${leaveDetails.dates.toDuration === 'half' ? ` (${leaveDetails.dates.toSession})` : ''}` : ''}`;
          return res.status(400).json({
            message: `You are assigned as Charge Given To for a leave ${dateRangeStr} and cannot apply for non-Emergency leaves during this period.`,
          });
        }
      }

      const leaveType = req.body.leaveType;
      const isConfirmed = user.employeeType === "Confirmed";
      const joinDate = new Date(user.dateOfJoining);
      const yearsOfService =
        (new Date() - joinDate) / (1000 * 60 * 60 * 24 * 365);

      let medicalCertificateId = null;
      let supportingDocumentsId = null;
      
      // Handle medical certificate upload
      if (leaveType === "Medical") {
        if (!req.files?.medicalCertificate) {
          return res.status(400).json({
            message: "Medical certificate is required for Medical leave",
          });
        }
        const fileData = await uploadToGridFS(req.files.medicalCertificate[0], {
          employeeId: user.employeeId,
          leaveType: "Medical",
        });
        medicalCertificateId = fileData._id;
      }
      
      // Handle supporting documents upload for maternity/paternity leave
      if (["Maternity", "Paternity"].includes(leaveType)) {
        if (!req.files?.supportingDocuments) {
          return res.status(400).json({
            message: "Supporting documents are required for Maternity/Paternity leave",
          });
        }
        const fileData = await uploadToGridFS(req.files.supportingDocuments[0], {
          employeeId: user.employeeId,
          leaveType: "Supporting",
        });
        supportingDocumentsId = fileData._id;
      }

      // Validate chargeGivenTo
      const chargeGivenToEmployee = await Employee.findById(
        req.body.chargeGivenTo
      );
      if (!chargeGivenToEmployee) {
        return res
          .status(400)
          .json({ message: "Selected employee for Charge Given To not found" });
      }
      // Check for overlapping charge assignments or employee's own leaves
      const startDateOnly = startOfDay(leaveStart);
      const endDateOnly = startOfDay(leaveEnd);
      const overlappingLeaves = await Leave.find({
        $or: [
          // Leaves where chargeGivenTo is assigned
          {
            chargeGivenTo: req.body.chargeGivenTo,
            $or: [
              {
                "dates.from": { $lte: formatForDB(leaveEnd) },
                "dates.to": { $gte: formatForDB(leaveStart) },
                $and: [
                  { "status.hod": { $in: ["Pending", "Approved"] } },
                  { "status.ceo": { $in: ["Pending", "Approved"] } },
                  { "status.admin": { $in: ["Pending", "Acknowledged"] } },
                ],
                $or: [
                  { 'dates.fromDuration': 'full' },
                  { 'dates.fromDuration': 'half', 'dates.fromSession': { $in: ['forenoon', 'afternoon'] } }
                ],
                ...(formatForDB(leaveStart).toISOString().split('T')[0] !== formatForDB(leaveEnd).toISOString().split('T')[0] && {
                  $or: [
                    { 'dates.toDuration': 'full' },
                    { 'dates.toDuration': 'half', 'dates.toSession': 'forenoon' }
                  ]
                })
              },
              {
                "dates.from": { $gte: formatForDB(startDateOnly), $lte: formatForDB(endDateOnly) },
                "dates.to": { $gte: formatForDB(startDateOnly), $lte: formatForDB(endDateOnly) },
                "dates.fromDuration": 'half',
                "dates.fromSession": { $in: ['forenoon', 'afternoon'] },
                $and: [
                  { "status.hod": { $in: ["Pending", "Approved"] } },
                  { "status.ceo": { $in: ["Pending", "Approved"] } },
                  { "status.admin": { $in: ["Pending", "Acknowledged"] } },
                ]
              }
            ]
          },
          // Leaves where chargeGivenTo is the employee
          {
            employee: req.body.chargeGivenTo,
            $or: [
              {
                "dates.from": { $lte: formatForDB(leaveEnd) },
                "dates.to": { $gte: formatForDB(leaveStart) },
                $and: [
                  { "status.hod": { $in: ["Pending", "Approved"] } },
                  { "status.ceo": { $in: ["Pending", "Approved"] } },
                  { "status.admin": { $in: ["Pending", "Acknowledged"] } },
                ],
                $or: [
                  { 'dates.fromDuration': 'full' },
                  { 'dates.fromDuration': 'half', 'dates.fromSession': { $in: ['forenoon', 'afternoon'] } }
                ],
                ...(formatForDB(leaveStart).toISOString().split('T')[0] !== formatForDB(leaveEnd).toISOString().split('T')[0] && {
                  $or: [
                    { 'dates.toDuration': 'full' },
                    { 'dates.toDuration': 'half', 'dates.toSession': 'forenoon' }
                  ]
                })
              },
              {
                "dates.from": { $gte: formatForDB(startDateOnly), $lte: formatForDB(endDateOnly) },
                "dates.to": { $gte: formatForDB(startDateOnly), $lte: formatForDB(endDateOnly) },
                "dates.fromDuration": 'half',
                "dates.fromSession": { $in: ['forenoon', 'afternoon'] },
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
          if (![3, 4].includes(leaveDays))
            return res
              .status(400)
              .json({ message: "Medical leave must be either 3 or 4 days." });
          if (user.medicalLeaves < leaveDays)
            return res
              .status(400)
              .json({
                message:
                  "Medical leave already used or insufficient balance for this year.",
              });
          const medicalLeavesThisYear = await Leave.find({
            employeeId: user.employeeId,
            leaveType: "Medical",
            "status.admin": "Acknowledged",
            'dates.from': { $gte: new Date(currentYear, 0, 1) }
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
          if (!req.body.restrictedHoliday)
            return res
              .status(400)
              .json({ message: "Restricted holiday must be selected." });
          const existingRestrictedLeave = await Leave.findOne({
            employeeId: user.employeeId,
            leaveType: "Restricted Holidays",
            'dates.from': { $gte: new Date(currentYear, 0, 1) },
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
          if (!req.body.compensatoryEntryId || !req.body.projectDetails) {
            return res
              .status(400)
              .json({
                message:
                  "Compensatory entry ID and project details are required",
              });
          }
          const entry = user.compensatoryAvailable.find(
            (e) =>
              e._id.toString() === req.body.compensatoryEntryId &&
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
                message: `Selected entry (${
                  entry.hours
                } hours) does not match leave duration (${
                  leaveDays === 0.5
                    ? "Half Day (4 hours)"
                    : "Full Day (8 hours)"
                })`,
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

      const leave = new Leave({
        employeeId: user.employeeId,
        employee: user._id,
        name: user.name,
        designation: user.designation,
        department: user.department,
        leaveType: req.body.leaveType,
        dates: {
          from: formatForDB(leaveStart),
          to: formatForDB(leaveEnd),
          fromDuration: req.body.dates?.fromDuration || 'full',
          fromSession: req.body.dates?.fromSession,
          toDuration: req.body.dates?.toDuration || 'full',
          toSession: req.body.dates?.toSession,
        },
        reason: req.body.reason,
        chargeGivenTo: req.body.chargeGivenTo,
        emergencyContact: req.body.emergencyContact,
        compensatoryEntryId: req.body.compensatoryEntryId,
        projectDetails: req.body.projectDetails,
        restrictedHoliday: req.body.restrictedHoliday,
        medicalCertificate: medicalCertificateId,
        supportingDocuments: supportingDocumentsId,
        status,
      });

      await leave.save();

      // Notify the chargeGivenTo employee
      const dateRangeStr =
        `from ${formatForDisplay(leaveStart, 'YYYY-MM-DD')}${req.body.dates.fromDuration === 'half' ? ` (${req.body.dates.fromSession})` : ''}${leaveEnd ? ` to ${formatForDisplay(leaveEnd, 'YYYY-MM-DD')}${req.body.dates.toDuration === 'half' ? ` (${req.body.dates.toSession})` : ''}` : ''}`;
      await Notification.create({
        userId: chargeGivenToEmployee.employeeId,
        message: `You have been assigned as Charge Given To for ${user.name}'s leave ${dateRangeStr}. You cannot apply for non-Emergency leaves during this period until the leave is rejected.`,
      });
      if (global._io) {
        global._io.to(chargeGivenToEmployee.employeeId).emit("notification", {
          message: `You have been assigned as Charge Given To for ${user.name}'s leave ${dateRangeStr}. You cannot apply for non-Emergency leaves during this period until the leave is rejected.`,
        });
      }

      if (req.user.role === "HOD" || req.user.role === "Admin") {
        const ceo = await Employee.findOne({ loginType: "CEO" });
        if (ceo) {
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
        if (hod) {
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

      await Audit.create({
        user: user.employeeId,
        action: "Submit Leave",
        details: "Submitted leave request",
      });

      res.status(201).json(formatLeaveDates(leave));
    } catch (err) {
      console.error("Leave submit error:", err.stack);
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
      const startDate = parseDate(fromDate);
      if (!validateDate(startDate)) {
        return res.status(400).json({ message: "Invalid from date format" });
      }
      query['dates.from'] = { $gte: formatForDB(startDate) };
    }

    if (toDate) {
      const endDate = parseDate(toDate);
      if (!validateDate(endDate)) {
        return res.status(400).json({ message: "Invalid to date format" });
      }
      query['dates.to'] = { $lte: formatForDB(endDate) };
    }

    const total = await Leave.countDocuments(query);
    const leaves = await Leave.find(query)
      .populate("department", "name")
      .populate("chargeGivenTo", "name")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    // Manually fetch file information for leaves
    const leavesWithDocuments = await Promise.all(
      leaves.map(async (leave) => {
        let medicalCertificate = null;
        let supportingDocuments = null;
        
        // Handle medical certificate for Medical leaves
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
            console.error('Error fetching medical certificate:', err);
          }
        }
        
        // Handle supporting documents for Maternity/Paternity leaves
        if ((leave.leaveType === "Maternity" || leave.leaveType === "Paternity") && leave.supportingDocuments) {
          try {
            const file = await gfs
              .find({ _id: leave.supportingDocuments })
              .toArray();
            if (file[0]) {
              supportingDocuments = {
                _id: file[0]._id,
                filename: file[0].filename,
              };
            }
          } catch (err) {
            console.error('Error fetching supporting documents:', err);
          }
        }

        return formatLeaveDates({
          ...leave._doc,
          medicalCertificate,
          supportingDocuments,
        });
      })
    );

    res.json({
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
      leaves: leavesWithDocuments,
    });
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
            message: `Invalid status. Must be one of ${validStatuses.join(
              ", "
            )}`,
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
                message: `Leave request from ${leave.name} (${formatForDisplay(leave.dates.from, 'DD MMMM YYYY')}${leave.dates.to ? ' to ' + formatForDisplay(leave.dates.to, 'DD MMMM YYYY') : ''}) awaiting your approval`,
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
                message: `Leave request from ${leave.name} (${formatForDisplay(leave.dates.from, 'DD MMMM YYYY')}${leave.dates.to ? ' to ' + formatForDisplay(leave.dates.to, 'DD MMMM YYYY') : ''}) awaiting your acknowledgment`,
              });
          }
        }
      }

      if (status === "Acknowledged" && currentStage === "admin") {
        const employee = leave.employee;
        const leaveDays = calculateLeaveDays(
          parseDate(leave.dates.from),
          leave.dates.to ? parseDate(leave.dates.to) : parseDate(leave.dates.from),
          leave.dates.fromDuration,
          leave.dates.toDuration,
          leave.dates.fromSession,
          leave.dates.toSession
        );
        switch (leave.leaveType) {
          case "Casual":
            await employee.deductPaidLeaves(
              leave.dates.from,
              leave.dates.to,
              leave.leaveType
            );
            break;
          case "Medical":
            await employee.deductMedicalLeaves(
              leave,
              leaveDays
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
            if (employee.paidLeaves >= leaveDays) {
              await employee.deductPaidLeaves(
                leave.dates.from,
                leave.dates.to,
                leave.leaveType
              );
            } else {
              await employee.incrementUnpaidLeaves(
                leave.dates.from,
                leave.dates.to,
                leave.employee
              );
            }
            break;
          case "Leave Without Pay(LWP)":
            await employee.incrementUnpaidLeaves(
              leave.dates.from,
              leave.dates.to,
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
        // Format dates for display
        const fromStr = formatForDisplay(leave.dates.from, 'YYYY-MM-DD');
        const toStr = leave.dates.to ? formatForDisplay(leave.dates.to, 'YYYY-MM-DD') : fromStr;
        
        // Notify the employee who submitted the leave
        await Notification.create({
          userId: leave.employee.employeeId,
          message: `Your ${
            leave.leaveType
          } leave request (${formatForDisplay(leave.dates.from, 'DD MMMM YYYY')}${leave.dates.to ? ' to ' + formatForDisplay(leave.dates.to, 'DD MMMM YYYY') : ''}) was rejected by ${currentStage.toUpperCase()}`,
        });
        if (global._io) {
          global._io
            .to(leave.employee.employeeId)
            .emit("notification", {
              message: `Your ${
                leave.leaveType
              } leave request (${formatForDisplay(leave.dates.from, 'DD MMMM YYYY')}${leave.dates.to ? ' to ' + formatForDisplay(leave.dates.to, 'DD MMMM YYYY') : ''}) was rejected by ${currentStage.toUpperCase()}`,
            });
        }

        // Notify the chargeGivenTo employee that they are no longer assigned
        if (leave.chargeGivenTo) {
           const dateRangeStr =
            `from ${
                formatForDisplay(leave.dates.from, 'DD MMMM YYYY')
              }${leave.dates.fromDuration === 'half' ? ` (${leave.dates.fromSession})` : ''}${leave.dates.to ? ` to ${formatForDisplay(leave.dates.to, 'DD MMMM YYYY')}${leave.dates.toDuration === 'half' ? ` (${leave.dates.toSession})` : ''}` : ''}`;
          await Notification.create({
            userId: leave.chargeGivenTo.employeeId,
            message: `You are no longer assigned as Charge Given To for ${
              leave.name
            }'s leave ${dateRangeStr} due to rejection by ${currentStage.toUpperCase()}. You can now apply for non-Emergency leaves during this period.`,
          });
          if (global._io) {
            global._io.to(leave.chargeGivenTo.employeeId).emit("notification", {
              message: `You are no longer assigned as Charge Given To for ${
                leave.name
              }'s leave ${dateRangeStr} due to rejection by ${currentStage.toUpperCase()}. You can now apply for non-Emergency leaves.`,
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
              message: `Your leave request (${formatForDisplay(leave.dates.from, 'DD MMMM YYYY')}${leave.dates.to ? ' to ' + formatForDisplay(leave.dates.to, 'DD MMMM YYYY') : ''}) has been ${status.toLowerCase()} by ${currentStage.toUpperCase()}`,
            });
      }

      res.json(formatLeaveDates(leave));
    } catch (err) {
      console.error("Leave approval error:", err.stack);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  }
);

export default router;