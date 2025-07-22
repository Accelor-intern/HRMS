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
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
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
  const [showCalendar, setShowCalendar] = useState(false);
  const [allocations, setAllocations] = useState([]);
  const [viewAllocations, setViewAllocations] = useState([]);
  const [todayShifts, setTodayShifts] = useState([]);
  const [editMode, setEditMode] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [todaySearchTerm, setTodaySearchTerm] = useState(''); // For Today's Shifts search
  const filteredEmployees = employees.filter((emp) =>
    emp.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredViewAllocations = viewAllocations.filter((alloc) =>
    alloc.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredTodayShifts = todayShifts.filter((shift) =>
    shift.name.toLowerCase().includes(todaySearchTerm.toLowerCase())
  );
  const currentDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).replace(/(\d+)\/(\d+)\/(\d+)/, '$1-$2-$3'); // Format to DD-MM-YYYY


  
  const getCalendarDates = () => {
    const dates = [];
    if (form.dateOut) {
      const from = new Date(form.dateOut);
      dates.push(from);
      if (form.dateIn) {
        const to = new Date(form.dateIn);
        let current = new Date(from);
        while (current <= to) {
          dates.push(new Date(current));
          current.setDate(current.getDate() + 1);
        }
      }
    }
    return dates;
  };

  // Calendar-related logic from ODForm.jsx
  const isHoliday = (date) => {
    const holidayList = [
      { month: 0, day: 26 },  // Republic Day
      { month: 2, day: 14 },  // Holi
      { month: 7, day: 15 },  // Independence Day
      { month: 9, day: 2 },   // Gandhi Jayanti
      { month: 9, day: 21 },  // Diwali
      { month: 9, day: 22 },  // Vishwakarma Day
      { month: 10, day: 5 },  // Guru Nanak Jayanti
    ];

    return (
      holidayList.some(h => date.getDate() === h.day && date.getMonth() === h.month) ||
      date.getDay() === 0
    );
  };

  const restrictedHolidayList = [
    { label: "Raksha Bandhan", date: new Date(2025, 7, 9) },
    { label: "Janmashtami", date: new Date(2025, 7, 16) },
    { label: "Karva Chauth", date: new Date(2025, 9, 9) },
    { label: "Christmas", date: new Date(2025, 11, 25) },
  ];

  const isRestrictedHoliday = (date) => {
    return restrictedHolidayList.some(
      (rh) => rh.date.toDateString() === date.toDateString()
    );
  };

  const tileClassName = ({ date, view }) => {
    if (view === "month") {
      const classes = [];
      if (isHoliday(date)) classes.push("bg-red-200");
      if (isRestrictedHoliday(date)) classes.push("restricted-holiday");
      if (date.getDay() === 0) classes.push("sun");
      if (getCalendarDates().some(d => d.toDateString() === date.toDateString())) {
        classes.push("bg-blue-200");
      }
      return classes.join(" ");
    }
    return "";
  };



  // Function to format dates to DD/MM/YYYY
  const formatDate = (dateStr) => {
    if (!dateStr || dateStr === '-') return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  // Calculate minimum date for Effective From (3 days ago)
  const getMinDate = () => {
    const minDate = new Date();
    minDate.setDate(minDate.getDate() - 3);
    return minDate.toISOString().split('T')[0];
  };

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
      .filter(
        (emp) =>
          emp.shift &&
          new Date(emp.shiftEffectiveFrom) <= new Date(today) &&
          (!emp.shiftValidUpto || new Date(emp.shiftValidUpto) >= new Date(today))
      )
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
        try {
          const shiftData = await api.get(`/employees/${emp._id}/shift`);
          return {
            ...emp,
            shift: shiftData.data.shift || '',
            shiftEffectiveFrom: shiftData.data.effectiveFrom || new Date().toISOString().split('T')[0],
            shiftValidUpto: shiftData.data.validUpto || null,
          };
        } catch (err) {
          console.error(`Error fetching shift for employee ${emp._id}:`, err);
          return {
            ...emp,
            shift: '',
            shiftEffectiveFrom: new Date().toISOString().split('T')[0],
            shiftValidUpto: null,
          };
        }
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
                : new Date().toISOString().split('T')[0],
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
              effectiveFrom: new Date().toISOString().split('T')[0],
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

    const effectiveFrom = allocation.effectiveFrom;
    let validUpto = allocation.validUpto;
    if (!validUpto || validUpto === '-') {
      const validUptoInput = new Date(effectiveFrom);
      validUptoInput.setDate(validUptoInput.getDate() + (allocation.noOfDays || 0));
      validUpto = validUptoInput.toISOString().split('T')[0];
    }

    if (new Date(validUpto) <= new Date(effectiveFrom)) {
      alert('Valid Upto must be a future date after Effective From');
      return;
    }

    setSubmitting(true);
    try {
      await api.patch(`/employees/${allocation._id}/shift`, {
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
      const enriched = await fetchShiftDetails(employees);
      fetchTodayShifts(enriched);
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
    const data = filteredTodayShifts.map((shift, index) => ({
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
    const effectiveFrom = allocation.effectiveFrom;
    let validUpto = allocation.validUpto;
    if (!validUpto || validUpto === '-') {
      const validUptoInput = new Date(effectiveFrom);
      validUptoInput.setDate(validUptoInput.getDate() + (allocation.noOfDays || 0));
      validUpto = validUptoInput.toISOString().split('T')[0];
    }

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
          a._id === allocation._id ? { ...a, validUpto } : a
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

  const allShiftTypes = [
    'General (09:00-17:30)',
    'Shift A (06:00-14:30)',
    'Shift B (14:00-22:30)',
    'Shift C (22:00-06:30)'
  ];

  const activeShifts = allShiftTypes
    .map(shift => ({
      name: shift,
      count: filteredTodayShifts.filter(s => s.shift === shift).length
    }))
    .filter(shift => shift.count > 0)
    .sort((a, b) => b.count - a.count);

  const getShiftDetails = (shiftId) => {
    const shift = shifts.find(s => s.id === shiftId);
    return shift ? `${shift.name} (${shift.startTime} - ${shift.endTime})` : shiftId;
  };

  return (
    <ContentLayout title="Shift Manager">
      <div className="flex flex-col lg:flex-row gap-6 w-full max-w-[1600px] min-h-screen px-4 mx-auto">
        <div className="w-full">
          <Card className="shadow-lg border h-full flex flex-col">
            <CardContent className="p-6 h-full flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-red-800">Today's Shifts - {currentDate}</h3>
                <div className="space-x-2">
                  <Button
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                    onClick={() => setShowViewAllocationModal(true)}
                  >
                    Manage Schedule
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
              <div className="mb-4">
                <Input
                  type="text"
                  placeholder="Search by employee name..."
                  value={todaySearchTerm}
                  onChange={(e) => setTodaySearchTerm(e.target.value)}
                  className="w-full max-w-xs"
                />
              </div>
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <p>Loading...</p>
                ) : filteredTodayShifts.length === 0 ? (
                  <p>No shifts assigned for today.</p>
                ) : (
                  <table className="w-full text-sm text-left border border-blue-800 border-collapse table-auto">
                    <thead className="bg-gray-100">
                      <tr className="text-blue-800 bg-blue-50 text-base">
                        <th className="px-4 py-2 border border-gray-300">S.No</th>
                        {activeShifts.map((shift, index) => (
                          <th key={index} className="px-4 py-2 border border-gray-300">
                            {shift.name.includes('(')
                              ? shift.name.split('(')[0].trim()
                              : shift.name}
                            <br />
                            ({shift.name.match(/\((.*?)\)/)?.[1]})
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...Array(Math.max(...activeShifts.map(s => s.count)))].map((_, rowIndex) => (
                        <tr key={rowIndex} className="border-b border-gray-300">
                          <td className="px-4 py-2 border border-gray-300">{rowIndex + 1}</td>
                          {activeShifts.map((shift, colIndex) => {
                            const names = filteredTodayShifts.filter(s => s.shift === shift.name);
                            return (
                              <td key={colIndex} className="px-4 py-2 border border-gray-300">
                                {names[rowIndex]?.name || ''}
                              </td>
                            );
                          })}
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
        <DialogContent className="w-[95vw] h-[95vh] max-w-none">
          <DialogHeader>
            <DialogTitle>Shift Allocation</DialogTitle>
          </DialogHeader>
          <div className="mb-4">
            <Input
              type="text"
              placeholder="Search by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full max-w-xs"
            />
          </div>
          <div className="overflow-x-auto h-[calc(95vh-120px)]">
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
                {filteredEmployees.map((emp, index) => {
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
                            <SelectValue placeholder="Select Shift">
                              {allocation.assignedShift
                                ? getShiftDetails(allocation.assignedShift)
                                : 'Select Shift'}
                            </SelectValue>
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
                          value={
                            allocation.effectiveFrom && allocation.effectiveFrom !== '-'
                              ? allocation.effectiveFrom
                              : new Date().toISOString().split('T')[0]
                          }
                          onChange={(e) =>
                            setAllocations(
                              allocations.map((a) =>
                                a._id === emp._id ? { ...a, effectiveFrom: e.target.value } : a
                              )
                            )
                          }
                          min={getMinDate()}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          value={allocation.noOfDays}
                          onChange={(e) => {
                            const days = parseInt(e.target.value) || 0;
                            const effectiveFrom = new Date(
                              allocation.effectiveFrom && allocation.effectiveFrom !== '-'
                                ? allocation.effectiveFrom
                                : new Date().toISOString().split('T')[0]
                            );
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
                      <td className="px-4 py-2">
                        {allocation.validUpto ? formatDate(allocation.validUpto) : '-'}
                      </td>
                      <td className="px-4 py-2">
                        <Button
                          onClick={() => handleAllocationSubmit(index)}
                          className="bg-green-600 hover:bg-green-700 text-white mr-2"
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
            {/* <Button
              type="button"
              onClick={() => setShowAllocationModal(false)}
              className="bg-gray-600 hover:bg-gray-700 text-white"
            >
              Close
            </Button> */}
          </DialogFooter>
        </DialogContent>
      </Dialog>

  <Dialog open={showViewAllocationModal} onOpenChange={setShowViewAllocationModal}>
  <DialogContent className="w-[100vw] max-w-[1700px] h-[102vh] p-0 overflow-hidden flex flex-col">
    <DialogHeader className="p-6 pb-4">
      <div className="flex justify-between items-center">
        <DialogTitle className="text-red-800"><span className="text-xl"> Manage Shift Schedule</span></DialogTitle>
        <Button
          onClick={() => setShowCalendar(!showCalendar)}
          className="bg-red-50 hover:bg-red-100 text-red-800 font-lg !mr-16 border border-red-800"
        >
          {showCalendar ? 'Hide Calendar' : "Refer Calendar"}
        </Button>
      </div>
    </DialogHeader>
    <div className="flex-1 flex overflow-hidden">
      {/* Main Content with Scrollable Table */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 mb-4">
          <Input
            type="text"
            placeholder="Search by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full max-w-xs"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-6">
          <div className="min-w-[900px] overflow-x-auto"> {/* Increased min-width and added overflow-x-auto */}
 <table className="w-full text-sm text-left text-black table-auto">
  <thead className="sticky top-0 bg-blue-50 text-blue-900 z-10">
    <tr>
      <th className="px-4 py-2 min-w-[100px]">Employee ID</th>
      <th className="px-4 py-2 min-w-[150px]">Name</th>
      <th className="px-4 py-2 min-w-[200px]">Assigned Shift</th>
      <th className="px-4 py-2 min-w-[120px]">Effective From</th>
      {editMode !== null && <th className="px-4 py-2 min-w-[100px]">No. of Days</th>}
      <th className="px-4 py-2 min-w-[120px]">Valid Upto</th>
      <th className="px-4 py-2 min-w-[100px]">Action</th>
    </tr>
  </thead>
  <tbody>
    {filteredViewAllocations.map((allocation, index) => (
      <tr key={index} className="border-b">
        <td className="px-4 py-2">{allocation.employeeId}</td>
        <td className="px-4 py-2">{allocation.name}</td>
        <td className="px-4 py-2 min-w-[200px] max-w-[200px] overflow-hidden">
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
              <SelectTrigger className="w-full truncate">
                <SelectValue placeholder="Select Shift">
                  {allocation.assignedShift
                    ? getShiftDetails(allocation.assignedShift)
                    : 'Select Shift'}
                </SelectValue>
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
            <span className="truncate">{getShiftDetails(allocation.assignedShift)}</span>
          )}
        </td>
        <td className="px-4 py-2 min-w-[120px]">
          {editMode === allocation._id ? (
            <Input
              type="date"
              value={
                allocation.effectiveFrom && allocation.effectiveFrom !== '-'
                  ? allocation.effectiveFrom
                  : new Date().toISOString().split('T')[0]
              }
              onChange={(e) => handleChangeViewAllocation(e, allocation)}
              name="effectiveFrom"
              min={getMinDate()}
              className="w-full"
            />
          ) : (
            formatDate(allocation.effectiveFrom)
          )}
        </td>
        {editMode !== null && (
          <td className="px-4 py-2 min-w-[100px]">
            {editMode === allocation._id ? (
              <Input
                type="number"
                min="0"
                value={allocation.noOfDays || ''}
                placeholder="Specify days for schedule"
                onChange={(e) => {
                  const days = parseInt(e.target.value) || 0;
                  const effectiveFrom = new Date(
                    allocation.effectiveFrom && allocation.effectiveFrom !== '-'
                      ? allocation.effectiveFrom
                      : new Date().toISOString().split('T')[0]
                  );
                  const validUpto = new Date(effectiveFrom);
                  validUpto.setDate(effectiveFrom.getDate() + days);
                  setViewAllocations(
                    viewAllocations.map((a) =>
                      a._id === allocation._id
                        ? {
                            ...a,
                            noOfDays: days,
                            validUpto: validUpto.toISOString().split('T')[0],
                          }
                        : a
                    )
                  );
                }}
                className="w-full pl-2"
              />
            ) : (
              '-' // Placeholder for non-edited rows
            )}
          </td>
        )}
        <td className="px-4 py-2 min-w-[120px]">
          {editMode === allocation._id ? (
            <Input
              type="date"
              value={
                allocation.validUpto && allocation.validUpto !== '-'
                  ? allocation.validUpto
                  : new Date().toISOString().split('T')[0]
              }
              onChange={(e) => handleChangeViewAllocation(e, allocation)}
              name="validUpto"
              className="w-full"
            />
          ) : (
            formatDate(allocation.validUpto)
          )}
        </td>
        <td className="px-4 py-2 min-w-[100px]">
          {editMode === allocation._id ? (
            <div className="flex space-x-2">
              <Button
                onClick={() => handleSaveEdit(allocation)}
                className="bg-green-600 hover:bg-green-700 text-white mr-2"
                size="sm"
              >
                Save
              </Button>
              <Button
                onClick={() => {
                  setEditMode(null);
                  setViewAllocations(prev =>
                    prev.map(a =>
                      a._id === allocation._id ? { ...a, noOfDays: a.noOfDays || '' } : a
                    )
                  );
                }}
                className="bg-red-600 hover:bg-red-700 text-white"
                size="sm"
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => handleEditAllocation(allocation)}
              className="bg-blue-700 hover:bg-blue-600 text-white"
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
        </div>
      </div>
      {/* Calendar Side Panel */}
      {showCalendar && (
        <div className="w-[360px] bg-gray-50 p-6 shadow-xl border-l border-gray-200 flex-shrink-0 overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-green-700">Calendar</h3>
          </div>
          <Calendar
            tileClassName={tileClassName}
            minDate={new Date()}
          />
          <div className="mt-4 space-y-1 text-sm text-gray-700">
            <p>
              <span className="inline-block w-4 h-4 bg-red-200 border border-red-400 mr-2"></span> Yearly Holiday (YH)
            </p>
            <p>
              <span className="inline-block w-4 h-4 bg-purple-200 border border-purple-400 mr-2"></span> Restricted Holiday (RH)
            </p>
          </div>
        </div>
      )}
    </div>
    <DialogFooter className="p-6 pt-4">
      {/* Optional Close button */}
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