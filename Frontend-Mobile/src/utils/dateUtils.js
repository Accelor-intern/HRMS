// Frontend date utility functions that handle IST timezone consistently
import moment from 'moment-timezone';

// Convert a date to IST timezone
export const toIST = (date) => {
  if (!date) return null;
  
  // Handle different input types
  const momentDate = moment(date);
  if (!momentDate.isValid()) return null;
  
  // Convert to IST timezone
  return momentDate.tz('Asia/Kolkata');
};

// Format date for backend (YYYY-MM-DD)
export const formatForBackend = (date) => {
  const istDate = toIST(date);
  if (!istDate) return '';
  
  // Format as YYYY-MM-DD
  return istDate.format('YYYY-MM-DD');
};

// Format time for backend (HH:mm)
export const formatTimeForBackend = (date) => {
  const istDate = toIST(date);
  if (!istDate) return '';
  
  // Format as HH:mm
  return istDate.format('HH:mm');
};

// Parse date from backend (YYYY-MM-DD)
export const parseDateFromBackend = (dateString) => {
  if (!dateString) return null;
  
  // Parse as IST date
  const date = moment(dateString, 'YYYY-MM-DD');
  if (!date.isValid()) return null;
  
  // Ensure it's in IST timezone
  return date.tz('Asia/Kolkata');
};

// Parse time from backend (HH:mm)
export const parseTimeFromBackend = (timeString) => {
  if (!timeString) return null;
  
  // Parse as IST time
  const time = moment(timeString, 'HH:mm');
  if (!time.isValid()) return null;
  
  // Ensure it's in IST timezone
  return time.tz('Asia/Kolkata');
};

// Format date for display (e.g., '2025-07-04')
export const formatForDisplay = (date) => {
  const istDate = toIST(date);
  if (!istDate) return '';
  
  // Format as YYYY-MM-DD
  return istDate.format('YYYY-MM-DD');
};

// Format time for display (e.g., '11:14')
export const formatTimeForDisplay = (date) => {
  const istDate = toIST(date);
  if (!istDate) return '';
  
  // Format as HH:mm
  return istDate.format('HH:mm');
};

// Validate date input
export const validateDate = (date) => {
  const istDate = toIST(date);
  return istDate && istDate.isValid();
};

// Validate time input
export const validateTime = (time) => {
  const istTime = toIST(time);
  return istTime && istTime.isValid();
};

// Get current IST date
export const getCurrentISTDate = () => {
  return moment().tz('Asia/Kolkata');
};

// Get current IST time
export const getCurrentISTTime = () => {
  return moment().tz('Asia/Kolkata');
};

// Compare two dates in IST
export const compareDates = (date1, date2) => {
  const istDate1 = toIST(date1);
  const istDate2 = toIST(date2);
  
  if (!istDate1 || !istDate2) return null;
  
  return istDate1.diff(istDate2, 'days');
};

// Get start of day in IST
export const startOfDay = (date) => {
  const istDate = toIST(date);
  if (!istDate) return null;
  
  return istDate.startOf('day');
};

// Get end of day in IST
export const endOfDay = (date) => {
  const istDate = toIST(date);
  if (!istDate) return null;
  
  return istDate.endOf('day');
};

// Format date range for display
export const formatDateRange = (startDate, endDate) => {
  const start = toIST(startDate);
  const end = toIST(endDate);
  
  if (!start || !end) return '';
  
  return `${start.format('YYYY-MM-DD')} to ${end.format('YYYY-MM-DD')}`;
};
