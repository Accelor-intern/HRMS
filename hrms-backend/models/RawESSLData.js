import mongoose from 'mongoose';

const rawESSLDataSchema = new mongoose.Schema({
  rawData: { type: String, required: true },
  fetchDate: { type: Date, default: Date.now },
  processed: { type: Boolean, default: false },
});

// Prevent model overwrite by checking if the model is already defined
export default mongoose.models.RawESSLData || mongoose.model('RawESSLData', rawESSLDataSchema);