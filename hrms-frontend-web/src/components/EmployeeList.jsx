import React, { useState, useEffect, useMemo, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Skeleton } from '../components/ui/skeleton';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import ContentLayout from './ContentLayout';
import EmployeeDetails from './EmployeeDetails';
import EmployeeUpdateForm from './EmployeeUpdateForm';
import Pagination from './Pagination';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { Switch } from '../components/ui/switch'; // Assuming a Switch component is available or imported
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function EmployeeList() {
  console.log('EmployeeList component rendered');
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const initialFilters = useMemo(
    () => ({
      departmentId: user?.loginType === 'HOD' && user?.department ? user.department._id : 'all',
    }),
    [user]
  );
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState(initialFilters.departmentId);
  const [departments, setDepartments] = useState([]);
  const [selectedEmployeeForDetails, setSelectedEmployeeForDetails] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [loginType, setLoginType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [shiftLoading, setShiftLoading] = useState({});
  const [tempShift, setTempShift] = useState({});
  const [emergencyLoading, setEmergencyLoading] = useState({}); // Track loading state for emergency toggle
  const departmentOrder = ['Admin', 'R&D', 'Production', 'AMETL'];


useEffect(() => {
  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const userRes = await api.get('/auth/me').catch(err => {
        console.error('Error fetching user:', err.response?.data || err.message);
        if (err.response?.status === 401 || err.response?.status === 403) {
          localStorage.removeItem('token');
          navigate('/login');
          throw new Error('not_authenticated');
        }
        throw new Error('Failed to fetch user details.');
      });
      const userLoginType = userRes.data.loginType || '';
      setLoginType(userLoginType);
      console.log('User fetched:', userRes.data, 'Login Type:', userLoginType, 'Department:', userRes.data.department);

      const endpoint = userLoginType === 'HOD' ? '/employees/department' : '/employees';
      const params = userLoginType === 'HOD' ? {} : { departmentId: departmentFilter === 'all' ? undefined : departmentFilter };
      const empRes = await api.get(endpoint, { params }).catch(err => {
        console.error('Error fetching employees:', err.response?.data || err.message);
        if (err.response?.status === 401 || err.response?.status === 403) {
          localStorage.removeItem('token');
          navigate('/login');
          throw new Error('not_authenticated');
        }
        throw new Error('Failed to fetch employees. Please try again later.');
      });

      // Load initial state from server and merge with local storage if available
      const storedStates = JSON.parse(localStorage.getItem('emergencyToggleStates') || '{}');
      const updatedEmployees = empRes.data.map(emp => ({
        ...emp,
        canApplyEmergencyLeave: storedStates[emp._id] !== undefined ? storedStates[emp._id] : emp.canApplyEmergencyLeave !== undefined ? emp.canApplyEmergencyLeave : false
      }));
      setEmployees(updatedEmployees);
      console.log('Employees fetched with emergency status:', updatedEmployees.map(emp => ({
        employeeId: emp.employeeId,
        name: emp.name,
        department: emp.department,
        shift: emp.shift,
        canApplyEmergencyLeave: emp.canApplyEmergencyLeave,
      })));

      if (['Admin', 'CEO'].includes(userLoginType)) {
        try {
          const deptRes = await api.get('/departments');
          const validDepartments = deptRes.data.filter(dept => dept._id && dept.name.trim() !== '');
          setDepartments(validDepartments);
          console.log('Departments fetched:', validDepartments);
        } catch (err) {
          console.error('Error fetching departments:', err.response?.data || err.message);
          if (err.response?.status === 401) {
            localStorage.removeItem('token');
            navigate('/login');
            throw new Error('not_authenticated');
          } else if (err.response?.status === 403) {
            setError('Access denied: Cannot fetch departments. Department filter unavailable.');
          } else {
            setError('Failed to fetch departments. Department filter may be unavailable.');
          }
        }
      } else if (userLoginType === 'HOD' && userRes.data?.department) {
        setDepartments([{ _id: userRes.data.department._id, name: userRes.data.department.name }]);
      }
    } catch (err) {
      if (err.message !== 'not_authenticated') {
        console.error('Fetch error:', err);
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };
  fetchData();
}, [navigate, departmentFilter, user]);

const isCEO = user?.loginType === 'CEO';

const sortEmployeesForCEO = (list) => {
  return [...list].sort((a, b) => {
    const deptA = a.department?.name || '';
    const deptB = b.department?.name || '';
    const indexA = departmentOrder.indexOf(deptA);
    const indexB = departmentOrder.indexOf(deptB);
    return (indexA !== -1 ? indexA : Infinity) - (indexB !== -1 ? indexB : Infinity);
  });
};


const handleDownloadPDF = (data) => {
  if (!data || data.length === 0) {
    toast.error('No employees to export.');
    return;
  }

  const finalList = isCEO ? sortEmployeesForCEO(data) : data;

  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text('Employee List (Department-wise)', 14, 20);

  const tableData = finalList.map(emp => [
    emp.employeeId,
    emp.name,
    emp.department?.name || 'N/A',
  ]);

  autoTable(doc, {
    startY: 30,
    head: [['Employee ID', 'Name', 'Department']],
    body: tableData,
    theme: 'striped',
    styles: { fontSize: 11 },
  });

  doc.save('employee_list.pdf');
};



  const filteredEmployees = useMemo(() => {
    let filtered = employees;
    if (search) {
      filtered = filtered.filter(emp =>
        emp.name.toLowerCase().includes(search.toLowerCase()) ||
        emp.employeeId.toLowerCase().includes(search.toLowerCase())
      );
    }
    if (loginType !== 'HOD' && departmentFilter && departmentFilter !== 'all') {
      filtered = filtered.filter(emp => {
        if (!emp.department || !emp.department._id) {
          console.log(`Employee ${emp.employeeId} has no department:`, emp.department);
          return false;
        }
        const matchesDepartment = emp.department._id.toString() === departmentFilter;
        if (!matchesDepartment) {
          console.log(`Employee ${emp.employeeId} does not match department ${departmentFilter}:`, emp.department);
        }
        return matchesDepartment;
      });
    }
    console.log('Filtered employees:', filtered.map(emp => ({
      employeeId: emp.employeeId,
      name: emp.name,
      department: emp.department,
      shift: emp.shift,
      canApplyEmergencyLeave: emp.canApplyEmergencyLeave,
    })));
    return filtered;
  }, [employees, search, departmentFilter, loginType]);

  const paginatedEmployees = filteredEmployees.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

const handleDownloadXLSX = (data) => {
  if (!data || data.length === 0) {
    toast.error('No employees to export.');
    return;
  }

  const finalList = isCEO ? sortEmployeesForCEO(data) : data;

  const worksheetData = finalList.map(emp => ({
    'Employee ID': emp.employeeId,
    'Name': emp.name,
    'Department': emp.department?.name || 'N/A',
  }));

  const worksheet = XLSX.utils.json_to_sheet(worksheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Employees');

  XLSX.writeFile(workbook, 'employee_list.xlsx');
};


  const TableCellComponent = ({ emp }) => {
    if (!canShowEmergencyToggle(emp)) return null;

    return (
      <div className="flex items-center space-x-2">
        <button
          onClick={() => handleEmergencyToggle(emp._id)}
          disabled={emergencyLoading[emp._id]}
          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors duration-200 ${
            emp.canApplyEmergencyLeave
              ? 'bg-green-700 text-white hover:bg-green-800'
              : 'bg-red-700 text-white hover:bg-red-800'
          } disabled:opacity-50`}
        >
          {emergencyLoading[emp._id] ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : emp.canApplyEmergencyLeave ? 'Enabled' : 'Disabled'}
        </button>
      </div>
    );
  };
  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this employee?')) return;
    try {
      await api.delete(`/employees/${id}`);
      setEmployees(employees.filter(emp => emp._id !== id));
      toast.success('Employee deleted successfully');
    } catch (err) {
      console.error('Error deleting employee:', err.response?.data || err.message);
      setError('Failed to delete employee. Please try again.');
      toast.error(err.response?.data?.message || 'Failed to delete employee');
    }
  };

  const handleViewDetails = async (employee) => {
    try {
      let fullEmployee = employee;
      if (loginType === 'HOD') {
        const response = await api.get(`/employees/${employee._id}`);
        fullEmployee = response.data;
        console.log('Full employee details fetched for HOD:', {
          employeeId: fullEmployee.employeeId,
          name: fullEmployee.name,
          department: fullEmployee.department,
          loginType: fullEmployee.loginType,
          shift: fullEmployee.shift,
          canApplyEmergencyLeave: fullEmployee.canApplyEmergencyLeave,
        });
      }
      setSelectedEmployeeForDetails(fullEmployee);
      setShowDetails(true);
    } catch (err) {
      console.error('Error fetching full employee details:', err.response?.data || err.message);
      setError('Failed to load employee details. Please try again.');
      toast.error(err.response?.data?.message || 'Failed to load employee details');
    }
  };

  const handleCloseDetailsModal = () => {
    setShowDetails(false);
    setSelectedEmployeeForDetails(null);
  };

  const handleUpdateSuccess = (updatedEmployee) => {
    console.log('handleUpdateSuccess called, updatedEmployee:', updatedEmployee);
    if (typeof updatedEmployee.department === 'string') {
      updatedEmployee.department = departments.find(d => d._id === updatedEmployee.department);
    }
    setEmployees((prevEmployees) =>
      prevEmployees.map(emp =>
        emp._id === updatedEmployee._id ? { ...emp, ...updatedEmployee } : emp
      )
    );
    toast.success('Employee updated successfully');
  };

  const handleEmployeeUpdate = (updatedEmployee) => {
    console.log('handleEmployeeUpdate called, updatedEmployee:', updatedEmployee);
    setEmployees((prevEmployees) =>
      prevEmployees.map(emp =>
        emp._id === updatedEmployee._id ? { ...emp, ...updatedEmployee } : emp
      )
    );
    setSelectedEmployeeForDetails(updatedEmployee);
  };

  const handleShiftChange = async (employeeId) => {
    const newShift = tempShift[employeeId] || 'Regular';
    if (!newShift || newShift === employees.find(emp => emp._id === employeeId)?.shift) return;

    setShiftLoading(prev => ({ ...prev, [employeeId]: true }));
    try {
      const response = await api.patch(`/employees/${employeeId}/shift`, { shift: newShift });

      setEmployees(prevEmployees =>
        prevEmployees.map(emp =>
          emp._id === employeeId ? { ...emp, shift: newShift } : emp
        )
      );
      if (selectedEmployeeForDetails?._id === employeeId) {
        setSelectedEmployeeForDetails(prev => ({ ...prev, shift: newShift }));
      }
      setTempShift(prev => ({ ...prev, [employeeId]: undefined }));
      toast.success(`Shift updated to ${newShift} for employee ${employeeId}`);
    } catch (err) {
      console.error('Error updating shift:', err.response?.data || err.message);
      toast.error(err.response?.data?.message || 'Failed to update shift');
      setTempShift(prev => ({ ...prev, [employeeId]: employees.find(emp => emp._id === employeeId)?.shift }));
    } finally {
      setShiftLoading(prev => ({ ...prev, [employeeId]: false }));
    }
  };

  const handleShiftSelect = (employeeId, value) => {
    setTempShift(prev => ({ ...prev, [employeeId]: value }));
  };

const handleEmergencyToggle = async (employeeId) => {
  const employee = employees.find(emp => emp._id === employeeId);
  if (!employee) return;

  setEmergencyLoading(prev => ({ ...prev, [employeeId]: true }));
  try {
    const response = await api.patch(`/employees/${employeeId}/emergency-leave-permission`);
    const newCanApply = response.data.canApplyEmergencyLeave;
    setEmployees(prevEmployees =>
      prevEmployees.map(emp =>
        emp._id === employeeId ? { ...emp, canApplyEmergencyLeave: newCanApply } : emp
      )
    );
    if (selectedEmployeeForDetails?._id === employeeId) {
      setSelectedEmployeeForDetails(prev => ({ ...prev, canApplyEmergencyLeave: newCanApply }));
    }

    // Update local storage with the new state
    const storedStates = JSON.parse(localStorage.getItem('emergencyToggleStates') || '{}');
    storedStates[employeeId] = newCanApply;
    localStorage.setItem('emergencyToggleStates', JSON.stringify(storedStates));
    toast.success(`Emergency Leave permission ${newCanApply ? 'enabled' : 'disabled'} for ${employee.employeeId}`);
  } catch (err) {
    console.error('Error toggling Emergency Leave permission:', err.response?.data || err.message);
    toast.error(err.response?.data?.message || 'Failed to update Emergency Leave permission');
  } finally {
    setEmergencyLoading(prev => ({ ...prev, [employeeId]: false }));
  }
};

const canShowEmergencyToggle = (employee) => {
  if (!user || !employee) return false;

  const userDeptId = user.department?._id?.toString();
  const employeeDeptId = employee.department?._id?.toString();

  // Admin can see toggle for all
  if (user.loginType === 'Admin') return true;

  // HOD can see toggle:
  if (user.loginType === 'HOD') {
    // For self
    if (user._id?.toString() === employee._id?.toString()) return true;

    // For employees in same department
    if (userDeptId && employeeDeptId && userDeptId === employeeDeptId) {
      return true;
    }
  }

  // CEO can toggle for HODs
  if (user.loginType === 'CEO') return true;

  return false;
};



  const handleFilter = () => {
    setCurrentPage(1);
  };

  const hodDepartmentName =
    loginType === 'HOD' && user?.department
      ? departments.find((dep) => dep._id === user.department._id)?.name || 'Unknown'
      : '';

  console.log('Rendering EmployeeList, loading:', loading, 'error:', error, 'employees:', employees.length);

  if (loading) {
    return (
      <ContentLayout title="Employee List">
        <div className="w-full max-w-6xl mx-auto">
          <div className="mb-6 flex flex-col md:flex-row gap-4">
            <Skeleton className="h-10 max-w-sm" />
            <Skeleton className="h-10 max-w-sm" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (error && employees.length === 0) {
    return (
      <ContentLayout title="Employee List">
        <div className="w-full max-w-6xl mx-auto">
          <p className="text-red-500">{error}</p>
        </div>
      </ContentLayout>
    );
  }

  try {
    return (
      <ContentLayout title="Employee List">
        <div className="w-full max-w-6xl mx-auto">
          {error && (
            <p className="text-yellow-500 mb-4">{error}</p>
          )}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
          >
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                placeholder="Search by name or ID"
                value={search}
                onChange={(e) => {
                  console.log('Search input changed:', e.target.value);
                  setSearch(e.target.value);
                }}
                className="mt-1 border-gray-300 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="departmentId">Department</Label>
              {loginType === 'HOD' ? (
                <Input
                  id="departmentId"
                  value={hodDepartmentName}
                  readOnly
                  className="mt-1 border-gray-300 bg-gray-100 cursor-not-allowed"
                  placeholder="Your Department"
                />
              ) : (
                <Select
                  onValueChange={(value) => {
                    setDepartmentFilter(value);
                    handleFilter();
                  }}
                  value={departmentFilter}
                  disabled={loading}
                >
                  <SelectTrigger
                    id="departmentId"
                    className="mt-1 border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <SelectValue placeholder="All Departments" />
                  </SelectTrigger>
                  <SelectContent className="z-50">
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments.map((dep) => (
                      <SelectItem key={dep._id} value={dep._id}>
                        {dep.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex gap-3 mt-6">
  <Button
    className="bg-gray-100 hover:bg-gray-200 text-black"
    onClick={() => handleDownloadXLSX(filteredEmployees)}
  >
    📊 Download XLSX
  </Button>

  <Button
    className="bg-gray-100 hover:bg-gray-200 text-black"
    onClick={() => handleDownloadPDF(filteredEmployees)}
  >
    📝 Download PDF
  </Button>
</div>

          </motion.div>
          {filteredEmployees.length === 0 ? (
            <div className="text-center py-8 bg-gray-100 rounded-lg">
              <p className="text-lg font-semibold text-gray-700">No employees found.</p>
              {departmentFilter !== 'all' && loginType !== 'HOD' && (
                <p className="text-sm text-gray-500 mt-2">
                  The selected department may not match any employees. Try selecting "All Departments".
                </p>
              )}
              {filteredEmployees.length === 0 && employees.length > 0 && departmentFilter === 'all' && (
                <p className="text-sm text-red-500 mt-2">
                  Warning: Some employees may not have a valid department assigned.
                </p>
              )}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Department</TableHead>
                    
                    <TableHead>Emergency Leave Toggle</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedEmployees.map(emp => (
                    <TableRow key={emp._id}>
                      <TableCell>{emp.employeeId}</TableCell>
                      <TableCell>{emp.name}</TableCell>
                      <TableCell>{emp.department?.name || 'N/A'}</TableCell>
         
                      <TableCell>
{canShowEmergencyToggle(emp) && (
  <div className="flex items-center space-x-2">
    <button
      onClick={() => handleEmergencyToggle(emp._id)}
      disabled={emergencyLoading[emp._id]}
      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors duration-200 ${
        emp.canApplyEmergencyLeave
          ? 'bg-green-700 text-white'
          : 'bg-red-700 text-white'
      } disabled:opacity-50`}
    >
      {emergencyLoading[emp._id] ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : emp.canApplyEmergencyLeave ? 'Enabled' : 'Disabled'}
    </button>
  </div>
)}

                      </TableCell>
                      <TableCell className="space-x-2">
                        <Button
                          onClick={() => handleViewDetails(emp)}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          View
                        </Button>
                        {loginType === 'Admin' && (
                          <>
                            <EmployeeUpdateForm
                              employee={emp}
                              onUpdate={handleUpdateSuccess}
                            />
                            <Button
                              onClick={() => handleDelete(emp._id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Delete
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                currentPage={currentPage}
                itemsPerPage={itemsPerPage}
                totalItems={filteredEmployees.length}
                onPageChange={setCurrentPage}
                onPageSizeChange={(size) => {
                  setItemsPerPage(size);
                  setCurrentPage(1);
                }}
              />
            </>
          )}
          {showDetails && selectedEmployeeForDetails && (
            <EmployeeDetails
              employee={selectedEmployeeForDetails}
              onClose={handleCloseDetailsModal}
              isAdmin={loginType === 'Admin'}
              onLockToggle={async (section) => {
                try {
                  const response = await api.patch(`/employees/${selectedEmployeeForDetails._id}/lock-section`, { section });
                  setSelectedEmployeeForDetails(response.data);
                  setEmployees(employees.map(emp => emp._id === response.data._id ? response.data : emp));
                  toast.success(`Section ${section} lock toggled successfully`);
                } catch (err) {
                  console.error('Error toggling section lock:', err.response?.data || err.message);
                  setError('Failed to toggle section lock. Please try again.');
                  toast.error(err.response?.data?.message || 'Failed to toggle section lock');
                }
              }}
              onEmployeeUpdate={handleEmployeeUpdate}
            />
          )}
        </div>
      </ContentLayout>
    );
  } catch (err) {
    console.error('Rendering error in EmployeeList:', err);
    return <div>Error rendering EmployeeList: {err.message}</div>;
  }
}

export default EmployeeList;