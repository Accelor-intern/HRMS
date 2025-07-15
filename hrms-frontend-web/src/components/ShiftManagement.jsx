import React, { useState, useEffect, useContext } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import ContentLayout from './ContentLayout';
import '../App.css';

function ShiftManagement() {
  const { user } = useContext(AuthContext);
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([
    { id: 'general', name: 'General', startTime: '09:00', endTime: '17:30' },
    { id: 'a-shift', name: 'Shift A', startTime: '06:00', endTime: '14:30' },
    { id: 'b-shift', name: 'Shift B', startTime: '14:00', endTime: '22:30' },
    { id: 'c-shift', name: 'Shift C', startTime: '22:00', endTime: '06:30' },
  ]);
  const [form, setForm] = useState({
    shiftId: '',
    name: '',
    startTime: '',
    endTime: '',
  });
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedShift, setSelectedShift] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);

  // Fetch employees based on user role and department
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
        const filtered = res.data.filter((emp) => emp.employeeId !== user?.employeeId);
        setEmployees(filtered);
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

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  const handleShiftSelect = (value) => {
    setSelectedShift(value);
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

 // Update the modal form's submit handler to handle editing
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
    setShowCreateModal(false); // Close modal after submission
  } catch (err) {
    console.error('Error processing shift:', err);
    alert('Error processing shift');
  } finally {
    setSubmitting(false);
  }
};

// Inside the ShiftManagement component, update the handleEditShift function
const handleEditShift = (shift) => {
  setForm({
    shiftId: shift.id,
    name: shift.name,
    startTime: shift.startTime,
    endTime: shift.endTime,
  });
  setIsEditing(true);
  setShowCreateModal(true); // Open the modal for editing
};

  const handleDeleteShift = (shiftId) => {
    if (window.confirm('Are you sure you want to delete this shift?')) {
      setShifts(shifts.filter((shift) => shift.id !== shiftId));
      if (form.shiftId === shiftId) {
        setForm({ shiftId: '', name: '', startTime: '', endTime: '' });
        setIsEditing(false);
      }
    }
  };

  const handleAssignShift = async (employeeId) => {
    if (!selectedShift) {
      alert('Please select a shift to assign');
      return;
    }

    setSubmitting(true);
    try {
      await api.patch(`/employees/${employeeId}/shift`, { shift: selectedShift });
      setEmployees(
        employees.map((emp) =>
          emp._id === employeeId ? { ...emp, shift: selectedShift } : emp
        )
      );
      alert('Shift assigned successfully');
      setSelectedEmployee(null);
      setSelectedShift('');
    } catch (err) {
      console.error('Error assigning shift:', err);
      alert(`Error: ${err.response?.data?.message || 'Failed to assign shift'}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ContentLayout title="Shift Manager">
     <div className="flex flex-col lg:flex-row gap-6 w-full max-w-[1600px] px-4 mx-auto">

        {/* Left Section: Employee List (2/3rds) */}
        <div className="w-full lg:w-2/3">
          <Card className="shadow-lg border h-full flex flex-col">
            <CardContent className="p-6 h-full flex flex-col">
              <h3 className="text-lg font-semibold text-green-700 mb-4">Employee List</h3>
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <p>Loading employees...</p>
                ) : employees.length === 0 ? (
                  <p>No employees found in your department.</p>
                ) : (
                  <div className="space-y-4">
                    {employees.map((employee) => (
                      <div
                        key={employee._id}
                        className={`p-4 rounded-lg border cursor-pointer ${
                          selectedEmployee === employee._id ? 'bg-gray-50' : 'bg-gray-50'
                        }`}
                        onClick={() => setSelectedEmployee(employee._id)}
                      >
                        <p className="font-semibold">{employee.name}</p>
                        <p className="text-sm text-gray-600">ID: {employee.employeeId}</p>
                        <p className="text-sm text-gray-600">
                          Current Shift: {employee.shift || 'Not Assigned'}
                        </p>
                        {selectedEmployee === employee._id && (
                          <div className="mt-2">
                            <Select
                              value={selectedShift}
                              onValueChange={handleShiftSelect}
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
                            <Button
                              className="mt-2 w-full bg-blue-800 hover:bg-blue-700 text-white"
                              onClick={() => handleAssignShift(employee._id)}
                              disabled={submitting || !selectedShift}
                            >
                              {submitting ? 'Assigning...' : 'Assign Shift'}
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Section: Existing Shifts and Create Button (1/3rd) */}
        <div className="w-full lg:w-1/3">
          <Card className="shadow-lg border h-full flex flex-col">
            <CardContent className="p-6 h-full flex flex-col">
              <h3 className="text-lg font-semibold text-green-700 mb-4">Shift Overview</h3>
              <div className="flex-1 overflow-y-auto mb-4">
                {shifts.length === 0 ? (
                  <p>No shifts defined.</p>
                ) : (
                  <div className="space-y-2">
                    {shifts.map((shift) => (
                      <div
                        key={shift.id}
                        className="flex justify-between items-center p-2 bg-gray-50 rounded-lg"
                      >
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
              </div>
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => {
                  setForm({ shiftId: '', name: '', startTime: '', endTime: '' });
                  setIsEditing(false);
                  setShowCreateModal(true);
                }}
                disabled={submitting}
              >
                Create Shift
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create Shift Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Shift</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleShiftSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name" className="text-blue-800">Shift Name</Label>
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
              <Label htmlFor="startTime" className="text-blue-800">Start Time</Label>
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
              <Label htmlFor="endTime" className="text-blue-800">End Time</Label>
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
                {submitting ? 'Creating...' : 'Create Shift'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}

export default ShiftManagement;