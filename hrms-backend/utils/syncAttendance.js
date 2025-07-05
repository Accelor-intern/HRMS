import { connectSQL, sql } from '../config/sql.js';
import RawPunchlog from '../models/RawPunchlog.js';
import Attendance from '../models/Attendance.js';
import Employee from '../models/Employee.js';
import SyncMetadata from '../models/SyncMetadata.js';
import Leave from '../models/Leave.js';

// Toggle variable for direction
let directionToggle = true;

const syncAttendance = async () => {
  try {
    // Step 1: Check if RawPunchlog is empty and initialize lastSyncedAt
    const rawPunchlogCount = await RawPunchlog.countDocuments();
    let syncMeta = await SyncMetadata.findOne({ name: 'attendanceSync' });
    let fromDate;

    if (rawPunchlogCount === 0 || !syncMeta) {
      console.log('RawPunchlog is empty or no sync metadata, fetching all punch logs');
      fromDate = new Date('1970-01-01');
      if (!syncMeta) {
        syncMeta = await SyncMetadata.create({ name: 'attendanceSync', lastSyncedAt: fromDate });
      }
    } else {
      fromDate = new Date(syncMeta.lastSyncedAt);
    }

    const toDate = new Date();

    const formatDateTime = (date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

    console.log(`🔄 Syncing attendance from ${formatDateTime(fromDate)} to ${formatDateTime(toDate)}`);

    // Step 2: Fetch punch logs from SQL
    const pool = await connectSQL();
    const query = `
      SELECT UserID, LogDate, LogTime, Direction
      FROM Punchlogs
      WHERE LogDate >= '${fromDate.toISOString().split('T')[0]}'
    `;
    const result = await pool.request().query(query);
    const records = result.recordset;

    if (!records || records.length === 0) {
      console.log('⚠️ No new punch logs found.');
      await SyncMetadata.findOneAndUpdate(
        { name: 'attendanceSync' },
        { lastSyncedAt: toDate }
      );
      return;
    }

    // Step 3: Normalize and deduplicate logs
    let punchLogs = records.map((log) => {
      let logTime = log.LogTime;

      if (typeof logTime === 'number') {
        const h = Math.floor(logTime / 3600);
        const m = Math.floor((logTime % 3600) / 60);
        const s = logTime % 60;
        logTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      } else if (logTime instanceof Date) {
        logTime = logTime.toISOString().split('T')[1].substring(0, 8);
      } else if (typeof logTime === 'string' && !/^\d{2}:\d{2}:\d{2}$/.test(logTime)) {
        console.warn(`⚠️ Invalid LogTime format for UserID: ${log.UserID}`, log.LogTime);
        return null;
      }

      return {
        UserID: log.UserID?.toString().trim(),
        LogDate: new Date(new Date(log.LogDate).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })),
        LogTime: logTime,
        Direction: log.Direction ? log.Direction.toLowerCase() : (directionToggle = !directionToggle) ? 'in' : 'out',
        processed: false,
      };
    }).filter((log) => log && log.UserID && log.LogTime && !isNaN(log.LogDate));

    // Step 4: Deduplicate in-memory
    punchLogs = [...new Map(punchLogs.map((log) =>
      [`${log.UserID}_${log.LogDate.toISOString()}_${log.LogTime}`, log]
    )).values()];

    // Step 5: Insert only new logs in RawPunchlog
    const newLogs = [];
    for (const log of punchLogs) {
      const exists = await RawPunchlog.exists({
        UserID: log.UserID,
        LogDate: log.LogDate,
        LogTime: log.LogTime,
      });
      if (!exists) newLogs.push(log);
    }

    if (newLogs.length > 0) {
      await RawPunchlog.insertMany(newLogs);
      console.log(`✅ ${newLogs.length} new punch logs inserted.`);
    } else {
      console.log('⚠️ No new punch logs to insert.');
    }

    // Step 6: Process logs and sync attendance
    const employees = await Employee.find();
    const rawLogs = await RawPunchlog.find({ processed: false });
    const logsByUser = {};

    rawLogs.forEach(log => {
      const key = `${log.UserID}_${log.LogDate.toISOString().split('T')[0]}`;
      if (!logsByUser[key]) logsByUser[key] = [];
      logsByUser[key].push(log);
    });

    for (const key in logsByUser) {
      const logs = logsByUser[key].sort((a, b) =>
        new Date(`1970-01-01T${a.LogTime}Z`) - new Date(`1970-01-01T${b.LogTime}Z`)
      );

      const userId = logs[0].UserID.trim();
      const employee = employees.find(emp => emp.userId.toString() === userId);

      if (!employee) {
        console.log(`⚠️ No employee found for UserID: ${userId}`);
        continue;
      }

      const logDate = new Date(new Date(logs[0].LogDate).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      logDate.setHours(0, 0, 0, 0);

      // Check if it's the current day
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isCurrentDay = logDate.getTime() === today.getTime();

      // Get first punch
      const firstPunch = logs[0];

      // Check for half-day leave to adjust timeIn
      let timeIn = firstPunch.LogTime;
      let status = 'Present';
      let halfDay = null;

      const leave = await Leave.findOne({
        employeeId: employee.employeeId,
        'fullDay.from': logDate,
        'status.ceo': { $in: ['Pending', 'Approved'] },
        'status.hod': { $in: ['Pending', 'Approved'] },
      });

      if (leave && leave.fullDay.fromSession === 'forenoon') {
        const afternoonPunch = logs.find(log => log.LogTime >= '13:30:00');
        if (afternoonPunch) {
          timeIn = afternoonPunch.LogTime;
          status = 'Half Day';
          halfDay = 'First Half';
        } else {
          continue;
        }
      } else if (leave && leave.fullDay.fromSession === 'afternoon') {
        const morningPunch = logs.find(log => log.LogTime <= '13:30:00');
        if (morningPunch) {
          status = 'Half Day';
          halfDay = 'Second Half';
        } else {
          continue;
        }
      }

      // Create or update Attendance record
      const existingAttendance = await Attendance.findOne({
        employeeId: employee.employeeId,
        logDate,
      });

      if (existingAttendance) {
        existingAttendance.timeIn = timeIn;
        existingAttendance.status = status;
        existingAttendance.halfDay = halfDay;
        existingAttendance.ot = 0; // Reset OT for current day
        if (!isCurrentDay) {
          const lastPunch = logs[logs.length - 1];
          existingAttendance.timeOut = lastPunch.LogTime;
          if (firstPunch !== lastPunch && status === 'Present') {
            const [inHours, inMinutes] = timeIn.split(':').map(Number);
            const [outHours, outMinutes] = lastPunch.LogTime.split(':').map(Number);
            const duration = (outHours * 60 + outMinutes) - (inHours * 60 + inMinutes);
            existingAttendance.ot = Math.max(0, duration - 510);
            if (duration < 240) {
              existingAttendance.status = 'Half Day';
              existingAttendance.halfDay = 'First Half';
            }
          }
        }
        await existingAttendance.save();
      } else {
        const attendanceData = {
          employeeId: employee.employeeId,
          userId,
          name: employee.name,
          logDate,
          timeIn,
          timeOut: isCurrentDay ? null : logs[logs.length - 1].LogTime,
          status,
          halfDay,
          ot: 0,
        };

        if (!isCurrentDay && logs.length > 1 && status === 'Present') {
          const [inHours, inMinutes] = timeIn.split(':').map(Number);
          const [outHours, outMinutes] = logs[logs.length - 1].LogTime.split(':').map(Number);
          const duration = (outHours * 60 + outMinutes) - (inHours * 60 + inMinutes);
          attendanceData.ot = Math.max(0, duration - 510);
          if (duration < 240) {
            attendanceData.status = 'Half Day';
            attendanceData.halfDay = 'First Half';
          }
        }

        await Attendance.create(attendanceData);
      }

      // Mark logs as processed
      for (const log of logs) {
        log.processed = true;
        await log.save();
      }
    }

    await RawPunchlog.deleteMany({ processed: true });

    // Step 7: Update sync time
    await SyncMetadata.findOneAndUpdate(
      { name: 'attendanceSync' },
      { lastSyncedAt: toDate }
    );

    console.log('✅ Attendance sync complete and metadata updated.');
  } catch (err) {
    console.error('❌ Attendance sync error:', err.message, err.stack);
  }
};

export { syncAttendance };
