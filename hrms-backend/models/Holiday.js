import mongoose from 'mongoose';

const holidaySchema = new mongoose.Schema({
  name: { type: String, required: true },
  date: { type: Date, required: true, index: true },
  type: { type: String, enum: ['RH', 'YH'], required: true },
  note: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

holidaySchema.index({ date: 1, type: 1 });

const Holiday = mongoose.model('Holiday', holidaySchema);
export default Holiday;