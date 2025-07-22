import mongoose from 'mongoose';

const punchMissedSchema = new mongoose.Schema({
  employeeId: { type: String, required: true },
  name: { type: String, required: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  punchMissedDate: { type: Date, required: true },
  when: { type: String, enum: ['Time IN', 'Time OUT'], required: true },
  yourInput: { type: String, required: true },
  reason: { type: String, required: true },
  adminInput: { type: String },
  status: {
    hod: { type: String, enum: ['Pending', 'Approved', 'Submitted'], default: 'Pending' },
    admin: { type: String, enum: ['Pending', 'Approved'], default: 'Pending' },
    ceo: { type: String, enum: ['Pending', 'Approved'], default: 'Pending' },
  },
    statusHistory: [{
    stage: { type: String, enum: ['hod', 'admin', 'ceo'], required: true },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Submitted', 'N/A'], required: true },
    reason: { type: String, default: '' },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    changedAt: { type: Date, default: Date.now }
  }],
}, { timestamps: true });

export default mongoose.model('PunchMissed', punchMissedSchema);