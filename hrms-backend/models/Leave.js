import mongoose from 'mongoose';

const leaveSchema = new mongoose.Schema({
  employeeId: { type: String, required: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  name: { type: String, required: true },
  designation: { type: String, required: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },

  // Updated field to accommodate all types
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

  dates: {
    from: { type: Date, required: true },
    to: { type: Date },
    fromDuration: { type: String, enum: ['full', 'half'], default: 'full' },
    fromSession: { type: String, enum: ['forenoon', 'afternoon'] },
    toDuration: { type: String, enum: ['full', 'half'] },
    toSession: { type: String, enum: ['forenoon'] }
  },

  reason: { type: String, required: true },
  chargeGivenTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  emergencyContact: { type: String, required: true },

  // Additional fields for specific leave types
  compensatoryEntryId: { type: mongoose.Schema.Types.ObjectId, default: null },
  projectDetails: { type: String },
  restrictedHoliday: { type: String },
  medicalCertificate: { type: mongoose.Schema.Types.ObjectId, ref: 'Uploads.files', default: null },
  supportingDocuments: { type: mongoose.Schema.Types.ObjectId, ref: 'Uploads.files', default: null },

  status: {
    hod: { type: String, enum: ['Pending', 'Approved', 'Submitted', 'Rejected'], default: 'Pending' },
    admin: { type: String, enum: ['Pending', 'Acknowledged'], default: 'Pending' },
    ceo: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
  },

  remarks: { type: String, default: 'N/A' }
}, { timestamps: true });

export default mongoose.model('Leave', leaveSchema);
