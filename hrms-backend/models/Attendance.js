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
      'Present', 
      'Absent', 
      'Half Day', 
      'Present (HD)',
      'Present & Absent (HD)', 
      'Present (-)', 
      'Present (HD: First Half)', 
      'Present (HD: Afternoon)',
      'AWI', 
      'LA',
      'Leave (Approved)', 
      'Leave (Approval Pending)', 
      'Leave (Approved) & Present (HD)', 
      'Leave (Approval Pending) & Present (HD)', 
      'Leave (Approved) & Present (HD: Afternoon)', 
      'Leave (Approval Pending) & Present (HD: Afternoon)', 
      'Present & Absent (HD: Afternoon)',
      'Present (OD: 9:00 to 5:30)', // Added for full-day OD
      '- & OD: 09:15 to 13:54', // Added for first half OD
      'OD: 13:00 to 17:30 & -' // Added for second half OD
    ], 
    required: true 
  },
  halfDay: { type: String, enum: ['First Half', 'Second Half', 'Afternoon', null], default: null }, // Track half-day absences
  ot: { type: Number, default: 0 }, // Overtime in minutes
  od: {
    timeIn: { type: String },
    timeOut: { type: String },
  }
}, { timestamps: true });

// Add unique index to prevent duplicate attendance records for the same employee and date
attendanceSchema.index({ employeeId: 1, logDate: 1 }, { unique: true });

export default mongoose.model('Attendance', attendanceSchema);