import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema({
  employeeId: { type: String, required: true, ref: 'Employee' },
  userId: { type: String, required: true },
  name: { type: String, required: true },
  logDate: { type: Date, required: true },
  timeIn: { type: String }, // First IN time, optional
  timeOut: { type: String }, // Last OUT time
  status: { type: String, required: true },
  halfDay: { type: String, enum: ['First Half', 'Second Half', null], default: null }, // Track half-day absences
  ot: { type: Number, default: 0 }, // Overtime in minutes
  od: {
    timeIn: { type: String },
    timeOut: { type: String },
  }
}, { timestamps: true });

// Add unique index to prevent duplicate attendance records for the same employee and date
attendanceSchema.index({ employeeId: 1, logDate: 1 }, { unique: true });

export default mongoose.model('Attendance', attendanceSchema);
