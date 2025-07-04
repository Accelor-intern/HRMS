import mongoose from 'mongoose';
import Attendance from '../models/Attendance.js';
import RawPunchlog from '../models/RawPunchlog.js';
import Leave from '../models/Leave.js';
import OD from '../models/OD.js';
import Employee from '../models/Employee.js';

async function processLateArrivalsAndAbsents() {
  try {
    console.log(`Running processLateArrivalsAndAbsents at ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}...`);

    // Current date in IST (UTC+5:30) for processing current day's records
    const today = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    const todayDate = new Date(today);
    todayDate.setHours(0, 0, 0, 0);

    // Previous date in IST
    const yesterday = new Date(todayDate);
    yesterday.setDate(todayDate.getDate() - 1);

    // Step 1: Fetch employees and unprocessed punch logs
    const employees = await Employee.find();
    const rawLogs = await RawPunchlog.find({ processed: false });
    const logsByUser = {};

    // Group unprocessed logs by UserID and date in IST
    rawLogs.forEach(log => {
      const logDateIST = new Date(log.LogDate).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }).split(' ')[0];
      const key = `${log.UserID}_${logDateIST}`;
      if (!logsByUser[key]) logsByUser[key] = [];
      logsByUser[key].push(log);
    });

    // Step 2: Process today's and unprocessed logs' attendance
    for (const employee of employees) {
      const userId = employee.userId;

      // Process logs for today and any unprocessed dates
      for (const key in logsByUser) {
        if (key.startsWith(`${userId}_`)) {
          const logs = logsByUser[key];
          if (logs.length === 0) continue;

          // Extract and validate date part from key (e.g., "95_7/2/2025" -> "7/2/2025")
          const logDateStr = key.split('_')[1];
          console.log(`Processing logDateStr: ${logDateStr}`);

          // Parse M/D/YYYY format
          const [month, day, year] = logDateStr.split('/').map(part => parseInt(part, 10));
          if (isNaN(month) || isNaN(day) || isNaN(year) || month < 1 || month > 12 || day < 1 || day > 31) {
            console.error(`Invalid logDate format for key ${key}: ${logDateStr}`);
            continue;
          }
          const logDate = new Date(year, month - 1, day);
          if (isNaN(logDate.getTime())) {
            console.error(`Invalid logDate for key ${key}: ${logDateStr}`);
            continue;
          }
          const attendanceDate = new Date(logDate.toISOString().split('T')[0]);
          console.log(`attendanceDate: ${attendanceDate}`);

          // Check for approved or pending leaves
          let leaveStatus = null;
          const leaveQuery = {
            employeeId: employee.employeeId,
            'fullDay.from': { $lte: attendanceDate },
            'fullDay.to': { $gte: attendanceDate }
          };

          const leave = await Leave.findOne(leaveQuery).lean();
          if (leave && leave.fullDay) {
            const fromDate = new Date(leave.fullDay.from);
            const toDate = new Date(leave.fullDay.to);
            if (fromDate <= attendanceDate && toDate >= attendanceDate) {
              leaveStatus = leave.status.ceo === 'Approved' ? 'Leave (Approved)' : 'Leave (Approval Pending)';
            }
          }

          // Sort logs by time and determine timeIn and timeOut based on Direction
          logs.sort((a, b) => new Date(`1970-01-01T${a.LogTime}Z`) - new Date(`1970-01-01T${b.LogTime}Z`));
          const firstInPunch = logs.find(log => log.Direction === "in");
          const lastOutPunch = [...logs].reverse().find(log => log.Direction === "out");
          const existingAttendance = await Attendance.findOne({
            employeeId: employee.employeeId,
            logDate: attendanceDate
          }).lean();

          let timeIn = existingAttendance ? existingAttendance.timeIn : (firstInPunch ? firstInPunch.LogTime : '00:00:00');
          let timeOut = lastOutPunch ? lastOutPunch.LogTime : (existingAttendance ? existingAttendance.timeOut : null);

          let status = 'Present';
          let halfDay = null;
          let ot = 0;

          // Status determination based on login time
          if (timeIn === '00:00:00' && !firstInPunch) {
            status = leaveStatus || 'Absent';
          } else if (timeIn <= '09:00:00') {
            status = 'Present';
          } else if (timeIn > '09:00:00' && timeIn <= '09:30:00') {
            status = leaveStatus ? `${leaveStatus} & Present (HD)` : 'Present (HD)';
            halfDay = 'First Half';
          } else if (timeIn > '09:30:00' && timeIn < '13:00:00') {
            status = leaveStatus ? `${leaveStatus} & Present (HD)` : 'Present (HD)';
            halfDay = 'First Half';
          } else if (timeIn >= '13:00:00' && timeIn <= '13:30:00') {
            status = leaveStatus ? `${leaveStatus} & Present (HD)` : 'Present (HD)';
            halfDay = 'First Half';
          } else if (timeIn > '13:30:00') {
            status = leaveStatus ? `${leaveStatus} & Present (HD: Afternoon)` : 'Present (HD: Afternoon)';
            halfDay = 'Afternoon';
          }

          // Adjust status based on logout time if available
          if (timeOut && timeIn !== '00:00:00') {
            if (timeOut < '17:30:00') {
              if (status.includes('Present (HD)') || status.includes('Present (HD: Afternoon)')) {
                status = leaveStatus ? `${leaveStatus} & Present (HD: Afternoon)` : 'Present (HD: Afternoon)';
                halfDay = 'Afternoon';
              } else {
                status = leaveStatus ? `${leaveStatus} & Present (HD: Afternoon)` : 'Present (HD: Afternoon)';
                halfDay = 'Afternoon';
              }
            } else {
              status = status.replace('Present (HD)', 'Present').replace('Present (HD: Afternoon)', 'Present');
              if (leaveStatus && !status.includes(leaveStatus)) {
                status = `${leaveStatus} & ${status}`;
              }
            }

            // Calculate overtime if timeOut is after 17:30:00
            if (timeOut >= '17:30:00') {
              const [outHours, outMinutes] = timeOut.split(':').map(Number);
              const [inHours, inMinutes] = timeIn.split(':').map(Number);
              const duration = (outHours * 60 + outMinutes) - (inHours * 60 + inMinutes);
              ot = Math.max(0, duration - 510); // 510 minutes = 8.5 hours
            }
          }

          // Create or update attendance record
          if (existingAttendance) {
            await Attendance.updateOne({ _id: existingAttendance._id }, {
              timeIn,
              timeOut,
              status,
              halfDay,
              ot
            });
          } else {
            await Attendance.create({
              employeeId: employee.employeeId,
              userId,
              name: employee.name,
              logDate: attendanceDate,
              timeIn,
              timeOut,
              status,
              halfDay,
              ot
            });
          }

          // Mark logs as processed
          for (const log of logs) {
            log.processed = true;
            await log.save();
          }
        }
      }
    }

    // Step 4: Process late arrivals for current month
    const startOfMonth = new Date(todayDate);
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date(startOfMonth);
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);
    endOfMonth.setDate(0);
    endOfMonth.setHours(23, 59, 59, 999);

    const employeesWithPunches = await RawPunchlog.distinct('UserID');
    for (const userId of employeesWithPunches) {
      const latePunches = await RawPunchlog.aggregate([
        {
          $match: {
            UserID: userId,
            LogDate: { $gte: startOfMonth, $lte: endOfMonth },
            LogTime: { $gte: '09:00:00', $lte: '09:10:00' },
            Direction: 'in'
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$LogDate' } },
            firstPunch: { $min: '$LogTime' },
          },
        },
      ]);

      if (latePunches.length >= 3) {
        const todayPunch = await RawPunchlog.findOne({
          UserID: userId,
          LogDate: todayDate,
          LogTime: { $gte: '09:00:00', $lte: '09:10:00' },
          Direction: 'in'
        }).sort({ LogTime: 1 });

        if (todayPunch && todayPunch.LogTime) {
          const employee = await Employee.findOne({ userId });
          if (!employee) {
            console.warn(`⚠️ No employee found for UserID: ${userId}`);
            continue;
          }

          const existingAttendance = await Attendance.findOne({
            employeeId: employee.employeeId,
            logDate: todayDate,
          });

          if (existingAttendance) {
            existingAttendance.status = 'Half Day';
            existingAttendance.halfDay = 'First Half';
            existingAttendance.timeIn = todayPunch.LogTime;
            existingAttendance.ot = 0;
            await existingAttendance.save();
          } else {
            await Attendance.create({
              employeeId: employee.employeeId,
              userId,
              name: employee.name,
              logDate: todayDate,
              timeIn: todayPunch.LogTime,
              timeOut: null,
              status: 'Half Day',
              halfDay: 'First Half',
              ot: 0,
            });
          }

          // Mark todayPunch as processed
          todayPunch.processed = true;
          await todayPunch.save();
        }
      }
    }

    // Step 5: Clean up processed logs
    await RawPunchlog.deleteMany({ processed: true });

    console.log(`processLateArrivalsAndAbsents at ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })} completed.`);
  } catch (err) {
    console.error('❌ Error processing late arrivals and absents:', err.message, err.stack);
  }
}


// async function updateAttendanceWithLeaves() {
//   try {
//     console.log(`Running updateAttendanceWithLeaves at ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}...`);
//     const today = new Date();
//     today.setUTCHours(0, 0, 0, 0); // Midnight UTC

//     const absentAttendances = await Attendance.find({
//       logDate: {
//         $gte: new Date(today.getTime()).toISOString(),
//         $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(),
//       },
//       status: 'Absent',
//       timeIn: null,
//       timeOut: null,
//     }).lean();

//     console.log(`Found ${absentAttendances.length} absent records for ${today.toISOString()}`);

//     if (!absentAttendances.length) {
//       console.log('No absent records found to update.');
//       return;
//     }

//     for (const attendance of absentAttendances) {
//       const employee = await Employee.findOne({ employeeId: attendance.employeeId });
//       if (!employee) {
//         console.warn(`No employee found for employeeId: ${attendance.employeeId}`);
//         continue;
//       }

//       // Convert logDate string to Date object and normalize to start of day in UTC
//       const logDate = new Date(attendance.logDate);
//       logDate.setUTCHours(0, 0, 0, 0); // Normalize to start of day in UTC
//       console.log(`Processing attendance for employeeId ${attendance.employeeId}, logDate: ${logDate.toISOString()}, raw logDate: ${attendance.logDate}`);

//       // Define the date range for the entire day in UTC
//       const startOfDay = new Date(logDate.getTime());
//       const endOfDay = new Date(logDate.getTime() + 24 * 60 * 60 * 1000 - 1);

//       console.log(`Date range: ${startOfDay.toISOString()} to ${endOfDay.toISOString()}`);

//       // Query leave records using leave_from and leave_to
//       const leave = await Leave.findOne({
//         employeeId: attendance.employeeId,
//         leave_from: {
//           $lte: endOfDay.toISOString(),
//         },
//         leave_to: {
//           $gte: startOfDay.toISOString(),
//         },
//         'status.ceo': { $in: ['Approved', 'Pending'] },
//       }).lean();

//       if (leave) {
//         let status = attendance.status; // Initialize with current status
//         let halfDay = attendance.halfDay;

//         // Determine status based on leave type and approval
//         status = leave.status.ceo === 'Approved'
//           ? `Leave (${leave.leaveType})`
//           : `Leave (${leave.leaveType}) (Approval Pending)`;

//         // Handle half-day or full-day logic based on duration/session
//         if (leave.dates && (leave.dates.fromDuration === 'half' || leave.dates.toDuration === 'half')) {
//           halfDay = leave.dates.toSession === 'forenoon' ? 'First Half' : 'Second Half';
//         } else if (leave.leave_from && leave.leave_to) {
//           const fromTime = new Date(leave.leave_from).getUTCHours() * 60 + new Date(leave.leave_from).getUTCMinutes();
//           const toTime = new Date(leave.leave_to).getUTCHours() * 60 + new Date(leave.leave_to).getUTCMinutes();
//           if (toTime - fromTime < 12 * 60) { // Less than 12 hours, assume half-day
//             halfDay = fromTime < 12 * 60 ? 'First Half' : 'Second Half'; // Rough heuristic
//           } else {
//             halfDay = null; // Full-day leave
//           }
//         }

//         const result = await Attendance.updateOne(
//           { _id: attendance._id },
//           { $set: { status, halfDay } }
//         );
//         if (result.modifiedCount > 0) {
//           console.log(`Updated attendance for employeeId ${attendance.employeeId} with status: ${status}, halfDay: ${halfDay}`);
//         } else {
//           console.warn(`Failed to update attendance for employeeId ${attendance.employeeId}`);
//         }
//       } else {
//         console.log(`No leave found for employeeId ${attendance.employeeId} on ${logDate.toISOString()}`);
//         // Debug: Check all leaves for this employeeId to verify data
//         const allLeaves = await Leave.find({ employeeId: attendance.employeeId }).lean();
//         console.log(`All leaves for employeeId ${attendance.employeeId}: ${JSON.stringify(allLeaves)}`);
//       }
//     }

//     console.log('updateAttendanceWithLeaves completed.');
//   } catch (err) {
//     console.error('Error updating attendance with leaves:', err);
//   }
// }

async function processLateArrivalStatus() {
  try {
    // Current date for processing
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch all employees
    const employees = await Employee.find();
    const todayPunches = await RawPunchlog.find({ LogDate: today });
    const logsByUser = {};

    // Group punches by UserID
    todayPunches.forEach(log => {
      const key = log.UserID;
      if (!logsByUser[key]) logsByUser[key] = [];
      logsByUser[key].push(log);
    });

    for (const employee of employees) {
      const userId = employee.userId;
      const logs = logsByUser[userId] || [];
      if (!logs.length) continue; // Skip employees with no punches

      // Sort punches by time
      logs.sort((a, b) => 
        new Date(`1970-01-01T${a.LogTime}Z`) - new Date(`1970-01-01T${b.LogTime}Z`)
      );

      const firstPunch = logs[0];
      const lastPunch = logs[logs.length - 1];
      let status = 'Present';
      let halfDay = null;

      // Determine LA status based on first punch time
      const firstPunchTime = firstPunch.LogTime;
      const [hours, minutes] = firstPunchTime.split(':').map(Number);
      const totalMinutes = hours * 60 + minutes;

      if (totalMinutes >= 540 && totalMinutes <= 570) { // 9:00 to 9:30
        status = 'LA';
        halfDay = 'First Half';
      } else if (totalMinutes > 570) { // After 9:30
        status = 'LA';
        halfDay = null;
      } else if (totalMinutes >= 780 && totalMinutes <= 810) { // 13:00 to 13:30
        status = 'LA';
        halfDay = 'Second Half';
      } else if (totalMinutes > 810) { // After 13:30
        status = 'LA';
        halfDay = null;
      }

      // Check for existing attendance record
      let attendance = await Attendance.findOne({
        employeeId: employee.employeeId,
        logDate: today,
      });

      if (attendance) {
        // Update existing record
        attendance.timeIn = firstPunchTime;
        attendance.timeOut = lastPunch !== firstPunch ? lastPunch.LogTime : null;
        attendance.status = status;
        attendance.halfDay = halfDay;
        attendance.ot = 0; // Assuming no OT for late arrivals
        await attendance.save();
      } else {
        // Create new attendance record
        await Attendance.create({
          employeeId: employee.employeeId,
          userId,
          name: employee.name,
          logDate: today,
          timeIn: firstPunchTime,
          timeOut: lastPunch !== firstPunch ? lastPunch.LogTime : null,
          status,
          halfDay,
          ot: 0,
        });
      }
    }
  } catch (err) {
    console.error('Error processing late arrival status:', err);
  }
}

async function updateAttendanceWithLeaves() {
  try {
    console.log(`Running updateAttendanceWithLeaves at ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}...`);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0); // Midnight UTC

    const absentAttendances = await Attendance.find({
      logDate: {
        $gte: new Date(today.getTime()).toISOString(),
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      },
      status: 'Absent',
      timeIn: null,
      timeOut: null,
    }).lean();

    console.log(`Found ${absentAttendances.length} absent records for ${today.toISOString()}`);

    if (!absentAttendances.length) {
      console.log('No absent records found to update.');
      return;
    }

    for (const attendance of absentAttendances) {
      const employee = await Employee.findOne({ employeeId: attendance.employeeId });
      if (!employee) {
        console.warn(`No employee found for employeeId: ${attendance.employeeId}`);
        continue;
      }

      // Convert logDate string to Date object and normalize to start of day in UTC
      const logDate = new Date(attendance.logDate);
      logDate.setUTCHours(0, 0, 0, 0); // Normalize to start of day in UTC
      console.log(`Processing attendance for employeeId ${attendance.employeeId}, logDate: ${logDate.toISOString()}, raw logDate: ${attendance.logDate}`);

      // Define the date range for the entire day in UTC
      const startOfDay = new Date(logDate.getTime());
      const endOfDay = new Date(logDate.getTime() + 24 * 60 * 60 * 1000 - 1);

      console.log(startOfDay);
      console.log(endOfDay);

      // Query leave records with range-based matching using leave_from and leave_to
     const leave = await Leave.findOne({
  employeeId: attendance.employeeId,
  leave_from: { $lte: endOfDay },   // ✅ Remove `.toISOString()`
  leave_to: { $gte: startOfDay },   // ✅ Remove `.toISOString()`
  'status.ceo': { $in: ['Approved', 'Pending'] },
}).lean();
      if (leave) {
        let status = attendance.status; // Initialize with current status
        let halfDay = attendance.halfDay;

        // Override status with leave information
        status = leave.status.ceo === 'Approved'
          ? `Leave (${leave.leaveType})`
          : `Leave (${leave.leaveType}) (Approval Pending)`;
        halfDay = null; // Reset halfDay for full-day leaves

        const result = await Attendance.updateOne(
          { _id: attendance._id },
          { $set: { status, halfDay } }
        );
        if (result.modifiedCount > 0) {
          console.log(`Updated attendance for employeeId ${attendance.employeeId} with status: ${status}`);
        } else {
          console.warn(`Failed to update attendance for employeeId ${attendance.employeeId}`);
        }
      } else {
        console.log(`No leave found for employeeId ${attendance.employeeId} on ${logDate.toISOString()}`);
        // Debug: Check all leaves for this employeeId to verify data
        const allLeaves = await Leave.find({ employeeId: attendance.employeeId }).lean();
        console.log(`All leaves for employeeId ${attendance.employeeId}: ${JSON.stringify(allLeaves)}`);
      }
    }

    console.log('updateAttendanceWithLeaves completed.');
  } catch (err) {
    console.error('Error updating attendance with leaves:', err);
  }
}

// async function updateAttendanceWithOD() {
//   try {
//     const today = new Date();
//     today.setHours(0, 0, 0, 0);

//     const employees = await Employee.find();
//     for (const employee of employees) {
//       const employeeId = employee.employeeId;
//       const attendance = await Attendance.findOne({ employeeId, logDate: today });

//       if (!attendance) continue;

//       // Check leave records
//       const leave = await Leave.findOne({
//         employeeId,
//         $or: [
//           { 'fullDay.from': { $lte: today }, 'fullDay.to': { $gte: today } },
//           { 'halfDay.date': today },
//         ],
//         'status.ceo': 'Approved',
//       });

//       if (leave) continue;

//       // Check OD records
//       const odRecord = await mongoose.connection.db.collection('ods').findOne({ employeeId });

//       if (!odRecord) {
//         if (attendance.status === 'Absent' && !leave) {
//           attendance.status = 'AWI';
//           await attendance.save();
//         }
//         continue;
//       }

//       const odDateOut = new Date(odRecord.dateOut);
//       odDateOut.setHours(0, 0, 0, 0);
//       const odDateIn = new Date(odRecord.dateIn);
//       odDateIn.setHours(0, 0, 0, 0);

//       if (odDateOut.toDateString() !== attendance.logDate.toDateString()) {
//         if (attendance.status === 'Absent' && !leave) {
//           attendance.status = 'AWI';
//           await attendance.save();
//         }
//         continue;
//       }

//       let newStatus = attendance.status;
//       if (odDateOut.toDateString() !== odDateIn.toDateString()) {
//         newStatus = 'Present (OD: 9:00 to 5:30)';
//       } else {
//         const [outHours, outMinutes] = odRecord.timeOut.split(':').map(Number);
//         const [inHours, inMinutes] = odRecord.timeIn.split(':').map(Number);
//         const actualTimeIn = attendance.actualTimeIn || '09:15';
//         const actualTimeOut = attendance.actualTimeOut || '13:54';

//         if (outHours * 60 + outMinutes <= 13.5 * 60) { // 13:30
//           newStatus = `- & OD: ${actualTimeIn || '09:15'} to ${actualTimeOut || '13:30'}`;
//         } else if (inHours * 60 + inMinutes >= 13 * 60) { // 13:00
//           newStatus = `OD: ${actualTimeIn || '13:00'} to ${actualTimeOut || '17:30'} & -`;
//         }
//       }

//       attendance.status = newStatus;
//       await attendance.save();
//     }
//   } catch (err) {
//     console.error('Error updating attendance with OD:', err);
//   }
// }

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

export { processLateArrivalsAndAbsents, updateAttendanceWithLeaves, updateAttendanceWithOD, processLateArrivalStatus};