import React from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import '../App.css';

function CalendarComponent({ selectedDates = [], onChange }) {
  // Define holidays
  const isHoliday = (date) => {
    const holidayList = [
      { month: 0, day: 26 }, // Republic Day
      { month: 2, day: 14 }, // Holi
      { month: 7, day: 15 }, // Independence Day
      { month: 9, day: 2 }, // Gandhi Jayanti
      { month: 9, day: 21 }, // Diwali
      { month: 9, day: 22 }, // Vishwakarma Day
      { month: 10, day: 5 }, // Guru Nanak Jayanti
    ];

    return (
      holidayList.some(h => date.getDate() === h.day && date.getMonth() === h.month) ||
      date.getDay() === 0
    );
  };

  // Define restricted holidays
  const restrictedHolidayList = [
    { label: 'Raksha Bandhan', date: new Date(2025, 7, 9) },
    { label: 'Janmashtami', date: new Date(2025, 7, 16) },
    { label: 'Karva Chauth', date: new Date(2025, 9, 9) },
    { label: 'Christmas', date: new Date(2025, 11, 25) },
  ];

  const isRestrictedHoliday = (date) => {
    return restrictedHolidayList.some(
      (rh) => rh.date.toDateString() === date.toDateString()
    );
  };

  // Tile styling for calendar
  const tileClassName = ({ date, view }) => {
    if (view === 'month') {
      const classes = [];
      if (isHoliday(date)) classes.push('bg-red-200');
      if (isRestrictedHoliday(date)) classes.push('restricted-holiday');
      if (date.getDay() === 0) classes.push('sun');
      if (selectedDates.some(d => d.toDateString() === date.toDateString())) {
        classes.push('bg-blue-200');
      }
      return classes.join(' ');
    }
    return '';
  };

  return (
    <div className="w-full bg-gray-50 p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4 text-green-700">Calendar</h3>
      <Calendar
        value={selectedDates}
        onChange={onChange}
        tileClassName={tileClassName}
        minDate={new Date()}
      />
      <div className="mt-4 space-y-1 text-sm text-gray-700">
        <p><span className="inline-block w-4 h-4 bg-red-200 border border-red-400 mr-2"></span> Yearly Holiday (YH)</p>
        <p><span className="inline-block w-4 h-4 bg-purple-200 border border-purple-400 mr-2"></span> Restricted Holiday (RH)</p>
      </div>
    </div>
  );
}

export default CalendarComponent;