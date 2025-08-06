import mongoose from 'mongoose';
import Attendance from '../models/Attendance.js';
import RawPunchlog from '../models/RawPunchlog.js';
import Leave from '../models/Leave.js';
import OD from '../models/OD.js';
import Employee from '../models/Employee.js';

async function processPunchLogAttendance() {
  try {
    const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    console.log(`Running processPunchLogAttendance at ${now}...`);

    // Set date to start of day in IST (UTC+5:30)
    const todayDate = new Date(now);
    todayDate.setHours(0, 0, 0, 0);
    const startOfDay = new Date(todayDate);
    const endOfDay = new Date(todayDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Fetch all employees
    const employees = await Employee.find();
    console.log(`Fetched ${employees.length} employees`);

    // Fetch unprocessed punch logs for today
    const todayPunches = await RawPunchlog.find({
      LogDate: { $gte: startOfDay, $lte: endOfDay },
      processed: false
    });
    console.log(`Fetched ${todayPunches.length} unprocessed punch logs for ${todayDate.toISOString().split('T')[0]}`);

    // Group punches by UserID
    const logsByUser = {};
    todayPunches.forEach(log => {
      const key = log.UserID;
      if (!logsByUser[key]) logsByUser[key] = [];
      logsByUser[key].push(log);
    });

    // Process attendance for each employee
    for (const employee of employees) {
      const userId = employee.userId;
      const logs = logsByUser[userId] || [];
      console.log(`Processing employee ${userId} with ${logs.length} logs`);

      // Find or create attendance record
      let attendance = await Attendance.findOne({
        employeeId: employee.employeeId,
        logDate: todayDate
      });

      if (logs.length === 0) {
        // No punch records, mark as Absent
        if (!attendance) {
          await Attendance.create({
            employeeId: employee.employeeId,
            userId,
            name: employee.name,
            logDate: todayDate,
            timeIn: null,
            timeOut: null,
            status: 'AWI',
            halfDay: null,
            ot: 0
          });
          console.log(`Created Absent record for employee ${employee.employeeId}`);
        } else if (attendance.status !== 'AWI') {
          attendance.status = 'AWI';
          attendance.timeIn = null;
          attendance.timeOut = null;
          await attendance.save();
          console.log(`Updated to Absent for employee ${employee.employeeId}`);
        }
        continue;
      }

      // Sort punches by LogDate to ensure earliest punch is selected
      logs.sort((a, b) => new Date(a.LogDate) - new Date(b.LogDate));

      // Select first "in" and last "out" punch
      const firstInPunch = logs.find(log => log.Direction === 'in');
      const lastOutPunch = [...logs].reverse().find(log => log.Direction === 'out');

      let timeIn = firstInPunch ? firstInPunch.LogTime : '00:00:00';
      let timeOut = lastOutPunch ? lastOutPunch.LogTime : null;
      let status = 'AWI'; // Default status

      // Validate time formats
      if (!/^\d{2}:\d{2}:\d{2}$/.test(timeIn)) {
        console.warn(`⚠️ Invalid timeIn format for employee ${employee.employeeId} on ${todayDate.toISOString().split('T')[0]}: ${timeIn}. Defaulting to '00:00:00'.`);
        timeIn = '00:00:00';
      }
      if (timeOut && !/^\d{2}:\d{2}:\d{2}$/.test(timeOut)) {
        console.warn(`⚠️ Invalid timeOut format for employee ${employee.employeeId} on ${todayDate.toISOString().split('T')[0]}: ${timeOut}. Ignoring timeOut.`);
        timeOut = null;
      }

      // Determine attendance status
      if (firstInPunch) {
        const [inHours, inMinutes] = timeIn.split(':').map(Number);
        const inTotalMinutes = inHours * 60 + inMinutes;
        if (inTotalMinutes <= 9 * 60) { // 09:00:00 or before
          status = 'Present(-)';
        }
      }

      if (lastOutPunch) {
        const [outHours, outMinutes] = timeOut.split(':').map(Number);
        const outTotalMinutes = outHours * 60 + outMinutes;
        if (outTotalMinutes >= 17.5 * 60) { // 17:30:00 or after
          status = 'Present'; // Overrides Present(-) if both conditions met
        }
      }

      // Create or update attendance record
      if (attendance) {
        attendance.timeIn = timeIn;
        attendance.timeOut = timeOut;
        attendance.status = status;
        attendance.halfDay = null;
        attendance.ot = 0;
        await attendance.save();
        console.log(`Updated attendance for employee ${employee.employeeId} with status: ${status}`);
      } else {
        await Attendance.create({
          employeeId: employee.employeeId,
          userId,
          name: employee.name,
          logDate: todayDate,
          timeIn,
          timeOut,
          status,
          halfDay: null,
          ot: 0
        });
        console.log(`Created attendance for employee ${employee.employeeId} with status: ${status}`);
      }

      // Mark logs as processed
      for (const log of logs) {
        log.processed = true;
        await log.save();
        console.log(`Marked log ${log._id} as processed for employee ${userId}`);
      }
    }

    console.log(`processPunchLogAttendance completed at ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}`);
  } catch (err) {
    console.error('❌ Error processing punch log attendance:', err.message, err.stack);
    throw err;
  }
}

async function processLateArrivalStatus() {
  try {
    // Set today to UTC midnight of the current local date (August 1, 2025, 00:00 IST = 2025-08-01T00:00:00.000+00:00 UTC)
    const now = new Date();
    const todayIST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    todayIST.setUTCHours(0, 0, 0, 0); // Midnight IST
    const todayUTC = new Date(Date.UTC(todayIST.getUTCFullYear(), todayIST.getUTCMonth(), todayIST.getUTCDate()));
    const yesterdayUTC = new Date(todayUTC);
    yesterdayUTC.setUTCDate(todayUTC.getUTCDate() - 1);
    const tomorrowUTC = new Date(todayUTC);
    tomorrowUTC.setUTCDate(todayUTC.getUTCDate() + 1);

    // Adjust range to start from previous day's 18:30:00 UTC to next day's 18:30:00 UTC
    const startOfDayUTC = new Date(todayUTC);
    startOfDayUTC.setUTCHours(18, 30, 0, 0); // 6:30 PM UTC (previous day's 18:30:00 UTC as per your example)
    if (startOfDayUTC > todayUTC) {
      startOfDayUTC.setUTCDate(startOfDayUTC.getUTCDate() - 1); // Ensure it’s the previous day if needed
    }
    const endOfDayUTC = new Date(startOfDayUTC);
    endOfDayUTC.setUTCDate(startOfDayUTC.getUTCDate() + 1);

    console.log(`Processing records from ${startOfDayUTC.toISOString()} to ${endOfDayUTC.toISOString()}`);

    // Fetch all today's attendance records in UTC
    const existingAttendances = await Attendance.find({
      logDate: { $gte: startOfDayUTC, $lt: endOfDayUTC }
    });

    if (!existingAttendances.length) {
      console.log('No attendance records found for today in UTC range.');
      return;
    }

    // Fetch punches where LogTime > 9:00 AM
    const todayPunches = await RawPunchlog.find({
      LogDate: { $gte: startOfDayUTC, $lt: endOfDayUTC },
      LogTime: { $gt: '09:00:00' }
    });

    // Group punches by UserID
    const logsByUser = {};
    todayPunches.forEach(log => {
      const key = log.UserID;
      if (!logsByUser[key]) logsByUser[key] = [];
      logsByUser[key].push(log);
    });

    for (const attendance of existingAttendances) {
      const employee = await Employee.findOne({ employeeId: attendance.employeeId });
      if (!employee) continue;

      const userId = employee.userId;
      const logs = logsByUser[userId] || [];
      if (!logs.length) {
        console.log(`No punches found for ${attendance.employeeId}, skipping update.`);
        continue;
      }

      // Sort punches by time
      logs.sort((a, b) => 
        new Date(`1970-01-01T${a.LogTime}Z`) - new Date(`1970-01-01T${b.LogTime}Z`)
      );

      const firstPunch = logs[0];
      const lastPunch = logs[logs.length - 1];
      let fnStatus = null;
      let anStatus = null;
      let halfDay = attendance.halfDay; // Preserve existing halfDay
      let approvalStatus = attendance.approvalStatus; // Preserve existing approvalStatus

      // Parse timeIn from attendance (existing record)
      const timeIn = attendance.timeIn;
      if (!timeIn) {
        console.log(`No timeIn for ${attendance.employeeId}, skipping update.`);
        continue;
      }
      const [hours, minutes] = timeIn.split(':').map(Number);
      const totalMinutes = hours * 60 + minutes;

      // Determine FN status for late arrivals based on existing timeIn
      if (totalMinutes > 540) { // After 9:00 AM
        if (totalMinutes >= 540 && totalMinutes <= 555) { // 9:00 to 9:15
          fnStatus = 'Present (LA)';
          approvalStatus = 'Pending';
        } else if (totalMinutes > 555) { // After 9:15
          fnStatus = 'Present (LA)';
          approvalStatus = 'NotRequired';
        }
      } else {
        // Skip if timeIn is before or at 9:00 AM, no update needed
        continue;
      }

      // Determine AN status based on logout time if available
      if (lastPunch !== firstPunch && lastPunch.LogTime) {
        const lastPunchTime = lastPunch.LogTime;
        const [lastHours, lastMinutes] = lastPunchTime.split(':').map(Number);
        const lastTotalMinutes = lastHours * 60 + lastMinutes;

        if (lastTotalMinutes >= 1050) { // 17:30 or later
          anStatus = 'Present';
        } else if (!anStatus) {
          anStatus = 'AWI';
        }
      } else if (!anStatus) {
        anStatus = '-'; // Pending future syncs
      }

      // Combine statuses
      const status = fnStatus && anStatus 
        ? `FN: ${fnStatus} & AN: ${anStatus}`
        : fnStatus 
          ? `FN: ${fnStatus}${anStatus ? ` & AN: ${anStatus}` : ''}`
          : `AN: ${anStatus}`;

      // Update only if status or approvalStatus changed
      const timeOut = lastPunch !== firstPunch ? lastPunch.LogTime : attendance.timeOut;
      if (attendance.status !== status || attendance.approvalStatus !== approvalStatus) {
        attendance.status = status;
        attendance.timeOut = timeOut;
        attendance.approvalStatus = approvalStatus;
        attendance.logDate = todayUTC; // Ensure logDate is UTC midnight
        await attendance.save();
        console.log(`Updated attendance for ${attendance.employeeId} to: ${status}`);
      } else {
        console.log(`No changes needed for ${attendance.employeeId}`);
      }
    }

    // Process HOD approvals for previous day's pending cases
    const previousDayUTC = new Date(startOfDayUTC);
    previousDayUTC.setUTCDate(startOfDayUTC.getUTCDate() - 1);
    const pendingAttendances = await Attendance.find({
      logDate: previousDayUTC,
      approvalStatus: 'Pending'
    });

    for (const attendance of pendingAttendances) {
      const approval = await Approval.findOne({
        attendanceId: attendance._id,
        approved: { $exists: true },
        approvalDate: { $gte: previousDayUTC, $lt: startOfDayUTC }
      });

      if (approval && approval.approved) {
        attendance.status = attendance.status.replace('Present (LA)', 'Present [LA (Allowed)]');
        attendance.approvalStatus = 'Approved';
      } else {
        attendance.status = attendance.status.replace('Present (LA)', 'Present [LA (Denied)]');
        attendance.approvalStatus = 'Rejected';
      }
      await attendance.save();
      console.log(`Processed approval for ${attendance.employeeId}: ${attendance.status}`);
    }

    console.log('Late arrival processing completed successfully.');
  } catch (err) {
    console.error('Error processing late arrival status:', err.message, err.stack);
    throw err;
  }
}

async function updateAttendanceWithLeaves() {
  try {
    console.log(`Running updateAttendanceWithLeaves at ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}...`);
    
    // Set date to midnight UTC for the current day
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Query for absent records
    const absentAttendances = await Attendance.find({
      logDate: {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      },
      status: 'AWI',
      $or: [
        { timeIn: null },
        { timeIn: 'null' },
      ],
      $or: [
        { timeOut: null },
        { timeOut: 'null' },
      ],
    }).lean();

    console.log(`Found ${absentAttendances.length} absent records for ${today.toISOString()}`);

    if (!absentAttendances.length) {
      console.log('No absent records found to update.');
      const allAttendance = await Attendance.find({
        logDate: {
          $gte: today,
          $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
        },
      }).lean();
      console.log(`Total attendance records for ${today.toISOString()}: ${allAttendance.length}`);
      console.log(`Sample attendance records: ${JSON.stringify(allAttendance.slice(0, 2))}`);
      return;
    }

    for (const attendance of absentAttendances) {
      const employee = await Employee.findOne({ employeeId: attendance.employeeId }).lean();
      if (!employee) {
        console.warn(`No employee found for employeeId: ${attendance.employeeId}`);
        continue;
      }

      // Normalize logDate to start of day in UTC
      const logDate = new Date(attendance.logDate);
      logDate.setUTCHours(0, 0, 0, 0);
      const startOfDay = new Date(logDate.getTime());
      const endOfDay = new Date(logDate.getTime() + 24 * 60 * 60 * 1000 - 1);

      console.log(`Processing attendance for employeeId ${attendance.employeeId}, logDate: ${logDate.toISOString()}`);
      console.log(`Querying leaves with startOfDay: ${startOfDay.toISOString()}, endOfDay: ${endOfDay.toISOString()}`);

      // Query leave records, handling string dates with +00:00
      const leave = await Leave.findOne({
        employeeId: attendance.employeeId,
        leave_from: { $lte: endOfDay.toISOString().replace('Z', '+00:00') },
        leave_to: { $gte: startOfDay.toISOString().replace('Z', '+00:00') },
        'status.ceo': { $in: ['Approved', 'Pending'] },
      }).lean();

      if (leave) {
        // Validate status.ceo field
        if (!leave.status || !leave.status.ceo) {
          console.warn(`Invalid status field for leave record: ${JSON.stringify(leave)}`);
          continue;
        }

        // Determine new status
        const status = leave.status.ceo === 'Approved' && leave.status.admin=== 'Acknowledged'
          ? `Leave (${leave.leaveType}) (Approval Done)`
          : `Leave (${leave.leaveType}) (Approval Pending)`;

        // Update attendance record
        const result = await Attendance.updateOne(
          { _id: attendance._id },
          { $set: { status, halfDay: null } }
        );

        if (result.modifiedCount > 0) {
          console.log(`Updated attendance for employeeId ${attendance.employeeId} to status: ${status}`);
        } else {
          console.warn(`Failed to update attendance for employeeId ${attendance.employeeId}`);
        }
      } else {
        console.log(`No leave found for employeeId ${attendance.employeeId} on ${logDate.toISOString()}`);
        // Debug: Log all leaves for this employee
        const allLeaves = await Leave.find({ employeeId: attendance.employeeId }).lean();
        console.log(`All leaves for employeeId ${attendance.employeeId}: ${JSON.stringify(allLeaves.map(l => ({
          leave_from: l.leave_from,
          leave_to: l.leave_to,
          leaveType: l.leaveType,
          status: l.status,
        })))}`);
        // Debug: Test leave query manually
        const testLeave = await Leave.find({
          employeeId: attendance.employeeId,
          leave_from: { $lte: endOfDay.toISOString().replace('Z', '+00:00') },
          leave_to: { $gte: startOfDay.toISOString().replace('Z', '+00:00') },
        }).lean();
        console.log(`Test leave query result: ${JSON.stringify(testLeave)}`);
      }
    }

    console.log('updateAttendanceWithLeaves completed.');
  } catch (err) {
    console.error('Error updating attendance with leaves:', err);
  }
}

async function updateAttendanceWithOD() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const employees = await Employee.find();
    for (const employee of employees) {
      const employeeId = employee.employeeId;
      const attendance = await Attendance.findOne({ employeeId, logDate: today });

      if (!attendance) continue;

      // Check leave records
      const leave = await Leave.findOne({
        employeeId,
        $or: [
          { 'fullDay.from': { $lte: today }, 'fullDay.to': { $gte: today } },
          { 'halfDay.date': today },
        ],
        'status.ceo': 'Approved',
      });

      if (leave) continue;

      // Get OD record from 'ods' collection
      const odRecord = await mongoose.connection.db.collection('ods').findOne({ employeeId });

      if (!odRecord) {
        if (attendance.status === 'Absent' && !leave) {
          attendance.status = 'AWI';
          await attendance.save();
        }
        continue;
      }

      const odDateOut = new Date(odRecord.dateOut);
      odDateOut.setHours(0, 0, 0, 0);
      const odDateIn = new Date(odRecord.dateIn);
      odDateIn.setHours(0, 0, 0, 0);

      if (odDateOut.toDateString() !== attendance.logDate.toDateString()) {
        if (attendance.status === 'Absent' && !leave) {
          attendance.status = 'AWI';
          await attendance.save();
        }
        continue;
      }

      // ✅ SKIP if OD already present
if (attendance.status.includes('OD:') || attendance.status.includes('Present (OD')) {
  continue;
}
      // Extract OD timing logic
      const [outHours, outMinutes] = odRecord.timeOut.split(':').map(Number);
      const [inHours, inMinutes] = odRecord.timeIn.split(':').map(Number);

      // Pull actual OD timings
      const actualTimeIn = odRecord.actualTimeIn || odRecord.timeIn;
      const actualTimeOut = odRecord.actualTimeOut || odRecord.timeOut;

      let odStatus = '';
      if (odDateOut.toDateString() !== odDateIn.toDateString()) {
        odStatus = 'Present (OD: 9:00 to 5:30)';
      } else if (outHours * 60 + outMinutes <= 13.5 * 60) {
        odStatus = `- & OD: ${actualTimeIn} to ${actualTimeOut}`;
      } else if (inHours * 60 + inMinutes >= 13 * 60) {
        odStatus = `OD: ${actualTimeIn} to ${actualTimeOut} & -`;
      }

      // Final status assignment
      if (attendance.status === 'Absent') {
        attendance.status = odStatus;
      } else if (odStatus) {
        attendance.status += ` & ${odStatus}`;
      }

      await attendance.save();
    }
  } catch (err) {
    console.error('Error updating attendance with OD:', err);
  }
}

async function processPunchLogOD() {
  try {
    console.log(`Running processPunchLogOD at ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}...`);

    // Current date in IST (UTC+5:30) for processing current day's records
    const today = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    const todayDate = new Date(today);
    todayDate.setHours(0, 0, 0, 0);

    // Fetch all employees
    const employees = await Employee.find();
    console.log(`Fetched ${employees.length} employees`);

    // Fetch unprocessed punch logs for today
    const todayPunches = await RawPunchlog.find({ LogDate: todayDate, processed: false });
    console.log(`Fetched ${todayPunches.length} unprocessed punch logs for ${todayDate}`);

    // Group punches by UserID
    const logsByUser = {};
    todayPunches.forEach(log => {
      const key = log.UserID;
      if (!logsByUser[key]) logsByUser[key] = [];
      logsByUser[key].push(log);
    });

    // Process OD records for each employee
    for (const employee of employees) {
      const userId = employee.userId;
      const logs = logsByUser[userId] || [];
      console.log(`Processing employee ${userId} with ${logs.length} logs`);

      if (logs.length === 0) {
        console.log(`No punch logs for employee ${employee.employeeId}, skipping OD creation`);
        continue;
      }

      // Sort punches by time
      logs.sort((a, b) => new Date(`1970-01-01T${a.LogTime}Z`) - new Date(`1970-01-01T${b.LogTime}Z`));

      // Group punches into in/out pairs
      const punchPairs = [];
      let currentIn = null;
      for (const log of logs) {
        if (log.Direction === 'in') {
          currentIn = log;
        } else if (log.Direction === 'out' && currentIn) {
          punchPairs.push({ inPunch: currentIn, outPunch: log });
          currentIn = null;
        }
      }

      // If there's an unpaired 'in' punch, add it with null out time
      if (currentIn) {
        punchPairs.push({ inPunch: currentIn, outPunch: null });
      }

      // Create or update OD record
      let odRecord = await OD.findOne({
        employeeId: employee.employeeId,
        dateOut: todayDate,
      });

      const actualPunchTimes = punchPairs.map(pair => ({
        actualTimeOut: pair.outPunch ? new Date(`${todayDate.toISOString().split('T')[0]}T${pair.outPunch.LogTime}Z`) : null,
        actualTimeIn: new Date(`${todayDate.toISOString().split('T')[0]}T${pair.inPunch.LogTime}Z`),
        punchId: new mongoose.Types.ObjectId().toString(),
        recordedAt: new Date(),
      }));

      if (odRecord) {
        // Update existing OD record by appending new punch times
        odRecord.actualPunchTimes.push(...actualPunchTimes);
        await odRecord.save();
        console.log(`Updated OD record for employee ${employee.employeeId} with ${actualPunchTimes.length} new punch pairs`);
      } else {
        // Create new OD record
        await OD.create({
          employeeId: employee.employeeId,
          employee: employee._id,
          name: employee.name,
          designation: employee.designation || 'N/A', // Adjust based on Employee schema
          department: employee.department || null, // Adjust based on Employee schema
          dateOut: todayDate,
          timeOut: punchPairs[punchPairs.length - 1]?.outPunch?.LogTime || null,
          dateIn: todayDate,
          timeIn: punchPairs[0]?.inPunch?.LogTime || '00:00:00',
          purpose: 'Official Duty', // Default, adjust as needed
          placeUnitVisit: 'On-Site', // Default, adjust as needed
          status: {
            hod: 'Pending',
            admin: 'Pending',
            ceo: 'Pending',
          },
          actualPunchTimes,
        });
        console.log(`Created OD record for employee ${employee.employeeId} with ${actualPunchTimes.length} punch pairs`);
      }

      // Mark logs as processed
      for (const log of logs) {
        log.processed = true;
        await log.save();
        console.log(`Marked log ${log._id} as processed for employee ${userId}`);
      }
    }

    console.log(`processPunchLogOD at ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })} completed.`);
  } catch (err) {
    console.error('❌ Error processing punch log OD:', err.message, err.stack);
  }
}

async function updateAttendanceWithShift() {
  try {
    console.log(`Running updateAttendanceWithShift at ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}...`);

    // Get current date in IST and normalize to UTC midnight
    const now = new Date();
    const todayIST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    todayIST.setUTCHours(0, 0, 0, 0);
    const todayUTC = new Date(Date.UTC(todayIST.getUTCFullYear(), todayIST.getUTCMonth(), todayIST.getUTCDate()));

    // Adjust for Attendance table's logDate (previous day 18:30:00 UTC)
    const attendanceLogDate = new Date(todayUTC);
    attendanceLogDate.setUTCHours(18, 30, 0, 0);
    if (attendanceLogDate > todayUTC) {
      attendanceLogDate.setUTCDate(attendanceLogDate.getUTCDate() - 1);
    }

    console.log(`Processing shift updates for attendance logDate: ${attendanceLogDate.toISOString()}`);

    // Fetch attendance records with AWI status for the logDate
    const awiAttendances = await Attendance.find({
      logDate: attendanceLogDate,
      status: 'AWI'
    }).lean();

    console.log(`Found ${awiAttendances.length} AWI attendance records for ${attendanceLogDate.toISOString()}`);

    if (!awiAttendances.length) {
      console.log('No AWI attendance records found to update.');
      return;
    }

    for (const attendance of awiAttendances) {
      // Fetch employee with shift details
      const employee = await Employee.findOne({ employeeId: attendance.employeeId }).lean();
      if (!employee) {
        console.warn(`No employee found for employeeId: ${attendance.employeeId}`);
        continue;
      }

      // Check if shift exists and current date is within shiftEffectiveFrom and shiftValidUpto (inclusive)
      if (employee.shift && employee.shiftEffectiveFrom && employee.shiftValidUpto) {
        const shiftStart = new Date(employee.shiftEffectiveFrom);
        const shiftEnd = new Date(employee.shiftValidUpto);
        shiftEnd.setUTCHours(23, 59, 59, 999); // Include entire end date

        if (todayUTC >= shiftStart && todayUTC <= shiftEnd) {
          // Update attendance status to shift value
          const result = await Attendance.updateOne(
            { _id: attendance._id },
            { $set: { status: employee.shift } }
          );
          if (result.modifiedCount > 0) {
            console.log(`Updated attendance for employeeId ${attendance.employeeId} to status: ${employee.shift}`);
          } else {
            console.warn(`Failed to update attendance for employeeId ${attendance.employeeId}`);
          }
        } else {
          console.log(`Date ${todayUTC.toISOString()} outside shift range for employeeId ${attendance.employeeId}`);
        }
      } else {
        console.log(`No shift details found for employeeId ${attendance.employeeId}, leaving AWI unchanged`);
      }
    }

    console.log('updateAttendanceWithShift completed.');
  } catch (err) {
    console.error('Error updating attendance with shift:', err.message, err.stack);
    throw err;
  }
}

export {updateAttendanceWithShift, updateAttendanceWithLeaves, updateAttendanceWithOD, processLateArrivalStatus, processPunchLogAttendance, processPunchLogOD};


