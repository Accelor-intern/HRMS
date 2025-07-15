import Leave from '../models/Leave.js';

async function generateNextCompositeLeaveId() {
  const lastLeave = await Leave.findOne({ compositeLeaveId: { $exists: true, $ne: null } })
    .sort({ createdAt: -1 })
    .select('compositeLeaveId');

  let nextIdNumber = 10004;
  if (lastLeave?.compositeLeaveId) {
    const lastNum = parseInt(lastLeave.compositeLeaveId.replace("CL", ""), 10);
    nextIdNumber = lastNum + 1;
  }

  return `CL${nextIdNumber}`;
}

export default generateNextCompositeLeaveId;