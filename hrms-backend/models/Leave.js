import mongoose from 'mongoose';

const leaveSchema = new mongoose.Schema({
  employeeId: { type: String, required: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  name: { type: String, required: true },
  designation: { type: String, required: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },

  leaveType: {
    type: String,
    enum: [
      'Casual',
      'Medical',
      'Maternity',
      'Paternity',
      'Compensatory',
      'Restricted Holidays',
      'Leave Without Pay(LWP)',
      'Emergency'
    ],
    required: true
  },

  fullDay: {
    from: { type: Date, required: true },
    to: { type: Date },
    fromDuration: { type: String, enum: ['full', 'half', 'forenoon', 'afternoon'], default: 'full' },
    fromSession: { type: String, enum: ['forenoon', 'afternoon'] },
    toDuration: { type: String, enum: ['full', 'half', 'forenoon', 'afternoon'] },
    toSession: { type: String, enum: ['forenoon', 'afternoon'] }
  },

  reason: { type: String, required: true },
  chargeGivenTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  emergencyContact: { type: String, required: true },

  compensatoryEntryId: { type: mongoose.Schema.Types.ObjectId, default: null },
  projectDetails: { type: String },
  restrictedHoliday: { type: String },
  medicalCertificate: { type: mongoose.Schema.Types.ObjectId, ref: 'Uploads.files', default: null },

  compositeLeaveId: { type: String, default: null },

  status: {
    hod: { type: String, enum: ['Pending', 'Approved', 'Submitted', 'Rejected', 'N/A'], default: 'Pending' },
    admin: { type: String, enum: ['Pending', 'Acknowledged', 'N/A'], default: 'Pending' },
    ceo: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'N/A'], default: 'Pending' },
  },

  remarks: { type: String, default: 'N/A' },
  approvedDates: [{ date: Date, duration: { type: String, enum: ['full', 'half', 'forenoon', 'afternoon'] } }],
  rejectedDates: [{ date: Date, duration: { type: String, enum: ['full', 'half', 'forenoon', 'afternoon'] } }]

}, { timestamps: true });

export default mongoose.model('Leave', leaveSchema);