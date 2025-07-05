import express from 'express';
const router = express.Router();
import mongoose from 'mongoose';
import XLSX from 'xlsx';
import multer from 'multer';
import Employee from '../models/Employee.js';
import Department from '../models/Department.js';
import Leave from '../models/Leave.js';
import auth from '../middleware/auth.js';
import role from '../middleware/role.js';
import Audit from '../models/Audit.js';
import { upload, uploadToGridFS, gfsReady } from '../middleware/fileupload.js';
import { getGfs } from '../utils/gridfs.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import numberToWords from 'number-to-words';
import { toIST, formatForDB, formatForDisplay, parseDate, validateDate, startOfDay, endOfDay, now } from '../utils/dateUtils.js';

dotenv.config();

function parseExcelDate(value) {
  if (!value) return undefined;
  if (typeof value === 'number') {
    // Excel's epoch starts at 1900-01-01, treat as UTC
    const date = toIST(new Date((value - 25569) * 86400 * 1000));
    if (!validateDate(date)) return undefined;
    return formatForDB(date);
  }
  // Parse as string in IST
  const date = toIST(parseDate(value));
  if (!validateDate(date)) return undefined;
  return formatForDB(date);
}

// Middleware to check gfs readiness
const ensureGfs = (req, res, next) => {
  if (!gfsReady()) {
    console.error('GridFS not initialized');
    return res.status(503).json({ message: 'GridFS not initialized. Please try again later.' });
  }
  next();
};

// Middleware to ensure MongoDB connection is open
const ensureDbConnection = (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    console.error('MongoDB connection is not open, state:', mongoose.connection.readyState);
    return res.status(500).json({ message: 'Database connection is not open' });
  }
  next();
};

// Middleware to check if request contains files
const checkForFiles = (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    upload.fields([
      { name: 'profilePicture', maxCount: 1 },
      { name: 'tenthTwelfthDocs', maxCount: 1 },
      { name: 'graduationDocs', maxCount: 1 },
      { name: 'postgraduationDocs', maxCount: 1 },
      { name: 'experienceCertificate', maxCount: 1 },
      { name: 'salarySlips', maxCount: 1 },
      { name: 'panCard', maxCount: 1 },
      { name: 'aadharCard', maxCount: 1 },
      { name: 'bankPassbook', maxCount: 1 },
      { name: 'medicalCertificate', maxCount: 1 },
      { name: 'backgroundVerification', maxCount: 1 },
    ])(req, res, async (err) => {
      if (err instanceof multer.MulterError) {
        console.error('Multer error:', err);
        return res.status(400).json({ message: `Multer error: ${err.message}` });
      }
      if (err) {
        console.error('Upload error:', err);
        return res.status(400).json({ message: `Upload error: ${err.message}` });
      }
      req.uploadedFiles = {};
      try {
        if (!req.files || Object.keys(req.files).length === 0) {
          return next();
        }
        for (const field of Object.keys(req.files)) {
          req.uploadedFiles[field] = [];
          for (const file of req.files[field]) {
            if (!file.buffer || !file.originalname || !file.mimetype) {
              return res.status(400).json({ message: `Invalid file data for ${field}` });
            }
            const uploadedFile = await uploadToGridFS(file, {
              originalname: file.originalname,
              mimetype: file.mimetype,
              fieldname: file.fieldname,
              employeeId: req.body.employeeId || req.params.id || 'unknown',
            });
            if (!uploadedFile || !uploadedFile._id) {
              return res.status(500).json({ message: `GridFS upload failed for ${file.originalname}` });
            }
            req.uploadedFiles[field].push({
              id: uploadedFile._id,
              filename: uploadedFile.filename,
            });
          }
        }
        next();
      } catch (uploadErr) {
        console.error('GridFS upload error:', uploadErr);
        return res.status(500).json({ message: 'File upload to GridFS failed', error: uploadErr.message });
      }
    });
  } else {
    req.uploadedFiles = {};
    next();
  }
};

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Helper function to format employee dates in IST
function formatEmployeeDates(employee) {
  const employeeObj = employee.toObject();
  return {
    ...employeeObj,
    dateOfBirth: employee.dateOfBirth ? formatForDisplay(employee.dateOfBirth, 'DD-MM-YYYY') : undefined,
    joiningDate: employee.joiningDate ? formatForDisplay(employee.joiningDate, 'DD-MM-YYYY') : undefined,
    dateOfResigning: employee.dateOfResigning ? formatForDisplay(employee.dateOfResigning, 'DD-MM-YYYY') : undefined,
    confirmationDate: employee.confirmationDate ? formatForDisplay(employee.confirmationDate, 'DD-MM-YYYY') : undefined,
    lastEmergencyLeaveToggle: employee.lastEmergencyLeaveToggle ? formatForDisplay(employee.lastEmergencyLeaveToggle, 'DD-MM-YYYY HH:mm') : undefined,
    createdAt: employee.createdAt ? formatForDisplay(employee.createdAt, 'DD-MM-YYYY HH:mm') : undefined,
    updatedAt: employee.updatedAt ? formatForDisplay(employee.updatedAt, 'DD-MM-YYYY HH:mm') : undefined,
  };
}

// Get document metadata for an employee
router.get('/:id/documents', auth, ensureGfs, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid employee ID format' });
    }
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    const gfs = getGfs();
    if (!gfs) {
      return res.status(503).json({ message: 'GridFS not initialized' });
    }
    const documentMetadata = [];
    for (const docId of employee.documents) {
      if (!mongoose.Types.ObjectId.isValid(docId)) {
        console.warn(`Invalid document ID: ${docId}`);
        continue;
      }
      const file = await gfs.find({ _id: new mongoose.Types.ObjectId(docId) }).toArray();
      if (file[0]) {
        documentMetadata.push({
          id: file[0]._id,
          filename: file[0].filename,
          fieldname: file[0].metadata?.fieldname || 'unknown',
        });
      }
    }
    res.json(documentMetadata);
  } catch (err) {
    console.error('Error fetching document metadata:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get all employees (Admin and CEO only)
router.get('/', auth, role(['Admin', 'CEO']), async (req, res) => {
  try {
    const employees = await Employee.find().populate('department reportingManager');
    console.log('Fetching employees for role:', req.user.role);
    console.log('Employees found:', employees.length);
    const formattedEmployees = employees.map(formatEmployeeDates);
    res.json(formattedEmployees);
  } catch (err) {
    console.error('Error fetching employees:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get employees in the same department, excluding those assigned to overlapping leaves or on leave
router.get('/department', auth, role(['HOD', 'Employee']), async (req, res) => {
  try {
    const { id, loginType } = req.user;
    const { startDate, endDate, fromDuration, fromSession, toDuration, toSession } = req.query;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }
    const user = await Employee.findById(id).populate('department');
    if (!user?.department?._id) {
      return res.status(400).json({ message: 'User department not found' });
    }

    const query = {
      department: user.department._id,
      _id: { $ne: id }, // Exclude logged-in user
    };
    if (loginType === 'Employee') {
      query.loginType = { $nin: ['HOD', 'CEO', 'Admin'] };
    } else if (loginType === 'HOD') {
      query.loginType = { $nin: ['CEO', 'Admin'] };
    }

    let excludedEmployeeIds = [];
    if (startDate && endDate) {
      const parsedStart = parseDate(startDate);
      const parsedEnd = parseDate(endDate);
      if (!validateDate(parsedStart) || !validateDate(parsedEnd)) {
        return res.status(400).json({ message: 'Invalid date format' });
      }

      if (parsedEnd < parsedStart) {
        return res.status(400).json({ message: 'End date must be after start date' });
      }

      const startUTC = formatForDB(parsedStart);
      const endUTC = formatForDB(parsedEnd);

      query.$and = query.$and || [];
      query.$and.push({
        joiningDate: {
          $gte: startUTC,
          $lte: endUTC
        }
      });

      const overlappingLeaves = await Leave.find({
        $or: [
          {
            $or: [
              { chargeGivenTo: { $exists: true } },
              { employee: { $exists: true } }
            ],
            'fullDay.from': { $lte: endUTC },
            'fullDay.to': { $gte: startUTC },
            $and: [
              { 'status.hod': { $in: ['Pending', 'Approved'] } },
              { 'status.ceo': { $in: ['Pending', 'Approved'] } },
              { 'status.admin': { $in: ['Pending', 'Acknowledged'] } }
            ],
            $or: [
              { 'fullDay.fromDuration': 'full' },
              { 'fullDay.fromDuration': 'half', 'fullDay.fromSession': { $in: ['forenoon', 'afternoon'] } }
            ],
            ...(startUTC.toISOString().split('T')[0] !== endUTC.toISOString().split('T')[0] && {
              $or: [
                { 'fullDay.toDuration': 'full' },
                { 'fullDay.toDuration': 'half', 'fullDay.toSession': 'forenoon' }
              ]
            })
          },
          {
            $or: [
              { chargeGivenTo: { $exists: true } },
              { employee: { $exists: true } }
            ],
            'fullDay.from': { $gte: startUTC, $lte: endUTC },
            'fullDay.to': { $gte: startUTC, $lte: endUTC },
            'fullDay.fromDuration': 'half',
            'fullDay.fromSession': { $in: ['forenoon', 'afternoon'] },
            $and: [
              { 'status.hod': { $in: ['Pending', 'Approved'] } },
              { 'status.ceo': { $in: ['Pending', 'Approved'] } },
              { 'status.admin': { $in: ['Pending', 'Acknowledged'] } }
            ]
          }
        ]
      }).select('chargeGivenTo employee');

      excludedEmployeeIds = [
        ...overlappingLeaves
          .map((leave) => leave.chargeGivenTo?.toString())
          .filter((id) => id && mongoose.Types.ObjectId.isValid(id)),
        ...overlappingLeaves
          .map((leave) => leave.employee?.toString())
          .filter((id) => id && mongoose.Types.ObjectId.isValid(id))
      ];
      excludedEmployeeIds = [...new Set(excludedEmployeeIds)];

      if (excludedEmployeeIds.includes('6831b42e22d3b8e6c3ce0fc0')) {
        console.log('Excluding employee 6831b42e22d3b8e6c3ce0fc0 due to existing leave on June 27, 2025');
      }
    }

    if (excludedEmployeeIds.length > 0) {
      query._id = { ...query._id, $nin: excludedEmployeeIds };
    }

    const employees = await Employee.find(query)
      .select('_id name employeeId gender department')
      .populate('department', 'name');
    console.log('Fetching department employees for:', loginType, user.department._id);
    console.log('Employees found:', employees.length);
    const formattedEmployees = employees.map(formatEmployeeDates);
    res.json(formattedEmployees);
  } catch (err) {
    console.error('Error fetching department employees:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get all departments
router.get('/departments', auth, role(['Admin', 'CEO']), async (req, res) => {
  try {
    const departments = await Department.find({}, '_id name');
    console.log('Fetching departments:', departments.length);
    res.json(departments);
  } catch (err) {
    console.error('Error fetching departments:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get single employee by ID
router.get('/:id', auth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid employee ID format' });
    }
    const employee = await Employee.findById(req.params.id).populate('department reportingManager');
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    const formattedEmployee = formatEmployeeDates(employee);
    res.json(formattedEmployee);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Create employee (Admin only)
router.post('/', auth, role(['Admin']), ensureGfs, ensureDbConnection, checkForFiles, async (req, res) => {
  try {
    console.log('Received POST request body:', req.body);
    console.log('Received files:', req.uploadedFiles);
    const {
      employeeId, userId, email, password, name, dateOfBirth, fatherName, motherName,
      mobileNumber, permanentAddress, currentAddress, aadharNumber, bloodGroup, gender, maritalStatus,
      spouseName, emergencyContactName, emergencyContactNumber, dateOfJoining, reportingManager,
      status, dateOfResigning, employeeType, probationPeriod, confirmationDate, referredBy, loginType,
      designation, location, department, panNumber, pfNumber, uanNumber, esiNumber, paymentType,
      bankName, bankBranch, accountNumber, ifscCode, serviceAgreement, ctc, basic, inHand
    } = req.body;

    // Validate required fields
    const requiredFields = [
      'employeeId', 'userId', 'email', 'password', 'name', 'dateOfBirth', 'fatherName',
      'motherName', 'mobileNumber', 'permanentAddress', 'currentAddress', 'aadharNumber',
      'bloodGroup', 'gender', 'maritalStatus', 'emergencyContactName', 'emergencyContactNumber',
      'dateOfJoining', 'reportingManager', 'status', 'loginType', 'designation',
      'location', 'department', 'panNumber', 'paymentType', 'ctc', 'basic', 'inHand'
    ];
    for (const field of requiredFields) {
      if (!req.body[field] || req.body[field].toString().trim() === '') {
        console.log(`Validation failed: ${field} is missing`);
        return res.status(400).json({ message: `${field} is required` });
      }
    }

    if (maritalStatus === 'Married' && (!spouseName || spouseName.trim() === '')) {
      return res.status(400).json({ message: 'Spouse name is required for married employees' });
    }

    if (status === 'Resigned' && (!dateOfResigning || dateOfResigning.trim() === '')) {
      return res.status(400).json({ message: 'Date of Resigning is required for Resigned status' });
    }

    if (status === 'Working' && (!employeeType || employeeType.trim() === '')) {
      return res.status(400).json({ message: 'Employee Type is required for Working status' });
    }

    if (status === 'Working' && employeeType === 'Probation' && (!probationPeriod || !confirmationDate)) {
      return res.status(400).json({ message: 'Probation period and confirmation date are required for Probation employee type' });
    }
    
    if (status === 'Working' && employeeType === 'OJT' && (!serviceAgreement || serviceAgreement.toString().trim() === '')) {
      return res.status(400).json({ message: 'Service Agreement is required for OJT employee type' });
    }

    if (paymentType === 'Bank Transfer' && (!bankName || !bankBranch || !accountNumber || !ifscCode)) {
      return res.status(400).json({ message: 'Bank details are required for bank transfer payment type' });
    }

    if (!/^\d{12}$/.test(aadharNumber)) {
      return res.status(400).json({ message: 'Aadhar Number must be exactly 12 digits' });
    }
    if (!/^\d{10}$/.test(mobileNumber)) {
      return res.status(400).json({ message: 'Mobile Number must be exactly 10 digits' });
    }
    if (password && password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }
    if (!/^[A-Z0-9]{10}$/.test(panNumber)) {
      return res.status(400).json({ message: 'PAN Number must be 10 alphanumeric characters' });
    }
    if (pfNumber && !/^\d{18}$/.test(pfNumber)) {
      return res.status(400).json({ message: 'PF Number must be 18 digits' });
    }
    if (uanNumber && !/^\d{12}$/.test(uanNumber)) {
      return res.status(400).json({ message: 'UAN Number must be 12 digits' });
    }
    if (esiNumber && !/^\d{12}$/.test(esiNumber)) {
      return res.status(400).json({ message: 'ESI Number must be 12 digits' });
    }

    if (!['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].includes(bloodGroup)) {
      return res.status(400).json({ message: 'Invalid blood group' });
    }
    if (!['Intern', 'Confirmed', 'Contractual', 'Probation', 'Apprentice', 'OJT'].includes(employeeType)) {
      return res.status(400).json({ message: 'Invalid employee type' });
    }
    if (isNaN(ctc) || Number(ctc) < 0) {
      return res.status(400).json({ message: 'CTC must be a valid non-negative number' });
    }
    if (isNaN(basic) || Number(basic) < 0) {
      return res.status(400).json({ message: 'Basic must be a valid non-negative number' });
    }
    if (isNaN(inHand) || Number(inHand) < 0) {
      return res.status(400).json({ message: 'In Hand must be a valid non-negative number' });
    }

    if (!mongoose.Types.ObjectId.isValid(department)) {
      return res.status(400).json({ message: 'Invalid department ID format' });
    }
    const departmentExists = await Department.findById(department);
    if (!departmentExists) return res.status(400).json({ message: 'Invalid department' });

    if (!mongoose.Types.ObjectId.isValid(reportingManager)) {
      return res.status(400).json({ message: 'Invalid reporting manager ID format' });
    }
    const reportingManagerExists = await Employee.findById(reportingManager);
    if (!reportingManagerExists) return res.status(400).json({ message: 'Invalid reporting manager' });

    const files = req.uploadedFiles || {};
    console.log('Processed files:', files);
    if (!files.profilePicture && Object.keys(files).length === 0) {
      console.warn('No files uploaded');
    }
    const documentIds = [
      files.tenthTwelfthDocs ? files.tenthTwelfthDocs[0].id : null,
      files.graduationDocs ? files.graduationDocs[0].id : null,
      files.postgraduationDocs ? files.postgraduationDocs[0].id : null,
      files.experienceCertificate ? files.experienceCertificate[0].id : null,
      files.salarySlips ? files.salarySlips[0].id : null,
      files.panCard ? files.panCard[0].id : null,
      files.aadharCard ? files.aadharCard[0].id : null,
      files.bankPassbook ? files.bankPassbook[0].id : null,
      files.medicalCertificate ? files.medicalCertificate[0].id : null,
      files.backgroundVerification ? files.backgroundVerification[0].id : null,
    ].filter(id => id !== null);

    const employee = new Employee({
      employeeId,
      userId,
      email,
      password,
      name,
      dateOfBirth: formatForDB(parseDate(dateOfBirth)),
      fatherName,
      motherName,
      mobileNumber,
      permanentAddress,
      currentAddress,
      aadharNumber,
      bloodGroup,
      gender,
      maritalStatus,
      spouseName,
      emergencyContactName,
      emergencyContactNumber,
      joiningDate: formatForDB(toIST(dateOfJoining)),
      reportingManager,
      status,
      dateOfResigning: status === 'Resigned' ? formatForDB(toIST(dateOfResigning)) : null,
      employeeType: status === 'Working' ? employeeType : null,
      probationPeriod: status === 'Working' && employeeType === 'Probation' ? probationPeriod : null,
      confirmationDate: status === 'Working' && employeeType === 'Probation' ? formatForDB(toIST(confirmationDate)) : null,
      referredBy,
      loginType,
      designation,
      location,
      department,
      panNumber,
      pfNumber,
      uanNumber,
      esiNumber,
      profilePicture: files.profilePicture ? files.profilePicture[0].id : null,
      documents: documentIds,
      paymentType,
      bankDetails: paymentType === 'Bank Transfer' ? {
        bankName,
        bankBranch,
        accountNumber,
        ifscCode,
      } : {},
      serviceAgreement: status === 'Working' && employeeType === 'OJT' ? Number(serviceAgreement) : null,
      ctc: Number(ctc),
      basic: Number(basic),
      inHand: Number(inHand),
      locked: true,
      basicInfoLocked: true,
      positionLocked: true,
      statutoryLocked: true,
      documentsLocked: true,
      paymentLocked: true,
      paidLeaves: 12,
      unpaidLeavesTaken: 0,
    });

    const newEmployee = await employee.save();
    console.log('Employee created:', newEmployee.employeeId);

    try {
      await Audit.create({
        action: 'create_employee',
        user: req.user?.id || 'unknown',
        details: `Created employee ${employeeId}`,
      });
    } catch (auditErr) {
      console.warn('Audit logging failed:', auditErr.message);
    }

    const formattedEmployee = formatEmployeeDates(newEmployee);
    res.status(201).json(formattedEmployee);
  } catch (err) {
    console.error('Error creating employee:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Update employee (Admin or authorized Employee)
router.put('/:id', auth, ensureGfs, ensureDbConnection, checkForFiles, async (req, res) => {
  try {
    console.log('Update request received');
    console.log('Received PUT request body:', req.body);
    console.log('Received files:', req.uploadedFiles);
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid employee ID format' });
    }
    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const isAdmin = req.user.role === 'Admin';
    const isSelf = req.user.employeeId === employee.employeeId;

    if (!isAdmin && !isSelf) {
      return res.status(403).json({ message: 'Unauthorized to update this employee' });
    }

    const updates = req.body;
    const files = req.uploadedFiles || {};

    // Log file details for debugging
    if (files.profilePicture) {
      console.log('Profile picture details:', files.profilePicture);
      if (!files.profilePicture[0]?.id) {
        console.error('Profile picture file ID is missing');
        return res.status(500).json({ message: 'Failed to process profile picture upload' });
      }
    }

    // Define fields by section
    const basicInfoFields = [
      'employeeId', 'userId', 'email', 'password', 'name', 'dateOfBirth', 'fatherName',
      'motherName', 'mobileNumber', 'permanentAddress', 'currentAddress', 'aadharNumber',
      'bloodGroup', 'gender', 'maritalStatus', 'spouseName', 'emergencyContactName', 'emergencyContactNumber',
      'dateOfJoining', 'reportingManager', 'status', 'dateOfResigning', 'employeeType', 'probationPeriod', 'confirmationDate',
      'referredBy', 'loginType', 'serviceAgreement'
    ];
    const positionFields = ['designation', 'location', 'department'];
    const statutoryFields = ['panNumber', 'pfNumber', 'uanNumber', 'esiNumber'];
    const documentFields = [
      'tenthTwelfthDocs', 'graduationDocs', 'postgraduationDocs', 'experienceCertificate',
      'salarySlips', 'panCard', 'aadharCard', 'bankPassbook', 'medicalCertificate',
      'backgroundVerification', 'profilePicture',
    ];
    const paymentFields = ['paymentType', 'bankName', 'bankBranch', 'accountNumber', 'ifscCode', 'ctc', 'basic', 'inHand'];

    // Check lock status for each section
    if (!isAdmin) {
      const unauthorizedFields = [];
      if (employee.basicInfoLocked && basicInfoFields.some(field => updates[field] || files[field])) {
        unauthorizedFields.push('Basic Information');
      }
      if (employee.positionLocked && positionFields.some(field => updates[field])) {
        unauthorizedFields.push('Employee Position');
      }
      if (employee.statutoryLocked && statutoryFields.some(field => updates[field])) {
        unauthorizedFields.push('Statutory Information');
      }
      if (employee.documentsLocked && documentFields.some(field => files[field])) {
        unauthorizedFields.push('Document Upload');
      }
      if (employee.paymentLocked && paymentFields.some(field => updates[field])) {
        unauthorizedFields.push('Payment Information');
      }
      if (unauthorizedFields.length > 0) {
        return res.status(403).json({ message: `Cannot update locked sections: ${unauthorizedFields.join(', ')}` });
      }
    }

    // Validate updates
    if (updates.department) {
      if (!mongoose.Types.ObjectId.isValid(updates.department)) {
        return res.status(400).json({ message: 'Invalid department ID format' });
      }
      const departmentExists = await Department.findById(updates.department);
      if (!departmentExists) return res.status(400).json({ message: 'Invalid department' });
    }
    if (updates.reportingManager) {
      if (!mongoose.Types.ObjectId.isValid(updates.reportingManager)) {
        return res.status(400).json({ message: 'Invalid reporting manager ID format' });
      }
      const reportingManagerExists = await Employee.findById(updates.reportingManager);
      if (!reportingManagerExists) {
        return res.status(400).json({ message: 'Invalid reporting manager' });
      }
    }
    if (updates.aadharNumber && !/^\d{12}$/.test(updates.aadharNumber)) {
      return res.status(400).json({ message: 'Aadhar Number must be exactly 12 digits' });
    }
    if (updates.bloodGroup && !['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].includes(updates.bloodGroup)) {
      return res.status(400).json({ message: 'Invalid blood group' });
    }
    if (updates.mobileNumber && !/^\d{10}$/.test(updates.mobileNumber)) {
      return res.status(400).json({ message: 'Mobile Number must be 10 digits' });
    }
    if (updates.password && updates.password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }
    if (updates.status === 'Resigned' && !updates.dateOfResigning) {
      return res.status(400).json({ message: 'Date of Resigning is required for Resigned status' });
    }
    if (updates.status === 'Working' && !updates.employeeType) {
      return res.status(400).json({ message: 'Employee Type is required for Working status' });
    }
    if (updates.status === 'Working' && updates.employeeType === 'Probation' && (!updates.probationPeriod || !validateDate(parseDate(updates.confirmationDate)))) {
      return res.status(400).json({ message: 'Probation period and confirmation date are required for Probation' });
    }
    if (updates.status === 'Working' && updates.employeeType === 'OJT' && (!updates.serviceAgreement || updates.serviceAgreement.toString().trim() === '')) {
      return res.status(400).json({ message: 'Service Agreement is required for OJT employee type' });
    }
    if (updates.panNumber && !/^[A-Z0-9]{10}$/.test(updates.panNumber)) {
      return res.status(400).json({ message: 'PAN Number must be 10 alphanumeric characters' });
    }
    if (updates.pfNumber && !/^\d{18}$/.test(updates.pfNumber)) {
      return res.status(400).json({ message: 'PF Number must be 18 digits' });
    }
    if (updates.uanNumber && !/^\d{12}$/.test(updates.uanNumber)) {
      return res.status(400).json({ message: 'UAN Number must be 12 digits' });
    }
    if (updates.esiNumber && !/^\d{12}$/.test(updates.esiNumber)) {
      return res.status(400).json({ message: 'ESI Number must be 12 digits' });
    }
    if (updates.dateOfBirth) {
      const parsedDate = toIST(updates.dateOfBirth);
      if (validateDate(parsedDate)) {
        updates.dateOfBirth = formatForDB(parsedDate);
      } else {
        return res.status(400).json({ message: 'Invalid date of birth format' });
      }
    }
    if (updates.dateOfJoining) {
      const parsedDate = toIST(updates.dateOfJoining);
      if (validateDate(parsedDate)) {
        updates.dateOfJoining = formatForDB(parsedDate);
      } else {
        return res.status(400).json({ message: 'Invalid joining date format' });
      }
    }
    if (updates.dateOfResigning) {
      const parsedDate = toIST(updates.dateOfResigning);
      if (validateDate(parsedDate)) {
        updates.dateOfResigning = formatForDB(parsedDate);
      } else {
        return res.status(400).json({ message: 'Invalid resignation date format' });
      }
    }
    if (updates.confirmationDate) {
      const parsedDate = toIST(updates.confirmationDate);
      if (validateDate(parsedDate)) {
        updates.confirmationDate = formatForDB(parsedDate);
      } else {
        return res.status(400).json({ message: 'Invalid confirmation date format' });
      }
    }
    if (updates.paymentType === 'Bank Transfer' && (!updates.bankName || !updates.bankBranch || !updates.accountNumber || !updates.ifscCode)) {
      return res.status(400).json({ message: 'Bank details are required for bank transfer payment type' });
    }
    if (updates.ctc && (isNaN(updates.ctc) || Number(updates.ctc) < 0)) {
      return res.status(400).json({ message: 'CTC must be a valid non-negative number' });
    }
    if (updates.basic && (isNaN(updates.basic) || Number(updates.basic) < 0)) {
      return res.status(400).json({ message: 'Basic must be a valid non-negative number' });
    }
    if (updates.inHand && (isNaN(updates.inHand) || Number(updates.inHand) < 0)) {
      return res.status(400).json({ message: 'In Hand must be a valid non-negative number' });
    }

    // Handle file uploads
    if (files.profilePicture) {
      console.log('Processing profile picture upload:', files.profilePicture);
      if (employee.profilePicture) {
        console.log('Deleting old profile picture:', employee.profilePicture);
        try {
          if (mongoose.Types.ObjectId.isValid(employee.profilePicture)) {
            await getGfs().delete(new mongoose.Types.ObjectId(employee.profilePicture));
          } else {
            console.warn(`Invalid profile picture ID: ${employee.profilePicture}`);
          }
        } catch (err) {
          console.warn(`Failed to delete old profile picture: ${err.message}`);
        }
      }
      if (files.profilePicture[0]?.id) {
        employee.profilePicture = files.profilePicture[0].id;
      } else {
        console.error('Profile picture file ID is missing:', files.profilePicture);
        return res.status(500).json({ message: 'Failed to process profile picture upload' });
      }
    }

    const docFields = [
      'tenthTwelfthDocs', 'graduationDocs', 'postgraduationDocs', 'experienceCertificate',
      'salarySlips', 'panCard', 'aadharCard', 'bankPassbook', 'medicalCertificate',
      'backgroundVerification',
    ];
    const newDocumentIds = docFields
      .map(field => {
        if (files[field] && files[field][0]?.id) {
          return files[field][0].id;
        }
        return null;
      })
      .filter(id => id !== null);
    if (newDocumentIds.length > 0) {
      console.log('Processing new document uploads:', newDocumentIds);
      if (employee.documents.length > 0) {
        for (const docId of employee.documents) {
          console.log('Deleting old document:', docId);
          try {
            if (mongoose.Types.ObjectId.isValid(docId)) {
              await getGfs().delete(new mongoose.Types.ObjectId(docId));
            } else {
              console.warn(`Invalid document ID: ${docId}`);
            }
          } catch (err) {
            console.warn(`Failed to delete old document ${docId}: ${err.message}`);
          }
        }
      }
      employee.documents = newDocumentIds;
    }

    // Apply updates
    Object.assign(employee, updates);
    if (updates.paymentType) {
      employee.bankDetails = updates.paymentType === 'Bank Transfer' ? {
        bankName: updates.bankName,
        bankBranch: updates.bankBranch,
        accountNumber: updates.accountNumber,
        ifscCode: updates.ifscCode,
      } : {};
    }
    if (updates.status === 'Working' && updates.employeeType === 'OJT') {
      employee.serviceAgreement = Number(updates.serviceAgreement);
    } else {
      employee.serviceAgreement = null;
    }
    if (updates.ctc) employee.ctc = Number(updates.ctc);
    if (updates.basic) employee.basic = Number(updates.basic);
    if (updates.inHand) employee.inHand = Number(updates.inHand);

    const updatedEmployee = await employee.save();
    const populatedEmployee = await Employee.findById(employee._id).populate('department reportingManager');
    console.log('Employee updated successfully:', updatedEmployee.employeeId);

    try {
      await Audit.create({
        type: 'update_employee',
        action: 'update',
        user: req.user?.id || 'unknown',
        dept: 'HR',
        details: `Updated employee ${employee.employeeId}`,
      });
    } catch (auditErr) {
      console.warn('Audit logging failed:', auditErr.message);
    }

    const formattedEmployee = formatEmployeeDates(populatedEmployee);
    res.json(formattedEmployee);
  } catch (err) {
    console.error('Error updating employee:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Delete employee (Admin only)
router.delete('/:id', auth, role(['Admin']), ensureGfs, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid employee ID format' });
    }
    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    if (employee.profilePicture) {
      console.log('Deleting profile picture:', employee.profilePicture);
      try {
        if (mongoose.Types.ObjectId.isValid(employee.profilePicture)) {
          await getGfs().delete(new mongoose.Types.ObjectId(employee.profilePicture));
        } else {
          console.warn(`Invalid profile picture ID: ${employee.profilePicture}`);
        }
      } catch (err) {
        console.warn(`Failed to delete profile picture: ${err.message}`);
      }
    }
    if (employee.documents && employee.documents.length > 0) {
      await Promise.all(
        employee.documents.map(docId => {
          console.log('Deleting document:', docId);
          try {
            if (mongoose.Types.ObjectId.isValid(docId)) {
              return getGfs().delete(new mongoose.Types.ObjectId(docId));
            } else {
              console.warn(`Invalid document ID: ${docId}`);
              return null;
            }
          } catch (err) {
            console.warn(`Failed to delete document ${docId}: ${err.message}`);
            return null;
          }
        })
      );
    }

    await Employee.findByIdAndDelete(req.params.id);
    console.log('Employee deleted:', req.params.id);

    try {
      await Audit.create({
        type: 'delete_employee',
        action: 'delete',
        user: req.user.id || 'unknown',
        dept: 'HR',
        details: `Deleted employee ${employee.employeeId}`,
      });
    } catch (auditErr) {
      console.warn('Audit deletion failed:', auditErr.message);
    }

    res.status(200).json({ message: 'Employee deleted successfully' });
  } catch (err) {
    console.error('Error deleting employee:', err.stack);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get file by ID (e.g., profile picture or document)
router.get('/files/:fileId', auth, ensureGfs, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.fileId)) {
      return res.status(400).json({ message: 'Invalid file ID format' });
    }
    const gfs = getGfs();
    const fileId = new mongoose.Types.ObjectId(req.params.fileId);

    const files = await gfs.find({ _id: fileId }).toArray();
    if (!files || files.length === 0) {
      return res.status(404).json({ message: 'File not found' });
    }

    console.log('Streaming file:', fileId);
    res.set('Content-Type', files[0].contentType);
    const downloadStream = gfs.openDownloadStream(fileId);
    downloadStream.on('error', (err) => {
      console.error('Download stream error:', err);
      res.status(500).json({ message: 'Error streaming file' });
    });
    downloadStream.pipe(res);
  } catch (err) {
    console.error('Error fetching file:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Lock/Unlock employee (Admin only)
router.patch('/:id/lock', auth, role(['Admin']), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid employee ID format' });
    }
    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    employee.locked = !employee.locked;
    const updatedEmployee = await employee.save();
    const populatedEmployee = await Employee.findById(employee._id).populate('department reportingManager');
    console.log(`Employee ${employee.employeeId} lock toggled to: ${employee.locked}`);

    try {
      await Audit.create({
        action: 'lock_unlock_employee',
        user: req.user?.id || 'unknown',
        details: `Toggled lock for employee ${employee.employeeId} to ${employee.locked}`,
      });
    } catch (auditErr) {
      console.warn('Audit logging failed:', auditErr.message);
    }

    const formattedEmployee = formatEmployeeDates(populatedEmployee);
    res.json(formattedEmployee);
  } catch (err) {
    console.error('Error locking/unlocking employee:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Toggle section-specific locks (Admin only)
router.patch('/:id/lock-section', auth, role(['Admin']), async (req, res) => {
  try {
    const { section } = req.body;
    const validSections = ['basicInfo', 'position', 'statutory', 'documents', 'payment'];
    if (!validSections.includes(section)) {
      return res.status(400).json({ message: 'Invalid section' });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid employee ID format' });
    }
    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const lockField = `${section}Locked`;
    employee[lockField] = !employee[lockField];
    const updatedEmployee = await employee.save();
    const populatedEmployee = await Employee.findById(employee._id).populate('department reportingManager');
    console.log(`Section ${section} lock toggled for employee ${employee.employeeId} to: ${employee[lockField]}`);

    try {
      await Audit.create({
        action: 'lock_unlock_section',
        user: req.user?.id || 'unknown',
        details: `Toggled ${section} lock for employee ${employee.employeeId} to ${employee[lockField]}`,
      });
    } catch (auditErr) {
      console.warn('Audit logging failed:', auditErr.message);
    }

    const formattedEmployee = formatEmployeeDates(populatedEmployee);
    res.json(formattedEmployee);
  } catch (err) {
    console.error('Error toggling section lock:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.post('/upload-excel', auth, role(['Admin']), excelUpload.single('excel'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded.' });
    }
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const results = await Promise.all(
      rows.map(async (row) => {
        try {
          // Format validations (only if field exists)
          if (row.aadharNumber && !/^\d{12}$/.test(row.aadharNumber)) {
            throw new Error('Aadhar Number must be exactly 12 digits');
          }
          if (row.mobileNumber && !/^\d{10}$/.test(row.mobileNumber)) {
            throw new Error('Mobile Number must be exactly 10 digits');
          }
          if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
            throw new Error('Invalid email format');
          }
          if (row.panNumber && !/^[A-Z0-9]{10}$/.test(row.panNumber)) {
            throw new Error('PAN Number must be 10 alphanumeric characters');
          }
          if (row.pfNumber && !/^\d{18}$/.test(row.pfNumber)) {
            throw new Error('PF Number must be 18 digits');
          }
          if (row.uanNumber && !/^\d{12}$/.test(row.uanNumber)) {
            throw new Error('UAN Number must be 12 digits');
          }
          if (row.esiNumber && !/^\d{12}$/.test(row.esiNumber)) {
            throw new Error('ESI Number must be 12 digits');
          }
          if (row.bloodGroup && !['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].includes(row.bloodGroup)) {
            throw new Error('Invalid blood group');
          }
          if (row.status === 'Resigned' && !row.dateOfResigning) {
            throw new Error('Date of Resigning is required for Resigned status');
          }
          if (row.status === 'Working' && !row.employeeType) {
            throw new Error('Employee Type is required for Working status');
          }
          if (row.status === 'Working' && row.employeeType === 'Probation' && (!row.probationPeriod || !row.confirmationDate)) {
            throw new Error('Probation period and confirmation date are required for Probation employee type');
          }
          if (row.status === 'Working' && row.employeeType === 'OJT' && (!row.serviceAgreement || row.serviceAgreement.toString().trim() === '')) {
            throw new Error('Service Agreement is required for OJT employee type');
          }
          if (isNaN(row.ctc) || Number(row.ctc) < 0) {
            throw new Error('CTC must be a valid non-negative number');
          }
          if (isNaN(row.basic) || Number(row.basic) < 0) {
            throw new Error('Basic must be a valid non-negative number');
          }
          if (isNaN(row.inHand) || Number(row.inHand) < 0) {
            throw new Error('In Hand must be a valid non-negative number');
          }

          // Department population if department is provided
          let departmentId = null;
          if (row.department) {
            const dept = await Department.findOne({ name: row.department });
            if (dept) {
              if (!mongoose.Types.ObjectId.isValid(dept._id)) {
                throw new Error(`Invalid department ID for department: ${row.department}`);
              }
              departmentId = dept._id;
            }
          }

          // Reporting Manager population if reportingManager is provided
          let reportingManagerId = null;
          if (row.reportingManager) {
            const manager = await Employee.findOne({ employeeId: row.reportingManager });
            if (manager) {
              if (!mongoose.Types.ObjectId.isValid(manager._id)) {
                throw new Error(`Invalid reporting manager ID for employeeId: ${row.reportingManager}`);
              }
              reportingManagerId = manager._id;
            }
          }

          // Compose employee data (leave missing fields blank)
          const employeeData = {
            employeeId: row.employeeId || '',
            userId: row.userId || '',
            name: row.name || '',
            dateOfBirth: row.dateOfBirth ? formatForDB(parseDate(row.dateOfBirth)) : undefined,
            fatherName: row.fatherName || '',
            motherName: row.motherName || '',
            mobileNumber: row.mobileNumber || '',
            permanentAddress: row.permanentAddress || '',
            currentAddress: row.currentAddress || '',
            email: row.email || '',
            password: row.password || Math.random().toString(36).slice(-8),
            aadharNumber: row.aadharNumber || '',
            bloodGroup: row.bloodGroup || '',
            gender: row.gender || '',
            maritalStatus: row.maritalStatus || '',
            spouseName: row.spouseName || '',
            emergencyContactName: row.emergencyContactName || '',
            emergencyContactNumber: row.emergencyContactNumber || '',
            joiningDate: row.joiningDate ? formatForDB(toIST(row.joiningDate)) : undefined,
            dateOfResigning: row.status === 'Resigned' && row.dateOfResigning ? formatForDB(toIST(row.dateOfResigning)) : null,
            employeeType: row.status === 'Working' ? row.employeeType : null,
            probationPeriod: row.status === 'Working' && row.employeeType === 'Probation' ? row.probationPeriod : null,
            confirmationDate: row.status === 'Working' && row.employeeType === 'Probation' && row.confirmationDate ? formatForDB(toIST(row.confirmationDate)) : null,
            reportingManager: reportingManagerId,
            status: row.status || '',
            referredBy: row.referredBy || '',
            loginType: row.loginType || '',
            designation: row.designation || '',
            location: row.location || '',
            department: departmentId,
            panNumber: row.panNumber || '',
            pfNumber: row.pfNumber || '',
            uanNumber: row.uanNumber || '',
            esiNumber: row.esiNumber || '',
            paymentType: row.paymentType || '',
            bankDetails: row.paymentType === 'Bank Transfer' ? {
              bankName: row.bankName || '',
              bankBranch: row.bankBranch || '',
              accountNumber: row.accountNumber || '',
              ifscCode: row.ifscCode || '',
            } : null,
            serviceAgreement: row.status === 'Working' && row.employeeType === 'OJT' ? Number(row.serviceAgreement) : null,
            ctc: Number(row.ctc) || 0,
            basic: Number(row.basic) || 0,
            inHand: Number(row.inHand) || 0,
            locked: true,
            basicInfoLocked: true,
            positionLocked: true,
            statutoryLocked: true,
            documentsLocked: true,
            paymentLocked: true,
          };

          // Remove empty bankDetails if paymentType is not 'Bank Transfer'
          if (employeeData.paymentType !== 'Bank Transfer') {
            delete employeeData.bankDetails;
          }

          // Save Employee
          const employee = new Employee(employeeData);
          await employee.save();
          return { employeeId: employee.employeeId, _id: employee._id };
        } catch (err) {
          return { error: err.message, row };
        }
      })
    );

    res.json({
      success: results.filter(r => !r.error),
      errors: results.filter(r => r.error)
    });
  } catch (err) {
    console.error('Error processing Excel upload:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/:id/emergency-leave-permission-existing', auth, role(['Admin', 'HOD', 'CEO']), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid employee ID format' });
    }
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    res.json({ canApplyEmergencyLeave: employee.canApplyEmergencyLeave });
  } catch (err) {
    console.error('Error fetching employee data:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Toggle Emergency Leave Permission (HOD for subordinates, CEO for HODs)
router.patch('/:id/emergency-leave-permission', auth, role(['Admin', 'HOD', 'CEO']), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid employee ID format' });
    }
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    if (!mongoose.Types.ObjectId.isValid(req.user.id)) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }
    const user = await Employee.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Authorization checks
    if (req.user.role === 'HOD') {
      if (employee.loginType !== 'Employee' || employee.department.toString() !== user.department.toString()) {
        return res.status(403).json({ message: 'Not authorized to toggle Emergency Leave permission for this employee' });
      }
    } else if (req.user.role === 'CEO') {
      if (employee.loginType !== 'HOD') {
        return res.status(400).json({ message: 'CEO can only toggle Emergency Leave permission for HODs' });
      }
    }

    // Toggle the canApplyEmergencyLeave field
    employee.canApplyEmergencyLeave = !employee.canApplyEmergencyLeave;
    // Update lastEmergencyLeaveToggle if toggling to true
    if (employee.canApplyEmergencyLeave) {
      employee.lastEmergencyLeaveToggle = formatForDB(toIST(new Date()));
    } else {
      employee.lastEmergencyLeaveToggle = null;
    }
    const updatedEmployee = await employee.save();
    const populatedEmployee = await Employee.findById(updatedEmployee._id).populate('department reportingManager');

    console.log(`Emergency Leave permission for employee ${employee.employeeId} toggled to: ${updatedEmployee.canApplyEmergencyLeave}`);

    try {
      await Audit.create({
        action: 'toggle_emergency_leave_permission',
        user: req.user.id || 'unknown',
        details: `Toggled Emergency Leave permission for employee ${employee.employeeId} to ${employee.canApplyEmergencyLeave}`,
      });
    } catch (auditErr) {
      console.warn('Audit logging failed:', auditErr.message);
    }

    const formattedEmployee = formatEmployeeDates(populatedEmployee);
    res.json(formattedEmployee);
  } catch (err) {
    console.error('Error toggling Emergency Leave permission:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Generate letter for an employee (Admin only)
router.post('/generate-letter', auth, role(['Admin']), async (req, res) => {
  try {
    const { employeeId, letterType } = req.body;

    // Validate inputs
    if (!employeeId || !letterType) {
      return res.status(400).json({ message: 'Employee ID and letter type are required' });
    }
    if (!['appointment', 'confidentiality', 'training', 'service'].includes(letterType)) {
      return res.status(400).json({ message: 'Invalid letter type' });
    }

    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({ message: 'Invalid employee ID format' });
    }
    // Fetch employee
    const employee = await Employee.findById(employeeId).populate('department reportingManager');
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Map letter type to template file
    const templateMap = {
      appointment: 'Appointment Letter.docx',
      confidentiality: 'Confidentiality Agreement.docx',
      training: 'Training Agreement.docx',
      service: 'Service Agreement.docx',
    };
    const templatePath = path.join(process.cwd(), 'templates', templateMap[letterType]);
    
    // Check if template exists
    if (!fs.existsSync(templatePath)) {
      return res.status(500).json({ message: `Template file ${templateMap[letterType]} not found` });
    }

    // Prepare data for template
    const data = {
      name: employee.name || '',
      permanentAddress: employee.permanentAddress || '',
      mobileNumber: employee.mobileNumber || '',
      email: employee.email || '',
      designation: employee.designation || '',
      dateOfJoining: employee.joiningDate ? formatForDisplay(employee.joiningDate, 'DD MMMM YYYY') : '',
      fatherName: employee.fatherName || '',
      aadharNumber: employee.aadharNumber || '',
      serviceAgreement: employee.serviceAgreement ? employee.serviceAgreement : '',
      gender: employee.gender || '',
    };

    // Appointment Letter specific fields
    if (letterType === 'appointment') {
      data.prefix = employee.gender === 'Male' ? 'Mr.' : employee.gender === 'Female' ? 'Ms.' : '';
      data.ctcInLakhs = employee.ctc ? (employee.ctc / 100000) : 0;
      data.ctcInWords = employee.ctc ? numberToWords.toWords(Math.floor(employee.ctc / 100000)) : '';
      data.probationPeriod = employee.employeeType === 'Probation' && employee.probationPeriod ? employee.probationPeriod : 0;
    }

    // Training Agreement specific fields
    if (letterType === 'training') {
      data.parentPrefix = employee.gender === 'Male' ? 'S/o' : 'D/o';
    }

    // Load template
    const content = fs.readFileSync(templatePath, 'binary');
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    // Render document with data
    try {
      doc.render(data);
    } catch (error) {
      console.error('Error rendering document:', error);
      return res.status(500).json({ message: 'Error rendering document', error: error.message });
    }

    // Generate buffer
    const buf = doc.getZip().generate({ type: 'nodebuffer' });

    // Set headers for download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename=${letterType}_${employee.employeeId}.docx`);

    // Audit logging
    try {
      await Audit.create({
        action: 'generate_letter',
        user: req.user?.id || 'unknown',
        details: `Generated ${letterType} letter for employee ${employee.employeeId}`,
      });
    } catch (auditErr) {
      console.warn('Audit logging failed:', auditErr.message);
    }

    // Send buffer
    res.send(buf);
  } catch (err) {
    console.error('Error generating letter:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

export default router;