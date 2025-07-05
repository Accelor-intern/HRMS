import { toIST, formatForDisplay, startOfDay } from './dateUtils.js';

function buildAttendanceData(attendanceRecords, attendanceView, fromDate, toDate, today = toIST(new Date()).toDate()) {
  // Convert input dates to IST Moment.js objects
  const from = toIST(fromDate);
  const to = toIST(toDate);
  const attendanceData = [];

  if (attendanceView === 'daily') {
    // For daily view, show range of days
    const totalDays = Math.floor(to.diff(from, 'days')) + 1;

    for (let i = 0; i < totalDays; i++) {
      const currentDate = toIST(from).add(i, 'days');
      const currentDateStart = startOfDay(currentDate).toDate();
      const currentDateEnd = toIST(currentDate).endOf('day').toDate();

      // Skip Sundays in IST
      if (currentDate.day() === 0) continue;

      const records = attendanceRecords.filter(a => {
        const logDate = a.logDate; // UTC Date from database
        return logDate >= currentDateStart && logDate < currentDateEnd;
      });

      // Determine status
      const fullDay = records.some(a => a.status === 'Present');
      const halfDay = records.some(a => a.status === 'Half Day');
      const absent = records.length === 0;
      const status = fullDay ? 'present' : halfDay ? 'half' : absent ? 'absent' : 'leave';
      const count = records.length;

      // Format date as DD MMM in IST
      const formattedDate = formatForDisplay(currentDate, 'DD MMM');

      attendanceData.push({ name: formattedDate, status, count });
    }
  } else if (attendanceView === 'monthly') {
    // For monthly view, show each day of the current month up to today
    const currentDate = toIST(today);
    const startOfMonth = toIST(currentDate).startOf('month');
    
    // Adjust for provided date range
    const adjustedStartDate = from.isAfter(startOfMonth) ? from : startOfMonth;
    const adjustedEndDate = to.isBefore(currentDate) ? to : currentDate;

    const totalDays = Math.ceil(adjustedEndDate.diff(adjustedStartDate, 'days'));

    for (let i = 0; i <= totalDays; i++) {
      const date = toIST(adjustedStartDate).add(i, 'days');
      
      // Skip Sundays in IST
      if (date.day() === 0) continue;

      const dateStart = startOfDay(date).toDate();
      const dateEnd = toIST(date).endOf('day').toDate();

      // Find records for this date
      const records = attendanceRecords.filter(a => {
        const logDate = a.logDate; // UTC Date
        return logDate >= dateStart && logDate < dateEnd;
      });

      // Determine status
      const fullDay = records.some(a => a.status === 'Present');
      const halfDay = records.some(a => a.status === 'Half Day');
      const absent = records.length === 0;
      const status = fullDay ? 'present' : halfDay ? 'half' : absent ? 'absent' : 'leave';
      const count = fullDay ? 1 : halfDay ? 0.5 : 0;

      // Format as DD in IST
      const formattedDate = date.date().toString();

      attendanceData.push({ 
        name: formattedDate, 
        status, 
        count,
      });
    }
  } else if (attendanceView === 'yearly') {
    // For yearly view, show each day of the year up to today for current year
    const currentYear = toIST(today).year();
    const isCurrentYear = currentYear === toIST(new Date()).year();

    // Set date range
    const startDate = toIST(new Date(currentYear, 0, 1)); // Jan 1
    const endDate = isCurrentYear ? toIST(new Date()) : toIST(new Date(currentYear, 11, 31));

    // Adjust for provided date range
    const adjustedStartDate = from.isAfter(startDate) ? from : startDate;
    const adjustedEndDate = to.isBefore(endDate) ? to : endDate;

    const totalDays = Math.ceil(adjustedEndDate.diff(adjustedStartDate, 'days'));

    for (let i = 0; i <= totalDays; i++) {
      const currentDate = toIST(adjustedStartDate).add(i, 'days');

      // Skip Sundays in IST
      if (currentDate.day() === 0) continue;

      const dateStart = startOfDay(currentDate).toDate();
      const dateEnd = toIST(currentDate).endOf('day').toDate();

      // Find records for this date
      const records = attendanceRecords.filter(a => {
        const logDate = a.logDate; // UTC Date
        return logDate >= dateStart && logDate < dateEnd;
      });

      // Determine status
      const fullDay = records.some(a => a.status === 'Present');
      const halfDay = records.some(a => a.status === 'Half Day');
      const absent = records.length === 0;
      const status = fullDay ? 'present' : halfDay ? 'half' : absent ? 'absent' : 'leave';
      const count = fullDay ? 1 : halfDay ? 0.5 : 0;

      // Format as DD MMM in IST
      const formattedDate = formatForDisplay(currentDate, 'DD MMM');

      attendanceData.push({
        name: formattedDate,
        status,
        count,
      });
    }
  }

  return attendanceData;
}

export { buildAttendanceData };