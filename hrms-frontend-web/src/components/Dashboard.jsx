import React, { useEffect, useState, useContext, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '../components/ui/select';
import { Button } from '../components/ui/button';
import api from '../services/api';
import { AuthContext } from '../context/AuthContext';
import ContentLayout from './ContentLayout';
import * as XLSX from 'xlsx';

function Dashboard() {
  const { user } = useContext(AuthContext);
  const [data, setData] = useState({
    confirmedEmployees: 0,
    probationEmployees: 0,
    ojtEmployees: 0,
    apprenticeEmployees: 0,
    contractualEmployees: 0,
    internEmployees: 0,
    presentToday: 0,
    pendingLeaves: 0,
  });
  const [chartData, setChartData] = useState([]);
  const [chartType, setChartType] = useState('gender');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const reservedFileRef = useRef(null);
  const yearlyFileRef = useRef(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [greeting, setGreeting] = useState('');
  const [quote, setQuote] = useState('');

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

        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        const [statsRes, employees, attendance, leaves] = await Promise.all([
          api.get('/dashboard/stats'),
          user.loginType === 'HOD' ? api.get('/employees/department') : api.get('/employees'),
          api.get(`/attendance?fromDate=${startOfMonth.toISOString().split('T')[0]}&toDate=${endOfMonth.toISOString().split('T')[0]}`),
          api.get(`/leaves?fromDate=${startOfMonth.toISOString().split('T')[0]}&toDate=${endOfMonth.toISOString().split('T')[0]}`),
        ]);

        setData(statsRes.data);

        // Gender Distribution
        const genderCounts = employees.data.reduce((acc, emp) => {
          const gender = emp.gender || 'Other';
          acc[gender] = (acc[gender] || 0) + 1;
          return acc;
        }, {});
        const genderData = Object.entries(genderCounts).map(([name, count]) => ({ name, count }));

        // Attendance Punctuality (On Time: before 9 AM, Late: after 9 AM)
        const attendanceRecords = Array.isArray(attendance.data.attendance) ? attendance.data.attendance : [];
        const punctualityData = employees.data.map(emp => {
          const employeeAttendance = attendanceRecords.filter(a => a.employeeId === emp.id && a.status.includes('Present'));
          const onTime = employeeAttendance.filter(a => {
            const [hours, minutes] = a.timeIn.split(':').map(Number);
            return hours < 9 || (hours === 9 && minutes === 0);
          }).length;
          const late = employeeAttendance.filter(a => {
            const [hours, minutes] = a.timeIn.split(':').map(Number);
            return hours >= 9 || (hours === 9 && minutes > 0);
          }).length;
          return { name: emp.name, onTime, late };
        }).filter(emp => emp.onTime > 0 || emp.late > 0);

        // Regularity (Based on Presence Consistency)
        const leaveRecords = Array.isArray(leaves.data) ? leaves.data : [];
        const regularityData = employees.data.map(emp => {
          const employeeAttendance = attendanceRecords.filter(a => a.employeeId === emp.id && a.status.includes('Present'));
          const totalDays = Math.ceil((endOfMonth - startOfMonth) / (1000 * 60 * 60 * 24)); // Days in month
          const presentDays = employeeAttendance.length;
          const leaveDays = leaveRecords.filter(l => l.employeeId === emp.id && l.status === 'Approved').length;
          const workableDays = totalDays - leaveDays;
          const regularity = workableDays > 0 ? (presentDays / workableDays) * 100 : 0;
          return { name: emp.name, regularity: Math.round(regularity) };
        }).filter(emp => emp.regularity > 0);

        // Set chart data based on chartType
        if (chartType === 'gender') {
          setChartData(genderData);
        } else if (chartType === 'punctuality') {
          setChartData(punctualityData);
        } else if (chartType === 'regularity') {
          setChartData(regularityData);
        }
      } catch (error) {
        console.error('Dashboard fetch error:', error);
        setError('Failed to fetch dashboard data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    // Dynamic greeting based on time
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening');

    // Dynamic short crisp quotes (rotated daily)
    const quotes = [
      'Fall in love with the process',
      'Keep pushing forward',
      'Embrace the journey',
      'Stay focused, stay strong',
      'Believe in Yourself',
      'Trust the Process',
    ];
    const today = new Date().toDateString();
    const quoteIndex = Math.floor(new Date(today).getDate() % quotes.length);
    setQuote(quotes[quoteIndex]);

    fetchData();
  }, [user, chartType]);

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

  if (loading) {
    return (
      <ContentLayout title="Dashboard">
        <div className="text-center py-8">Loading...</div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title="Dashboard">
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded">{error}</div>
      </ContentLayout>
    );
  }

  return (
    
    <ContentLayout title="HoD Panel">
      <div className="flex flex-col items-center w-full">
        {/* Greeting and Quote */}
      <div className="w-full max-w-[1200px] bg-[#f4f4f5] p-6 rounded-lg mb-6 text-center">
  <h1 className="text-2xl font-bold text-[#1d3d89db]">{`${greeting}, ${user?.name || 'HOD'}!`}</h1>
  {/* <p className="text-md text-[#2F6F44] italic font-bold mt-2">{quote}</p> */}
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

        <div className="flex flex-col items-center w-full max-w-[1200px]">
          <div className="flex justify-center gap-20 w-full">
            <Card className="w-48 h-48 flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
              <CardHeader className="p-2">
                <CardTitle className="text-lg font-semibold text-blue-800 text-center">Regular Employees</CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                <p className="text-3xl font-bold text-blue-600 text-center">{data.confirmedEmployees}</p>
              </CardContent>
            </Card>
            <Card className="w-48 h-48 flex flex-col items-center justify-center bg-gradient-to-br from-pink-50 to-pink-100">
              <CardHeader className="p-2">
                <CardTitle className="text-lg font-semibold text-pink-800 text-center">Contractual</CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                <p className="text-3xl font-bold text-pink-600 text-center">{data.contractualEmployees}</p>
              </CardContent>
            </Card>
            <Card className="w-48 h-48 flex flex-col items-center justify-center bg-gradient-to-br from-indigo-50 to-indigo-100">
              <CardHeader className="p-2">
                <CardTitle className="text-lg font-semibold text-indigo-800 text-center">Intern</CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                <p className="text-3xl font-bold text-indigo-600 text-center">{data.internEmployees}</p>
              </CardContent>
            </Card>
          </div>
          <div className="flex justify-center gap-20 w-full mt-6">
            <Card className="w-48 h-48 flex flex-col items-center justify-center bg-gradient-to-br from-teal-50 to-teal-100">
              <CardHeader className="p-2">
                <CardTitle className="text-lg font-semibold text-teal-800 text-center">OJT</CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                <p className="text-3xl font-bold text-teal-600 text-center">{data.ojtEmployees}</p>
              </CardContent>
            </Card>
            <Card className="w-48 h-48 flex flex-col items-center justify-center bg-gradient-to-br from-orange-50 to-orange-100">
              <CardHeader className="p-2">
                <CardTitle className="text-lg font-semibold text-orange-800 text-center">Apprentice</CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                <p className="text-3xl font-bold text-orange-600 text-center">{data.apprenticeEmployees}</p>
              </CardContent>
            </Card>
            <Card className="w-48 h-48 flex flex-col items-center justify-center bg-gradient-to-br from-green-50 to-green-100">
              <CardHeader className="p-2">
                <CardTitle className="text-lg font-semibold text-green-800 text-center">Present Today</CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                <p className="text-3xl font-bold text-green-600 text-center">{data.presentToday}</p>
              </CardContent>
            </Card>
            <Card className="w-48 h-48 flex flex-col items-center justify-center bg-gradient-to-br from-yellow-50 to-yellow-100">
              <CardHeader className="p-2">
                <CardTitle className="text-lg font-semibold text-yellow-800 text-center">
                  {user.loginType === 'Admin' ? 'Pending Acknowledgement' : 'Pending Approvals'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                <p className="text-3xl font-bold text-yellow-600 text-center">{data.pendingLeaves}</p>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 w-full max-w-[900px]">
          <Card>
            <CardHeader className="flex flex-row justify-between items-center">
              <CardTitle>
                {chartType === 'gender' ? 'Gender Distribution' : chartType === 'punctuality' ? 'Attendance Punctuality' : 'Employee Regularity'}
              </CardTitle>
              <Select
                value={chartType}
                onValueChange={(value) => setChartType(value)}
                aria-label="Select chart type"
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Gender Distribution" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gender">Gender Distribution</SelectItem>
                  <SelectItem value="punctuality">Attendance Punctuality</SelectItem>
                  <SelectItem value="regularity">Employee Regularity</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  {chartType === 'gender' && (
                    <Bar dataKey="count" fill={COLORS[0]} name="Count" />
                  )}
                  {chartType === 'punctuality' && (
                    <>
                      <Bar dataKey="onTime" fill={COLORS[1]} name="On Time (Before 9 AM)" />
                      <Bar dataKey="late" fill={COLORS[2]} name="Late (After 9 AM)" />
                    </>
                  )}
                  {chartType === 'regularity' && (
                    <Bar dataKey="regularity" fill={COLORS[0]} name="Regularity (%)" />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </ContentLayout>
  );
}

export default Dashboard;