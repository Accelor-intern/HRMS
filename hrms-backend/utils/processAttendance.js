import mongoose from 'mongoose';
import Attendance from '../models/Attendance.js';
import RawPunchlog from '../models/RawPunchlog.js';
import Leave from '../models/Leave.js';
import Employee from '../models/Employee.js';

async function processLateArrivalsAndAbsents() {
  try {
    // Current date (for processing current day's absents)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Previous date (for updating timeOut)
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    // Step 1: Create Absent records for today
    const employees = await Employee.find();
    const todayPunches = await RawPunchlog.find({ LogDate: today });
    const punchedUserIDs = [...new Set(todayPunches.map(p => p.UserID))];

    for (const employee of employees) {
      const userId = employee.userId;
      if (punchedUserIDs.includes(userId)) continue; // Skip employees with punches

      // Check for approved leaves
      const leave = await Leave.findOne({
        employeeId: employee.employeeId,
        $or: [
          { 'fullDay.from': { $lte: today }, 'fullDay.to': { $gte: today } },
          { 'halfDay.date': today },
        ],
        'status.ceo': 'Approved',
      });

      // Create Absent record (even for leaves, marked as Absent with (L) in Excel)
      const existingAttendance = await Attendance.findOne({
        employeeId: employee.employeeId,
        logDate: today,
      });

      if (!existingAttendance) {
        await Attendance.create({
          employeeId: employee.employeeId,
          userId,
          name: employee.name,
          logDate: today,
          timeIn: null,
          timeOut: null,
          status: 'Absent',
          halfDay: null,
          ot: 0,
        });
      }
    }

    // Step 2: Update timeOut for yesterday's records
    const yesterdayPunches = await RawPunchlog.find({ LogDate: yesterday });
    const logsByUser = {};

    yesterdayPunches.forEach(log => {
      const key = log.UserID;
      if (!logsByUser[key]) logsByUser[key] = [];
      logsByUser[key].push(log);
    });

    for (const userId in logsByUser) {
      const logs = logsByUser[userId].sort((a, b) =>
        new Date(`1970-01-01T${a.LogTime}Z`) - new Date(`1970-01-01T${b.LogTime}Z`)
      );

      const employee = await Employee.findOne({ userId });
      if (!employee) {
        console.warn(`⚠️ No employee found for UserID: ${userId}`);
        continue;
      }

      const attendance = await Attendance.findOne({
        employeeId: employee.employeeId,
        logDate: yesterday,
      });

      if (attendance && !attendance.timeOut) {
        const lastPunch = logs[logs.length - 1];
        const firstPunch = logs[0];

        // Update status based on duration
        let status = attendance.status;
        let halfDay = null;
        if (firstPunch !== lastPunch) {
          const [inHours, inMinutes] = firstPunch.LogTime.split(':').map(Number);
          const [outHours, outMinutes] = lastPunch.LogTime.split(':').map(Number);
          const duration = (outHours * 60 + outMinutes) - (inHours * 60 + inMinutes);
          if (duration < 240) {
            status = 'Half Day';
            halfDay = 'First Half';
          } else {
            status = 'Present';
          }
        } else {
          status = 'Half Day';
          halfDay = 'First Half';
        }

        // Calculate OT
        let ot = 0;
        if (firstPunch !== lastPunch) {
          const [inHours, inMinutes] = firstPunch.LogTime.split(':').map(Number);
          const [outHours, outMinutes] = lastPunch.LogTime.split(':').map(Number);
          const duration = (outHours * 60 + outMinutes) - (inHours * 60 + inMinutes);

          // Check if yesterday was a Sunday
          const isSunday = yesterday.getDay() === 0;

          if (isSunday) {
            // For Sundays, OT is the entire duration
            ot = duration;
            status = duration >= 240 ? 'Present' : 'Half Day';
            halfDay = duration >= 240 ? null : 'First Half';
          } else {
            // For non-Sundays, OT is duration beyond 8.5 hours (510 minutes)
            ot = Math.max(0, duration - 510); // 510 minutes = 8 hours 30 minutes
            if (duration < 240) {
              status = 'Half Day';
              halfDay = 'First Half';
            } else {
              status = 'Present';
            }
          }
        } else {
          status = 'Half Day';
          halfDay = 'First Half';
          ot = 0;
        }

        // Check for half-day leave to adjust status
        const leave = await Leave.findOne({
          employeeId: employee.employeeId,
          'halfDay.date': yesterday,
          'status.ceo': 'Approved',
        });

        if (leave) {
          if (leave.halfDay.session === 'forenoon') {
            // Expect punch in afternoon
            const afternoonPunch = logs.find(log => log.LogTime >= '13:30:00');
            if (afternoonPunch) {
              attendance.timeIn = afternoonPunch.LogTime;
              status = 'Half Day';
              halfDay = 'Second Half';
            } else {
              status = 'Absent';
              halfDay = null;
            }
          } else if (leave.halfDay.session === 'afternoon') {
            // Expect punch in morning
            const morningPunch = logs.find(log => log.LogTime <= '13:30:00');
            if (morningPunch && firstPunch !== lastPunch) {
              status = 'Half Day';
              halfDay = 'First Half';
            } else {
              status = 'Absent';
              halfDay = null;
            }
          }
        }

        attendance.timeOut = lastPunch.LogTime;
        attendance.status = status;
        attendance.halfDay = halfDay;
        attendance.ot = ot;
        await attendance.save();
      }
    }

    // Step 3: Process late arrivals for current month
    const startOfMonth = new Date();
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
          LogDate: today,
          LogTime: { $gte: '09:00:00', $lte: '09:10:00' },
        }).sort({ LogTime: 1 });

        if (todayPunch && todayPunch.LogTime) {
          const employee = await Employee.findOne({ userId });
          if (!employee) {
            console.warn(`⚠️ No employee found for UserID: ${userId}`);
            continue;
          }

          const existingAttendance = await Attendance.findOne({
            employeeId: employee.employeeId,
            logDate: today,
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
              logDate: today,
              timeIn: todayPunch.LogTime,
              timeOut: null,
              status: 'Half Day',
              halfDay: 'First Half',
              ot: 0,
            });
          }

          const outPunch = await RawPunchlog.findOne({
            UserID: userId,
            LogDate: today,
            LogTime: { $gte: '13:30:00' },
          }).sort({ LogTime: -1 });

          if (!outPunch) {
            const attendance = await Attendance.findOne({
              employeeId: employee.employeeId,
              logDate: today,
            });
            if (attendance) {
              attendance.status = 'Absent';
              attendance.halfDay = null;
              attendance.ot = 0;
              await attendance.save();
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Error processing late arrivals and absents:', err);
  }
}

export { processLateArrivalsAndAbsents };