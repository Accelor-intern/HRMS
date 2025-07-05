import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import Leave from './Leave.js';
import Audit from './Audit.js'; // Import Audit model for logging

const employeeSchema = new mongoose.Schema({
  // Basic Info
  employeeId: { type: String, unique: true },
  userId: { type: String, unique: true },
  email: { type: String, unique: true },
  password: {
    type: String,
    minlength: [6, 'Password must be at least 6 characters long']
  },
  name: String,
  dateOfBirth: Date,
  fatherName: String,
  motherName: String,
  mobileNumber: { type: String, match: /^\d{10}$/ },
  permanentAddress: String,
  currentAddress: String,
  aadharNumber: { type: String, match: /^\d{12}$/ },
  bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
  gender: { type: String, enum: ['Male', 'Female', 'Other'] },
  maritalStatus: { type: String, enum: ['Single', 'Married'] },
  spouseName: { 
    type: String,
    required: function() { return this.maritalStatus === 'Married'; } 
  },
  emergencyContactName: String,
  emergencyContactNumber: String,
  dateOfJoining: Date,
  status: { type: String, enum: ['Working', 'Resigned'] },
  dateOfResigning: { 
    type: Date,
    required: function() { return this.status === 'Resigned'; } 
  },
  probationPeriod: { 
    type: Number,
    required: function() { return this.status === 'Working' && this.employeeType === 'Probation'; } 
  },
  confirmationDate: { 
    type: Date,
    required: function() { return this.status === 'Working' && this.employeeType === 'Probation'; } 
  },
  serviceAgreement: {
    type: Number,
    required: function() { return this.status === 'Working' && this.employeeType === 'OJT'; }
  },
  referredBy: String,

  // Employment Details
  loginType: { type: String, enum: ['Employee', 'HOD', 'Admin', 'CEO'] },
  designation: { type: String, required: true },
  location: { type: String },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  reportingManager: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  employeeType: { 
    type: String, 
    enum: ['Intern', 'Confirmed', 'Contractual', 'Probation', 'Apprentice', 'OJT'],
    required: function() { return this.status === 'Working'; }
  },

  // Statutory Details
  panNumber: { type: String, match: /^[A-Z0-9]{10}$/ },
  pfNumber: { type: String, match: /^\d{18}$/, sparse: true },
  uanNumber: { type: String, match: /^\d{12}$/, sparse: true },
  esiNumber: { type: String, match: /^\d{12}$/, sparse: true },

  // Documents
  profilePicture: { type: mongoose.Schema.Types.ObjectId, ref: 'Uploads.files' },
  documents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Uploads.files' }],

  // Bank Details
  bankDetails: {
    paymentType: { 
      type: String, 
      enum: ['Cash', 'Bank Transfer'] 
    },
    bankName: { 
      type: String,
      required: function() { return this.paymentType === 'Bank Transfer'; } 
    },
    bankBranch: { 
      type: String,
      required: function() { return this.paymentType === 'Bank Transfer'; } 
    },
    accountNumber: { 
      type: String,
      required: function() { return this.paymentType === 'Bank Transfer'; } 
    },
    ifscCode: { 
      type: String,
      required: function() { return this.paymentType === 'Bank Transfer'; } 
    },
  },

  // Payment Details
  ctc: { type: Number, required: true },
  basic: { type: Number, required: true },
  inHand: { type: Number, required: true },

  //Locks
  locked: { type: Boolean, default: true },
  basicInfoLocked: { type: Boolean, default: true },
  positionLocked: { type: Boolean, default: true },
  statutoryLocked: { type: Boolean, default: true },
  documentsLocked: { type: Boolean, default: true },
  paymentLocked: { type: Boolean, default: true },

  //Leave Counts
  paidLeaves: { type: Number, default: 0 }, // Tracks Casual leaves     only
  medicalLeaves: { type: Number, default: 0 }, // Tracks Medical leaves (7 per year for Confirmed only)
  maternityClaims: { type: Number, default: 0 }, // Tracks Maternity leave claims (max 2 for Confirmed only)
  paternityClaims: { type: Number, default: 0 }, // Tracks Paternity leave claims (max 2 for Confirmed only)
  restrictedHolidays: { type: Number, default: 1 }, // Tracks Restricted Holiday (1 per year)
  unpaidLeavesTaken: { type: Number, default: 0 },
  compensatoryLeaves: { type: Number, default: 0 }, // Tracks total compensatory leave hours
  compensatoryAvailable: [{
    date: { type: Date, required: true },
    hours: { type: Number, enum: [4, 8], required: true },
    status: { type: String, enum: ['Available', 'Claimed'], default: 'Available' }
  }],
  lastCompensatoryReset: { type: Date }, // Tracks last reset for expiration
  lastLeaveReset: { type: Date }, // For Casual leaves
  lastMedicalReset: { type: Date }, // For Medical leaves
  lastRestrictedHolidayReset: { type: Date }, // For Restricted Holiday
  canApplyEmergencyLeave: { type: Boolean, default: false }, // Permission for Emergency Leave
  lastEmergencyLeaveToggle: { type: Date }, // Tracks when canApplyEmergencyLeave was last set to true

  //Attendance
  lastPunchMissedSubmission: { type: Date }, // Tracks last Punch Missed Form submission
  attendanceHistory: [{ // New field for attendance history
    date: { type: Date, required: true },
    status: { type: String, enum: ['Present', 'Absent', 'On Leave'], required: true },
    leaveType: { type: String, default: null },
    leaveId: { type: mongoose.Schema.Types.ObjectId, ref: 'Leave', default: null }
  }]
}, { timestamps: true });

// Middleware to handle password hashing
employeeSchema.pre('save', async function(next) {
  if (this.isModified('password') && this.password) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

// Middleware to handle leave allocation, reset, over and above leave adjustment, Probation-to-Confirmed transition, and Emergency Leave auto-reset
employeeSchema.pre('save', async function(next) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  // Normalize today's date to start of day for comparison
  today.setHours(0, 0, 0, 0);

  // Handle Emergency Leave auto-reset
  if (this.canApplyEmergencyLeave && this.lastEmergencyLeaveToggle) {
    const toggleDate = new Date(this.lastEmergencyLeaveToggle);
    toggleDate.setHours(0, 0, 0, 0);
    if (today > toggleDate) {
      this.canApplyEmergencyLeave = false;
      this.lastEmergencyLeaveToggle = null;
      try {
        await Audit.create({
          action: 'auto_reset_emergency_leave',
          user: 'system',
          details: `Auto-reset Emergency Leave permission for employee ${this.employeeId} to false`,
        });
      } catch (auditErr) {
        console.warn('Audit logging for Emergency Leave auto-reset failed:', auditErr.message);
      }
    }
  }

  // Handle Probation to Confirmed transition
  if (!this.isNew && this.employeeType === 'Probation' && this.confirmationDate) {
    const confirmationDate = new Date(this.confirmationDate);
    confirmationDate.setHours(0, 0, 0, 0); // Normalize to start of day
    today.setHours(0, 0, 0, 0); // Normalize to start of day
    if (today >= confirmationDate) {
      this.employeeType = 'Confirmed';
      this.probationPeriod = null;
      this.confirmationDate = null;

      // Update Paid Leaves
      const joinDate = new Date(this.dateOfJoining);
      const joinMonth = joinDate.getMonth();
      const joinDay = joinDate.getDate();
      const leavesForYear = joinMonth === 11 ? 0 : 12 - (joinMonth + (joinDay > 15 ? 1 : 0)); // Prorated based on joining month
      this.paidLeaves = Math.min(this.paidLeaves + leavesForYear, 12); // Add prorated leaves, cap at 12
      this.lastLeaveReset = new Date(currentYear, currentMonth, 1);

      // Allocate Medical Leaves (prorated)
      const remainingMonths = 12 - currentMonth;
      this.medicalLeaves = Math.floor((remainingMonths / 12) * 7); // Prorate based on remaining months
      this.lastMedicalReset = new Date(currentYear, 0, 1);

      // Enable Maternity/Paternity Claims
      this.maternityClaims = 0;
      this.paternityClaims = 0;

      // Log the transition in Audit
      try {
        await Audit.create({
          action: 'auto_confirm_employee',
          user: 'system',
          details: `Employee ${this.employeeId} transitioned from Probation to Confirmed`,
        });
      } catch (auditErr) {
        console.warn('Audit logging for Probation-to-Confirmed transition failed:', auditErr.message);
      }
    }
  }

  // Initialize reset dates and leaves for new employees
  if (this.isNew) {
    const joinDate = new Date(this.dateOfJoining);
    const joinDay = joinDate.getDate();
    const joinMonth = joinDate.getMonth();
    const joinYear = joinDate.getFullYear();

    // Paid Leaves
    if (this.employeeType === 'Confirmed') {
      // Confirmed employees get 12 - joinMonth leaves for the year, starting from next month if joined after 15th
      const leavesForYear = joinMonth === 11 ? 0 : 12 - (joinMonth + 1); // Exclude joining month
      this.paidLeaves = joinDay > 15 ? 0 : 1; // No leave for joining month if after 15th, else 1
      this.lastLeaveReset = new Date(joinYear, joinDay > 15 ? joinMonth + 1 : joinMonth, 1);
    } else if (['Intern', 'Contractual', 'Probation', 'Apprentice', 'OJT'].includes(this.employeeType)) {
      // Non-Confirmed employees get 1 leave per month, starting next month if joined after 15th
      this.paidLeaves = joinDay > 15 ? 0 : 1; // No leave for joining month if after 15th
      this.lastLeaveReset = new Date(joinYear, joinDay > 15 ? joinMonth + 1 : joinMonth, 1);
    }

    // Medical Leaves: Only for Confirmed employees
    if (this.employeeType === 'Confirmed') {
      this.medicalLeaves = 7;
      this.lastMedicalReset = new Date(joinYear, 0, 1);
    } else {
      this.medicalLeaves = 0; // Non-Confirmed employees get no medical leaves
    }

    // Maternity/Paternity: Only for Confirmed employees
    if (this.employeeType === 'Confirmed') {
      this.maternityClaims = 0;
      this.paternityClaims = 0;
    } else {
      this.maternityClaims = 0;
      this.paternityClaims = 0; // Non-Confirmed employees cannot claim
    }

    // Restricted Holidays
    this.restrictedHolidays = 1;
    this.lastRestrictedHolidayReset = new Date(joinYear, 0, 1);

    // Compensatory Leaves
    this.compensatoryLeaves = 0;
    this.lastCompensatoryReset = new Date(joinYear, joinMonth, 1);

    // Unpaid Leaves
    this.unpaidLeavesTaken = 0;
  }

  // Handle compensatory leave expiration (6 months)
  const lastCompReset = this.lastCompensatoryReset ? new Date(this.lastCompensatoryReset) : null;
  if (lastCompReset) {
    const sixMonthsLater = new Date(lastCompReset);
    sixMonthsLater.setMonth(lastCompReset.getMonth() + 6);
    if (today >= sixMonthsLater) {
      this.compensatoryLeaves = 0; // Reset compensatory leaves after 6 months
      this.lastCompensatoryReset = new Date(currentYear, currentMonth, 1);
    }
  }

  // Handle Paid Leave monthly reset (no yearly carry forward)
  const lastLeaveReset = this.lastLeaveReset ? new Date(this.lastLeaveReset) : null;
  if (lastLeaveReset) {
    const lastResetYear = lastLeaveReset.getFullYear();
    const lastResetMonth = lastLeaveReset.getMonth();

    // Reset paid leaves at the start of a new year
    if (lastResetYear < currentYear) {
      if (this.employeeType === 'Confirmed') {
        this.paidLeaves = 12; // Reset to 12 for Confirmed employees
      } else {
        this.paidLeaves = 1; // Reset to 1 for non-Confirmed employees (January leave)
      }
      this.lastLeaveReset = new Date(currentYear, 0, 1);
    }

    // Add 1 paid leave for the new month within the same year
    if (lastResetYear === currentYear && lastResetMonth < currentMonth) {
      this.paidLeaves = Math.min(this.paidLeaves + 1, 12); // Cap at 12 for the year
      this.lastLeaveReset = new Date(currentYear, currentMonth, 1);
    }
  }

  // Handle Medical Leave reset (Confirmed employees only)
  if (this.employeeType === 'Confirmed') {
    const lastMedicalResetYear = this.lastMedicalReset ? new Date(this.lastMedicalReset).getFullYear() : null;
    if (!lastMedicalResetYear || lastMedicalResetYear < currentYear) {
      this.medicalLeaves = 7; // Reset Medical leaves to 7 for new year
      this.lastMedicalReset = new Date(currentYear, 0, 1);
    }
  }

  // Handle Restricted Holiday reset
  const lastRestrictedResetYear = this.lastRestrictedHolidayReset ? new Date(this.lastRestrictedHolidayReset).getFullYear() : null;
  if (!lastRestrictedResetYear || lastRestrictedResetYear < currentYear) {
    this.restrictedHolidays = 1; // Reset Restricted Holiday to 1 for new year
    this.lastRestrictedHolidayReset = new Date(currentYear, 0, 1);
  }

  // Handle over and above leaves for resigned employees
  if (this.isModified('status') && this.status === 'Resigned') {
    const joinDate = new Date(this.dateOfJoining);
    const resignDate = new Date(this.dateOfResigning);
    const joinYear = joinDate.getFullYear();
    const joinMonth = joinDate.getMonth();
    const joinDay = joinDate.getDate();
    const resignYear = resignDate.getFullYear();
    const resignMonth = resignDate.getMonth();
    const resignDay = resignDate.getDate();

    // Only process if resignation is in the same year or later than joining
    if (joinYear <= resignYear) {
      // Calculate entitled leaves based on months worked
      let entitledLeaves = 0;
      if (this.employeeType === 'Confirmed') {
        // Confirmed: 1 leave per month starting from next month if joined after 15th
        entitledLeaves = joinDay > 15 ? 12 - (joinMonth + 1) : 12 - joinMonth;
      } else {
        // Non-Confirmed: 1 leave per month starting from next month if joined after 15th
        entitledLeaves = joinDay > 15 ? resignMonth - (joinMonth + 1) + 1 : resignMonth - joinMonth + 1;
      }

      // Adjust for resignation month: must work at least 15 days to earn leave
      if (resignDay < 15) {
        entitledLeaves = Math.max(0, entitledLeaves - 1); // Remove leave for resignation month
      }

      // Calculate approved paid leaves taken in the resignation year
      const leaves = await Leave.find({
        employeeId: this.employeeId,
        leaveType: 'Casual', // Only consider Casual leaves
        'status.hod': 'Approved',
        'status.admin': 'Acknowledged',
        'status.ceo': 'Approved',
        $or: [
          { 'fullDay.from': { $gte: new Date(resignYear, 0, 1), $lte: new Date(resignYear, 11, 31) } },
          { 'halfDay.date': { $gte: new Date(resignYear, 0, 1), $lte: new Date(resignYear, 11, 31) } },
        ],
      });

      let totalPaidLeavesTaken = 0;
      for (const leave of leaves) {
        if (leave.halfDay?.date) {
          totalPaidLeavesTaken += 0.5;
        } else if (leave.fullDay?.from && leave.fullDay?.to) {
          const from = new Date(leave.fullDay.from);
          const to = new Date(leave.fullDay.to);
          from.setHours(0, 0, 0, 0);
          to.setHours(0, 0, 0, 0);
          totalPaidLeavesTaken += ((to - from) / (1000 * 60 * 60 * 24)) + 1;
        }
      }

      // Calculate over and above leaves
      const overAndAboveLeaves = Math.max(0, totalPaidLeavesTaken - entitledLeaves);
      if (overAndAboveLeaves > 0) {
        // Shift over and above paid leaves to unpaid leaves
        this.paidLeaves = Math.max(0, this.paidLeaves - overAndAboveLeaves);
        this.unpaidLeavesTaken = (this.unpaidLeavesTaken || 0) + overAndAboveLeaves;
      }
    }
  }

  next();
});

// Method to compare passwords
employeeSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

// Method to check for three consecutive paid leaves
employeeSchema.methods.checkConsecutivePaidLeaves = async function(newLeaveStart, newLeaveEnd) {
  const normalizeDate = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  newLeaveStart = normalizeDate(newLeaveStart);
  newLeaveEnd = normalizeDate(newLeaveEnd);

  const newLeaveDays = newLeaveStart.getTime() === newLeaveEnd.getTime() ? 0.5 : ((newLeaveEnd - newLeaveStart) / (1000 * 60 * 60 * 24)) + 1;
  if (newLeaveDays > 3) {
    return false; // No paid leaves allowed for more than 3 consecutive days
  }

  const leaves = await Leave.find({
    employeeId: this.employeeId,
    leaveType: { $in: ['Casual', 'Medical', 'Maternity', 'Paternity', 'Restricted Holidays', 'Emergency'] }, // Added Emergency leave type
    'status.hod': 'Approved',
    'status.admin': 'Approved',
    'status.ceo': 'Approved',
    $or: [
      {
        'fullDay.from': { $lte: newLeaveEnd },
        'fullDay.to': { $gte: newLeaveStart },
      },
      {
        'halfDay.date': { $gte: newLeaveStart, $lte: newLeaveEnd },
      },
    ],
  });

  let totalDays = newLeaveDays;
  for (const leave of leaves) {
    if (leave.halfDay?.date) {
      totalDays += 0.5;
    } else if (leave.fullDay?.from && leave.fullDay?.to) {
      const from = normalizeDate(leave.fullDay.from);
      const to = normalizeDate(leave.fullDay.to);
      totalDays += ((to - from) / (1000 * 60 * 60 * 24)) + 1;
    }
  }

  return totalDays <= 3;
};

// Method to deduct paid leaves (Casual or Emergency)
employeeSchema.methods.deductPaidLeaves = async function(leaveStart, leaveEnd, leaveType) {
  if (!leaveStart || !leaveEnd) return;

  const normalizeDate = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  leaveStart = normalizeDate(leaveStart);
  leaveEnd = normalizeDate(leaveEnd);

  let days = 0;
  if (leaveStart.getTime() === leaveEnd.getTime()) {
    days = 0.5;
  } else {
    days = ((leaveEnd - leaveStart) / (1000 * 60 * 60 * 24)) + 1;
  }

  console.log(`Deducting ${days} days for ${leaveType || 'Casual'} leave from ${leaveStart.toISOString()} to ${leaveEnd.toISOString()} for employee ${this.employeeId}`);

  this.paidLeaves = Math.max(0, this.paidLeaves - days);
  await this.save();
};

// Method to deduct medical leaves
employeeSchema.methods.deductMedicalLeaves = async function(leave, days) {
  if (this.employeeType !== 'Confirmed') {
    throw new Error('Medical leaves are only allowed for Confirmed employees');
  }
  this.medicalLeaves = Math.max(0, this.medicalLeaves - days);

  // Update attendance history
  const startDate = new Date(leave.fullDay.from);
  const endDate = new Date(leave.fullDay.to);
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);

  const attendanceRecords = [];
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    attendanceRecords.push({
      date: new Date(d),
      status: 'Leave',
      leaveType: 'Medical',
      leaveId: leave._id
    });
  }

  this.attendanceHistory.push(...attendanceRecords);
  await this.save();
};

// Method to deduct restricted holidays
employeeSchema.methods.deductRestrictedHolidays = async function() {
  this.restrictedHolidays = Math.max(0, this.restrictedHolidays - 1);
  await this.save();
};

// Method to add compensatory leave entry
employeeSchema.methods.addCompensatoryLeave = async function(date, hours) {
  if (![4, 8].includes(hours)) {
    throw new Error('Compensatory leave must be 4 or 8 hours');
  }
  this.compensatoryAvailable.push({ date, hours, status: 'Available' });
  this.compensatoryLeaves = (this.compensatoryLeaves || 0) + hours;
  await this.save();
};

// Method to deduct compensatory leaves
employeeSchema.methods.deductCompensatoryLeaves = async function(entryId) {
  const entry = this.compensatoryAvailable.find(e => e._id.toString() === entryId && e.status === 'Available');
  if (!entry) {
    throw new Error('Invalid or already claimed compensatory leave entry');
  }
  entry.status = 'Claimed';
  this.compensatoryLeaves = Math.max(0, this.compensatoryLeaves - entry.hours);
  const days = entry.hours === 4 ? 0.5 : 1;
  this.paidLeaves = (this.paidLeaves || 0) + days;
  await this.save();
};

// Method to record maternity leave claim
employeeSchema.methods.recordMaternityClaim = async function() {
  if (this.employeeType !== 'Confirmed') {
    throw new Error('Maternity leaves are only allowed for Confirmed employees');
  }
  this.maternityClaims = (this.maternityClaims || 0) + 1;
  await this.save();
};

// Method to record paternity leave claim
employeeSchema.methods.recordPaternityClaim = async function() {
  if (this.employeeType !== 'Confirmed') {
    throw new Error('Paternity leaves are only allowed for Confirmed employees');
  }
  this.paternityClaims = (this.paternityClaims || 0) + 1;
  await this.save();
};

// Method to increment unpaid leaves taken
employeeSchema.methods.incrementUnpaidLeaves = async function(leaveStart, leaveEnd, leaveType) {
  if (!leaveStart || !leaveEnd) return;

  const normalizeDate = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  leaveStart = normalizeDate(leaveStart);
  leaveEnd = normalizeDate(leaveEnd);

  let days = 0;
  if (leaveStart.getTime() === leaveEnd.getTime()) {
    days = 0.5;
  } else {
    days = ((leaveEnd - leaveStart) / (1000 * 60 * 60 * 24)) + 1;
  }

  console.log(`Incrementing ${days} days for ${leaveType || 'Unpaid'} leave from ${leaveStart.toISOString()} to ${leaveEnd.toISOString()} for employee ${this.employeeId}`);

  this.unpaidLeavesTaken = (this.unpaidLeavesTaken || 0) + days;
  await this.save();
};

export default mongoose.model('Employee', employeeSchema);
