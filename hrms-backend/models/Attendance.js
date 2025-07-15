import mongoose from 'mongoose';
const attendanceSchema = new mongoose.Schema({
  employeeId: { type: String, required: true, ref: 'Employee' },
  userId: { type: String, required: true },
  name: { type: String, required: true },
  logDate: { type: Date, required: true },
  timeIn: { type: String }, // First IN time, optional
  timeOut: { type: String }, // Last OUT time
  status: { 
    type: String, 
    enum: [
      // Existing statuses
      'Present', 
      'Absent', 
      'Half Day', 
      'Present (HD)',
      'Present & Absent (HD)', 
      'FN: Late Arrival (Approval Pending) & AN: Present',
      'Present(-)', 
      'Present (HD: First Half)', 
      'Present (HD: Afternoon)',
      'Present & Absent (HD: Afternoon)',
      'AWI', 
      'LA',
      'FN: Late Arrival',
      'AN: Late Arrival',
      'FN: Present',
      'FN: AWI & AN: LA',
      'FN: LA',
      'Leave (Approved)', 
      'Leave (Approval Pending)', 
      'Leave (Approved) & Present (HD)', 
      'Leave (Approval Pending) & Present (HD)', 
      'Leave (Approved) & Present (HD: Afternoon)', 
      'Leave (Approval Pending) & Present (HD: Afternoon)',
      'Present (OD: 9:00 to 5:30)',
      '- & OD: 09:15 to 13:54',
      'OD: 13:00 to 17:30 & -',
      // New statuses to cover all function-generated combinations
      'FN: Present & AN: AWI',
      'Present [LA: Approval Pending]',
      'FN: Late Arrival & AN: Present',
      'FN: Late Arrival & AN: AWI',
      'FN: Present (LA)',
      'FN: AWI & AN: Present',
      'FN: AWI & AN: Late Arrival',
      'FN: AWI & AN: AWI',
      'FN: Present & AN: Late Arrival',
      // Post-approval statuses
      'FN: Late Arrival (Allowed)',
      'FN: Present & AN: -',
      'FN: Present (LA) & AN: -',
      'FN: Present [LA: Allowed]',
      'Present [LA: Deducted(CL)]',
      'FN: Late Arrival (Denied)',
      'AN: Late Arrival (Allowed)',
      'AN: Late Arrival (Denied)',
      'FN: Late Arrival (Allowed) & AN: Present',
      'FN: Present (LA) & AN: Present',
      'FN: Late Arrival (Denied) & AN: Present',
      'FN: Present & AN: Late Arrival (Allowed)',
      'FN: Present [LA: Approval Pending] & AN: Present',
      'FN: Present (LA) & AN: Present',
      'FN: Present & AN: Late Arrival (Denied)',
      'FN: Late Arrival (Allowed) & AN: AWI',
      'FN: Late Arrival (Denied) & AN: AWI',
      'FN: AWI & AN: Late Arrival (Allowed)',
      'FN: AWI & AN: Late Arrival (Denied)',
      // Potential leave and OD combinations (if integrated later)
      'Leave (Approved) & FN: Present',
      'Leave (Approval Pending) & FN: Present',
      'FN: Present [LA: Approval Pending]',
      'FN: Present [LA: Deducted(Salary)] & AN: Present',
      'Leave (Approved) & AN: Present',
      'Leave (Approval Pending) & AN: Present',
      'OD: 9:00 to 17:30 & FN: Present',
      'OD: 9:00 to 17:30 & AN: Present'
    ], 
    required: true 
  },
  halfDay: { type: String, enum: ['First Half', 'Second Half', 'Afternoon', null, ""], default: null }, // Track half-day absences
  ot: { type: Number, default: 0 }, // Overtime in minutes
  od: {
    timeIn: { type: String },
    timeOut: { type: String },
  },
 laReason: { type: String }, // New field for late arrival reason
  laApproval: { type: String, enum: ['Pending', 'Allowed', 'Denied', null], default: null } ,// Optional approval status
 approvalReason: { type: String }, // New field for approval reason
  rejectionReason: { type: String }, // New field for rejection reason
}, { timestamps: true });

// Add unique index to prevent duplicate attendance records for the same employee and date
attendanceSchema.index({ employeeId: 1, logDate: 1 }, { unique: true });

export default mongoose.model('Attendance', attendanceSchema);