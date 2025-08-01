import mongoose from 'mongoose';
import Attendance from '../models/Attendance.js';
import RawPunchlog from '../models/RawPunchlog.js';
import Leave from '../models/Leave.js';
import OD from '../models/OD.js';
import Employee from '../models/Employee.js';

// async function processLateArrivalsAndAbsents() {
//   try {
//     console.log(`Running processLateArrivalsAndAbsents at ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}...`);

//     // Current date in IST (UTC+5:30) for processing current day's records
//     const today = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
//     const todayDate = new Date(today);
//     todayDate.setHours(0, 0, 0, 0);

//     // Previous date in IST
//     const yesterday = new Date(todayDate);
//     yesterday.setDate(todayDate.getDate() - 1);

//     // Step 1: Fetch employees and unprocessed punch logs
//     const employees = await Employee.find();
//     const rawLogs = await RawPunchlog.find({ processed: false });
//     const logsByUser = {};

//     // Group unprocessed logs by UserID and date in IST
//     rawLogs.forEach(log => {
//       const logDateIST = new Date(log.LogDate).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }).split(' ')[0];
//       const key = `${log.UserID}_${logDateIST}`;
//       if (!logsByUser[key]) logsByUser[key] = [];
//       logsByUser[key].push(log);
//     });

//     // Step 2: Process today's and unprocessed logs' attendance
//     for (const employee of employees) {
//       const userId = employee.userId;

//       // Process logs for today and any unprocessed dates
//       for (const key in logsByUser) {
//         if (key.startsWith(`${userId}_`)) {
//           const logs = logsByUser[key];
//           if (logs.length === 0) continue;

//           // Extract and validate date part from key (e.g., "95_7/2/2025" -> "7/2/2025")
//           const logDateStr = key.split('_')[1];
//           console.log(`Processing logDateStr: ${logDateStr}`);

//           // Parse M/D/YYYY format
//           const [month, day, year] = logDateStr.split('/').map(part => parseInt(part, 10));
//           if (isNaN(month) || isNaN(day) || isNaN(year) || month < 1 || month > 12 || day < 1 || day > 31) {
//             console.error(`Invalid logDate format for key ${key}: ${logDateStr}`);
//             continue;
//           }
//           const logDate = new Date(year, month - 1, day);
//           if (isNaN(logDate.getTime())) {
//             console.error(`Invalid logDate for key ${key}: ${logDateStr}`);
//             continue;
//           }
//           const attendanceDate = new Date(logDate.toISOString().split('T')[0]);
//           console.log(`attendanceDate: ${attendanceDate}`);

//           // Check for approved or pending leaves
//           let leaveStatus = null;
//           const leaveQuery = {
//             employeeId: employee.employeeId,
//             'fullDay.from': { $lte: attendanceDate },
//             'fullDay.to': { $gte: attendanceDate }
//           };

//           const leave = await Leave.findOne(leaveQuery).lean();
//           if (leave && leave.fullDay) {
//             const fromDate = new Date(leave.fullDay.from);
//             const toDate = new Date(leave.fullDay.to);
//             if (fromDate <= attendanceDate && toDate >= attendanceDate) {
//               leaveStatus = leave.status.ceo === 'Approved' ? 'Leave (Approved)' : 'Leave (Approval Pending)';
//             }
//           }

//           // Sort logs by time and determine timeIn and timeOut based on Direction
//           logs.sort((a, b) => new Date(`1970-01-01T${a.LogTime}Z`) - new Date(`1970-01-01T${b.LogTime}Z`));
//           const firstInPunch = logs.find(log => log.Direction === "in");
//           const lastOutPunch = [...logs].reverse().find(log => log.Direction === "out");
//           const existingAttendance = await Attendance.findOne({
//             employeeId: employee.employeeId,
//             logDate: attendanceDate
//           }).lean();

//           let timeIn = existingAttendance ? existingAttendance.timeIn : (firstInPunch ? firstInPunch.LogTime : '00:00:00');
//           let timeOut = lastOutPunch ? lastOutPunch.LogTime : (existingAttendance ? existingAttendance.timeOut : null);

//           let status = 'Present';
//           let halfDay = null;
//           let ot = 0;

//           // Status determination based on login time
//           if (timeIn === '00:00:00' && !firstInPunch) {
//             status = leaveStatus || 'Absent';
//           } else if (timeIn <= '09:00:00') {
//             status = 'Present';
//           } else if (timeIn > '09:00:00' && timeIn <= '09:30:00') {
//             status = leaveStatus ? `${leaveStatus} & Present (HD)` : 'Present (HD)';
//             halfDay = 'First Half';
//           } else if (timeIn > '09:30:00' && timeIn < '13:00:00') {
//             status = leaveStatus ? `${leaveStatus} & Present (HD)` : 'Present (HD)';
//             halfDay = 'First Half';
//           } else if (timeIn >= '13:00:00' && timeIn <= '13:30:00') {
//             status = leaveStatus ? `${leaveStatus} & Present (HD)` : 'Present (HD)';
//             halfDay = 'First Half';
//           } else if (timeIn > '13:30:00') {
//             status = leaveStatus ? `${leaveStatus} & Present (HD: Afternoon)` : 'Present (HD: Afternoon)';
//             halfDay = 'Afternoon';
//           }

//           // Adjust status based on logout time if available
//           if (timeOut && timeIn !== '00:00:00') {
//             if (timeOut < '17:30:00') {
//               if (status.includes('Present (HD)') || status.includes('Present (HD: Afternoon)')) {
//                 status = leaveStatus ? `${leaveStatus} & Present (HD: Afternoon)` : 'Present (HD: Afternoon)';
//                 halfDay = 'Afternoon';
//               } else {
//                 status = leaveStatus ? `${leaveStatus} & Present (HD: Afternoon)` : 'Present (HD: Afternoon)';
//                 halfDay = 'Afternoon';
//               }
//             } else {
//               status = status.replace('Present (HD)', 'Present').replace('Present (HD: Afternoon)', 'Present');
//               if (leaveStatus && !status.includes(leaveStatus)) {
//                 status = `${leaveStatus} & ${status}`;
//               }
//             }

//             // Calculate overtime if timeOut is after 17:30:00
//             if (timeOut >= '17:30:00') {
//               const [outHours, outMinutes] = timeOut.split(':').map(Number);
//               const [inHours, inMinutes] = timeIn.split(':').map(Number);
//               const duration = (outHours * 60 + outMinutes) - (inHours * 60 + inMinutes);
//               ot = Math.max(0, duration - 510); // 510 minutes = 8.5 hours
//             }
//           }

//           // Create or update attendance record
//           if (existingAttendance) {
//             await Attendance.updateOne({ _id: existingAttendance._id }, {
//               timeIn,
//               timeOut,
//               status,
//               halfDay,
//               ot
//             });
//           } else {
//             await Attendance.create({
//               employeeId: employee.employeeId,
//               userId,
//               name: employee.name,
//               logDate: attendanceDate,
//               timeIn,
//               timeOut,
//               status,
//               halfDay,
//               ot
//             });
//           }

//           // Mark logs as processed
//           for (const log of logs) {
//             log.processed = true;
//             await log.save();
//           }
//         }
//       }
//     }

//     // Step 4: Process late arrivals for current month
//     const startOfMonth = new Date(todayDate);
//     startOfMonth.setDate(1);
//     startOfMonth.setHours(0, 0, 0, 0);

//     const endOfMonth = new Date(startOfMonth);
//     endOfMonth.setMonth(endOfMonth.getMonth() + 1);
//     endOfMonth.setDate(0);
//     endOfMonth.setHours(23, 59, 59, 999);

//     const employeesWithPunches = await RawPunchlog.distinct('UserID');
//     for (const userId of employeesWithPunches) {
//       const latePunches = await RawPunchlog.aggregate([
//         {
//           $match: {
//             UserID: userId,
//             LogDate: { $gte: startOfMonth, $lte: endOfMonth },
//             LogTime: { $gte: '09:00:00', $lte: '09:10:00' },
//             Direction: 'in'
//           },
//         },
//         {
//           $group: {
//             _id: { $dateToString: { format: '%Y-%m-%d', date: '$LogDate' } },
//             firstPunch: { $min: '$LogTime' },
//           },
//         },
//       ]);

//       if (latePunches.length >= 3) {
//         const todayPunch = await RawPunchlog.findOne({
//           UserID: userId,
//           LogDate: todayDate,
//           LogTime: { $gte: '09:00:00', $lte: '09:10:00' },
//           Direction: 'in'
//         }).sort({ LogTime: 1 });

//         if (todayPunch && todayPunch.LogTime) {
//           const employee = await Employee.findOne({ userId });
//           if (!employee) {
//             console.warn(`⚠️ No employee found for UserID: ${userId}`);
//             continue;
//           }

//           const existingAttendance = await Attendance.findOne({
//             employeeId: employee.employeeId,
//             logDate: todayDate,
//           });

//           if (existingAttendance) {
//             existingAttendance.status = 'Half Day';
//             existingAttendance.halfDay = 'First Half';
//             existingAttendance.timeIn = todayPunch.LogTime;
//             existingAttendance.ot = 0;
//             await existingAttendance.save();
//           } else {
//             await Attendance.create({
//               employeeId: employee.employeeId,
//               userId,
//               name: employee.name,
//               logDate: todayDate,
//               timeIn: todayPunch.LogTime,
//               timeOut: null,
//               status: 'Half Day',
//               halfDay: 'First Half',
//               ot: 0,
//             });
//           }

//           // Mark todayPunch as processed
//           todayPunch.processed = true;
//           await todayPunch.save();
//         }
//       }
//     }

//     // Step 5: Clean up processed logs
//     await RawPunchlog.deleteMany({ processed: true });

//     console.log(`processLateArrivalsAndAbsents at ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })} completed.`);
//   } catch (err) {
//     console.error('❌ Error processing late arrivals and absents:', err.message, err.stack);
//   }
// }

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

    // Group unprocessed logs by UserID and date in IST with validation
    rawLogs.forEach(log => {
      console.log(`Processing log: ${JSON.stringify(log)}`);
      // Validate LogDate
      if (!log.LogDate) {
        console.warn(`⚠️ Skipping log with null or undefined LogDate: ${JSON.stringify(log)}`);
        return;
      }
      if (typeof log.LogDate !== 'string') {
        console.warn(`⚠️ Skipping log with non-string LogDate: ${JSON.stringify(log)}, Type: ${typeof log.LogDate}`);
        return;
      }

      const logDate = new Date(log.LogDate);
      console.log(`Parsed logDate: ${logDate}, isNaN: ${isNaN(logDate.getTime())}`);
      if (isNaN(logDate.getTime())) {
        console.warn(`⚠️ Skipping log with invalid LogDate parsing: ${JSON.stringify(log)} - Parsed Date: ${logDate}`);
        return;
      }

      const logDateStr = logDate.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
      console.log(`Generated logDateStr: ${logDateStr}`);
      if (!logDateStr || !logDateStr.includes(' ')) {
        console.warn(`⚠️ Invalid logDateStr format: ${logDateStr} for log: ${JSON.stringify(log)}`);
        return;
      }

      const [datePart] = logDateStr.split(' ');
      const logDateIST = datePart;
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
          const logDate = new Date(year, month - 1, day); // Recalculate logDate from key
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

          // Initialize timeIn and timeOut with fallback values
          let timeIn = existingAttendance?.timeIn || (firstInPunch?.LogTime && firstInPunch.LogTime !== '' ? firstInPunch.LogTime : '00:00:00');
          let timeOut = lastOutPunch?.LogTime || (existingAttendance?.timeOut || null);

          // Validate timeIn format
          if (!timeIn || !/^\d{2}:\d{2}:\d{2}$/.test(timeIn)) {
            console.warn(`⚠️ Invalid timeIn format for employee ${employee.employeeId} on ${logDateStr}: ${timeIn}. Defaulting to '00:00:00'.`);
            timeIn = '00:00:00';
          }

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
            if (!/^\d{2}:\d{2}:\d{2}$/.test(timeOut)) {
              console.warn(`⚠️ Invalid timeOut format for employee ${employee.employeeId} on ${logDateStr}: ${timeOut}. Ignoring timeOut.`);
              timeOut = null;
            } else if (timeOut < '17:30:00') {
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
            if (timeOut && timeOut >= '17:30:00') {
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

// async function processLateArrivalStatus() {
//   try {
//     // Current date for processing
//     const today = new Date();
//     today.setHours(0, 0, 0, 0);

//     // Fetch all employees
//     const employees = await Employee.find();
//     const todayPunches = await RawPunchlog.find({ LogDate: today });
//     const logsByUser = {};

//     // Group punches by UserID
//     todayPunches.forEach(log => {
//       const key = log.UserID;
//       if (!logsByUser[key]) logsByUser[key] = [];
//       logsByUser[key].push(log);
//     });

//     for (const employee of employees) {
//       const userId = employee.userId;
//       const logs = logsByUser[userId] || [];
//       if (!logs.length) continue; // Skip employees with no punches

//       // Sort punches by time
//       logs.sort((a, b) => 
//         new Date(`1970-01-01T${a.LogTime}Z`) - new Date(`1970-01-01T${b.LogTime}Z`)
//       );

//       const firstPunch = logs[0];
//       const lastPunch = logs[logs.length - 1];
//       let fnStatus = null;
//       let anStatus = null;
//       let halfDay = null;

//       // Determine FN and AN status based on first punch time
//       const firstPunchTime = firstPunch.LogTime;
//       const [hours, minutes] = firstPunchTime.split(':').map(Number);
//       const totalMinutes = hours * 60 + minutes;

//       if (totalMinutes < 720) { // Before 12:00 PM (Forenoon)
//         if (totalMinutes >= 540 && totalMinutes <= 555) { // 9:00 to 9:15
//           fnStatus = 'Late Arrival';
//           halfDay = null;
//         } else if (totalMinutes > 555) { // After 9:15
//           fnStatus = 'Late Arrival';
//           halfDay = null;
//         } else {
//           fnStatus = 'Present';
//         }
//         anStatus = null; // No afternoon punch
//       } else { // 12:00 PM or later (Afternoon)
//         fnStatus = 'AWI'; // Absent Without Intimation for Forenoon
//         if (totalMinutes >= 810 && totalMinutes <= 825) { // 13:30 to 13:45
//           anStatus = 'Late Arrival';
//           halfDay = '';
//         } else if (totalMinutes > 825) { // After 13:45
//           anStatus = 'Late Arrival';
//           halfDay = null;
//         } else {
//           anStatus = 'Present';
//         }
//       }

//       // Combine statuses for final status field
//       const status = fnStatus && anStatus ? `FN: ${fnStatus} & AN: ${anStatus}` :
//                     fnStatus ? `FN: ${fnStatus}` :
//                     `AN: ${anStatus}`;

//       // Check for existing attendance record
//       let attendance = await Attendance.findOne({
//         employeeId: employee.employeeId,
//         logDate: today,
//       });

//       if (attendance) {
//         // Update existing record
//         attendance.timeIn = firstPunchTime;
//         attendance.timeOut = lastPunch !== firstPunch ? lastPunch.LogTime : null;
//         attendance.status = status;
//         attendance.halfDay = halfDay;
//         attendance.ot = 0; // Assuming no OT for late arrivals
//         await attendance.save();
//       } else {
//         // Create new attendance record
//         await Attendance.create({
//           employeeId: employee.employeeId,
//           userId,
//           name: employee.name,
//           logDate: today,
//           timeIn: firstPunchTime,
//           timeOut: lastPunch !== firstPunch ? lastPunch.LogTime : null,
//           status,
//           halfDay,
//           ot: 0,
//         });
//       }
//     }
//   } catch (err) {
//     console.error('Error processing late arrival status:', err);
//   }
// }

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


async function updateAWIStatus() {
  try {
    // Set base date in UTC (midnight)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0); // 2025-08-01T00:00:00.000+00:00
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // Fetch attendance records with AWI status for today
    const awiAttendances = await Attendance.find({
      logDate: { $gte: today, $lt: tomorrow },
      status: { $regex: /AWI/ } // Match any status containing AWI
    });

    if (!awiAttendances.length) {
      console.log('No AWI statuses found for processing today.');
      return;
    }

    // Get unique employee IDs
    const employeeIds = awiAttendances.map(att => att.employeeId);

    // Fetch corresponding punches where LogTime > 9:00 AM
    const todayPunches = await RawPunchlog.find({
      LogDate: { $gte: today, $lt: tomorrow },
      LogTime: { $gt: '09:00:00' },
      UserID: { $in: (await Employee.find({ employeeId: { $in: employeeIds } })).map(emp => emp.userId) }
    });

    // Group punches by UserID
    const logsByUser = {};
    todayPunches.forEach(log => {
      const key = log.UserID;
      if (!logsByUser[key]) logsByUser[key] = [];
      logsByUser[key].push(log);
    });

    for (const attendance of awiAttendances) {
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
      let approvalStatus = attendance.approvalStatus; // Preserve existing approval status
      let halfDay = attendance.halfDay; // Preserve existing halfDay

      // Parse first punch time
      const firstPunchTime = firstPunch.LogTime;
      const [hours, minutes] = firstPunchTime.split(':').map(Number);
      const totalMinutes = hours * 60 + minutes;

      // Determine FN status for late arrivals
      if (totalMinutes < 720) { // Before 12:00 PM
        if (totalMinutes >= 540 && totalMinutes <= 555) { // 9:00 to 9:15
          fnStatus = 'Present (LA)';
          approvalStatus = 'Pending';
        } else if (totalMinutes > 555) { // After 9:15
          fnStatus = 'Present (LA)';
          approvalStatus = 'NotRequired';
        }
      } else { // 12:00 PM or later
        fnStatus = 'AWI';
        if (totalMinutes >= 810 && totalMinutes <= 825) { // 13:30 to 13:45
          anStatus = 'Present (LA)';
          approvalStatus = 'Pending';
        } else if (totalMinutes > 825) { // After 13:45
          anStatus = 'Present (LA)';
          approvalStatus = 'NotRequired';
        } else {
          anStatus = 'Present';
        }
      }

      // Determine AN status based on logout time
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
      const newStatus = fnStatus && anStatus 
        ? `FN: ${fnStatus} & AN: ${anStatus}`
        : fnStatus 
          ? `FN: ${fnStatus}${anStatus ? ` & AN: ${anStatus}` : ''}`
          : `AN: ${anStatus}`;

      // Update only if status differs
      if (attendance.status !== newStatus) {
        attendance.status = newStatus;
        attendance.approvalStatus = approvalStatus;
        attendance.logDate = today; // Ensure logDate is UTC midnight
        await attendance.save();
        console.log(`Updated AWI status for ${attendance.employeeId} to: ${newStatus}`);
      } else {
        console.log(`No status change needed for ${attendance.employeeId}`);
      }
    }

    console.log('AWI status update completed successfully.');
  } catch (err) {
    console.error('Error updating AWI status:', err.message, err.stack);
    throw err;
  }
}

export { processLateArrivalsAndAbsents, updateAttendanceWithLeaves, updateAttendanceWithOD, processLateArrivalStatus, processPunchLogAttendance, processPunchLogOD, updateAWIStatus};

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

