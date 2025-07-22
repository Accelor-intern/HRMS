import React, { useEffect, useState, useContext, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import ContentLayout from './ContentLayout';
import Pagination from './Pagination';
import { Card, CardContent } from '../components/ui/card';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';

function PunchMissedList() {
  const { user } = useContext(AuthContext);
  const initialFilters = useMemo(
    () => ({
      employeeId: user?.loginType === 'Employee' ? user?.employeeId || '' : '',
      departmentId:
        user?.loginType === 'HOD' && user?.department
          ? user.department._id
          : 'all',
      status: 'all',
    }),
    [user]
  );
  const [punchMissedForms, setPunchMissedForms] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [total, setTotal] = useState(0);
  const [selectedForm, setSelectedForm] = useState(null);
  const [adminInput, setAdminInput] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await api.get('/departments');
      setDepartments(res.data);
    } catch (err) {
      console.error('Error fetching departments:', err);
      setError('Failed to load departments');
    }
  }, []);

  const fetchPunchMissedForms = useCallback(async (filterParams) => {
    setLoading(true);
    setError(null);
    try {
      const normalizedFilters = { ...filterParams };
      if (normalizedFilters.departmentId === 'all') {
        delete normalizedFilters.departmentId;
      }
      const res = await api.get('/punch-missed', {
        params: { ...normalizedFilters, page: currentPage, limit: itemsPerPage },
      });
      setPunchMissedForms(res.data.punchMissedForms || []);
      setTotal(res.data.total || 0);
      if (res.data.punchMissedForms.length === 0) {
        setError('No Punch Missed Forms found.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load forms');
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage]);

  useEffect(() => {
    if (user?.loginType === 'HOD' && user?.department) {
      setDepartments([{ _id: user.department._id, name: user.department.name }]);
      fetchPunchMissedForms({
        ...initialFilters,
        departmentId: user.department._id,
      });
    } else if (user?.loginType === 'Employee') {
      fetchPunchMissedForms({
        ...initialFilters,
        employeeId: user?.employeeId || '',
      });
    } else if (user) {
      fetchDepartments();
      fetchPunchMissedForms(initialFilters);
    }
  }, [user, fetchDepartments, fetchPunchMissedForms, initialFilters]);

  const handleChange = (name, value) => {
    setFilters({ ...filters, [name]: value });
  };

  const handleFilter = () => {
    if (filters.employeeId && !/^[A-Za-z0-9]+$/.test(filters.employeeId)) {
      setError('Invalid Employee ID format.');
      return;
    }
    setCurrentPage(1);
    fetchPunchMissedForms(filters);
  };

  const handleView = (form) => {
    setSelectedForm(form);
    setAdminInput(form.adminInput || '');
    setDialogOpen(true);
  };

const handleSaveInput = async () => {
  if (!selectedForm || !/^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/i.test(adminInput)) {
    setError('Please enter a valid time format (e.g., 09:30 AM).');
    return;
  }
  setLoading(true);
  try {
    const response = await api.put(`/punch-missed/${selectedForm._id}`, {
      adminInput: adminInput,
    });
    setSelectedForm({ ...selectedForm, adminInput: response.data.punchMissed.adminInput });
    setError(null);
  } catch (err) {
    setError(err.response?.data?.message || 'Failed to save admin input');
  } finally {
    setLoading(false);
  }
};

const handleApprove = async (form) => {
  if (!form) return;
  if (
    user.loginType === 'Admin' &&
    !form.adminInput &&
    !/^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/i.test(adminInput)
  ) {
    setError('Please save a valid admin input before approving.');
    return;
  }
  setLoading(true);
  try {
    await api.put(`/punch-missed/${form._id}/approve`, {
      status: 'Approved',
      adminInput: user.loginType === 'Admin' ? (form.adminInput || adminInput) : undefined,
    });
    setDialogOpen(false);
    setSelectedForm(null);
    setAdminInput('');
    fetchPunchMissedForms(filters);
  } catch (err) {
    setError(err.response?.data?.message || 'Failed to approve form');
  } finally {
    setLoading(false);
  }
};

const handleReject = async (form) => {
  if (!form) return;
  setLoading(true);
  try {
    await api.put(`/punch-missed/${form._id}/approve`, {
      status: 'Rejected',
    });
    setDialogOpen(false);
    setSelectedForm(null);
    setAdminInput('');
    fetchPunchMissedForms(filters);
  } catch (err) {
    setError(err.response?.data?.message || 'Failed to reject form');
  } finally {
    setLoading(false);
  }
};

  const formatDateDisplay = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

const canApproveOrReject = (form) => {
  if (!form) return false; // Safety check for null/undefined forms
  if (user.loginType === 'HOD' && form.status.hod === 'Pending') return true;
  if (
    user.loginType === 'Admin' &&
    ["Approved", "Submitted"].includes(form.status.hod) &&
    form.status.admin === 'Pending'
  )
    return true;
  if (
    user.loginType === 'CEO' &&
    ["Approved", "Submitted"].includes(form.status.hod) &&
    form.status.admin === 'Approved' &&
    form.status.ceo === 'Pending'
  )
    return true;
  return false;
};

  const hodDepartmentName =
    user?.loginType === 'HOD' && user?.department
      ? departments.find((dep) => dep._id === user.department._id)?.name ||
        'Unknown'
      : '';

  return (
    <ContentLayout title="Punch Missed List">
      <Card className="w-full mx-auto shadow-lg border">
        <CardContent className="p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-100 text-red-700 rounded">
              {error}
            </div>
          )}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
          >
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="employeeId">Employee ID</Label>
              <Input
                id="employeeId"
                name="employeeId"
                value={filters.employeeId}
                onChange={(e) => handleChange('employeeId', e.target.value)}
                placeholder="Employee ID"
                disabled={user?.loginType === 'Employee'}
                className="mt-1 border-gray-300 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="departmentId">Department</Label>
              {user?.loginType === 'HOD' ? (
                <Input
                  id="departmentId"
                  value={hodDepartmentName}
                  readOnly
                  className="mt-1 border-gray-300 bg-gray-100 cursor-not-allowed"
                  placeholder="Your Department"
                />
              ) : user?.loginType === 'Employee' ? (
                <Input
                  id="departmentId"
                  value={user?.department?.name || 'Unknown'}
                  readOnly
                  className="mt-1 border-gray-300 bg-gray-100 cursor-not-allowed"
                  placeholder="Your Department"
                />
              ) : (
                <Select
                  onValueChange={(value) => handleChange('departmentId', value)}
                  value={filters.departmentId}
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
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="status">Approval Status (Any Stage)</Label>
              <Select
                onValueChange={(value) => handleChange('status', value)}
                value={filters.status}
                disabled={loading}
              >
                <SelectTrigger
                  id="status"
                  className="mt-1 border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                >
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent className="z-50">
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Approved">Approved</SelectItem>
                  <SelectItem value="Rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 items-end">
              <Button
                onClick={handleFilter}
                className="px-4 py-2 bg-blue-600 text-white"
                disabled={loading}
              >
                Filter
              </Button>
            </div>
          </motion.div>
          {loading ? (
            <p className="text-center py-4">Loading...</p>
          ) : punchMissedForms.length === 0 ? (
            <div className="text-center py-8 rounded-lg bg-gray-100">
              <p className="text-lg font-semibold">
                No Punch Missed Forms found.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table className="min-w-full">
                  <TableHeader>
                    <TableRow className="border-b">
                      <TableHead className="font-semibold">Employee ID</TableHead>
                      <TableHead className="font-semibold">Name</TableHead>
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="font-semibold">Punch Type</TableHead>
                      <TableHead className="font-semibold">Your Input</TableHead>
                      <TableHead className="font-semibold">Admin Input</TableHead>
                      <TableHead className="font-semibold">View</TableHead>
                      <TableHead className="font-semibold">HOD Status</TableHead>
                      <TableHead className="font-semibold">Admin Status</TableHead>
                      <TableHead className="font-semibold">CEO Status</TableHead>
                      <TableHead className="font-semibold">Action</TableHead>
                    </TableRow>
                  </TableHeader>
<TableBody>
  {punchMissedForms.map((form) => (
    <TableRow key={form._id} className="hover:bg-gray-50">
      <TableCell>{form.employeeId}</TableCell>
      <TableCell>{form.name}</TableCell>
      <TableCell>{formatDateDisplay(form.punchMissedDate)}</TableCell>
      <TableCell>{form.when}</TableCell>
      <TableCell>{form.yourInput}</TableCell>
      <TableCell>{form.adminInput || '-'}</TableCell>
      <TableCell>
        <Button
          onClick={() => handleView(form)}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          View
        </Button>
      </TableCell>
      <TableCell>{form.status.hod}</TableCell>
      <TableCell>{form.status.admin}</TableCell>
      <TableCell>{form.status.ceo}</TableCell>
      <TableCell>
        {canApproveOrReject(form) && (
          <div className="flex gap-2">
            <Button
              onClick={() => handleApprove(form)}
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={loading}
            >
              Approve
            </Button>
            <Button
              onClick={() => handleReject(form)}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={loading}
            >
              Reject
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  ))}
</TableBody>
                </Table>
              </div>
              <Pagination
                currentPage={currentPage}
                itemsPerPage={itemsPerPage}
                totalItems={total}
                onPageChange={setCurrentPage}
                onPageSizeChange={(size) => {
                  setItemsPerPage(size);
                  setCurrentPage(1);
                }}
              />
            </>
          )}
          {selectedForm && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Punch Missed Form Details</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">Employee ID</Label>
                    <span className="col-span-3">{selectedForm.employeeId}</span>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">Name</Label>
                    <span className="col-span-3">{selectedForm.name}</span>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">Date</Label>
                    <span className="col-span-3">
                      {formatDateDisplay(selectedForm.punchMissedDate)}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">Punch Type</Label>
                    <span className="col-span-3">{selectedForm.when}</span>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">Your Input</Label>
                    <span className="col-span-3">{selectedForm.yourInput}</span>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">Admin Input</Label>
                    {user.loginType === 'Admin' &&
                    selectedForm.status.admin === 'Pending' ? (
                      <Input
                        value={adminInput}
                        onChange={(e) => setAdminInput(e.target.value)}
                        placeholder="e.g., 09:30 AM"
                        className="col-span-3"
                      />
                    ) : (
                      <span className="col-span-3">
                        {selectedForm.adminInput || '-'}
                      </span>
                    )}
                  </div>
                </div>
          <DialogFooter>
  {user.loginType === 'Admin' && selectedForm.status.admin === 'Pending' && (
    <Button
      onClick={handleSaveInput}
      className="bg-blue-600 hover:bg-blue-700 text-white mr-2"
      disabled={loading || !adminInput || !/^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/i.test(adminInput)}
    >
      Save
    </Button>
  )}
  <Button
    onClick={() => setDialogOpen(false)}
    className="bg-gray-600 hover:bg-gray-700 text-white"
  >
    Close
  </Button>
</DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </CardContent>
      </Card>
    </ContentLayout>
  );
}

export default PunchMissedList;
