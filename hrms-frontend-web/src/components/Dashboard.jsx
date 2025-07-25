import React, { useEffect, useState, useContext, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '../components/ui/select';
import { Button } from '../components/ui/button';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/ui/table';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { AuthContext } from '../context/AuthContext';
import ContentLayout from './ContentLayout';
import * as XLSX from 'xlsx';

function Dashboard() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [data, setData] = useState({
    confirmedEmployees: 0,
    probationEmployees: 0,
    ojtEmployees: 0,
    apprenticeEmployees: 0,
    contractualEmployees: 0,
    internEmployees: 0,
    presentToday: 0,
    pendingLeaves: 0,
    pendingOD: 0,
    pendingPunchMissed: 0,
    attendance: [],
  });
  const [chartData, setChartData] = useState([]);
  const [chartType, setChartType] = useState('gender');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const reservedFileRef = useRef(null);
  const yearlyFileRef = useRef(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [greeting, setGreeting] = useState('');
  const [quote, setQuote] = useState('');
  const [birthdayMessage, setBirthdayMessage] = useState('');
  const [anniversaryMessage, setAnniversaryMessage] = useState('');
  const [holidayMessage, setHolidayMessage] = useState('');
  const [showHolidayMessage, setShowHolidayMessage] = useState(false);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28'];

  useEffect(() => {
    const fetchData = async () => {
      if (!user) {
        setError('User not authenticated. Please log in.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Use current date in IST for other API calls
        const now = new Date();
        const istOffsetMs = 5.5 * 60 * 60 * 1000;
        const today = new Date(now.getTime() + istOffsetMs);
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        // Fetch stats, employees, attendance, leaves, OD, and punch missed records
        const [statsRes, employeesRes, attendanceRes, leavesRes, odRes, punchMissedRes] = await Promise.all([
          api.get('/dashboard/stats').catch(() => ({ data: {} })),
          api.get('/employees').catch(() => ({ data: [] })),
          api.get('/attendance').catch(() => ({ data: [] })),
          api.get(`/leaves?fromDate=${startOfMonth.toISOString().split('T')[0]}&toDate=${endOfMonth.toISOString().split('T')[0]}&status=Pending`).catch(() => ({ data: [] })),
          api.get(`/od?status=Pending`).catch(() => ({ data: { odRecords: [] } })),
          api.get(`/punch-missed?status=Pending`).catch(() => ({ data: { punchMissedForms: [] } })),
        ]);

        const statsData = statsRes.data || {};
        const employees = Array.isArray(employeesRes.data) ? employeesRes.data : [];
        const attendanceRecords = Array.isArray(attendanceRes.data) ? attendanceRes.data : [];
        const leaveRecords = Array.isArray(leavesRes.data) ? leavesRes.data : [];
        const odRecords = Array.isArray(odRes.data.odRecords) ? odRes.data.odRecords : [];
        const punchMissedRecords = Array.isArray(punchMissedRes.data.punchMissedForms) ? punchMissedRes.data.punchMissedForms : [];

        // Filter attendance records by search term (client-side)
        const filteredAttendance = attendanceRecords.filter(record =>
          record.name.toLowerCase().includes(searchTerm.toLowerCase())
        );

        setData({
          confirmedEmployees: statsData.confirmedEmployees || 0,
          probationEmployees: statsData.probationEmployees || 0,
          ojtEmployees: statsData.ojtEmployees || 0,
          apprenticeEmployees: statsData.apprenticeEmployees || 0,
          contractualEmployees: statsData.contractualEmployees || 0,
          internEmployees: statsData.internEmployees || 0,
          presentToday: statsData.presentToday || 0,
         pendingLeaves: statsData.pendingLeaves || 0,
pendingOD: statsData.pendingOD || 0,
pendingPunchMissed: statsData.pendingPunchMissed || 0,

          attendance: filteredAttendance,
        });

        // Gender, punctuality, and regularity calculations
        const genderCounts = employees.reduce((acc, emp) => {
          const gender = emp.gender || 'Other';
          acc[gender] = (acc[gender] || 0) + 1;
          return acc;
        }, {});
        const genderData = Object.entries(genderCounts).map(([name, count]) => ({ name, count }));

        const punctualityData = employees.map(emp => {
          const employeeAttendance = filteredAttendance.filter(a => a.employeeId === emp.employeeId && a.status.includes('Present'));
          const onTime = employeeAttendance.filter(a => {
            const [hours, minutes] = (a.logInTime || '').split(':').map(Number);
            return hours < 9 || (hours === 9 && minutes <= 15);
          }).length;
          const late = employeeAttendance.filter(a => {
            const [hours, minutes] = (a.logInTime || '').split(':').map(Number);
            return hours >= 9 && minutes > 15;
          }).length;
          return { name: emp.name, onTime, late };
        }).filter(emp => emp.onTime > 0 || emp.late > 0);

        const regularityData = employees.map(emp => {
          const employeeAttendance = filteredAttendance.filter(a => a.employeeId === emp.employeeId && a.status.includes('Present'));
          const totalDays = Math.ceil((endOfMonth - startOfMonth) / (1000 * 60 * 60 * 24));
          const presentDays = employeeAttendance.length;
          const leaveDays = leaveRecords.filter(l => l.employeeId === emp.employeeId && l.status === 'Approved').length;
          const workableDays = totalDays - leaveDays;
          const regularity = workableDays > 0 ? (presentDays / workableDays) * 100 : 0;
          return { name: emp.name, regularity: Math.round(regularity) };
        }).filter(emp => emp.regularity > 0);

        if (chartType === 'gender') {
          setChartData(genderData);
        } else if (chartType === 'punctuality') {
          setChartData(punctualityData);
        } else if (chartType === 'regularity') {
          setChartData(regularityData);
        }

        // Birthday, anniversary, and holiday checks
        const birthdayEmployees = employees.filter(emp => {
          if (!emp.dateOfBirth) return false;
          const dob = new Date(emp.dateOfBirth);
          return dob.getMonth() === today.getMonth() && dob.getDate() === today.getDate();
        });
        if (birthdayEmployees.length > 0) {
          setBirthdayMessage(`🎉 It's ${birthdayEmployees.map(emp => emp.name).join(', ')}'s Birthday!`);
          setTimeout(() => setBirthdayMessage(''), 5 * 60 * 60 * 1000);
        }

        const anniversaryEmployees = employees.filter(emp => {
          if (!emp.dateOfJoining) return false;
          const joinDate = new Date(emp.dateOfJoining);
          return joinDate.getMonth() === today.getMonth() && joinDate.getDate() === today.getDate();
        });
        if (anniversaryEmployees.length > 0) {
          setAnniversaryMessage(`🎊 Congratulations to ${anniversaryEmployees.map(emp => emp.name).join(', ')} on their work anniversary!`);
        }

        const todayDate = today.getDate();
        const todayMonth = today.getMonth();
        if (todayDate === 15 && todayMonth === 7) {
          setHolidayMessage('Happy Independence Day! Celebrate freedom and unity!');
          setShowHolidayMessage(true);
          setTimeout(() => setShowHolidayMessage(false), 7000);
        }
      } catch (error) {
        console.error('Dashboard fetch error:', error);
        setError('Failed to fetch dashboard data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    // Set greeting and quote based on current IST time
    const now = new Date();
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const today = new Date(now.getTime() + istOffsetMs);
    const hour = today.getHours();
    setGreeting(hour < 12 ? 'Good Evening' : hour < 17 ? 'Good Evening' : 'Good Afternoon');

    const quotes = [
      'Fall in love with the process ❤️‍🔥✨',
      'Keep pushing forward 🚀💼',
      'Embrace the journey 🌄🛤️',
      'Stay focused, stay strong 🎯💪',
      'Believe in Yourself 💡✨',
      'Trust the Process 🌱🙌',
      'This too shall pass🌱🙌',
    ];

    const quoteIndex = Math.floor(Math.random() * quotes.length);
    setQuote(quotes[quoteIndex]);

    fetchData();
  }, [user, chartType, searchTerm]);

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleFileUpload = async (event, type) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      setUploadStatus(`Uploading ${type} holidays...`);
      const reader = new FileReader();
      reader.onload = async (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', raw: false, dateNF: 'yyyy-mm-dd' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        const holidays = jsonData.map((row) => ({
          name: row['Name'] || row['Holiday Name'] || row['Holiday'] || '',
          date: row['Date'] ? new Date(row['Date']).toISOString() : null,
          type: type,
          note: row['Note'] || row['Description'] || row['Comments'] || '',
        })).filter((holiday) => holiday.name && holiday.date && !isNaN(new Date(holiday.date).getTime()));

        if (holidays.length === 0) {
          setUploadStatus('No valid holidays found in the file. Ensure Name and Date columns are present and valid.');
          setTimeout(() => setUploadStatus(null), 5000);
          return;
        }

        const response = await api.post('/holidays/upload', { holidays }, {
          headers: { 'Content-Type': 'application/json' },
        });
        setUploadStatus(`${type} holidays uploaded successfully!`);
        setTimeout(() => setUploadStatus(null), 5000);
      };
      reader.readAsArrayBuffer(file);
    } catch (error) {
      setUploadStatus(`Failed to upload ${type} holidays: ${error.response?.data?.message || 'Invalid data or server error.'}`);
      setTimeout(() => setUploadStatus(null), 5000);
    }
  };

  const filteredAttendance = data.attendance.filter(emp =>
    emp.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <ContentLayout title={user?.loginType === 'Admin' ? 'HR Panel' : 'HoD Panel'}>
        <div className="text-center py-8">Loading...</div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title={user?.loginType === 'Admin' ? 'HR Panel' : 'HoD Panel'}>
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded">{error}</div>
      </ContentLayout>
    );
  }

  return (
   <ContentLayout title={
  user?.loginType === 'Admin'
    ? 'HR Panel'
    : user?.loginType === 'CEO'
    ? 'CEO Panel'
    : 'HoD Panel'
}>

      <div className="flex flex-col items-center w-full">
        {/* Greeting, Quote, Birthday, Anniversary, and Holiday Messages */}
        <div className="w-full max-w-[1200px] bg-gradient-to-r from-blue-50 to-indigo-100 p-6 rounded-lg mb-6 text-center shadow-lg relative">
          <h1 className="text-3xl font-bold text-indigo-800">{`${greeting}, ${user?.name || 'User'}!`}</h1>
          <p className="text-lg text-green-600 font-semibold mt-2">{quote}</p>
          {birthdayMessage && (
            <p className="text-xl text-blue-600 font-semibold mt-2">{birthdayMessage}</p>
          )}
          {anniversaryMessage && (
            <p className="text-xl text-blue-600 font-semibold mt-2">{anniversaryMessage}</p>
          )}
          {showHolidayMessage && (
            <div className="absolute top-0 left-0 w-full bg-gradient-to-r from-yellow-400 to-orange-400 text-white p-4 rounded-t-lg animate-slide-down">
              <p className="text-lg font-semibold">{holidayMessage}</p>
            </div>
          )}
        </div>

        {user.loginType === 'Admin' && (
          <div className="flex justify-end gap-2 mb-6 pr-4">
            <input
              ref={reservedFileRef}
              type="file"
              accept=".xlsx, .xls"
              className="hidden"
              onChange={(e) => handleFileUpload(e, 'RH')}
            />
            <input
              ref={yearlyFileRef}
              type="file"
              accept=".xlsx, .xls"
              className="hidden"
              onChange={(e) => handleFileUpload(e, 'YH')}
            />
            <Button variant="default" onClick={() => reservedFileRef.current?.click()}>
              Upload Reserved Holidays
            </Button>
            <Button variant="default" onClick={() => yearlyFileRef.current?.click()}>
              Upload Yearly Holidays
            </Button>
          </div>
        )}

        {uploadStatus && (
          <div className={`mb-4 p-4 rounded ${uploadStatus.includes('Failed') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {uploadStatus}
          </div>
        )}

        {/* Main Action Buttons */}
       <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-[1200px] mb-8">
  {/* Today's Attendance */}
  <Card className="w-full h-44 bg-white border border-green-200 shadow-md hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer">
    <CardContent className="h-full flex flex-col justify-center items-center text-center">
      <Button
        variant="default"
        className="w-11/12 h-12 text-lg font-semibold bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
        onClick={() => navigate('/hod/employee-dashboard')}
      >
        <span className="mr-2">🗓️</span> Today's Attendance
      </Button>
      <p className="mt-3 text-lg font-semibold text-green-800">View and manage today's attendance records</p>
    </CardContent>
  </Card>

  {/* Employees Record */}
  <Card className="w-full h-44 bg-white border border-blue-200 shadow-md hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer">
    <CardContent className="h-full flex flex-col justify-center items-center text-center">
      <Button
        variant="default"
        className="w-11/12 h-12 text-lg font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
        onClick={() => navigate('/hod/employees')}
      >
        <span className="mr-2">📋</span> Employees Record
      </Button>
      <p className="mt-3 text-lg font-semibold text-blue-800">Access and review employee details</p>
    </CardContent>
  </Card>
</div>


        {/* Existing Action Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 justify-items-center w-full max-w-[1200px] mb-8">
          <Card className="w-full h-40 bg-gradient-to-br from-red-50 to-red-100 shadow-md hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('/hod/shift-management')}>
            <CardHeader className="p-4"></CardHeader>
            <CardContent className="p-4 text-center">
              <p className="text-xl font-bold text-red-800">View Shift Schedule</p>
            </CardContent>
          </Card>
          <Card className="w-full h-40 bg-gradient-to-br from-green-100 to-green-200 shadow-md hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('/hod/attendance')}>
            <CardHeader className="p-4"></CardHeader>
            <CardContent className="p-4 text-center">
              <p className="text-xl font-bold text-green-700">View Attendance Record</p>
            </CardContent>
          </Card>
          <Card className="w-full h-40 bg-gradient-to-br from-yellow-100 to-yellow-200 shadow-md hover:shadow-lg transition-shadow cursor-pointer" 
          onClick={() => {
  if (user.loginType === 'HOD') navigate('/hod/approve-leave');
  else if (user.loginType === 'CEO') navigate('/ceo/approve-leaves');
  else if (user.loginType === 'Admin') navigate('/admin/approve-leave');
}}
>
            <CardHeader className="p-4"></CardHeader>
            <CardContent className="p-4 text-center">
              <p className="text-xl font-bold text-yellow-700">Approve Leave</p>
             <p className="text-md text-yellow-600">Pending: {data.pendingLeaves}</p>

            </CardContent>
          </Card>
          <Card className="w-full h-40 bg-gradient-to-br from-purple-100 to-purple-200 shadow-md hover:shadow-lg transition-shadow cursor-pointer" 
         // onClick={() => navigate('/hod/approve-od')}
                   onClick={() => {
  if (user.loginType === 'HOD') navigate('/hod/approve-od');
  else if (user.loginType === 'CEO') navigate('/ceo/approve-od');
  else if (user.loginType === 'Admin') navigate('/admin/approve-od');
}}
          
          >
            <CardHeader className="p-4"></CardHeader>
            <CardContent className="p-4 text-center">
              <p className="text-xl font-bold text-purple-700">Approve Office Duty (OD)</p>
            <p className="text-md text-purple-600">Pending: {data.pendingOD}</p>
            </CardContent>
          </Card>
          <Card className="w-full h-40 bg-gradient-to-br from-teal-100 to-teal-200 shadow-md hover:shadow-lg transition-shadow cursor-pointer" 
         // onClick={() => navigate('/hod/approve-punch-missed')}
            onClick={() => {
  if (user.loginType === 'HOD') navigate('/hod/approve-punch-missed');
  else if (user.loginType === 'CEO') navigate('/ceo/approve-punch-missed');
  else if (user.loginType === 'Admin') navigate('/admin/approve-punch-missed');
}}
          
          
          >
            <CardHeader className="p-4"></CardHeader>
            <CardContent className="p-4 text-center">
              <p className="text-xl font-bold text-teal-700">Approve Punch Missed</p>
              <p className="text-md text-teal-600">Pending: {data.pendingPunchMissed}</p>
            </CardContent>
          </Card>
        </div>

        {/* CSS for Animation */}
        <style jsx>{`
          @keyframes slideDown {
            0% { transform: translateY(-100%); opacity: 0; }
            100% { transform: translateY(0); opacity: 1; }
          }
          .animate-slide-down {
            animation: slideDown 0.5s ease-out forwards;
          }
        `}</style>
      </div>
    </ContentLayout>
  );
}

export default Dashboard;