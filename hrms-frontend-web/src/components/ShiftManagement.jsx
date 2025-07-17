import React, { useState, useEffect, useContext } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import ContentLayout from './ContentLayout';
import * as XLSX from 'xlsx';
import '../App.css';

function ShiftManagement() {
  const { user } = useContext(AuthContext);
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([
    { id: 'General (09:00-17:30)', name: 'General', startTime: '09:00', endTime: '17:30' },
    { id: 'Shift A (06:00-14:30)', name: 'Shift A', startTime: '06:00', endTime: '14:30' },
    { id: 'Shift B (14:00-22:30)', name: 'Shift B', startTime: '14:00', endTime: '22:30' },
    { id: 'Shift C (22:00-06:30)', name: 'Shift C', startTime: '22:00', endTime: '06:30' },
  ]);
  const [form, setForm] = useState({ shiftId: '', name: '', startTime: '', endTime: '' });
  const [submitting, setSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAllocationModal, setShowAllocationModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewAllocationModal, setShowViewAllocationModal] = useState(false);
  const [allocations, setAllocations] = useState([]);
  const [viewAllocations, setViewAllocations] = useState([]);
  const [todayShifts, setTodayShifts] = useState([]);
  const [editMode, setEditMode] = useState(null);
  const currentDate = new Date().toLocaleDateString('en-GB');

  useEffect(() => {
    const fetchEmployees = async () => {
      setLoading(true);
      try {
        let res;
        if (user?.loginType === 'HOD' && user?.department?._id) {
          res = await api.get(`/employees/by-department/${user.department._id}`);
        } else {
          res = await api.get('/employees');
        }
        const filtered = Array.isArray(res.data) ? res.data.filter((emp) => emp.employeeId !== user?.employeeId) : [];
        setEmployees(filtered);
        const enriched = await fetchShiftDetails(filtered);
        fetchTodayShifts(enriched);
        const allAllocations = await fetchAllShiftAllocations();
        setViewAllocations(allAllocations);
      } catch (err) {
        console.error('❌ Error fetching employees:', err?.response?.data || err.message);
        alert('Failed to load employees');
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchEmployees();
    }
  }, [user]);

  const fetchTodayShifts = (empList) => {
    const today = new Date().toISOString().split('T')[0];
    const shiftsToday = empList
      .filter((emp) => emp.shift && new Date(emp.shiftEffectiveFrom) <= new Date(today) && (!emp.shiftValidUpto || new Date(emp.shiftValidUpto) >= new Date(today)))
      .map((emp) => ({
        name: emp.name,
        employeeId: emp.employeeId,
        shift: emp.shift,
      }));
    setTodayShifts(shiftsToday);
  };

  const fetchShiftDetails = async (employeeList) => {
    const updatedAllocations = await Promise.all(
      employeeList.map(async (emp) => {
        const shiftData = await api.get(`/employees/${emp._id}/shift`);
        return {
          ...emp,
          shift: shiftData.data.shift || '',
          shiftEffectiveFrom: shiftData.data.effectiveFrom || new Date().toISOString().split('T')[0],
          shiftValidUpto: shiftData.data.validUpto || null,
        };
      })
    );
    setAllocations(updatedAllocations);
    return updatedAllocations;
  };

  const fetchAllShiftAllocations = async () => {
    try {
      let employeeRes;
      if (user?.loginType === 'HOD' && user?.department?._id) {
        employeeRes = await api.get(`/employees/by-department/${user.department._id}`);
      } else {
        employeeRes = await api.get('/employees');
      }
      const employees = Array.isArray(employeeRes.data)
        ? employeeRes.data.filter((emp) => emp.employeeId !== user?.employeeId)
        : [];
      const allocations = await Promise.all(
        employees.map(async (emp) => {
          try {
            const res = await api.get(`/employees/${emp._id}/shift`);
            return {
              employeeId: emp.employeeId,
              name: emp.name,
              assignedShift: res.data.shift || 'Not Assigned',
              effectiveFrom: res.data.effectiveFrom
                ? new Date(res.data.effectiveFrom).toISOString().split('T')[0]
                : '-',
              validUpto: res.data.validUpto
                ? new Date(res.data.validUpto).toISOString().split('T')[0]
                : '-',
              _id: emp._id,
            };
          } catch (err) {
            return {
              employeeId: emp.employeeId,
              name: emp.name,
              assignedShift: 'Not Assigned',
              effectiveFrom: '-',
              validUpto: '-',
              _id: emp._id,
            };
          }
        })
      );
      return allocations;
    } catch (err) {
      console.error('❌ Error fetching allocations:', err.message);
      alert('Failed to load shift allocations. See console for details.');
      return [];
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  const validateShiftForm = () => {
    if (!form.name) return 'Shift name is required';
    if (!form.startTime) return 'Start time is required';
    if (!form.endTime) return 'End time is required';
    if (!/^\d{2}:\d{2}$/.test(form.startTime) || !/^\d{2}:\d{2}$/.test(form.endTime)) {
      return 'Times must be in HH:MM format';
    }
    return null;
  };

  const handleShiftSubmit = async (e) => {
    e.preventDefault();
    const validationError = validateShiftForm();
    if (validationError) {
      alert(validationError);
      return;
    }
    setSubmitting(true);
    try {
      if (isEditing) {
        setShifts(shifts.map((shift) => (shift.id === form.shiftId ? { ...form, id: form.shiftId } : shift)));
        alert('Shift updated successfully');
      } else {
        const newShift = { ...form, id: `custom-${Date.now()}` };
        setShifts([...shifts, newShift]);
        alert('Shift created successfully');
      }
      setForm({ shiftId: '', name: '', startTime: '', endTime: '' });
      setIsEditing(false);
      setShowCreateModal(false);
    } catch (err) {
      console.error('Error processing shift:', err);
      alert('Error processing shift');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditShift = (shift) => {
    setForm({
      shiftId: shift.id,
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
    });
    setIsEditing(true);
    setShowCreateModal(true);
  };

const handleAllocationSubmit = async (index) => {
  const allocation = allocations.find((a) => a._id === employees[index]._id);
  if (!allocation?.assignedShift || allocation.assignedShift === '') {
    alert('Please select a shift to assign');
    return;
  }

  // Convert input dates to ISO format
  const effectiveFrom = new Date(allocation.effectiveFrom).toISOString().split('T')[0];
  let validUpto;
  if (allocation.validUpto) {
    validUpto = new Date(allocation.validUpto).toISOString().split('T')[0];
  } else {
    const validUptoInput = new Date(effectiveFrom);
    validUptoInput.setDate(validUptoInput.getDate() + (allocation.noOfDays || 0));
    validUpto = validUptoInput.toISOString().split('T')[0];
  }

  // Debug log to check dates
  console.log('Effective From:', effectiveFrom);
  console.log('Valid Upto:', validUpto);
  console.log('Comparison:', new Date(validUpto) > new Date(effectiveFrom));

  // Client-side validation
  if (new Date(validUpto) <= new Date(effectiveFrom)) {
    alert('Valid Upto must be a future date after Effective From');
    return;
  }

  setSubmitting(true);
  try {
    const response = await api.patch(`/employees/${allocation._id}/shift`, {
      shift: allocation.assignedShift,
      effectiveFrom,
      validUpto,
    });
    setAllocations(
      allocations.map((alloc) =>
        alloc._id === allocation._id ? { ...alloc, validUpto } : alloc
      )
    );
    alert('Allocation saved successfully');
    fetchTodayShifts(employees);
    const allAllocations = await fetchAllShiftAllocations();
    setViewAllocations(allAllocations);
    setAllocations(
      allocations.map((a) =>
        a._id === allocation._id ? { ...a, isSaved: true } : a
      )
    );
  } catch (err) {
    console.error('Error updating shift:', err.response?.data || err.message);
    alert('Error updating shift: ' + (err.response?.data?.message || err.message));
  } finally {
    setSubmitting(false);
  }
};

  const handleDownload = () => {
    const data = todayShifts.map((shift, index) => ({
      'S.No': index + 1,
      'General Shift': shift.shift === 'General (09:00-17:30)' ? shift.name : '',
      'Shift A': shift.shift === 'Shift A (06:00-14:30)' ? shift.name : '',
      'Shift B': shift.shift === 'Shift B (14:00-22:30)' ? shift.name : '',
      'Shift C': shift.shift === 'Shift C (22:00-06:30)' ? shift.name : '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'TodayShifts');
    XLSX.writeFile(wb, 'today_shift_data.xlsx');
  };

  const handleEditAllocation = (allocation) => {
    setEditMode(allocation._id);
  };

const handleSaveEdit = async (allocation) => {
  const effectiveFrom = new Date(allocation.effectiveFrom).toISOString().split('T')[0];
  let validUpto;
  if (allocation.validUpto) {
    validUpto = new Date(allocation.validUpto).toISOString().split('T')[0];
  } else {
    const validUptoInput = new Date(effectiveFrom);
    validUptoInput.setDate(validUptoInput.getDate() + (allocation.noOfDays || 0));
    validUpto = validUptoInput.toISOString().split('T')[0];
  }

  console.log('Effective From:', effectiveFrom);
  console.log('Valid Upto:', validUpto);
  console.log('Comparison:', new Date(validUpto) > new Date(effectiveFrom));

  if (new Date(validUpto) <= new Date(effectiveFrom)) {
    alert('Valid Upto must be a future date after Effective From');
    return;
  }

  try {
    await api.patch(`/employees/${allocation._id}/shift`, {
      shift: allocation.assignedShift,
      effectiveFrom,
      validUpto,
    });
    setViewAllocations(
      viewAllocations.map((a) =>
        a._id === allocation._id ? { ...allocation, validUpto } : a
      )
    );
    alert('Allocation updated successfully');
    setEditMode(null);
  } catch (err) {
    console.error('Error updating shift:', err.response?.data || err.message);
    alert('Error updating shift: ' + (err.response?.data?.message || err.message));
  }
};

  const handleChangeViewAllocation = (e, allocation) => {
    const { name, value } = e.target;
    setViewAllocations(
      viewAllocations.map((a) =>
        a._id === allocation._id ? { ...a, [name]: value } : a
      )
    );
  };

  return (
    <ContentLayout title="Shift Manager">
      <div className="flex flex-col lg:flex-row gap-6 w-full max-w-[1600px] min-h-screen px-4 mx-auto">
        <div className="w-full">
          <Card className="shadow-lg border h-full flex flex-col">
            <CardContent className="p-6 h-full flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-green-700">Today's Shifts - {currentDate}</h3>
                <div className="space-x-2">
                  <Button
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => setShowAllocationModal(true)}
                  >
                    Shift Allocation
                  </Button>
                  <Button
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                    onClick={() => setShowViewAllocationModal(true)}
                  >
                    View Shift Allocation
                  </Button>
                  <Button
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={handleDownload}
                  >
                    Download as XLSX
                  </Button>
                  <Button
                    className="bg-yellow-600 hover:bg-yellow-700 text-white"
                    onClick={() => setShowCreateModal(true)}
                  >
                    Shift Overview
                  </Button>
                </div>
              </div>
             <div className="flex-1 overflow-y-auto">
  {loading ? (
    <p>Loading...</p>
  ) : todayShifts.length === 0 ? (
    <p>No shifts assigned for today.</p>
  ) : (
    <table className="w-full text-sm text-left border-collapse">
      <thead className="bg-gray-100">
        <tr>
          <th className="px-4 py-2 border border-gray-300">S.No</th>
          <th className="px-4 py-2 border border-gray-300">General Shift<br/>(09:00 - 17:30)</th>
          <th className="px-4 py-2 border border-gray-300">Shift A<br/>(06:00 - 14:30)</th>
          <th className="px-4 py-2 border border-gray-300">Shift B<br/>(14:00 - 22:30)</th>
          <th className="px-4 py-2 border border-gray-300">Shift C<br/>(22:00 - 06:30)</th>
        </tr>
      </thead>
      <tbody>
        {[...Array(Math.max(
          ...['General (09:00-17:30)', 'Shift A (06:00-14:30)', 'Shift B (14:00-22:30)', 'Shift C (22:00-06:30)']
            .map(shift => todayShifts.filter(s => s.shift === shift).length)
        ))].map((_, rowIndex) => (
          <tr key={rowIndex} className="border-b border-gray-300">
            <td className="px-4 py-2 border border-gray-300">{rowIndex + 1}</td>
            <td className="px-4 py-2 border border-gray-300">
              {todayShifts.filter(s => s.shift === 'General (09:00-17:30)')[rowIndex]?.name || ''}
            </td>
            <td className="px-4 py-2 border border-gray-300">
              {todayShifts.filter(s => s.shift === 'Shift A (06:00-14:30)')[rowIndex]?.name || ''}
            </td>
            <td className="px-4 py-2 border border-gray-300">
              {todayShifts.filter(s => s.shift === 'Shift B (14:00-22:30)')[rowIndex]?.name || ''}
            </td>
            <td className="px-4 py-2 border border-gray-300">
              {todayShifts.filter(s => s.shift === 'Shift C (22:00-06:30)')[rowIndex]?.name || ''}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )}
</div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showAllocationModal} onOpenChange={setShowAllocationModal}>
        <DialogContent className="max-w-7xl">
          <DialogHeader>
            <DialogTitle>Shift Allocation</DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-500">
              <thead className="sticky top-0 bg-gray-100">
                <tr>
                  <th className="px-4 py-2">Employee ID</th>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Assigned Shift</th>
                  <th className="px-4 py-2">Effective From</th>
                  <th className="px-4 py-2">No. of Days</th>
                  <th className="px-4 py-2">Valid Upto</th>
                  <th className="px-4 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp, index) => {
                  const allocation = allocations.find((a) => a._id === emp._id) || {
                    _id: emp._id,
                    name: emp.name,
                    assignedShift: emp.shift || '',
                    effectiveFrom: new Date().toISOString().split('T')[0],
                    noOfDays: 0,
                  };
                  if (!allocations.find((a) => a._id === emp._id)) {
                    setAllocations([...allocations, allocation]);
                  }
                  return (
                    <tr key={emp._id} className="border-b">
                      <td className="px-4 py-2">{emp.employeeId}</td>
                      <td className="px-4 py-2">{emp.name}</td>
                      <td className="px-4 py-2">
                        <Select
                          value={allocation.assignedShift}
                          onValueChange={(value) =>
                            setAllocations(
                              allocations.map((a) =>
                                a._id === emp._id ? { ...a, assignedShift: value } : a
                              )
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select Shift" />
                          </SelectTrigger>
                          <SelectContent>
                            {shifts.map((shift) => (
                              <SelectItem key={shift.id} value={shift.id}>
                                {shift.name} ({shift.startTime} - {shift.endTime})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="date"
                          value={allocation.effectiveFrom}
                          onChange={(e) =>
                            setAllocations(
                              allocations.map((a) =>
                                a._id === emp._id ? { ...a, effectiveFrom: e.target.value } : a
                              )
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          value={allocation.noOfDays}
                          onChange={(e) => {
                            const days = parseInt(e.target.value) || 0;
                            const effectiveFrom = new Date(allocation.effectiveFrom);
                            const validUpto = new Date(effectiveFrom);
                            validUpto.setDate(effectiveFrom.getDate() + days);
                            setAllocations(
                              allocations.map((a) =>
                                a._id === emp._id
                                  ? { ...a, noOfDays: days, validUpto: validUpto.toISOString().split('T')[0] }
                                  : a
                              )
                            );
                          }}
                          min="0"
                        />
                      </td>
                      <td className="px-4 py-2">{allocation.validUpto || '-'}</td>
                      <td className="px-4 py-2">
                        <Button
                          onClick={() => handleAllocationSubmit(index)}
                          className="bg-blue-600 hover:bg-blue-700 text-white mr-2"
                          size="sm"
                          disabled={allocation.isSaved}
                        >
                          Save
                        </Button>
                       
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => setShowAllocationModal(false)}
              className="bg-gray-600 hover:bg-gray-700 text-white"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showViewAllocationModal} onOpenChange={setShowViewAllocationModal}>
        <DialogContent className="max-w-7xl">
          <DialogHeader>
            <DialogTitle>View Shift Allocation</DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-500">
              <thead className="sticky top-0 bg-gray-100">
                <tr>
                  <th className="px-4 py-2">Employee ID</th>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Assigned Shift</th>
                  <th className="px-4 py-2">Effective From</th>
                  <th className="px-4 py-2">Valid Upto</th>
                  <th className="px-4 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {viewAllocations.map((allocation, index) => (
                  <tr key={index} className="border-b">
                    <td className="px-4 py-2">
                      {editMode === allocation._id ? (
                        <Input
                          value={allocation.employeeId}
                          onChange={(e) => handleChangeViewAllocation(e, allocation)}
                          name="employeeId"
                          disabled
                        />
                      ) : (
                        allocation.employeeId
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {editMode === allocation._id ? (
                        <Input
                          value={allocation.name}
                          onChange={(e) => handleChangeViewAllocation(e, allocation)}
                          name="name"
                          disabled
                        />
                      ) : (
                        allocation.name
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {editMode === allocation._id ? (
                        <Select
                          value={allocation.assignedShift}
                          onValueChange={(value) =>
                            setViewAllocations(
                              viewAllocations.map((a) =>
                                a._id === allocation._id ? { ...a, assignedShift: value } : a
                              )
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select Shift" />
                          </SelectTrigger>
                          <SelectContent>
                            {shifts.map((shift) => (
                              <SelectItem key={shift.id} value={shift.id}>
                                {shift.name} ({shift.startTime} - {shift.endTime})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        allocation.assignedShift
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {editMode === allocation._id ? (
                        <Input
                          type="date"
                          value={allocation.effectiveFrom}
                          onChange={(e) => handleChangeViewAllocation(e, allocation)}
                          name="effectiveFrom"
                        />
                      ) : (
                        allocation.effectiveFrom
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {editMode === allocation._id ? (
                        <Input
                          type="date"
                          value={allocation.validUpto}
                          onChange={(e) => handleChangeViewAllocation(e, allocation)}
                          name="validUpto"
                        />
                      ) : (
                        allocation.validUpto
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {editMode === allocation._id ? (
                        <Button
                          onClick={() => handleSaveEdit(allocation)}
                          className="bg-blue-600 hover:bg-blue-700 text-white mr-2"
                          size="sm"
                        >
                          Save
                        </Button>
                      ) : (
                        <Button
                          onClick={() => handleEditAllocation(allocation)}
                          className="bg-yellow-600 hover:bg-yellow-700 text-white"
                          size="sm"
                        >
                          Edit
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => setShowViewAllocationModal(false)}
              className="bg-gray-600 hover:bg-gray-700 text-white"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Shift' : 'Create New Shift'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleShiftSubmit} className="space-y-4">
            <div>
              <Input
                id="name"
                name="name"
                type="text"
                value={form.name}
                onChange={handleFormChange}
                placeholder="e.g., Night Shift"
                required
              />
            </div>
            <div>
              <Input
                id="startTime"
                name="startTime"
                type="time"
                value={form.startTime}
                onChange={handleFormChange}
                required
              />
            </div>
            <div>
              <Input
                id="endTime"
                name="endTime"
                type="time"
                value={form.endTime}
                onChange={handleFormChange}
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="bg-gray-600 hover:bg-gray-700 text-white mr-2"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {submitting ? 'Saving...' : isEditing ? 'Update Shift' : 'Create Shift'}
              </Button>
            </DialogFooter>
          </form>
          {!isEditing && (
            <div className="mt-4 overflow-y-auto max-h-60">
              {shifts.map((shift) => (
                <div key={shift.id} className="flex justify-between items-center p-2 bg-gray-50 rounded-lg mb-2">
                  <span className="text-sm">
                    {shift.name} ({shift.startTime} - {shift.endTime})
                  </span>
                  <Button
                    onClick={() => handleEditShift(shift)}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white text-sm px-2 py-1"
                    size="sm"
                  >
                    Edit
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}

export default ShiftManagement;