import React, { useState, useEffect, useRef, memo } from 'react';
import { motion } from 'framer-motion';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Card, CardContent } from '../components/ui/card';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog';
import api from '../services/api';
import { useFileHandler } from '../hooks/useFileHandler';

class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught in ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="text-red-500 p-4">
          <h2>Something went wrong.</h2>
          <p>{this.state.error?.message || 'An unexpected error occurred.'}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function EmployeeUpdateForm({ employee, onUpdate }) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    employeeId: employee.employeeId || '',
    userId: employee.userId || '',
    name: employee.name || '',
    dateOfBirth: employee.dateOfBirth ? new Date(employee.dateOfBirth).toISOString().split('T')[0] : '',
    fatherName: employee.fatherName || '',
    motherName: employee.motherName || '',
    mobileNumber: employee.mobileNumber || '',
    permanentAddress: employee.permanentAddress || '',
    currentAddress: employee.currentAddress || '',
    email: employee.email || '',
    password: '',
    aadharNumber: employee.aadharNumber || '',
    bloodGroup: employee.bloodGroup || '',
    gender: employee.gender || '',
    maritalStatus: employee.maritalStatus || '',
    spouseName: employee.spouseName || '',
    emergencyContactName: employee.emergencyContactName || '',
    emergencyContactNumber: employee.emergencyContactNumber || '',
    dateOfJoining: employee.dateOfJoining ? new Date(employee.dateOfJoining).toISOString().split('T')[0] : '',
    reportingManager: employee.reportingManager?._id || null,
    status: employee.status || '',
    dateOfResigning: employee.dateOfResigning ? new Date(employee.dateOfResigning).toISOString().split('T')[0] : '',
    employeeType: employee.status === 'Working' ? employee.employeeType || '' : '',
    probationPeriod: employee.status === 'Working' && employee.employeeType === 'Probation' ? employee.probationPeriod || '' : '',
    confirmationDate: employee.status === 'Working' && employee.employeeType === 'Probation' ? (employee.confirmationDate ? new Date(employee.confirmationDate).toISOString().split('T')[0] : '') : '',
    referredBy: employee.referredBy || '',
    loginType: employee.loginType || '',
    designation: employee.designation || '',
    location: employee.location || '',
    department: employee.department?._id || null,
    panNumber: employee.panNumber || '',
    pfNumber: employee.pfNumber || '',
    uanNumber: employee.uanNumber || '',
    esiNumber: employee.esiNumber || '',
    paymentType: employee.paymentType || '',
    bankName: employee.bankDetails?.bankName || '',
    bankBranch: employee.bankDetails?.bankBranch || '',
    accountNumber: employee.bankDetails?.accountNumber || '',
    ifscCode: employee.bankDetails?.ifscCode || '',
    serviceAgreement: employee.status === 'Working' && employee.employeeType === 'OJT' ? employee.serviceAgreement || '' : '',
    ctc: employee.ctc || '',
    basic: employee.basic || '',
    inHand: employee.inHand || '',
  });
  const [files, setFiles] = useState({
    profilePicture: null,
    tenthTwelfthDocs: null,
    graduationDocs: null,
    postgraduationDocs: null,
    experienceCertificate: null,
    salarySlips: null,
    panCard: null,
    aadharCard: null,
    bankPassbook: null,
    medicalCertificate: null,
    backgroundVerification: null,
  });
  const [departments, setDepartments] = useState([]);
  const [managers, setManagers] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [allowSubmit, setAllowSubmit] = useState(false);
  const [documentMetadata, setDocumentMetadata] = useState([]);

  const submitButtonRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [deptRes, empRes, docRes] = await Promise.all([
          api.get('/departments'),
          api.get('/employees'),
          api.get(`/employees/${employee._id}/documents`),
        ]);
        setDepartments(deptRes.data.filter(dept => dept._id && dept._id.trim() !== ''));
        setManagers(
          empRes.data.filter(emp => ['HOD', 'Admin', 'CEO'].includes(emp.loginType) && emp._id && emp._id.trim() !== '')
        );
        setDocumentMetadata(docRes.data);
      } catch (err) {
        console.error('Error fetching data:', err);
      }
    };
    fetchData();
  }, [employee._id]);

  useEffect(() => {
    if (step === 5) {
      const timer = setTimeout(() => {
        setAllowSubmit(true);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      setAllowSubmit(false);
    }
  }, [step]);

  useEffect(() => {
    if (submitButtonRef.current) {
      const button = submitButtonRef.current;
      const handleFocus = () => {};
      const handleClick = () => {};
      button.addEventListener('focus', handleFocus);
      button.addEventListener('click', handleClick);
      return () => {
        button.removeEventListener('focus', handleFocus);
        button.removeEventListener('click', handleClick);
      };
    }
  }, [step]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prevForm) => {
      const updatedForm = { ...prevForm, [name]: value };
      if (name === 'dateOfJoining' || name === 'probationPeriod') {
        const dateOfJoining = name === 'dateOfJoining' ? value : prevForm.dateOfJoining;
        const probationPeriod = name === 'probationPeriod' ? value : prevForm.probationPeriod;
        if (dateOfJoining && probationPeriod) {
          const joiningDate = new Date(dateOfJoining);
          const confirmationDate = new Date(joiningDate.setMonth(joiningDate.getMonth() + parseInt(probationPeriod)));
          updatedForm.confirmationDate = confirmationDate.toISOString().split('T')[0];
        }
      }
      return updatedForm;
    });
    setErrors((prevErrors) => ({ ...prevErrors, [name]: '' }));
  };

  const handleSelectChange = (name, value) => {
    setForm((prevForm) => {
      const updatedForm = { ...prevForm, [name]: value === '' ? null : value };
      if (name === 'status') {
        updatedForm.dateOfResigning = '';
        updatedForm.employeeType = '';
        updatedForm.probationPeriod = '';
        updatedForm.confirmationDate = '';
        updatedForm.serviceAgreement = '';
      }
      if (name === 'employeeType') {
        if (value !== 'Probation') {
          updatedForm.probationPeriod = '';
          updatedForm.confirmationDate = '';
        }
        if (value !== 'OJT') {
          updatedForm.serviceAgreement = '';
        }
      }
      if (name === 'paymentType' && value !== 'Bank Transfer') {
        updatedForm.bankName = '';
        updatedForm.bankBranch = '';
        updatedForm.accountNumber = '';
        updatedForm.ifscCode = '';
      }
      return updatedForm;
    });
    setErrors((prevErrors) => ({ ...prevErrors, [name]: '' }));
  };

  const handleFileChange = (e) => {
    const { name, files: fileList } = e.target;
    if (fileList[0]) {
      const file = fileList[0];
      const newErrors = { ...errors };

      if (name === 'profilePicture') {
        if (!['image/jpeg', 'image/jpg'].includes(file.type)) {
          newErrors[name] = 'Profile Picture must be a JPEG/JPG image';
        } else if (file.size > 5 * 1024 * 1024) {
          newErrors[name] = 'Profile Picture must be less than or equal to 5MB';
        } else {
          delete newErrors[name];
        }
      } else {
        if (file.type !== 'application/pdf') {
          newErrors[name] = `${name.replace(/([A-Z])/g, ' $1').trim()} must be a PDF file`;
        } else {
          const maxSize = name === 'salarySlips' || name === 'panCard' || name === 'aadharCard' || name === 'bankPassbook' ? 1 * 1024 * 1024 :
                          name === 'medicalCertificate' || name === 'backgroundVerification' ? 2 * 1024 * 1024 : 5 * 1024 * 1024;
          if (file.size > maxSize) {
            newErrors[name] = `${name.replace(/([A-Z])/g, ' $1').trim()} must be less than or equal to ${maxSize / (1024 * 1024)}MB`;
          } else {
            delete newErrors[name];
          }
        }
      }

      setErrors(newErrors);
      if (!newErrors[name]) {
        console.log(`File selected for ${name}:`, file.name);
        setFiles(prev => ({ ...prev, [name]: file }));
      }
    }
  };

  const validateStep = (currentStep) => {
    const newErrors = {};
    if (currentStep === 1) {
      const requiredFields = [
        'name', 'dateOfBirth', 'fatherName', 'motherName',
        'mobileNumber', 'permanentAddress', 'currentAddress', 'email', 'aadharNumber',
        'bloodGroup', 'gender', 'maritalStatus', 'emergencyContactName', 'emergencyContactNumber',
        'dateOfJoining', 'reportingManager', 'status', 'loginType',
      ];
      requiredFields.forEach(field => {
        if (!form[field] || form[field].toString().trim() === '') {
          newErrors[field] = `${field.replace(/([A-Z])/g, ' $1').trim()} is required`;
        }
      });
      if (form.maritalStatus === 'Married' && (!form.spouseName || form.spouseName.trim() === '')) {
        newErrors.spouseName = 'Spouse Name is required';
      }
      if (form.status === 'Resigned' && (!form.dateOfResigning || form.dateOfResigning.trim() === '')) {
        newErrors.dateOfResigning = 'Date of Resigning is required';
      }
      if (form.status === 'Working' && (!form.employeeType || form.employeeType.trim() === '')) {
        newErrors.employeeType = 'Employee Type is required';
      }
      if (form.status === 'Working' && form.employeeType === 'Probation' && (!form.probationPeriod || !form.confirmationDate)) {
        newErrors.probationPeriod = 'Probation Period is required';
        newErrors.confirmationDate = 'Confirmation Date is required';
      }
      if (form.status === 'Working' && form.employeeType === 'OJT' && (!form.serviceAgreement || form.serviceAgreement.toString().trim() === '')) {
        newErrors.serviceAgreement = 'Service Agreement is required';
      }
      if (form.email && !/\S+@\S+\.\S+/.test(form.email)) {
        newErrors.email = 'Valid email is required';
      }
      if (form.password && form.password.length < 6) {
        newErrors.password = 'Password must be at least 6 characters';
      }
      if (form.aadharNumber && !/^\d{12}$/.test(form.aadharNumber)) {
        newErrors.aadharNumber = 'Aadhar Number must be exactly 12 digits';
      }
      if (form.mobileNumber && !/^\d{10}$/.test(form.mobileNumber)) {
        newErrors.mobileNumber = 'Mobile Number must be exactly 10 digits';
      }
      if (form.bloodGroup && !['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].includes(form.bloodGroup)) {
        newErrors.bloodGroup = 'Invalid blood group';
      }
      if (form.serviceAgreement && (isNaN(form.serviceAgreement) || Number(form.serviceAgreement) < 0)) {
        newErrors.serviceAgreement = 'Service Agreement must be a non-negative number';
      }
    } else if (currentStep === 2) {
      const requiredFields = ['designation', 'location', 'department'];
      requiredFields.forEach(field => {
        if (!form[field] || form[field].toString().trim() === '') {
          newErrors[field] = `${field.replace(/([A-Z])/g, ' $1').trim()} is required`;
        }
      });
    } else if (currentStep === 3) {
      if (!form.panNumber || form.panNumber.trim() === '') {
        newErrors.panNumber = 'PAN Number is required';
      } else if (!/^[A-Z0-9]{10}$/.test(form.panNumber)) {
        newErrors.panNumber = 'PAN Number must be 10 alphanumeric characters';
      }
      if (form.pfNumber && !/^\d{18}$/.test(form.pfNumber)) {
        newErrors.pfNumber = 'PF Number must be 18 digits';
      }
      if (form.uanNumber && !/^\d{12}$/.test(form.uanNumber)) {
        newErrors.uanNumber = 'UAN Number must be 12 digits';
      }
      if (form.esiNumber && !/^\d{12}$/.test(form.esiNumber)) {
        newErrors.esiNumber = 'ESI Number must be 12 digits';
      }
    } else if (currentStep === 4) {
      const fileFields = [
        'profilePicture', 'tenthTwelfthDocs', 'graduationDocs', 'postgraduationDocs',
        'experienceCertificate', 'salarySlips', 'panCard', 'aadharCard', 'bankPassbook',
        'medicalCertificate', 'backgroundVerification'
      ];
      fileFields.forEach(field => {
        if (files[field]) {
          if (field === 'profilePicture') {
            if (!['image/jpeg', 'image/jpg'].includes(files[field].type)) {
              newErrors[field] = 'Profile Picture must be a JPEG/JPG image';
            } else if (files[field].size > 5 * 1024 * 1024) {
              newErrors[field] = 'Profile Picture must be less than or equal to 5MB';
            }
          } else {
            if (files[field].type !== 'application/pdf') {
              newErrors[field] = `${field.replace(/([A-Z])/g, ' $1').trim()} must be a PDF file`;
            }
          }
        }
      });
    } else if (currentStep === 5) {
      if (!form.paymentType) {
        newErrors.paymentType = 'Payment Type is required';
      }
      if (form.paymentType === 'Bank Transfer') {
        const bankFields = ['bankName', 'bankBranch', 'accountNumber', 'ifscCode'];
        bankFields.forEach(field => {
          if (!form[field] || form[field].trim() === '') {
            newErrors[field] = `${field.replace(/([A-Z])/g, ' $1').trim()} is required`;
          }
        });
      }
      const salaryFields = ['ctc', 'basic', 'inHand'];
      salaryFields.forEach(field => {
        if (!form[field] || form[field].toString().trim() === '') {
          newErrors[field] = `${field.replace(/([A-Z])/g, ' $1').trim()} is required`;
        } else if (isNaN(form[field]) || Number(form[field]) < 0) {
          newErrors[field] = `${field.replace(/([A-Z])/g, ' $1').trim()} must be a non-negative number`;
        }
      });
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (!validateStep(step)) {
      console.error('Validation failed for step:', step, errors);
      return;
    } 
    if (step < 5) {
      setStep(step + 1);
    }
  };

  const handlePrevious = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setStep(1);
    setErrors({});
    setAllowSubmit(false);
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    console.log('handleSubmit called, step:', step, 'allowSubmit:', allowSubmit);
    if (!allowSubmit) {
      console.log('Submission blocked: allowSubmit is false');
      return;
    }

    for (let i = 1; i <= 5; i++) {
      if (!validateStep(i)) {
        setStep(i);
        console.error('Validation failed for step:', i, errors);
        return;
      }
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('employeeId', form.employeeId);
    Object.keys(form).forEach(key => {
      if (form[key] && form[key] !== null && key !== 'employeeId') {
        formData.append(key, form[key]);
      }
    });
    Object.keys(files).forEach(key => {
      if (files[key]) {
        formData.append(key, files[key]);
      }
    });

    for (let [key, value] of formData.entries()) {
      console.log(`FormData: ${key} = ${value}`);
    }

    try {
      const response = await api.put(`/employees/${employee._id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onUpdate(response.data);
      handleClose();
    } catch (error) {
      console.error('Error updating employee:', error.response?.data || error.message);
      setErrors({ submit: error.response?.data?.message || 'Update failed. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleFormKeyDown = (e) => {
    if (e.key === 'Enter') {
      console.log('Enter key pressed in form, preventing default submission');
      e.preventDefault();
    }
  };

  const FileViewer = ({ fileId }) => {
    const { handleViewFile } = useFileHandler(fileId);
    return (
      <button
        onClick={handleViewFile}
        className="text-blue-600 bg-white dark:bg-gray-800"
      >
        View
      </button>
    );
  };

  const getDocumentLabel = (fieldname) => {
    const docLabels = {
      tenthTwelfthDocs: '10th & 12th Certificates',
      graduationDocs: 'Graduation Certificates',
      postgraduationDocs: 'Postgraduation/PhD Certificates',
      experienceCertificate: 'Experience Certificate',
      salarySlips: 'Last 3 Months Salary Slips',
      panCard: 'PAN Card',
      aadharCard: 'Aadhar Card',
      bankPassbook: 'Bank Passbook/Cancelled Cheque',
      medicalCertificate: 'Medical Fitness Certificate',
      backgroundVerification: 'Background Verification',
    };
    return docLabels[fieldname] || fieldname;
  };

  const renderStep = () => {
    if (!isOpen) return null;
    return (
      <>
        <div className="mb-6">
          <h2 className="text-xl font-semibold">
            {step === 1 && 'Basic Information'}
            {step === 2 && 'Employee Position'}
            {step === 3 && 'Statutory Information'}
            {step === 4 && 'Document Upload'}
            {step === 5 && 'Payment Information'}
          </h2>
          <div className="flex justify-between mt-2">
            {[1, 2, 3, 4, 5].map(s => (
              <div key={s} className={`h-2 w-1/5 rounded ${s <= step ? 'bg-blue-600' : 'bg-gray-200'}`} />
            ))}
          </div>
        </div>
        <div className="overflow-y-auto max-h-[60vh] pr-4">
          {step === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col">
                <strong className="mb-1">Employee No.:</strong>
                <Input
                  name="employeeId"
                  value={form.employeeId}
                  onChange={handleChange}
                  className={errors.employeeId ? 'border-red-500' : ''}
                />
                {errors.employeeId && <p className="mt-1 text-sm text-red-500">{errors.employeeId}</p>}
              </div>
              <div className="flex flex-col">
                <strong className="mb-1">User ID:</strong>
                <Input
                  name="userId"
                  value={form.userId}
                  onChange={handleChange}
                  className={errors.userId ? 'border-red-500' : ''}
                  disabled
                />
                {errors.userId && <p className="mt-1 text-sm text-red-500">{errors.userId}</p>}
              </div>
              <div className="flex flex-col">
                <strong className="mb-1">Name:</strong>
                <Input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  className={errors.name ? 'border-red-500' : ''}
                />
                {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
              </div>
              <div className="flex flex-col">
                <strong className="mb-1">Date of Birth:</strong>
                <Input
                  name="dateOfBirth"
                  type="date"
                  value={form.dateOfBirth}
                  onChange={handleChange}
                  className={errors.dateOfBirth ? 'border-red-500' : ''}
                />
                {errors.dateOfBirth && <p className="mt-1 text-sm text-red-500">{errors.dateOfBirth}</p>}
              </div>
              <div className="flex flex-col">
                <strong className="mb-1">Father Name:</strong>
                <Input
                  name="fatherName"
                  value={form.fatherName}
                  onChange={handleChange}
                  className={errors.fatherName ? 'border-red-500' : ''}
                />
                {errors.fatherName && <p className="mt-1 text-sm text-red-500">{errors.fatherName}</p>}
              </div>
              <div className="flex flex-col">
                <strong className="mb-1">Mother Name:</strong>
                <Input
                  name="motherName"
                  value={form.motherName}
                  onChange={handleChange}
                  className={errors.motherName ? 'border-red-500' : ''}
                />
                {errors.motherName && <p className="mt-1 text-sm text-red-500">{errors.motherName}</p>}
              </div>
              <div className="flex flex-col">
                <strong className="mb-1">Mobile Number:</strong>
                <Input
                  name="mobileNumber"
                  value={form.mobileNumber}
                  onChange={handleChange}
                  className={errors.mobileNumber ? 'border-red-500' : ''}
                />
                {errors.mobileNumber && <p className="mt-1 text-sm text-red-500">{errors.mobileNumber}</p>}
              </div>
              <div className="flex flex-col">
                <strong className="mb-1">Permanent Address:</strong>
                <Input
                  name="permanentAddress"
                  value={form.permanentAddress}
                  onChange={handleChange}
                  className={errors.permanentAddress ? 'border-red-500' : ''}
                />
                {errors.permanentAddress && <p className="mt-1 text-sm text-red-500">{errors.permanentAddress}</p>}
              </div>
              <div className="flex flex-col">
                <strong className="mb-1">Current Address:</strong>
                <Input
                  name="currentAddress"
                  value={form.currentAddress}
                  onChange={handleChange}
                  className={errors.currentAddress ? 'border-red-500' : ''}
                />
                {errors.currentAddress && <p className="mt-1 text-sm text-red-500">{errors.currentAddress}</p>}
              </div>
              <div className="flex flex-col">
                <strong className="mb-1">Email:</strong>
                <Input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  className={errors.email ? 'border-red-500' : ''}
                />
                {errors.email && <p className="mt-1 text-sm text-red-500">{errors.email}</p>}
              </div>
              <div className="flex flex-col">
                <strong className="mb-1">Password:</strong>
                <Input
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={handleChange}
                  className={errors.password ? 'border-red-500' : ''}
                />
                {errors.password && <p className="mt-1 text-sm text-red-500">{errors.password}</p>}
              </div>
              <div className="flex flex-col">
                <strong className="mb-1">Aadhar Number:</strong>
                <Input
                  name="aadharNumber"
                  value={form.aadharNumber}
                  onChange={handleChange}
                  className={errors.aadharNumber ? 'border-red-500' : ''}
                />
                {errors.aadharNumber && <p className="mt-1 text-sm text-red-500">{errors.aadharNumber}</p>}
              </div>
              <div className="flex flex-col">
                <strong className="mb-1">Blood Group:</strong>
                <Select name="bloodGroup" value={form.bloodGroup} onValueChange={(value) => handleSelectChange('bloodGroup', value)}>
                  <SelectTrigger className={errors.bloodGroup ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Select blood group" />
                  </SelectTrigger>
                  <SelectContent>
                    {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
                      <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.bloodGroup && <p className="mt-1 text-sm text-red-500">{errors.bloodGroup}</p>}
              </div>
              <div className="flex flex-col">
                <strong className="mb-1">Gender:</strong>
                <Select name="gender" value={form.gender} onValueChange={(value) => handleSelectChange('gender', value)}>
                  <SelectTrigger className={errors.gender ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
                {errors.gender && <p className="mt-1 text-sm text-red-500">{errors.gender}</p>}
              </div>
              <div className="flex flex-col">
                <strong className="mb-1">Marital Status:</strong>
                <Select name="maritalStatus" value={form.maritalStatus} onValueChange={(value) => handleSelectChange('maritalStatus', value)}>
                  <SelectTrigger className={errors.maritalStatus ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Select marital status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Single">Single</SelectItem>
                    <SelectItem value="Married">Married</SelectItem>
                  </SelectContent>
                </Select>
                {errors.maritalStatus && <p className="mt-1 text-sm text-red-500">{errors.maritalStatus}</p>}
              </div>
              {form.maritalStatus === 'Married' && (
                <div className="flex flex-col">
                  <strong className="mb-1">Spouse Name:</strong>
                  <Input
                    name="spouseName"
                    value={form.spouseName}
                    onChange={handleChange}
                    className={errors.spouseName ? 'border-red-500' : ''}
                  />
                  {errors.spouseName && <p className="mt-1 text-sm text-red-500">{errors.spouseName}</p>}
                </div>
              )}
              <div className="flex flex-col">
                <strong className="mb-1">Emergency Contact Name:</strong>
                <Input
                  name="emergencyContactName"
                  value={form.emergencyContactName}
                  onChange={handleChange}
                  className={errors.emergencyContactName ? 'border-red-500' : ''}
                />
                {errors.emergencyContactName && <p className="mt-1 text-sm text-red-500">{errors.emergencyContactName}</p>}
              </div>
              <div className="flex flex-col">
                <strong className="mb-1">Emergency Contact Number:</strong>
                <Input
                  name="emergencyContactNumber"
                  value={form.emergencyContactNumber}
                  onChange={handleChange}
                  className={errors.emergencyContactNumber ? 'border-red-500' : ''}
                />
                {errors.emergencyContactNumber && <p className="mt-1 text-sm text-red-500">{errors.emergencyContactNumber}</p>}
              </div>
              <div className="flex flex-col">
                <strong className="mb-1">Date of Joining:</strong>
                <Input
                  name="dateOfJoining"
                  type="date"
                  value={form.dateOfJoining}
                  onChange={handleChange}
                  className={errors.dateOfJoining ? 'border-red-500' : ''}
                />
                {errors.dateOfJoining && <p className="mt-1 text-sm text-red-500">{errors.dateOfJoining}</p>}
              </div>
              <div className="flex flex-col">
                <strong className="mb-1">Reporting Manager:</strong>
                <Select name="reportingManager" value={form.reportingManager || ''} onValueChange={(value) => handleSelectChange('reportingManager', value)}>
                  <SelectTrigger className={errors.reportingManager ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Select reporting manager" />
                  </SelectTrigger>
                  <SelectContent>
                    {managers.map(m => (
                      m._id && m._id !== employee._id && <SelectItem key={m._id} value={m._id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.reportingManager && <p className="mt-1 text-sm text-red-500">{errors.reportingManager}</p>}
              </div>
              <div className="flex flex-col">
                <strong className="mb-1">Status:</strong>
                <Select name="status" value={form.status} onValueChange={(value) => handleSelectChange('status', value)}>
                  <SelectTrigger className={errors.status ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Working">Working</SelectItem>
                    <SelectItem value="Resigned">Resigned</SelectItem>
                  </SelectContent>
                </Select>
                {errors.status && <p className="mt-1 text-sm text-red-500">{errors.status}</p>}
              </div>
              {form.status === 'Resigned' && (
                <div className="flex flex-col">
                  <strong className="mb-1">Date of Resigning:</strong>
                  <Input
                    name="dateOfResigning"
                    type="date"
                    value={form.dateOfResigning}
                    onChange={handleChange}
                    className={errors.dateOfResigning ? 'border-red-500' : ''}
                  />
                  {errors.dateOfResigning && <p className="mt-1 text-sm text-red-500">{errors.dateOfResigning}</p>}
                </div>
              )}
              {form.status === 'Working' && (
                <>
                  <div className="flex flex-col">
                    <strong className="mb-1">Employee Type:</strong>
                    <Select name="employeeType" value={form.employeeType} onValueChange={(value) => handleSelectChange('employeeType', value)}>
                      <SelectTrigger className={errors.employeeType ? 'border-red-500' : ''}>
                        <SelectValue placeholder="Select employee type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Intern">Intern</SelectItem>
                        <SelectItem value="Confirmed">Confirmed</SelectItem>
                        <SelectItem value="Probation">Probation</SelectItem>
                        <SelectItem value="Contractual">Contractual</SelectItem>
                        <SelectItem value="Apprentice">Apprentice</SelectItem>
                        <SelectItem value="OJT">OJT</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.employeeType && <p className="mt-1 text-sm text-red-500">{errors.employeeType}</p>}
                  </div>
                  {form.employeeType === 'Probation' && (
                    <>
                      <div className="flex flex-col">
                        <strong className="mb-1">Probation Period:</strong>
                        <Input
                          name="probationPeriod"
                          value={form.probationPeriod}
                          onChange={handleChange}
                          className={errors.probationPeriod ? 'border-red-500' : ''}
                        />
                        {errors.probationPeriod && <p className="mt-1 text-sm text-red-500">{errors.probationPeriod}</p>}
                      </div>
                      <div className="flex flex-col">
                        <strong className="mb-1">Confirmation Date:</strong>
                        <Input
                          name="confirmationDate"
                          type="date"
                          value={form.confirmationDate}
                          onChange={handleChange}
                          className={errors.confirmationDate ? 'border-red-500' : ''}
                        />
                        {errors.confirmationDate && <p className="mt-1 text-sm text-red-500">{errors.confirmationDate}</p>}
                      </div>
                    </>
                  )}
                  {form.employeeType === 'OJT' && (
                    <div className="flex flex-col">
                      <strong className="mb-1">Service Agreement (months):</strong>
                      <Input
                        name="serviceAgreement"
                        type="number"
                        value={form.serviceAgreement}
                        onChange={handleChange}
                        className={errors.serviceAgreement ? 'border-red-500' : ''}
                        min="0"
                      />
                      {errors.serviceAgreement && <p className="mt-1 text-sm text-red-500">{errors.serviceAgreement}</p>}
                    </div>
                  )}
                </>
              )}
              <div className="flex flex-col">
                <strong className="mb-1">Referred By:</strong>
                <Input
                  name="referredBy"
                  value={form.referredBy}
                  onChange={handleChange}
                  className={errors.referredBy ? 'border-red-500' : ''}
                />
                {errors.referredBy && <p className="mt-1 text-sm text-red-500">{errors.referredBy}</p>}
              </div>
              <div className="flex flex-col">
                <strong className="mb-1">Login Type:</strong>
                <Select name="loginType" value={form.loginType} onValueChange={(value) => handleSelectChange('loginType', value)}>
                  <SelectTrigger className={errors.loginType ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Select login type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Employee">Employee</SelectItem>
                    <SelectItem value="HOD">HOD</SelectItem>
                    <SelectItem value="Admin">Admin</SelectItem>
                    <SelectItem value="CEO">CEO</SelectItem>
                  </SelectContent>
                </Select>
                {errors.loginType && <p className="mt-1 text-sm text-red-500">{errors.loginType}</p>}
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col">
                <strong className="mb-1">Designation:</strong>
                <Input
                  name="designation"
                  value={form.designation}
                  onChange={handleChange}
                  className={errors.designation ? 'border-red-500' : ''}
                />
                {errors.designation && <p className="mt-1 text-sm text-red-500">{errors.designation}</p>}
              </div>
              <div className="flex flex-col">
                <strong className="mb-1">Location:</strong>
                <Input
                  name="location"
                  value={form.location}
                  onChange={handleChange}
                  className={errors.location ? 'border-red-500' : ''}
                />
                {errors.location && <p className="mt-1 text-sm text-red-500">{errors.location}</p>}
              </div>
              <div className="flex flex-col">
                <strong className="mb-1">Department:</strong>
                <Select name="department" value={form.department || ''} onValueChange={(value) => handleSelectChange('department', value)}>
                  <SelectTrigger className={errors.department ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map(dept => (
                      dept._id && <SelectItem key={dept._id} value={dept._id}>{dept.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.department && <p className="mt-1 text-sm text-red-500">{errors.department}</p>}
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col">
                <strong className="mb-1">PAN Number:</strong>
                <Input
                  name="panNumber"
                  value={form.panNumber}
                  onChange={handleChange}
                  className={errors.panNumber ? 'border-red-500' : ''}
                />
                {errors.panNumber && <p className="mt-1 text-sm text-red-500">{errors.panNumber}</p>}
              </div>
              <div className="flex flex-col">
                <strong className="mb-1">PF Number:</strong>
                <Input
                  name="pfNumber"
                  value={form.pfNumber}
                  onChange={handleChange}
                  className={errors.pfNumber ? 'border-red-500' : ''}
                />
                {errors.pfNumber && <p className="mt-1 text-sm text-red-500">{errors.pfNumber}</p>}
              </div>
              <div className="flex flex-col">
                <strong className="mb-1">UAN Number:</strong>
                <Input
                  name="uanNumber"
                  value={form.uanNumber}
                  onChange={handleChange}
                  className={errors.uanNumber ? 'border-red-500' : ''}
                />
                {errors.uanNumber && <p className="mt-1 text-sm text-red-500">{errors.uanNumber}</p>}
              </div>
              <div className="flex flex-col">
                <strong className="mb-1">ESI Number:</strong>
                <Input
                  name="esiNumber"
                  value={form.esiNumber}
                  onChange={handleChange}
                  className={errors.esiNumber ? 'border-red-500' : ''}
                />
                {errors.esiNumber && <p className="mt-1 text-sm text-red-500">{errors.esiNumber}</p>}
              </div>
            </div>
          )}
          {step === 4 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { fieldname: 'profilePicture', label: 'Profile Picture', accept: 'image/jpeg,image/jpg' },
                { fieldname: 'tenthTwelfthDocs', label: '10th & 12th Certificates', accept: 'application/pdf' },
                { fieldname: 'graduationDocs', label: 'Graduation Certificates', accept: 'application/pdf' },
                { fieldname: 'postgraduationDocs', label: 'Postgraduation/PhD Certificates', accept: 'application/pdf' },
                { fieldname: 'experienceCertificate', label: 'Experience Certificate', accept: 'application/pdf' },
                { fieldname: 'salarySlips', label: 'Last 3 Months Salary Slips', accept: 'application/pdf', conditional: true },
                { fieldname: 'panCard', label: 'PAN Card', accept: 'application/pdf' },
                { fieldname: 'aadharCard', label: 'Aadhar Card', accept: 'application/pdf' },
                { fieldname: 'bankPassbook', label: 'Bank Passbook/Cancelled Cheque', accept: 'application/pdf' },
                { fieldname: 'medicalCertificate', label: 'Medical Fitness Certificate', accept: 'application/pdf' },
                { fieldname: 'backgroundVerification', label: 'Background Verification', accept: 'application/pdf' },
              ].map((doc, index) => {
                const docMeta = documentMetadata.find(meta => meta.fieldname === doc.fieldname);
                const fileId = doc.fieldname === 'profilePicture' ? employee.profilePicture : docMeta?.id;
                return (
                  <div
                    key={index}
                    className={doc.conditional && !employee.documents?.includes('experienceCertificate') && !files.experienceCertificate ? 'hidden' : 'flex flex-col'}
                  >
                    <strong className="mb-1">{getDocumentLabel(doc.fieldname)}:</strong>
                    {fileId && (
                      <div className="mb-2">
                        <FileViewer fileId={fileId} />
                      </div>
                    )}
                    <Input
                      name={doc.fieldname}
                      type="file"
                      accept={doc.accept}
                      onChange={handleFileChange}
                      className={errors[doc.fieldname] ? 'border-red-500 mt-1' : 'mt-1'}
                      required={doc.fieldname !== 'postgraduationDocs' && doc.fieldname !== 'experienceCertificate' && (!doc.conditional || (employee.documents?.includes('experienceCertificate') || files.experienceCertificate))}
                    />
                    {errors[doc.fieldname] && <p className="mt-1 text-sm text-red-500">{errors[doc.fieldname]}</p>}
                  </div>
                );
              })}
            </div>
          )}
          {step === 5 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col">
                <strong className="mb-1">Payment Type:</strong>
                <Select
                  name="paymentType"
                  value={form.paymentType || ''}
                  onValueChange={(value) => handleSelectChange('paymentType', value)}
                >
                  <SelectTrigger className={errors.paymentType ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Select payment type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
                {errors.paymentType && <p className="mt-1 text-sm text-red-500">{errors.paymentType}</p>}
              </div>
              {form.paymentType === 'Bank Transfer' && (
                <>
                  <div className="flex flex-col">
                    <strong className="mb-1">Bank Name:</strong>
                    <Input
                      name="bankName"
                      value={form.bankName || ''}
                      onChange={handleChange}
                      className={errors.bankName ? 'border-red-500' : ''}
                    />
                    {errors.bankName && <p className="mt-1 text-sm text-red-500">{errors.bankName}</p>}
                  </div>
                  <div className="flex flex-col">
                    <strong className="mb-1">Bank Branch:</strong>
                    <Input
                      name="bankBranch"
                      value={form.bankBranch || ''}
                      onChange={handleChange}
                      className={errors.bankBranch ? 'border-red-500' : ''}
                    />
                    {errors.bankBranch && <p className="mt-1 text-sm text-red-500">{errors.bankBranch}</p>}
                  </div>
                  <div className="flex flex-col">
                    <strong className="mb-1">Account Number:</strong>
                    <Input
                      name="accountNumber"
                      value={form.accountNumber || ''}
                      onChange={handleChange}
                      className={errors.accountNumber ? 'border-red-500' : ''}
                    />
                    {errors.accountNumber && <p className="mt-1 text-sm text-red-500">{errors.accountNumber}</p>}
                  </div>
                  <div className="flex flex-col">
                    <strong className="mb-1">IFSC Code:</strong>
                    <Input
                      name="ifscCode"
                      value={form.ifscCode || ''}
                      onChange={handleChange}
                      className={errors.ifscCode ? 'border-red-500' : ''}
                    />
                    {errors.ifscCode && <p className="mt-1 text-sm text-red-500">{errors.ifscCode}</p>}
                  </div>
                </>
              )}
              <div className="flex flex-col">
                <strong className="mb-1">CTC (Annual):</strong>
                <Input
                  name="ctc"
                  type="number"
                  value={form.ctc}
                  onChange={handleChange}
                  className={errors.ctc ? 'border-red-500' : ''}
                  min="0"
                />
                {errors.ctc && <p className="mt-1 text-sm text-red-500">{errors.ctc}</p>}
              </div>
              <div className="flex flex-col">
                <strong className="mb-1">Basic (Monthly):</strong>
                <Input
                  name="basic"
                  type="number"
                  value={form.basic}
                  onChange={handleChange}
                  className={errors.basic ? 'border-red-500' : ''}
                  min="0"
                />
                {errors.basic && <p className="mt-1 text-sm text-red-500">{errors.basic}</p>}
              </div>
              <div className="flex flex-col">
                <strong className="mb-1">In Hand (Monthly):</strong>
                <Input
                  name="inHand"
                  type="number"
                  value={form.inHand}
                  onChange={handleChange}
                  className={errors.inHand ? 'border-red-500' : ''}
                  min="0"
                />
                {errors.inHand && <p className="mt-1 text-sm text-red-500">{errors.inHand}</p>}
              </div>
            </div>
          )}
        </div>
      </>
    );
  };

  return (
    <>
      <Button
        onClick={() => {
          console.log('Opening dialog for employee:', employee.employeeId);
          setIsOpen(true);
        }}
        className="bg-purple-600 hover:bg-green-700"
      >
        Update
      </Button>
      <Dialog
        open={isOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) handleClose();
        }}
        closeOnOverlayClick={false}
        closeOnEsc={false}
      >
        <DialogContent className="max-w-4xl">
          <DialogTitle>Update Employee Information</DialogTitle>
          <DialogDescription>
            Update the details of the employee below. Navigate through the steps to edit all sections.
          </DialogDescription>
          <ErrorBoundary>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Card className="shadow-lg bg-white">
                <CardContent className="p-6">
                  <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}>
                    {renderStep()}
                    {errors.submit && (
                      <p className="mt-4 text-red-500">{errors.submit}</p>
                    )}
                    <div className="mt-6 flex justify-between">
                      {step > 1 && (
                        <Button
                          type="button"
                          onClick={handlePrevious}
                          disabled={loading}
                          className="bg-gray-600 hover:bg-gray-700 text-white"
                        >
                          Previous
                        </Button>
                      )}
                      <div className="flex gap-2">
                        {step < 5 ? (
                          <Button
                            type="button"
                            onClick={handleNext}
                            disabled={loading}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            Next
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            onClick={handleSubmit}
                            disabled={loading || !allowSubmit}
                            ref={submitButtonRef}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            {loading ? 'Submitting...' : 'Submit'}
                          </Button>
                        )}
                        <Button
                          type="button"
                          onClick={handleClose}
                          className="bg-red-600 hover:bg-red-700 text-white"
                        >
                          Close
                        </Button>
                      </div>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </motion.div>
          </ErrorBoundary>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default memo(EmployeeUpdateForm);
