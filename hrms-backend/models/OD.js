import mongoose from 'mongoose';

const odSchema = new mongoose.Schema({
  employeeId: { type: String, required: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  name: { type: String, required: true },
  designation: { type: String, required: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  dateOut: { type: Date, required: true },
  timeOut: { type: String, required: true },
  dateIn: { type: Date, required: true },
  timeIn: { type: String },
  purpose: { type: String, required: true },
  placeUnitVisit: { type: String, required: true },
  status: {
    hod: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Submitted', 'N/A'], default: 'Pending' },
    admin: { type: String, enum: ['Pending', 'Acknowledged', 'N/A'], default: 'Pending' },
    ceo: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'N/A'], default: 'Pending' },
  },
  statusHistory: [{
    stage: { type: String, enum: ['hod', 'ceo', 'admin'], required: true },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Acknowledged', 'Submitted', 'N/A'], required: true },
    reason: { type: String, required: false },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    changedAt: { type: Date, default: Date.now }
  }],
  actualPunchTimes: [{
    actualTimeOut: { type: Date },
    actualTimeIn: { type: Date },
    punchId: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
    recordedAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

const OD = mongoose.models.OD || mongoose.model('OD', odSchema);

export default OD;