import moment from 'moment-timezone';

// Constants
const IST_TIMEZONE = 'Asia/Kolkata';
const DATE_FORMATS = {
  DISPLAY: 'DD-MM-YYYY HH:mm',
  DATABASE: 'YYYY-MM-DD HH:mm:ss', // Kept for reference, but not used
  ISO: 'YYYY-MM-DDTHH:mm:ss.SSS[Z]'
};

/**
 * Convert any date to IST moment object
 * @param {Date|string|number} date - Date to convert
 * @returns {moment.Moment}
 */
const toIST = (date) => moment(date).tz(IST_TIMEZONE);

/**
 * Convert IST date to UTC
 * @param {Date|string|number} date - IST date to convert
 * @returns {moment.Moment}
 */
const toUTC = (date) => moment(date).tz(IST_TIMEZONE).utc();

/**
 * Get start of day in IST
 * @param {Date|string|number} date - Date to get start of day for
 * @returns {moment.Moment}
 */
const startOfDay = (date) => toIST(date).startOf('day');

/**
 * Get end of day in IST
 * @param {Date|string|number} date - Date to get end of day for
 * @returns {moment.Moment}
 */
const endOfDay = (date) => toIST(date).endOf('day');

/**
 * Convert date to UTC Date object for database storage
 * @param {Date|string|number} date - Date to convert
 * @returns {Date} UTC Date object
 */
const formatForDB = (date) => toUTC(date).toDate();

/**
 * Format date for display (IST)
 * @param {Date|string|number} date - Date to format
 * @param {string} format - Optional format string
 * @returns {string} Formatted date string
 */
const formatForDisplay = (date, format = DATE_FORMATS.DISPLAY) => {
  return toIST(date).format(format);
};

/**
 * Get current time in IST
 * @returns {moment.Moment}
 */
const now = () => toIST(new Date());

/**
 * Parse date string to IST moment object
 * @param {string} dateString - Date string to parse
 * @returns {moment.Moment}
 */
const parseDate = (dateString) => {
  try {
    const parsed = moment(dateString);
    if (!parsed.isValid()) {
      throw new Error('Invalid date format');
    }
    return parsed.tz(IST_TIMEZONE);
  } catch (error) {
    throw new Error('Failed to parse date: ' + error.message);
  }
};

/**
 * Validate if a date is in valid IST format
 * @param {Date|string|number} date - Date to validate
 * @returns {boolean}
 */
const validateDate = (date) => {
  const m = toIST(date);
  return m.isValid() && m.isSame(m.tz(IST_TIMEZONE));
};

/**
 * Convert UTC date string to IST
 * @param {string} utcDateString - UTC date string
 * @returns {moment.Moment}
 */
const fromUTC = (utcDateString) => {
  try {
    const parsed = moment.utc(utcDateString);
    if (!parsed.isValid()) {
      throw new Error('Invalid UTC date format');
    }
    return parsed.tz(IST_TIMEZONE);
  } catch (error) {
    throw new Error('Failed to convert from UTC: ' + error.message);
  }
};

/**
 * Check if a date is today in IST
 * @param {Date|string|number} date - Date to check
 * @returns {boolean}
 */
const isToday = (date) => {
  const today = now().startOf('day');
  const checkDate = toIST(date).startOf('day');
  return today.isSame(checkDate);
};

/**
 * Get date difference in days
 * @param {Date|string|number} date1 - First date
 * @param {Date|string|number} date2 - Second date
 * @returns {number} Number of days between dates
 */
const getDaysDifference = (date1, date2) => {
  const d1 = toIST(date1).startOf('day');
  const d2 = toIST(date2).startOf('day');
  return d1.diff(d2, 'days');
};

/**
 * Get date difference in hours
 * @param {Date|string|number} date1 - First date
 * @param {Date|string|number} date2 - Second date
 * @returns {number} Number of hours between dates
 */
const getHoursDifference = (date1, date2) => {
  const d1 = toIST(date1);
  const d2 = toIST(date2);
  return d1.diff(d2, 'hours');
};

export {
  IST_TIMEZONE,
  DATE_FORMATS,
  toIST,
  toUTC,
  fromUTC,
  startOfDay,
  endOfDay,
  formatForDB,
  formatForDisplay,
  now,
  parseDate,
  validateDate,
  isToday,
  getDaysDifference,
  getHoursDifference
}