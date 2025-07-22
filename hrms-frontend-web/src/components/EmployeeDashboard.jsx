import React, { useEffect, useContext, useCallback, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/ui/table';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '../components/ui/select';
import { Button } from '../components/ui/button';
import api from '../services/api';
import { AuthContext } from '../context/AuthContext';
import ContentLayout from './ContentLayout';
import io from 'socket.io-client';
import OTTable from './OTTable';
import CompensatoryTable from './CompensatoryTable';
import Clock from 'react-clock';
import 'react-clock/dist/Clock.css';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css'; // Default styles



function EmployeeDashboard() {
  const { user } = useContext(AuthContext);
  const [data, setData] = useState({
    attendanceData: [],
    paidLeavesRemaining: { monthly: 0, yearly: 0 },
    unpaidLeavesTaken: 0,
    medicalLeaves: 0,
    restrictedHolidays: 0,
    compensatoryLeaves: 0,
    compensatoryAvailable: [],
    employeeAttendance: [], // Ensure initialized as array
    leaveRecords: [],
    overtimeHours: 0,
    otClaimRecords: [],
    unclaimedOTRecords: [],
    claimedOTRecords: [],
    unclaimedCompRecords: [],
    claimedCompRecords: [],
    odRecords: [],
    birthdayMessage: '',
    birthdayCountdown: '',
  });
  const [attendanceView, setAttendanceView] = useState('daily');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [socket, setSocket] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());

useEffect(() => {
  const interval = setInterval(() => setCurrentTime(new Date()), 1000);
  return () => clearInterval(interval);
}, []);

  const [isEligible, setIsEligible] = useState(false);
  const [greeting, setGreeting] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (user?.employeeId) {
      const socketInstance = io(import.meta.env.VITE_APP_API_URL || 'http://localhost:5000', {
        query: { employeeId: user.employeeId },
        transports: ['websocket', 'polling'],
        withCredentials: true,
      });

      socketInstance.on('connect', () => console.log('WebSocket connected'));
      socketInstance.on('connect_error', (err) => console.error('WebSocket connection error:', err.message));

      setSocket(socketInstance);

      return () => {
        socketInstance.disconnect();
        console.log('WebSocket disconnected');
      };
    }
  }, [user?.employeeId]);

  useEffect(() => {
  const interval = setInterval(() => setCurrentTime(new Date()), 1000);
  return () => clearInterval(interval);
}, []);

  const fetchData = useCallback(async () => {
    if (!user) {
      setError('User not authenticated. Please log in.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('Fetching employee info...');
      const employeeRes = await api.get('/dashboard/employee-info');
      console.log('Employee info response:', employeeRes.data);
      const {
        paidLeaves,
        medicalLeaves,
        restrictedHolidays,
        compensatoryLeaves,
        compensatoryAvailable,
        department,
        designation,
        dateOfBirth,
      } = employeeRes.data;

      // Eligibility check
      const eligibleDepartments = ['Production', 'Mechanical', 'AMETL'];
      const eligibleDesignations = ['Technician', 'Sr. Technician', 'Junior Engineer'];
      const isDeptEligible = department?.name && eligibleDepartments.includes(department.name);
      const isDesignationEligible = eligibleDesignations.includes(designation);
      setIsEligible(isDeptEligible && isDesignationEligible);

    
// Date handling for today (11:34 AM IST, July 14, 2025)
const now = new Date();
const istOffsetMs = 5.5 * 60 * 60 * 1000; // IST offset in milliseconds
const istNow = new Date(now.getTime() + istOffsetMs);

// Use current day for attendance fetch
const today = new Date(istNow);
const todayDateStr = today.toISOString().split('T')[0];
console.log('Fetching attendance for date:', todayDateStr);

const startOfDay = new Date(today);
startOfDay.setUTCHours(3, 45, 0, 0); // 9:15 AM IST (UTC+5:30)
const endOfDay = new Date(today);
endOfDay.setUTCHours(17, 30, 0, 0); // 6:00 PM IST

// Birthday calculation
let birthdayMessage = '';
let birthdayCountdown = '';
if (dateOfBirth) {
  const birthday = new Date(dateOfBirth);
  birthday.setFullYear(istNow.getFullYear());
  const isBirthdayToday = birthday.toDateString() === istNow.toDateString();
  const tomorrow = new Date(istNow);
  tomorrow.setDate(istNow.getDate() + 1);
  const isBirthdayTomorrow = birthday.toDateString() === tomorrow.toDateString();

  if (isBirthdayToday) {
    birthdayMessage = '🎉 Happy Birthday! Wishing you a fantastic day! 🎂';
  } else if (isBirthdayTomorrow) {
    const diffTime = Math.abs(birthday - istNow);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    birthdayCountdown = `🎁 Birthday Countdown: ${diffDays} day(s) left!`;
  }
} else {
  console.warn('dateOfBirth is missing or invalid in API response');
}

// Fetch attendance for the current day
console.log('Fetching attendance for date:', todayDateStr);
const attendanceRes = await api.get('/dashboard/attendance', {
  params: { date: todayDateStr },
});
console.log('Attendance response:', attendanceRes.data);

setData((prevData) => ({
  ...prevData,
  attendanceData: [],
  paidLeavesRemaining: { monthly: paidLeaves, yearly: user.employeeType === 'Confirmed' ? paidLeaves : 0 },
  unpaidLeavesTaken: employeeRes.data.unpaidLeavesTaken || 0,
  medicalLeaves: medicalLeaves || 0,
  restrictedHolidays: restrictedHolidays || 0,
  compensatoryLeaves: compensatoryLeaves || 0,
  compensatoryAvailable: compensatoryAvailable || [],
  employeeAttendance: Array.isArray(attendanceRes.data) ? attendanceRes.data : [], // Ensure always an array
  leaveRecords: [],
  overtimeHours: 0,
  restrictedHolidays,
  compensatoryLeaves,
  compensatoryAvailable,
  otClaimRecords: [],
  unclaimedOTRecords: [],
  claimedOTRecords: [],
  unclaimedCompRecords: [],
  claimedCompRecords: [],
  odRecords: [],
  birthdayMessage,
  birthdayCountdown,
}));
    } catch (err) {
      console.error('Dashboard fetch error:', err.response ? err.response.data : err.message);
      setError(err.response?.data?.message || 'Failed to fetch dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user, attendanceView]);

  useEffect(() => {
    fetchData();
    if (socket && user?.employeeId) {
      socket.on('notification', () => {
        console.log('Received notification, refreshing dashboard data');
        fetchData();
      });
      return () => socket.off('notification');
    }
  }, [fetchData, socket, user?.employeeId]);

  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening');
  }, []);

  if (loading) {
    return (
      <ContentLayout title="My Dashboard">
        <div className="text-center py-8">Loading...</div>
      </ContentLayout>
    );
  }

  if (error || !user) {
    return (
      <ContentLayout title="My Dashboard">
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded">
          {error || 'User not authenticated. Please log in.'}
        </div>
      </ContentLayout>
    );
  }

    const highlightStatus = (status) => {
    if (!status) return "-";
    const parts = status.split(" & ");
    return (
      <div>
        {parts.map((part, index) => (
          <div key={index}>
            {part.split(/(\s+)/).map((subPart, i) =>
              subPart === "FN:" || subPart === "AN:"
                ? <strong key={`${index}-${i}`}>{subPart}</strong>
                : subPart
            )}
          </div>
        ))}
      </div>
    );
  };

  const filteredAttendance = data.employeeAttendance.filter(emp =>
    emp.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  let cardCount = 3; // Casual, Unpaid, Compensatory

if (user.employeeType === 'Confirmed') {
  cardCount += 2; // Medical + Restricted Holiday
}


  return (
    <ContentLayout title="My Workspace">
      <div className="flex flex-col items-center w-full">
        {/* Greeting and Birthday */}
        <div className="w-full max-w-[1200px] bg-gradient-to-r from-blue-50 to-indigo-100 p-6 rounded-lg mb-6 text-center shadow-lg">
          <h1 className="text-3xl font-bold text-indigo-800">{`${greeting}, ${user?.name || 'HOD'}!`}</h1>
          {data.birthdayMessage && <p className="text-xl text-green-600 font-semibold mt-2 ">{data.birthdayMessage}</p>}
          {data.birthdayCountdown && <p className="text-lg text-yellow-600 font-medium mt-1">{data.birthdayCountdown}</p>}
        </div>

   <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 justify-items-center w-full max-w-[1200px] mb-8">

  {/* Casual Leave */}
  <Card className="w-full h-50 bg-gradient-to-br from-blue-100 to-blue-200 shadow-md hover:shadow-lg transition-shadow">
    <CardHeader className="p-4">
      <CardTitle className="text-lg font-semibold text-blue-900">Casual Leave</CardTitle>
    </CardHeader>
    <CardContent className="p-4 text-center">
      {user.employeeType === 'Confirmed' ? (
        <>
          <p className="text-2xl font-bold text-blue-700">
            Availed: {12 - data.paidLeavesRemaining.monthly}
          </p>
          <p className="text-md  text-blue-700">
            Allowed: 12
          </p>
          <p className="text-md text-blue-600">Balance: {data.paidLeavesRemaining.monthly}/12</p>
        </>
      ) : (
        <>
          <p className="text-2xl font-bold text-blue-700">
            Availed: {1 - data.paidLeavesRemaining.monthly}
          </p>
          <p className="text-md  text-blue-600">Allowed: 1</p>
          <p className="text-md text-blue-600">Balance: {data.paidLeavesRemaining.monthly}/1</p>
        </>
      )}
    </CardContent>
  </Card>

  {/* Medical Leave (only if Confirmed) */}
  {user.employeeType === 'Confirmed' && (
    <Card className="w-full h-50 bg-gradient-to-br from-green-100 to-green-200 shadow-md hover:shadow-lg transition-shadow">
      <CardHeader className="p-4">
        <CardTitle className="text-lg font-semibold text-green-900">Medical Leave</CardTitle>
      </CardHeader>
      <CardContent className="p-4 text-center">
        <p className="text-2xl font-bold text-green-700">Availed: {7 - data.medicalLeaves}</p>
        <p className="text-md  text-green-600">Allowed: [3, 4, 7]</p>
        <p className="text-md text-green-600">Balance: {data.medicalLeaves}/7</p>
      </CardContent>
    </Card>
  )}

  {/* Restricted Holiday (only if Confirmed) */}
  {user.employeeType === 'Confirmed' && (
    <Card className="w-full h-50 bg-gradient-to-br from-yellow-100 to-yellow-200 shadow-md hover:shadow-lg transition-shadow">
      <CardHeader className="p-4">
        <CardTitle className="text-lg font-semibold text-yellow-900">Restricted Holiday</CardTitle>
      </CardHeader>
      <CardContent className="p-4 text-center">
        <p className="text-2xl font-bold text-yellow-700">Availed: {1 - data.restrictedHolidays}</p>
        <p className="text-md text-yellow-600">Allowed: 1</p>
        <p className="text-md text-yellow-600">Balance: {data.restrictedHolidays}/1</p>
      </CardContent>
    </Card>
  )}

  {/* Unpaid Leave */}
  <Card className="w-full h-50 bg-gradient-to-br from-purple-100 to-purple-200 shadow-md hover:shadow-lg transition-shadow">
    <CardHeader className="p-4">
      <CardTitle className="text-lg font-semibold text-purple-900">Unpaid Leave (LWP)</CardTitle>
    </CardHeader>
    <CardContent className="p-4 text-center">
      <p className="text-2xl font-bold text-purple-700">Availed: {data.unpaidLeavesTaken}</p>
    </CardContent>
  </Card>

  {/* Compensatory Leave (always visible) */}
  <Card className="w-full h-50 bg-gradient-to-br from-teal-100 to-teal-200 shadow-md hover:shadow-lg transition-shadow">
    <CardHeader className="p-4">
      <CardTitle className="text-lg font-semibold text-teal-900">Compensatory Leave</CardTitle>
    </CardHeader>
    <CardContent className="p-4 text-center">
      <p className="text-2xl font-bold text-teal-700">{`Availed: ${data.compensatoryLeaves}`}</p>
      <p className="text-md text-teal-600">
        Balance: {(data.compensatoryAvailable?.length || 0)} entries
      </p>
    </CardContent>
  </Card>

{/* Conditionally show Clock Card if cardCount < 5 */}
  {cardCount < 5 && (
    <Card className="col-span-2 w-full h-50 bg-gradient-to-br from-gray-200 to-gray-200 shadow-md hover:shadow-lg transition-shadow">
      <CardContent className="p-4 h-full w-full flex flex-row items-center justify-around">
        
        {/* Analog Clock */}
        <div className="flex items-center justify-center w-1/2">
          <Clock value={currentTime} size={100} />
        </div>

        {/* Digital Time + Date */}
        <div className="flex flex-col items-center justify-center w-1/2 space-y-1">
          <p className="text-3xl font-bold text-blue-900">
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
          <p className="text-sm text-blue-900">
            {currentTime.toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })}
          </p>
        </div>

      </CardContent>
    </Card>
  )}


</div>





        {/* Attendance Records */}
        <div className="w-full max-w-[1200px] mb-8">
          <Card className="bg-white shadow-lg rounded-lg p-6">
            <CardHeader className="flex flex-row justify-between items-center mb-4">
              <CardTitle className="text-xl font-semibold text-gray-800">Attendance Records (Today)</CardTitle>
              <input
                type="text"
                placeholder="Search by name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </CardHeader>
            <CardContent>
              <Table className="min-w-full bg-white">
                <TableHeader>
                  <TableRow className="bg-gray-100">
                    <TableHead className="py-2 px-4 text-left text-gray-600">Employee ID</TableHead>
                    <TableHead className="py-2 px-4 text-left text-gray-600">Name</TableHead>
                    <TableHead className="py-2 px-4 text-left text-gray-600">Department</TableHead>
                    <TableHead className="py-2 px-4 text-left text-gray-600">LogIn Time</TableHead>

                    <TableHead className="py-2 px-4 text-left text-gray-600">Status</TableHead>
                  </TableRow>
                </TableHeader>
<TableBody>
  {Array.isArray(filteredAttendance) && filteredAttendance.length > 0 ? (
    filteredAttendance
   .filter((emp) => !(emp.employeeId === "23005"))
    .map((emp) => (
      <TableRow key={emp.employeeId} className="border-b hover:bg-gray-50">
        <TableCell className="py-2 px-4">{emp.employeeId}</TableCell>
        <TableCell className="py-2 px-4">{emp.name}</TableCell>
        <TableCell className="py-2 px-4">{emp.department || 'N/A'}</TableCell>
       <TableCell className="py-2 px-4">
  {emp.logInTime ? emp.logInTime : '-'}
</TableCell>

         <TableCell>
                                  {highlightStatus(emp.status)}
                                  {emp.halfDay ? ` (${emp.halfDay})` : ""}
                                </TableCell>
      </TableRow>
    ))
  ) : (
    <TableRow>
      <TableCell colSpan="5" className="py-2 px-4 text-center text-gray-500">
        {error ? error : 'No attendance records available for today.'}
      </TableCell>
    </TableRow>
  )}
</TableBody>
              </Table>
            </CardContent>
          </Card>

          
        </div>

        {/* Existing Attendance Chart */}
        <div className="mt-8 grid grid-cols-1 gap-6 w-full max-w-[1200px]">
         
          <Card>
            <CardHeader>
              <CardTitle>Unclaimed Compensatory Records</CardTitle>
            </CardHeader>
            <CardContent>
              <CompensatoryTable
                unclaimedCompRecords={data.unclaimedCompRecords}
                claimedCompRecords={data.claimedCompRecords}
                onClaimSuccess={fetchData}
              />
            </CardContent>
          </Card>
          {isEligible && (
            <Card>
              <CardHeader>
                <CardTitle>Unclaimed Overtime Records</CardTitle>
              </CardHeader>
              <CardContent>
                <OTTable
                  unclaimedOTRecords={data.unclaimedOTRecords}
                  claimedOTRecords={data.claimedOTRecords}
                  onClaimSuccess={fetchData}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </ContentLayout>
  );
}

export default EmployeeDashboard;