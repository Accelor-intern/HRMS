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



// router.post(
//   "/",
//   auth,
//   role(["Employee", "HOD", "Admin"]),
//  upload.any(),
//   async (req, res) => {
//    try {
//       const user = await Employee.findById(req.user.id);
//       if (!user) return res.status(404).json({ message: "Employee not found" });
//       if (!user.designation) return res.status(400).json({ message: "Employee designation is required" });
//       if (!user.department) return res.status(400).json({ message: "Employee department is required" });

//       const today = new Date();
//       today.setUTCHours(0, 0, 0, 0);
//       const sevenDaysAgo = new Date(today);
//       sevenDaysAgo.setDate(today.getDate() - 7);
//       const sevenDaysFuture = new Date(today);
//       sevenDaysFuture.setDate(today.getDate() + 7);

//       // Debug: Log raw req.body and req.files
//       console.log("Raw req.body:", req.body);
//       console.log("Raw req.files:", req.files);

//  const parseSegments = (formData, files) => {
//   console.log("parseSegments input formData:", formData);
//   console.log("parseSegments input files:", files);
//   if (!Array.isArray(formData.segments)) {
//     console.log("No segments array found in formData");
//     return [];
//   }

//   const segments = formData.segments.map((segment, index) => {
//     console.log(`Processing segment ${index}:`, segment);
//     const fromDuration = segment.fullDay?.fromDuration || "full";
//     const toDuration = segment.fullDay?.to ? (segment.fullDay?.toDuration || "full") : "";
//     return {
//       leaveType: segment.leaveType || "",
//       isEmergency: segment.isEmergency === "true" || segment.isEmergency === true,
//       fullDay: {
//         from: segment.fullDay?.from || "",
//         fromDuration,
//         fromSession: fromDuration === "half" ? (segment.fullDay?.fromSession || "forenoon") : null,
//         to: segment.fullDay?.to || "",
//         toDuration,
//         toSession: toDuration === "half" ? (segment.fullDay?.toSession || "forenoon") : null,
//       },
//       compensatoryEntryId: segment.compensatoryEntryId || "",
//       restrictedHoliday: segment.restrictedHoliday || "",
//       projectDetails: segment.projectDetails || "",
//       medicalCertificate: files.find((f) => f.fieldname?.includes(`segments[${index}][medicalCertificate]`)) || null,
//     };
//   });

//   console.log("Generated segments:", segments);
//   return segments.filter(Boolean);
// };

//       const leaveSegments = parseSegments(req.body, req.files || []);
//       console.log("Parsed leaveSegments:", leaveSegments);

//       if (!leaveSegments.length) {
//         return res.status(400).json({ message: "No leave segments provided" });
//       }

//       if (!req.body.reason) return res.status(400).json({ message: "Reason is required" });
//       if (!req.body.chargeGivenTo) return res.status(400).json({ message: "Charge Given To is required" });
//       if (!req.body.emergencyContact) return res.status(400).json({ message: "Emergency Contact is required" });

//       let compositeLeaveId = leaveSegments.length > 1 ? await generateNextCompositeLeaveId() : null;
//       if (leaveSegments.length > 1 && !compositeLeaveId) {
//         return res.status(500).json({ message: "Failed to generate composite leave ID" });
//       }

//       const todayStr = today.toISOString().split("T")[0];
//       const errors = [];
//       const savedLeaves = [];

//       for (const [index, segment] of leaveSegments.entries()) {
//         try {
//           if (!segment.leaveType) throw new Error("Leave Type is required");
//           if (!segment.fullDay.from) throw new Error("From date is required");
//           if (!/^\d{4}-\d{2}-\d{2}$/.test(segment.fullDay.from)) {
//             throw new Error("Invalid from date format (expected YYYY-MM-DD)");
//           }
//           const leaveStart = new Date(segment.fullDay.from);
//           if (isNaN(leaveStart.getTime())) throw new Error("Invalid from date");
//           const fromDuration = segment.fullDay.fromDuration || "full";
//           const fromSession = segment.fullDay.fromSession || "";
//           if (!["full", "half"].includes(fromDuration)) {
//             throw new Error("Invalid fromDuration, must be 'full' or 'half'");
//           }
//           if (fromDuration === "half" && !["forenoon", "afternoon"].includes(fromSession)) {
//             throw new Error("Invalid fromSession, must be 'forenoon' or 'afternoon'");
//           }
//           if (fromDuration === "half" && !fromSession) {
//             throw new Error("fromSession is required for half-day fromDuration");
//           }

//           let leaveEnd = leaveStart;
//           let toDuration = "";
//           let toSession = "";
//           let leaveDays = fromDuration === "half" ? 0.5 : 1;

//           if (segment.fullDay.to) {
//             if (!/^\d{4}-\d{2}-\d{2}$/.test(segment.fullDay.to)) {
//               throw new Error("Invalid to date format (expected YYYY-MM-DD)");
//             }
//             leaveEnd = new Date(segment.fullDay.to);
//             if (isNaN(leaveEnd.getTime())) throw new Error("Invalid to date");
//             toDuration = segment.fullDay.toDuration || "full";
//             toSession = segment.fullDay.toSession || "";
//             if (!["full", "half"].includes(toDuration)) {
//               throw new Error("Invalid toDuration, must be 'full' or 'half'");
//             }
//             if (toDuration === "half" && toSession !== "forenoon") {
//               throw new Error("toSession must be 'forenoon' for half-day toDuration");
//             }
//             if (toDuration === "half" && !toSession) {
//               throw new Error("toSession is required for half-day toDuration");
//             }
//             if (leaveStart.toISOString().split("T")[0] === leaveEnd.toISOString().split("T")[0]) {
//               if (fromDuration === "full" && toDuration === "full") {
//                 leaveDays = 1;
//               } else if (fromDuration === "half" && toDuration === "half" && fromSession === "afternoon" && toSession === "forenoon") {
//                 leaveDays = 0.5;
//               } else {
//                 throw new Error("Invalid duration combination for same-day leave");
//               }
//             } else {
//              const fixedHolidays = [
//   new Date(2025, 0, 26),
//   new Date(2025, 2, 14),
//   new Date(2025, 7, 15),
//   new Date(2025, 9, 2),
//   new Date(2025, 9, 21),
//   new Date(2025, 9, 22),
//   new Date(2025, 10, 5),
// ];

// const isHoliday = (date) =>
//   date.getDay() === 0 ||  // Sunday
//   fixedHolidays.some((holiday) => holiday.toDateString() === date.toDateString());

// let leaveDays = 0;
// let current = new Date(leaveStart);
// current.setHours(0, 0, 0, 0);
// let end = new Date(leaveEnd);
// end.setHours(0, 0, 0, 0);

// while (current <= end) {
//   const isFromDate = current.toISOString().split("T")[0] === leaveStart.toISOString().split("T")[0];
//   const isToDate = current.toISOString().split("T")[0] === leaveEnd.toISOString().split("T")[0];

//   if (!isHoliday(current)) {
//     if (isFromDate && fromDuration === "half") {
//       leaveDays += 0.5;
//     } else if (isToDate && toDuration === "half") {
//       leaveDays += 0.5;
//     } else if (!(isFromDate && fromDuration === "half") && !(isToDate && toDuration === "half")) {
//       leaveDays += 1;
//     }
//   }

//   current.setDate(current.getDate() + 1);
// }


//             }
//           }

//           if (leaveStart > leaveEnd) {
//             throw new Error("Leave start date cannot be after end date");
//           }

//           if (segment.isEmergency && fromDuration === "full" && leaveStart.toISOString().split("T")[0] !== todayStr) {
//             throw new Error("Full-day Emergency leave must be for the current date only");
//           }
//           if (!segment.isEmergency && leaveStart <= today) {
//             throw new Error("From date must be after today for non-Emergency leave");
//           }

//           if (segment.leaveType === "Medical") {
//             if (leaveStart < sevenDaysAgo || leaveStart > sevenDaysFuture) {
//               throw new Error("Medical leave from date must be within 7 days prior and 7 days future from today");
//             }
//             if (!segment.fullDay.to) {
//               throw new Error("To date is required for Medical leave");
//             }
//           }

//           if (!segment.isEmergency) {
//             const overlappingChargeAssignments = await Leave.find({
//               chargeGivenTo: user._id,
//               $or: [
//                 {
//                   "fullDay.from": { $lte: leaveEnd },
//                   "fullDay.to": { $gte: leaveStart },
//                   $and: [
//                     { "status.hod": { $ne: "Rejected" } },
//                     { "status.ceo": { $ne: "Rejected" } },
//                     { "status.admin": { $in: ["Pending", "Acknowledged"] } },
//                   ],
//                 },
//               ],
//             });
//             if (overlappingChargeAssignments.length > 0) {
//               const leaveDetails = overlappingChargeAssignments[0];
//               const dateRangeStr = `from ${new Date(leaveDetails.fullDay.from).toISOString().split("T")[0]}${
//                 leaveDetails.fullDay.fromDuration === "half" ? ` (${leaveDetails.fullDay.fromSession})` : ""
//               }${leaveDetails.fullDay.to ? ` to ${new Date(leaveDetails.fullDay.to).toISOString().split("T")[0]}${
//                 leaveDetails.fullDay.toDuration === "half" ? ` (${leaveDetails.fullDay.toSession})` : ""
//               }` : ""}`;
//               throw new Error(
//                 `You are assigned as Charge Given To for a leave ${dateRangeStr} and cannot apply for non-Emergency leaves during this period.`
//               );
//             }
//           }

//           const chargeGivenToEmployee = await Employee.findById(req.body.chargeGivenTo);
//           if (!chargeGivenToEmployee) {
//             throw new Error("Selected employee for Charge Given To not found");
//           }
//           const startDateOnly = new Date(leaveStart.setHours(0, 0, 0, 0));
//           const endDateOnly = new Date(leaveEnd.setHours(0, 0, 0, 0));
//           const overlappingLeaves = await Leave.find({
//             $or: [
//               {
//                 chargeGivenTo: req.body.chargeGivenTo,
//                 $or: [
//                   {
//                     "fullDay.from": { $lte: leaveEnd },
//                     "fullDay.to": { $gte: leaveStart },
//                     $and: [
//                       { "status.hod": { $in: ["Pending", "Approved"] } },
//                       { "status.ceo": { $in: ["Pending", "Approved"] } },
//                       { "status.admin": { $in: ["Pending", "Acknowledged"] } },
//                     ],
//                   },
//                 ],
//               },
//               {
//                 employee: req.body.chargeGivenTo,
//                 $or: [
//                   {
//                     "fullDay.from": { $lte: leaveEnd },
//                     "fullDay.to": { $gte: leaveStart },
//                     $and: [
//                       { "status.hod": { $in: ["Pending", "Approved"] } },
//                       { "status.ceo": { $in: ["Pending", "Approved"] } },
//                       { "status.admin": { $in: ["Pending", "Acknowledged"] } },
//                     ],
//                   },
//                 ],
//               },
//             ],
//           });
//           if (overlappingLeaves.length > 0) {
//             throw new Error(
//               "Selected employee is either already assigned as Charge Given To or has a pending/approved leave for the specified date range"
//             );
//           }

//           const leaveType = segment.leaveType;
//           const isConfirmed = user.employeeType === "Confirmed";
//           const joinDate = new Date(user.dateOfJoining);
//           const yearsOfService = (new Date() - joinDate) / (1000 * 60 * 60 * 24 * 365);

//           switch (leaveType) {
//             case "Casual":
//               const canTakeCasualLeave = await user.checkConsecutivePaidLeaves(leaveStart, leaveEnd);
//               if (!canTakeCasualLeave) {
//                 throw new Error("Cannot take more than 3 consecutive paid leave days.");
//               }
//               if (user.paidLeaves < leaveDays) {
//                 throw new Error("Insufficient Casual leave balance.");
//               }
//               break;
//             case "Medical":
//               if (!isConfirmed) throw new Error("Medical leave is only for confirmed employees.");
//               if (![3, 4, 7].includes(leaveDays)) throw new Error("Medical leave must be exactly 3, 4, or 7 days.");
//               if (user.medicalLeaves < leaveDays) throw new Error("Insufficient Medical leave balance.");
//               const medicalLeavesThisYear = await Leave.find({
//                 employeeId: user.employeeId,
//                 leaveType: "Medical",
//                 "status.admin": "Acknowledged",
//                 "fullDay.from": { $gte: new Date(today.getFullYear(), 0, 1) },
//               });
//               if (medicalLeavesThisYear.length > 0) {
//                 throw new Error("Medical leave can only be used once per year.");
//               }
//               break;
//             case "Maternity":
//               if (!isConfirmed || user.gender?.trim().toLowerCase() !== "female") {
//                 throw new Error("Maternity leave is only for confirmed female employees.");
//               }
//               if (yearsOfService < 1) throw new Error("Must have completed one year of service.");
//               if (leaveDays !== 90) throw new Error("Maternity leave must be exactly 90 days.");
//               break;
//             case "Paternity":
//               if (!isConfirmed || user.gender?.trim().toLowerCase() !== "male") {
//                 throw new Error("Paternity leave is only for confirmed male employees.");
//               }
//               if (yearsOfService < 1) throw new Error("Must have completed one year of service.");
//               if (leaveDays !== 7) throw new Error("Paternity leave must be exactly 7 days.");
//               break;
//             case "Compensatory":
//               const compensatoryEntry = await CompensatoryLeave.findById(segment.compensatoryEntryId);
//               if (!compensatoryEntry || compensatoryEntry.employeeId.toString() !== user._id.toString() || compensatoryEntry.status !== "Available") {
//                 throw new Error("Invalid or unavailable compensatory leave entry.");
//               }
//               const hoursNeeded = fromDuration === "half" ? 4 : 8;
//               if (compensatoryEntry.hours !== hoursNeeded) {
//                 throw new Error(
//                   `Compensatory entry (${compensatoryEntry.hours} hours) does not match leave duration (${fromDuration === "half" ? "4 hours" : "8 hours"})`
//                 );
//               }
//               break;
//             case "Restricted Holidays":
//               if (!isConfirmed) throw new Error("Restricted Holidays are only for confirmed employees.");
//               if (user.restrictedHolidays <= 0) throw new Error("No restricted holidays available this year.");
//               if (leaveDays !== 1) throw new Error("Restricted Holiday must be exactly 1 day.");
//               break;
//             case "Leave Without Pay(LWP)":
//               if (leaveDays > 30) throw new Error("Leave Without Pay cannot exceed 30 days.");
//               break;
//             case "Emergency":
//               if (!segment.isEmergency) throw new Error("Emergency leave must have isEmergency set to true.");
//               if (leaveDays > 1) throw new Error("Emergency leave can only be half day or one full day.");
//               break;
//             default:
//               throw new Error("Invalid leave type specified.");
//           }

//           const leave = new Leave({
//             employee: user._id,
//             employeeId: user.employeeId,
//   name: user.name,
//   designation: user.designation,
//   department: user.department,
//             leaveType: segment.leaveType,
//             fullDay: {
//               from: leaveStart,
//               fromDuration,
//               fromSession,
//               to: segment.fullDay.to ? leaveEnd : undefined,
//               toDuration: segment.fullDay.to ? toDuration : undefined,
//               toSession: segment.fullDay.to ? toSession : undefined,
//             },
//             reason: req.body.reason,
//             chargeGivenTo: req.body.chargeGivenTo,
//             emergencyContact: req.body.emergencyContact,
//             projectDetails: segment.projectDetails || "",
//             compositeLeaveId,
//             status: {
//               hod: "Pending",
//               ceo: "Pending",
//               admin: "Pending",
//             },
//           });

//           if (segment.medicalCertificate) {
//             leave.medicalCertificate = {
//               data: segment.medicalCertificate.buffer,
//               contentType: segment.medicalCertificate.mimetype,
//             };
//           }
//           if (segment.compensatoryEntryId) {
//             leave.compensatoryEntry = segment.compensatoryEntryId;
//           }
//           if (segment.restrictedHoliday) {
//             leave.restrictedHoliday = segment.restrictedHoliday;
//           }

//           const savedLeave = await leave.save();
//           savedLeaves.push(savedLeave);

//           if (leaveType === "Compensatory" && compensatoryEntry) {
//             compensatoryEntry.status = "Used";
//             await compensatoryEntry.save();
//           } else if (leaveType === "Medical") {
//             user.medicalLeaves -= leaveDays;
//             await user.save();
//           } else if (leaveType === "Casual") {
//             user.paidLeaves -= leaveDays;
//             await user.save();
//           } else if (leaveType === "Restricted Holidays") {
//             user.restrictedHolidays -= 1;
//             await user.save();
//           }

//           if (leaveType === "Emergency") {
//             await Employee.findByIdAndUpdate(user._id, { canApplyEmergencyLeave: false });
//           }
//       } catch (error) {
//   console.log(`Segment ${index} failed:`, error.message, segment); // 👈 log this!
//   errors.push({ segmentIndex: index, message: error.message });
// }

//       }

//       if (errors.length > 0) {
//         return res.status(400).json({ message: "Partial success", errors });
//       }

//       res.status(201).json({ message: "Leave request submitted successfully", data: savedLeaves });
//     } catch (error) {
//       console.error("Leave submission error:", error);
//       res.status(500).json({ message: "Server error", error: error.message });
//     }
//   }
// );


router.post(
  "/",
  auth,
  role(["Employee", "HOD", "Admin"]),
  upload.any(),
  async (req, res) => {
    try {
      const user = await Employee.findById(req.user.id);
      if (!user) return res.status(404).json({ message: "Employee not found" });
      if (!user.designation) return res.status(400).json({ message: "Employee designation is required" });
      if (!user.department) return res.status(400).json({ message: "Employee department is required" });

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(today.getDate() - 7);
      const sevenDaysFuture = new Date(today);
      sevenDaysFuture.setDate(today.getDate() + 7);

      // Debug: Log raw req.body and req.files
      console.log("Raw req.body:", req.body);
      console.log("Raw req.files:", req.files);

      const parseSegments = (formData, files) => {
        console.log("parseSegments input formData:", formData);
        console.log("parseSegments input files:", files);
        if (!Array.isArray(formData.segments)) {
          console.log("No segments array found in formData");
          return [];
        }

        const segments = formData.segments.map((segment, index) => {
          console.log(`Processing segment ${index}:`, segment);
          const fromDuration = segment.fullDay?.fromDuration || "full";
          const toDuration = segment.fullDay?.to ? (segment.fullDay?.toDuration || "full") : "";

          // Normalize from date to midnight UTC
          let fromDate = segment.fullDay?.from ? new Date(segment.fullDay.from) : null;
          if (fromDate && !isNaN(fromDate.getTime())) {
            fromDate.setUTCHours(0, 0, 0, 0); // Set to midnight UTC
          } else {
            fromDate = null;
          }

          // Normalize to date to midnight UTC (if provided)
          let toDate = segment.fullDay?.to ? new Date(segment.fullDay.to) : null;
          if (toDate && !isNaN(toDate.getTime())) {
            toDate.setUTCHours(0, 0, 0, 0); // Set to midnight UTC
          } else {
            toDate = null;
          }

          return {
            leaveType: segment.leaveType || "",
            isEmergency: segment.isEmergency === "true" || segment.isEmergency === true,
            fullDay: {
              from: fromDate ? fromDate.toISOString() : "",
              fromDuration,
              fromSession: fromDuration === "half" ? (segment.fullDay?.fromSession || "forenoon") : null,
              to: toDate ? toDate.toISOString() : "",
              toDuration,
              toSession: toDuration === "half" ? (segment.fullDay?.toSession || "forenoon") : null,
            },
            compensatoryEntryId: segment.compensatoryEntryId || "",
            restrictedHoliday: segment.restrictedHoliday || "", // Only include if explicitly provided
            projectDetails: segment.projectDetails || "",
            medicalCertificate: files.find((f) => f.fieldname?.includes(`segments[${index}][medicalCertificate]`)) || null,
          };
        });

        console.log("Generated segments:", segments);
        return segments.filter(Boolean);
      };

      const leaveSegments = parseSegments(req.body, req.files || []);
      console.log("Parsed leaveSegments:", leaveSegments);

      if (!leaveSegments.length) {
        return res.status(400).json({ message: "No leave segments provided" });
      }

      if (!req.body.reason) return res.status(400).json({ message: "Reason is required" });
      if (!req.body.chargeGivenTo) return res.status(400).json({ message: "Charge Given To is required" });
      if (!req.body.emergencyContact) return res.status(400).json({ message: "Emergency Contact is required" });

      let compositeLeaveId = leaveSegments.length > 1 ? await generateNextCompositeLeaveId() : null;
      if (leaveSegments.length > 1 && !compositeLeaveId) {
        return res.status(500).json({ message: "Failed to generate composite leave ID" });
      }

      const todayStr = today.toISOString().split("T")[0];
      const errors = [];
      const savedLeaves = [];

      // Define holiday list and isHoliday function
      const holidayList = [
        { month: 0, day: 26 }, // Republic Day
        { month: 2, day: 14 }, // Holi
        { month: 7, day: 15 }, // Independence Day
        { month: 9, day: 2 }, // Gandhi Jayanti
        { month: 9, day: 21 }, // Dussehra
        { month: 9, day: 22 }, // Diwali
        { month: 10, day: 5 }, // Christmas
      ];

      const isHoliday = (date) => {
        return (
          holidayList.some((h) => date.getDate() === h.day && date.getMonth() === h.month) ||
          date.getDay() === 0 // Sunday
        );
      };

      for (const [index, segment] of leaveSegments.entries()) {
        try {
          if (!segment.leaveType) throw new Error("Leave Type is required");
          if (!segment.fullDay.from) throw new Error("From date is required");
          if (!/^\d{4}-\d{2}-\d{2}$/.test(segment.fullDay.from.split("T")[0])) {
            throw new Error("Invalid from date format (expected YYYY-MM-DD)");
          }
          const leaveStart = new Date(segment.fullDay.from);
          if (isNaN(leaveStart.getTime())) throw new Error("Invalid from date");
          const fromDuration = segment.fullDay.fromDuration || "full";
          const fromSession = segment.fullDay.fromSession || "";
          if (!["full", "half"].includes(fromDuration)) {
            throw new Error("Invalid fromDuration, must be 'full' or 'half'");
          }
          if (fromDuration === "half" && !["forenoon", "afternoon"].includes(fromSession)) {
            throw new Error("Invalid fromSession, must be 'forenoon' or 'afternoon'");
          }
          if (fromDuration === "half" && !fromSession) {
            throw new Error("fromSession is required for half-day fromDuration");
          }

          let leaveEnd = leaveStart;
          let toDuration = "";
          let toSession = "";
          let leaveDays = fromDuration === "half" ? 0.5 : 1;

          if (segment.fullDay.to) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(segment.fullDay.to.split("T")[0])) {
              throw new Error("Invalid to date format (expected YYYY-MM-DD)");
            }
            leaveEnd = new Date(segment.fullDay.to);
            if (isNaN(leaveEnd.getTime())) throw new Error("Invalid to date");
            toDuration = segment.fullDay.toDuration || "full";
            toSession = segment.fullDay.toSession || "";
            if (!["full", "half"].includes(toDuration)) {
              throw new Error("Invalid toDuration, must be 'full' or 'half'");
            }
            if (toDuration === "half" && toSession !== "forenoon") {
              throw new Error("toSession must be 'forenoon' for half-day toDuration");
            }
            if (toDuration === "half" && !toSession) {
              throw new Error("toSession is required for half-day toDuration");
            }
            if (leaveStart.toISOString().split("T")[0] === leaveEnd.toISOString().split("T")[0]) {
              if (fromDuration === "full" && toDuration === "full") {
                leaveDays = segment.leaveType === "Casual" && isHoliday(leaveStart) ? 0 : 1;
              } else if (fromDuration === "half" && toDuration === "half" && fromSession === "afternoon" && toSession === "forenoon") {
                leaveDays = segment.leaveType === "Casual" && isHoliday(leaveStart) ? 0 : 0.5;
              } else {
                throw new Error("Invalid duration combination for same-day leave");
              }
            } else {
              let daysDiff = 0;
              let current = new Date(leaveStart);
              while (current <= leaveEnd) {
                if (segment.leaveType !== "Casual" || !isHoliday(current)) {
                  daysDiff += 1;
                }
                current.setDate(current.getDate() + 1);
              }
              leaveDays = daysDiff;
              if (fromDuration === "half") leaveDays -= 0.5;
              if (toDuration === "half") leaveDays -= 0.5;
            }
          }

          if (leaveStart > leaveEnd) {
            throw new Error("Leave start date cannot be after end date");
          }

          if (segment.isEmergency && fromDuration === "full" && leaveStart.toISOString().split("T")[0] !== todayStr) {
            throw new Error("Full-day Emergency leave must be for the current date only");
          }
          if (!segment.isEmergency && leaveStart <= today) {
            throw new Error("From date must be after today for non-Emergency leave");
          }

          if (segment.leaveType === "Medical") {
            if (leaveStart < sevenDaysAgo || leaveStart > sevenDaysFuture) {
              throw new Error("Medical leave from date must be within 7 days prior and 7 days future from today");
            }
            if (!segment.fullDay.to) {
              throw new Error("To date is required for Medical leave");
            }
          }

          if (!segment.isEmergency) {
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
                },
              ],
            });
            if (overlappingChargeAssignments.length > 0) {
              const leaveDetails = overlappingChargeAssignments[0];
              const dateRangeStr = `from ${new Date(leaveDetails.fullDay.from).toISOString().split("T")[0]}${
                leaveDetails.fullDay.fromDuration === "half" ? ` (${leaveDetails.fullDay.fromSession})` : ""
              }${leaveDetails.fullDay.to ? ` to ${new Date(leaveDetails.fullDay.to).toISOString().split("T")[0]}${
                leaveDetails.fullDay.toDuration === "half" ? ` (${leaveDetails.fullDay.toSession})` : ""
              }` : ""}`;
              throw new Error(
                `You are assigned as Charge Given To for a leave ${dateRangeStr} and cannot apply for non-Emergency leaves during this period.`
              );
            }
          }

          const chargeGivenToEmployee = await Employee.findById(req.body.chargeGivenTo);
          if (!chargeGivenToEmployee) {
            throw new Error("Selected employee for Charge Given To not found");
          }
          const startDateOnly = new Date(leaveStart);
          startDateOnly.setUTCHours(0, 0, 0, 0);
          const endDateOnly = segment.fullDay.to ? new Date(leaveEnd) : new Date(leaveStart);
          endDateOnly.setUTCHours(0, 0, 0, 0);
          const overlappingLeaves = await Leave.find({
            $or: [
              {
                chargeGivenTo: req.body.chargeGivenTo,
                $or: [
                  {
                    "fullDay.from": { $lte: leaveEnd },
                    "fullDay.to": { $gte: leaveStart },
                    $and: [
                      { "status.hod": { $in: ["Pending", "Approved"] } },
                      { "status.ceo": { $in: ["Pending", "Approved"] } },
                      { "status.admin": { $in: ["Pending", "Acknowledged"] } },
                    ],
                  },
                ],
              },
              {
                employee: req.body.chargeGivenTo,
                $or: [
                  {
                    "fullDay.from": { $lte: leaveEnd },
                    "fullDay.to": { $gte: leaveStart },
                    $and: [
                      { "status.hod": { $in: ["Pending", "Approved"] } },
                      { "status.ceo": { $in: ["Pending", "Approved"] } },
                      { "status.admin": { $in: ["Pending", "Acknowledged"] } },
                    ],
                  },
                ],
              },
            ],
          });
          if (overlappingLeaves.length > 0) {
            throw new Error(
              "Selected employee is either already assigned as Charge Given To or has a pending/approved leave for the specified date range"
            );
          }

          const leaveType = segment.leaveType;
          const isConfirmed = user.employeeType === "Confirmed";
          const joinDate = new Date(user.dateOfJoining);
          const yearsOfService = (new Date() - joinDate) / (1000 * 60 * 60 * 24 * 365);

          switch (leaveType) {
            case "Casual":
              const canTakeCasualLeave = await user.checkConsecutivePaidLeaves(leaveStart, leaveEnd);
              if (!canTakeCasualLeave) {
                throw new Error("Cannot take more than 3 consecutive paid leave days.");
              }
              if (user.paidLeaves < leaveDays) {
                throw new Error("Insufficient Casual leave balance.");
              }
              break;
            case "Medical":
              if (!isConfirmed) throw new Error("Medical leave is only for confirmed employees.");
              if (![3, 4, 7].includes(leaveDays)) throw new Error("Medical leave must be exactly 3, 4, or 7 days.");
              if (user.medicalLeaves < leaveDays) throw new Error("Insufficient Medical leave balance.");
              const medicalLeavesThisYear = await Leave.find({
                employeeId: user.employeeId,
                leaveType: "Medical",
                "status.admin": "Acknowledged",
                "fullDay.from": { $gte: new Date(today.getFullYear(), 0, 1) },
              });
              if (medicalLeavesThisYear.length > 0) {
                throw new Error("Medical leave can only be used once per year.");
              }
              break;
            case "Maternity":
              if (!isConfirmed || user.gender?.trim().toLowerCase() !== "female") {
                throw new Error("Maternity leave is only for confirmed female employees.");
              }
              if (yearsOfService < 1) throw new Error("Must have completed one year of service.");
              if (leaveDays !== 90) throw new Error("Maternity leave must be exactly 90 days.");
              break;
            case "Paternity":
              if (!isConfirmed || user.gender?.trim().toLowerCase() !== "male") {
                throw new Error("Paternity leave is only for confirmed male employees.");
              }
              if (yearsOfService < 1) throw new Error("Must have completed one year of service.");
              if (leaveDays !== 7) throw new Error("Paternity leave must be exactly 7 days.");
              break;
            case "Compensatory":
              const compensatoryEntry = await CompensatoryLeave.findById(segment.compensatoryEntryId);
              if (!compensatoryEntry || compensatoryEntry.employeeId.toString() !== user._id.toString() || compensatoryEntry.status !== "Available") {
                throw new Error("Invalid or unavailable compensatory leave entry.");
              }
              const hoursNeeded = fromDuration === "half" ? 4 : 8;
              if (compensatoryEntry.hours !== hoursNeeded) {
                throw new Error(
                  `Compensatory entry (${compensatoryEntry.hours} hours) does not match leave duration (${fromDuration === "half" ? "4 hours" : "8 hours"})`
                );
              }
              break;
            case "Restricted Holidays":
              if (!isConfirmed) throw new Error("Restricted Holidays are only for confirmed employees.");
              if (user.restrictedHolidays <= 0) throw new Error("No restricted holidays available this year.");
              if (leaveDays !== 1) throw new Error("Restricted Holiday must be exactly 1 day.");
              break;
            case "Leave Without Pay(LWP)":
              if (leaveDays > 30) throw new Error("Leave Without Pay cannot exceed 30 days.");
              break;
            case "Emergency":
              if (!segment.isEmergency) throw new Error("Emergency leave must have isEmergency set to true.");
              if (leaveDays > 1) throw new Error("Emergency leave can only be half day or one full day.");
              break;
            default:
              throw new Error("Invalid leave type specified.");
          }

          const leave = new Leave({
            employee: user._id,
            employeeId: user.employeeId,
            name: user.name,
            designation: user.designation,
            department: user.department,
            leaveType: segment.leaveType,
            fullDay: {
              from: new Date(segment.fullDay.from), // Use normalized date directly
              fromDuration,
              fromSession,
              to: segment.fullDay.to ? new Date(segment.fullDay.to) : undefined, // Use normalized date directly
              toDuration: segment.fullDay.to ? toDuration : undefined,
              toSession: segment.fullDay.to ? toSession : undefined,
            },
            reason: req.body.reason,
            chargeGivenTo: req.body.chargeGivenTo,
            emergencyContact: req.body.emergencyContact,
            projectDetails: segment.projectDetails || "",
            compositeLeaveId,
            status: {
              hod: "Pending",
              ceo: "Pending",
              admin: "Pending",
            },
          });

          if (segment.medicalCertificate) {
            leave.medicalCertificate = {
              data: segment.medicalCertificate.buffer,
              contentType: segment.medicalCertificate.mimetype,
            };
          }
          if (segment.compensatoryEntryId) {
            leave.compensatoryEntry = segment.compensatoryEntryId;
          }
          if (segment.restrictedHoliday && segment.leaveType === "Restricted Holidays") {
            leave.restrictedHoliday = segment.restrictedHoliday;
          }

          const savedLeave = await leave.save();
          savedLeaves.push(savedLeave);

          if (leaveType === "Compensatory" && compensatoryEntry) {
            compensatoryEntry.status = "Used";
            await compensatoryEntry.save();
          } else if (leaveType === "Medical") {
            user.medicalLeaves -= leaveDays;
            await user.save();
          } else if (leaveType === "Casual") {
            user.paidLeaves -= leaveDays;
            await user.save();
          } else if (leaveType === "Restricted Holidays") {
            user.restrictedHolidays -= 1;
            await user.save();
          }

          if (leaveType === "Emergency") {
            await Employee.findByIdAndUpdate(user._id, { canApplyEmergencyLeave: false });
          }
        } catch (error) {
          console.log(`Segment ${index} failed:`, error.message, segment);
          errors.push({ segmentIndex: index, message: error.message });
        }
      }

      if (errors.length > 0) {
        return res.status(400).json({ message: "Partial success", errors });
      }

      res.status(201).json({ message: "Leave request submitted successfully", data: savedLeaves });
    } catch (error) {
      console.error("Leave submission error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
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


// router.put(
//   "/:id/approve",
//   auth,
//   role(["HOD", "CEO", "Admin"]),
//   async (req, res) => {
//     try {
//       const leave = await Leave.findById(req.params.id)
//         .populate("employee")
//         .populate("chargeGivenTo");
//       if (!leave) {
//         return res.status(404).json({ message: "Leave request not found" });
//       }

//       const user = await Employee.findById(req.user.id);
//       if (!user) {
//         return res.status(404).json({ message: "User not found" });
//       }

//       const { status, remarks, approvedDates, rejectedDates } = req.body;
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

//       if (leave.status[currentStage] !== "Pending") {
//         return res
//           .status(400)
//           .json({
//             message: `Leave is not pending ${currentStage.toUpperCase()} approval`,
//           });
//       }

//       if (
//         (status === "Rejected" || status === "Approved") &&
//         ["hod", "ceo"].includes(currentStage) &&
//         (!remarks || remarks.trim() === "")
//       ) {
//         return res
//           .status(400)
//           .json({ message: "Remarks are required for approval or rejection" });
//       }

//       if (
//         req.user.role === "HOD" &&
//         user.department.toString() !== leave.department.toString()
//       ) {
//         return res
//           .status(403)
//           .json({
//             message: "Not authorized to approve leaves for this department",
//           });
//       }

//       if (req.user.role === "CEO" && !["Approved", "Submitted"].includes(leave.status.hod)) {
//         return res
//           .status(400)
//           .json({ message: "Leave must be approved or Submitted by HOD first" });
//       }

//       if (req.user.role === "Admin" && leave.status.ceo !== "Approved") {
//         return res
//           .status(400)
//           .json({ message: "Leave must be approved by CEO first" });
//       }

//       if (req.user.role === "CEO" && leave.leaveType === "Medical" && !leave.medicalCertificate) {
//         return res
//           .status(403)
//           .json({ message: "Medical leave without certificate not visible to CEO" });
//       }

//       if (req.user.role === "Admin" && leave.leaveType === "Medical" && !leave.medicalCertificate) {
//         return res
//           .status(400)
//           .json({ message: "Medical leave cannot be acknowledged without a medical certificate" });
//       }

//       leave.status[currentStage] = status;
//       // Store remarks for both approval and rejection
//       if (remarks && remarks.trim() !== "") {
//         leave.remarks = remarks;
//       }

//       if (approvedDates && rejectedDates) {
//         const allDates = getAllDates(leave.fullDay.from, leave.fullDay.to);
//         if (approvedDates.length + rejectedDates.length !== allDates.length) {
//           return res.status(400).json({ message: "All dates must be either approved or rejected" });
//         }
//         leave.approvedDates = approvedDates;
//         leave.rejectedDates = rejectedDates;
//       } else if (status === "Approved") {
//         leave.approvedDates = getAllDates(leave.fullDay.from, leave.fullDay.to).map(date => ({ date, duration: 'full' }));
//         leave.rejectedDates = [];
//       } else if (status === "Rejected") {
//         leave.rejectedDates = getAllDates(leave.fullDay.from, leave.fullDay.to).map(date => ({ date, duration: 'full' }));
//         leave.approvedDates = [];
//       }

//       if (["Approved", "Submitted"].includes(status) && currentStage === "hod") {
//         leave.status.ceo = "Pending";
//         const ceo = await Employee.findOne({ loginType: "CEO" });
//         if (ceo) {
//           await Notification.create({
//             userId: ceo.employeeId,
//             message: `Leave request from ${leave.name} awaiting your approval${
//               remarks ? ` with note: ${remarks}` : ""
//             }`,
//           });
//           if (global._io) {
//             global._io
//               .to(ceo.employeeId)
//               .emit("notification", {
//                 message: `Leave request from ${leave.name} awaiting your approval${
//                   remarks ? ` with note: ${remarks}` : ""
//                 }`,
//               });
//           }
//         }
//       }

//       if (status === "Approved" && currentStage === "ceo") {
//         leave.status.admin = "Pending";
//         const admin = await Employee.findOne({ loginType: "Admin" });
//         if (admin) {
//           await Notification.create({
//             userId: admin.employeeId,
//             message: `Leave request from ${leave.name} awaiting your acknowledgment${
//               remarks ? ` with note: ${remarks}` : ""
//             }`,
//           });
//           if (global._io) {
//             global._io
//               .to(admin.employeeId)
//               .emit("notification", {
//                 message: `Leave request from ${leave.name} awaiting your acknowledgment${
//                   remarks ? ` with note: ${remarks}` : ""
//                 }`,
//               });
//           }
//         }
//       }

//       if (status === "Acknowledged" && currentStage === "admin") {
//         const employee = leave.employee;
//         const totalApprovedDays = leave.approvedDates.length + (leave.approvedDates.some(d => d.duration === 'half') ? 0.5 : 0);
//         switch (leave.leaveType) {
//           case "Casual":
//             await employee.deductPaidLeaves(leave.fullDay.from, leave.fullDay.to, leave.leaveType, totalApprovedDays);
//             break;
//           case "Medical":
//             await employee.deductMedicalLeaves(leave, totalApprovedDays);
//             break;
//           case "Maternity":
//             await employee.recordMaternityClaim();
//             break;
//           case "Paternity":
//             await employee.recordPaternityClaim();
//             break;
//           case "Restricted Holidays":
//             await employee.deductRestrictedHolidays();
//             break;
//           case "Compensatory":
//             const entry = employee.compensatoryAvailable.find(
//               (e) => e._id.toString() === leave.compensatoryEntryId.toString()
//             );
//             if (entry) {
//               entry.status = "Used";
//             }
//             await employee.deductCompensatoryLeaves(leave.compensatoryEntryId);
//             break;
//           case "Emergency":
//             if (employee.paidLeaves >= totalApprovedDays) {
//               await employee.deductPaidLeaves(leave.fullDay.from, leave.fullDay.to, leave.leaveType, totalApprovedDays);
//             } else {
//               await employee.incrementUnpaidLeaves(leave.fullDay.from, leave.fullDay.to, leave.employee, totalApprovedDays);
//             }
//             break;
//           case "Leave Without Pay(LWP)":
//             await employee.incrementUnpaidLeaves(leave.fullDay.from, leave.fullDay.to, leave.employee, totalApprovedDays);
//             break;
//           default:
//             return res
//               .status(400)
//               .json({ message: "Invalid leave type for balance update" });
//         }
//         await employee.save();
//       }

//       if (status === "Rejected") {
//         leave.status.hod = "N/A";
//         leave.status.ceo = "N/A";
//         leave.status.admin = "N/A";

//         await Notification.create({
//           userId: leave.employee.employeeId,
//           message: `Your ${leave.leaveType} leave request was rejected by ${currentStage.toUpperCase()} with note: ${remarks || "No remarks provided"}`,
//         });
//         if (global._io) {
//           global._io
//             .to(leave.employee.employeeId)
//             .emit("notification", {
//               message: `Your ${leave.leaveType} leave request was rejected by ${currentStage.toUpperCase()} with note: ${remarks || "No remarks provided"}`,
//             });
//         }

//         if (leave.chargeGivenTo) {
//           const dateRangeStr = `from ${new Date(leave.fullDay.from).toISOString().split("T")[0]}${leave.fullDay.fromDuration === "half" ? ` (${leave.fullDay.fromSession})` : ""}${new Date(leave.fullDay.to) ? ` to ${new Date(leave.fullDay.to).toISOString().split("T")[0]}${leave.fullDay.toDuration === "half" ? ` (${leave.fullDay.toSession})` : ""}` : ""}`;
//           await Notification.create({
//             userId: leave.chargeGivenTo.employeeId,
//             message: `You are no longer assigned as Charge Given To for ${leave.name}'s leave ${dateRangeStr} due to rejection by ${currentStage.toUpperCase()}. You can now apply for non-Emergency leaves during this period.`,
//           });
//           if (global._io) {
//             global._io.to(leave.chargeGivenTo.employeeId).emit("notification", {
//               message: `You are no longer assigned as Charge Given To for ${leave.name}'s leave ${dateRangeStr} due to rejection by ${currentStage.toUpperCase()}. You can now apply for non-Emergency leaves.`,
//             });
//           }
//         }
//       }

//       await leave.save();
//       await Audit.create({
//         user: user.employeeId,
//         action: `${status} Leave`,
//         details: `${status} leave request for ${leave.name}${remarks ? ` with remarks: ${remarks}` : ""}`,
//       });

//       const employee = await Employee.findById(leave.employee);
//       if (employee && status !== "Rejected") {
//         await Notification.create({
//           userId: employee.employeeId,
//           message: `Your leave request has been ${status.toLowerCase()} by ${currentStage.toUpperCase()}${remarks ? ` with note: ${remarks}` : ""}`,
//         });
//         if (global._io)
//           global._io
//             .to(employee.employeeId)
//             .emit("notification", {
//               message: `Your leave request has been ${status.toLowerCase()} by ${currentStage.toUpperCase()}${remarks ? ` with note: ${remarks}` : ""}`,
//             });
//       }

//       res.json(leave);
//     } catch (err) {
//       console.error("Leave approval error:", err.stack);
//       res.status(500).json({ message: "Server error", error: err.message });
//     }
//   }
// );

function getAllDates(startDate, endDate) {
  const dates = [];
  let currentDate = new Date(startDate);
  const end = new Date(endDate);
  while (currentDate <= end) {
    dates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return dates;
}


// List of yearly holidays for 2025 (dates in MM-DD format)
const yearlyHolidays = [
  { date: "2025-08-15", name: "Independence Day" }, // 15th August
  { date: "2025-10-02", name: "Gandhi Jayanti" },   // 2nd October
  { date: "2025-10-22", name: "Diwali" },           // 22nd October
  { date: "2025-10-23", name: "Vishwakarma Jayanti" }, // 23rd October
  { date: "2025-11-05", name: "Guru Nanak Jayanti" } // Assuming 05th November for 2025
];

// Function to check if a date is a Sunday or a holiday
const isNonWorkingDay = (date) => {
  const formattedDate = date.toISOString().split('T')[0]; // YYYY-MM-DD
  // Check if the date is a Sunday (0 is Sunday)
  const isSunday = date.getDay() === 0;
  // Check if the date is a holiday
  const isHoliday = yearlyHolidays.some(holiday => holiday.date === formattedDate);
  return isSunday || isHoliday;
};

// Function to calculate working days between two dates
const calculateWorkingDays = (from, to) => {
  let currentDate = new Date(from);
  currentDate.setHours(0, 0, 0, 0);
  const endDate = new Date(to);
  endDate.setHours(0, 0, 0, 0);
  let workingDays = 0;

  while (currentDate <= endDate) {
    if (!isNonWorkingDay(currentDate)) {
      workingDays++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return workingDays;
};
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

        // Extract dates without time and handle duration conditionally
        const approvedDates = leave.approvedDates.map(item => ({
          ...item,
          date: item.date.toISOString().split('T')[0],
          duration: item.duration === "full" ? undefined : item.duration
        }));
        const rejectedDates = leave.rejectedDates.map(item => ({
          ...item,
          date: item.date.toISOString().split('T')[0],
          duration: item.duration === "full" ? undefined : item.duration
        }));

        // Calculate working days for fullDay leaves
        let numberOfDays = leave.fullDay?.from && leave.fullDay?.to
          ? calculateWorkingDays(leave.fullDay.from, leave.fullDay.to)
          : null;

        return {
          ...leave.toObject(),
          medicalCertificate,
          approvedDates,
          rejectedDates,
          numberOfDays // Add the calculated working days
        };
      })
    );

    res.json({ leaves: leavesWithCertificates, total });
  } catch (err) {
    console.error("Fetch leaves error:", err.stack);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Approve Leave final one jha partial rejection bhi hota hai 
router.put(
  "/:id/approve",
  auth,
  role(["HOD", "CEO", "Admin"]),
  async (req, res) => {
    try {
      const leave = await Leave.findById(req.params.id)
        .populate("employee")
        .populate("chargeGivenTo");

      if (!leave) return res.status(404).json({ message: "Leave request not found" });

      const user = await Employee.findById(req.user.id);
      if (!user) return res.status(404).json({ message: "User not found" });

      const { status, remarks, adjustments, approvedDays, approvedDates, rejectedDates } = req.body;
      const currentStage = req.user.role.toLowerCase();
      const validStatuses =
        req.user.role === "Admin" ? ["Acknowledged"] : ["Approved", "Rejected"];

      if (!validStatuses.includes(status)) {
        return res
          .status(400)
          .json({ message: `Invalid status. Must be one of ${validStatuses.join(", ")}` });
      }

      if (leave.status[currentStage] !== "Pending") {
        return res
          .status(400)
          .json({ message: `Leave is not pending ${currentStage.toUpperCase()} approval` });
      }

      if (status === "Rejected" && ["hod", "ceo"].includes(currentStage) && (!remarks || remarks.trim() === "")) {
        return res.status(400).json({ message: "Remarks are required for rejection" });
      }

      if (req.user.role === "HOD" && user.department.toString() !== leave.department.toString()) {
        return res.status(403).json({ message: "Not authorized to approve leaves for this department" });
      }

      if (req.user.role === "CEO" && !["Approved", "Submitted"].includes(leave.status.hod)) {
        return res.status(400).json({ message: "Leave must be approved or Submitted by HOD first" });
      }

      if (req.user.role === "Admin" && leave.status.ceo !== "Approved") {
        return res.status(400).json({ message: "Leave must be approved by CEO first" });
      }

      if (req.user.role === "Admin" && leave.leaveType === "Medical" && !leave.medicalCertificate) {
        return res.status(400).json({ message: "Medical leave cannot be acknowledged without a medical certificate" });
      }

      leave.status[currentStage] = status;

      const isComposite = leave.composite && Array.isArray(leave.leaves);

      // Handle non-composite leaves
      if (!isComposite) {
        if (approvedDays !== undefined) {
          leave.approvedDays = approvedDays;
        }
        if (approvedDates) {
          leave.approvedDates = approvedDates;
        }
        if (rejectedDates) {
          leave.rejectedDates = rejectedDates;
        }
        if (remarks && remarks.trim() !== "") {
          leave.remarks = remarks;
        }
      }

      // Handle composite leaves
      if (isComposite && Array.isArray(adjustments)) {
        for (const segment of leave.leaves) {
          const matchingAdjustment = adjustments.find((a) => a.leaveId === segment._id.toString());
          if (matchingAdjustment) {
            segment.approvedDates = matchingAdjustment.approvedDates || [];
            segment.rejectedDates = matchingAdjustment.rejectedDates || []; // Add rejectedDates for composite
            segment.adjustedDays = matchingAdjustment.adjustedDays || 0;
            if (matchingAdjustment.remarks) segment.remarks = matchingAdjustment.remarks;
          }
        }
      }

      // Rest of the logic remains the same...
      if (["Approved", "Submitted"].includes(status) && currentStage === "hod") {
        leave.status.ceo = "Pending";
        const ceo = await Employee.findOne({ loginType: "CEO" });
        if (ceo) {
          await Notification.create({
            userId: ceo.employeeId,
            message: `Leave request from ${leave.name} awaiting your approval`,
          });
          if (global._io) {
            global._io.to(ceo.employeeId).emit("notification", {
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
            global._io.to(admin.employeeId).emit("notification", {
              message: `Leave request from ${leave.name} awaiting your acknowledgment`,
            });
          }
        }
      }

      if (status === "Acknowledged" && currentStage === "admin") {
        const employee = leave.employee;
        switch (leave.leaveType) {
          case "Casual":
            await employee.deductPaidLeaves(leave.fullDay.from, leave.fullDay.to, leave.leaveType);
            break;
          case "Medical":
            await employee.deductMedicalLeaves(
              leave,
              leave.approvedDays || (leave.fullDay.fromDuration === "half" && leave.fullDay.from === leave.fullDay.to
                ? 0.5
                : leave.fullDay?.from && leave.fullDay?.to
                  ? (new Date(leave.fullDay.to) - new Date(leave.fullDay.from)) / (1000 * 60 * 60 * 24) +
                    1 -
                    (leave.fullDay.fromDuration === "half" ? 0.5 : 0) -
                    (leave.fullDay.toDuration === "half" ? 0.5 : 0)
                  : 0)
            );
            break;
          // ... (other cases remain the same)
          default:
            return res.status(400).json({ message: "Invalid leave type for balance update" });
        }
        await employee.save();
      }

      if (status === "Rejected") {
        leave.status.hod = "Rejected";
        leave.status.ceo = "N/A";
        leave.status.admin = "N/A";

        await Notification.create({
          userId: leave.employee.employeeId,
          message: `Your ${leave.leaveType} leave request was rejected by ${currentStage.toUpperCase()}`,
        });

        if (global._io) {
          global._io.to(leave.employee.employeeId).emit("notification", {
            message: `Your ${leave.leaveType} leave request was rejected by ${currentStage.toUpperCase()}`,
          });
        }

        if (leave.chargeGivenTo) {
          const dateRangeStr = `from ${new Date(leave.fullDay.from).toISOString().split("T")[0]}${
            leave.fullDay.fromDuration === "half" ? ` (${leave.fullDay.fromSession})` : ""
          }${new Date(leave.fullDay.to) ? ` to ${new Date(leave.fullDay.to).toISOString().split("T")[0]}${
            leave.fullDay.toDuration === "half" ? ` (${leave.fullDay.toSession})` : ""
          }` : ""}`;
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
        if (global._io) {
          global._io.to(employee.employeeId).emit("notification", {
            message: `Your leave request has been ${status.toLowerCase()} by ${currentStage.toUpperCase()}`,
          });
        }
      }

      res.json(leave);
    } catch (err) {
      console.error("Leave approval error:", err.stack);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  }
);


export default router;



