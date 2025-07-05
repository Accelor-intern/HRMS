import { LEAVE_TYPES } from './constants';

const validateBasicFields = (form) => {
  console.log('called validateBasicFields');
  console.log('form', form);
  if (!form.leaveType?.trim()) {
    return 'Leave Type is required';
  }
  if (!form.reason?.trim()) {
    return 'Reason is required';
  }
  if (!form.chargeTo) {
    return 'Please select an employee to charge';
  }
  if (!form.emergencyContact) {
    return 'Emergency Contact is required';
  }
  if (!form.dates.fromDuration) {
    return 'Leave Duration is required';
  }
  console.log('here basic');
  return null;
};

const validateDates = (form) => {
  // Check if from date is provided
  if (!form.dates.from) {
    return 'From Date is required';
  }

  // For half-day leaves
  if (form.dates.fromDuration === 'half') {
    if (!form.dates.fromSession) {
      return 'Session is required for half-day leave';
    }
    // Allow to date for multi-day half-day leaves
    if (form.dates.to && new Date(form.dates.to) < new Date(form.dates.from)) {
      return 'To Date cannot be earlier than From Date';
    }
  }
  
  // For full-day leaves
  if (form.dates.fromDuration === 'full') {
    if (form.dates.to && new Date(form.dates.to) < new Date(form.dates.from)) {
      return 'To Date cannot be earlier than From Date';
    }
    
    // If toDuration is half, validate toSession
    if (form.dates.toDuration === 'half' && !form.dates.toSession) {
      return 'Session is required for half-day To Date';
    }
  }
  console.log('here dates');
  return null;
};

const validateLeaveType = (form, user, leaveDays, compensatoryEntries, canApplyEmergencyLeave) => {
  const today = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(today.getTime() + (today.getTimezoneOffset() * 60 * 1000) + istOffset);
  istTime.setUTCHours(0, 0, 0, 0);

  const fromDate = new Date(form.dates.from);
  fromDate.setHours(0, 0, 0, 0);

  if (form.leaveType !== 'Medical' && fromDate < istTime) {
    return `${form.leaveType} leave cannot be applied for past dates`;
  }

  switch (form.leaveType) {
    case 'Casual':
      if (user?.employeeType === 'Confirmed' && form.dates.fromDuration === 'full' && leaveDays > 3) {
        return 'Confirmed employees can take up to 3 consecutive Casual leaves';
      }
      if (user?.employeeType === 'Probation' && leaveDays > 1) {
        return 'Probation employees can take only 1 day of Casual leave at a time';
      }
      break;

    case 'Medical':
      if (user?.employeeType !== 'Confirmed') {
        return 'Medical leave is only available for Confirmed employees';
      }
      if (form.dates.fromDuration === 'half') {
        return 'Medical leave cannot be applied as a half-day leave';
      }
      if (!form.medicalCertificate || !form.medicalCertificate.uri) {
        return 'Medical certificate is required for medical leave';
      }
      if (leaveDays !== 3 && leaveDays !== 4) {
        return 'Medical leave must be exactly 3 or 4 days';
      }
      break;

    case 'Maternity':
      if (user?.gender?.toLowerCase() !== 'female') {
        return 'Maternity leave is only available for female employees';
      }
      if (user?.employeeType !== 'Confirmed') {
        return 'Maternity leave is only available for Confirmed employees';
      }
      if (form.dates.fromDuration === 'half') {
        return 'Maternity leave cannot be applied as a half-day leave';
      }
      if (leaveDays !== 90) {
        return 'Maternity leave must be exactly 90 days';
      }
      break;

    case 'Paternity':
      if (user?.gender?.toLowerCase() !== 'male') {
        return 'Paternity leave is only available for male employees';
      }
      if (user?.employeeType !== 'Confirmed') {
        return 'Paternity leave is only available for Confirmed employees';
      }
      if (form.dates.fromDuration === 'half') {
        return 'Paternity leave cannot be applied as a half-day leave';
      }
      if (leaveDays !== 7) {
        return 'Paternity leave must be exactly 7 days';
      }
      break;

    case 'Emergency':
      if (!canApplyEmergencyLeave) {
        return 'You are not authorized to apply for Emergency Leave';
      }
      // Allow both half-day and full-day emergency leaves
      if (form.dates.fromDuration === 'half') {
        if (leaveDays > 0.5) {
          return 'Emergency half-day leave cannot exceed 0.5 days';
        }
      } else {
        if (leaveDays > 1) {
          return 'Emergency full-day leave cannot exceed 1 day';
        }
      }
      
      // Check if the leave is for today
      const leaveDate = new Date(form.dates.from);
      leaveDate.setHours(0, 0, 0, 0);
      if (leaveDate.getTime() !== istTime.getTime()) {
        return 'Emergency leave must be for the current date only';
      }
      break;

    case 'Compensatory':
      if (!form.compensatoryEntry) {
        return 'Please select a compensatory leave entry';
      }
      const entry = compensatoryEntries.find(e => e._id === form.compensatoryEntry);
      if (!entry || entry.status !== 'Available') {
        return 'Selected compensatory leave is not available';
      }
      const hoursNeeded = form.dates.fromDuration === 'half' ? 4 : 8;
      if (entry.hours !== hoursNeeded) {
        return `Selected entry (${entry.hours} hours) does not match leave duration (${form.dates.fromDuration === 'half' ? 'Half Day (4 hours)' : 'Full Day (8 hours)'})`;
      }
      break;

    case 'Restricted Holidays':
      if (!form.restrictedHoliday) {
        return 'Please select a restricted holiday';
      }
      if (form.dates.fromDuration !== 'full') {
        return 'Restricted holidays must be full day';
      }
      break;

    case 'Leave Without Pay(LWP)':
      if (leaveDays > 30) {
        return 'LWP cannot exceed 30 days at a time';
      }
      if (user?.employeeType === 'Probation' && leaveDays > 7) {
        return 'Probation employees can take maximum 7 days of LWP at a time';
      }
      break;
  }

  if (form.leaveType !== 'Emergency' && form.leaveType !== 'Medical') {
    const noticeDays = 2;
    const noticeDate = new Date(istTime);
    noticeDate.setDate(istTime.getDate() + noticeDays);
    while (noticeDate.getDay() === 0 || noticeDate.getDay() === 6) {
      noticeDate.setDate(noticeDate.getDate() + 1);
    }
    if (fromDate < noticeDate) {
      return `${form.leaveType} requires minimum ${noticeDays} working days notice`;
    }
  }
  console.log('here leave type');
  return null;
};

export const validateLeaveForm = (form, user, leaveDays, compensatoryEntries, canApplyEmergencyLeave) => {
  console.log('called validateLeaveForm');
  const basicError = validateBasicFields(form);
  if (basicError) {
    return basicError;
  }

  const dateError = validateDates(form);
  if (dateError) {
    return dateError;
  }

  const leaveTypeError = validateLeaveType(form, user, leaveDays, compensatoryEntries, canApplyEmergencyLeave);
  if (leaveTypeError) {
    return leaveTypeError;
  }

  return null;
};