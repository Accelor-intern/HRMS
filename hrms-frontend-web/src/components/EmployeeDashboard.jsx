import React, { useEffect, useContext, useCallback, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import api from '../services/api';
import { AuthContext } from '../context/AuthContext';
import ContentLayout from './ContentLayout';
import io from 'socket.io-client';
import OTTable from './OTTable';
import CompensatoryTable from './CompensatoryTable';
import Clock from 'react-clock';
import 'react-clock/dist/Clock.css';

function EmployeeDashboard() {
  const { user } = useContext(AuthContext);
  const [data, setData] = useState({
    paidLeavesRemaining: { monthly: 0, yearly: 0 },
    unpaidLeavesTaken: 0,
    medicalLeaves: 0,
    restrictedHolidays: 0,
    compensatoryLeaves: 0,
    compensatoryAvailable: [],
    leaveRecords: [],
    overtimeHours: 0,
    otClaimRecords: [],
    unclaimedOTRecords: [],
    claimedOTRecords: [],
    unclaimedCompRecords: [],
    claimedCompRecords: [],
    odRecords: [],
    birthdayMessage: '',
    workAnniversaryMessage: '',
    companyAnnouncements: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [socket, setSocket] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isEligible, setIsEligible] = useState(false);
  const [greeting, setGreeting] = useState('');
  const [quote, setQuote] = useState('');
  const [holidayMessage, setHolidayMessage] = useState('');
  const [showHolidayMessage, setShowHolidayMessage] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Set up WebSocket for other notifications (optional, can be removed if not needed)
  useEffect(() => {
    if (user?.employeeId) {
      const socketInstance = io(import.meta.env.VITE_APP_API_URL || 'http://localhost:5000', {
        query: { employeeId: user.employeeId },
        transports: ['websocket', 'polling'],
        withCredentials: true,
      });

      socketInstance.on('connect', () => console.log('WebSocket connected'));
      socketInstance.on('connect_error', (err) => console.error('WebSocket connection error:', err.message));
      socketInstance.on('notification', () => {
        console.log('Received notification, refreshing dashboard data');
        fetchData();
      });

      setSocket(socketInstance);

      return () => {
        socketInstance.disconnect();
        console.log('WebSocket disconnected');
      };
    }
  }, [user?.employeeId]);

  const fetchData = useCallback(async () => {
    if (!user) {
      setError('User not authenticated. Please log in.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const now = new Date();
      const istOffsetMs = 5.5 * 60 * 60 * 1000;
      const istNow = new Date(now.getTime() + istOffsetMs);
      const todayDateStr = istNow.toISOString().split('T')[0];

      const [employeesRes] = await Promise.all([
        api.get('/employees').catch(() => ({ data: [] })),
      ]);

      const employees = Array.isArray(employeesRes.data) ? employeesRes.data : [];
      console.log('Employees data:', employees); // Debug log to check employee data

      // Birthday check with debug
      const birthdayEmployees = employees.filter(emp => {
        if (!emp.dateOfBirth) {
          console.log(`No dateOfBirth for employee ${emp.name || emp.employeeId}`);
          return false;
        }
        const dob = new Date(emp.dateOfBirth);
        const isBirthday = dob.getMonth() === istNow.getMonth() && dob.getDate() === istNow.getDate();
        if (isBirthday) console.log(`Birthday found for ${emp.name}`);
        return isBirthday;
      });
      let birthdayMessage = '';
      if (birthdayEmployees.length > 0) {
       // birthdayMessage = `🎉 It's ${birthdayEmployees.map(emp => emp.name).join(', ')}'s Birthday!`;
        setTimeout(() => setBirthdayMessage(''), 5 * 60 * 60 * 1000);
      } else {
        console.log('No birthdays today');
      }

      // Personal birthday check for the logged-in user
      let personalBirthdayMessage = '';
      if (user.dateOfBirth) {
        const userBirthday = new Date(user.dateOfBirth);
        userBirthday.setFullYear(istNow.getFullYear());
        const isUserBirthdayToday = userBirthday.toDateString() === istNow.toDateString();
        if (isUserBirthdayToday) {
          personalBirthdayMessage = `🎉 Happy Birthday, ${user.name}! Wishing you a fantastic day! 🎂`;
        }
      }

      // Anniversary check with debug
      const anniversaryEmployees = employees.filter(emp => {
        if (!emp.dateOfJoining) {
          console.log(`No dateOfJoining for employee ${emp.name || emp.employeeId}`);
          return false;
        }
        const joinDate = new Date(emp.dateOfJoining);
        const isAnniversary = joinDate.getMonth() === istNow.getMonth() && joinDate.getDate() === istNow.getDate();
        if (isAnniversary) console.log(`Anniversary found for ${emp.name}`);
        return isAnniversary;
      });
      let anniversaryMessage = '';
      if (anniversaryEmployees.length > 0) {
        //anniversaryMessage = `🎊 Congratulations to ${anniversaryEmployees.map(emp => emp.name).join(', ')} on their work anniversary!`;
      } else {
        console.log('No anniversaries today');
      }

      // Personal work anniversary check for the logged-in user
      let personalAnniversaryMessage = '';
      if (user.dateOfJoining) {
        const userAnniversary = new Date(user.dateOfJoining);
        userAnniversary.setFullYear(istNow.getFullYear());
        const isUserAnniversaryToday = userAnniversary.toDateString() === istNow.toDateString();
        if (isUserAnniversaryToday) {
          const years = istNow.getFullYear() - new Date(user.dateOfJoining).getFullYear();
          personalAnniversaryMessage = `🎉 Congratulations on your ${years} year${years > 1 ? 's' : ''} work anniversary, ${user.name}!`;
        }
      }

      // Company-wide announcements
      const companyAnnouncements = [];
      employees.forEach((emp) => {
        if (emp.dateOfBirth) {
          const empBirthday = new Date(emp.dateOfBirth);
          empBirthday.setFullYear(istNow.getFullYear());
          if (empBirthday.toDateString() === istNow.toDateString()) {
            companyAnnouncements.push(`🎂 Happy Birthday to ${emp.name}!`);
          }
        }
        if (emp.dateOfJoining) {
          const empAnniversary = new Date(emp.dateOfJoining);
          empAnniversary.setFullYear(istNow.getFullYear());
          if (empAnniversary.toDateString() === istNow.toDateString()) {
            const years = istNow.getFullYear() - new Date(emp.dateOfJoining).getFullYear();
            companyAnnouncements.push(`🎉 ${emp.name} celebrates ${years} year${years > 1 ? 's' : ''} with us today!`);
          }
        }
      });

      // Holiday check
      const todayDate = istNow.getDate();
      const todayMonth = istNow.getMonth();
      let holidayMessage = '';
      if (todayDate === 15 && todayMonth === 7) {
        holidayMessage = 'Happy Independence Day! Celebrate freedom and unity!';
        setShowHolidayMessage(true);
        setTimeout(() => setShowHolidayMessage(false), 7000);
      }

      setData((prevData) => ({
        ...prevData,
        paidLeavesRemaining: { monthly: prevData.paidLeavesRemaining.monthly, yearly: prevData.paidLeavesRemaining.yearly },
        unpaidLeavesTaken: prevData.unpaidLeavesTaken,
        medicalLeaves: prevData.medicalLeaves,
        restrictedHolidays: prevData.restrictedHolidays,
        compensatoryLeaves: prevData.compensatoryLeaves,
        compensatoryAvailable: prevData.compensatoryAvailable,
        leaveRecords: prevData.leaveRecords,
        overtimeHours: prevData.overtimeHours,
        otClaimRecords: prevData.otClaimRecords,
        unclaimedOTRecords: prevData.unclaimedOTRecords,
        claimedOTRecords: prevData.claimedOTRecords,
        unclaimedCompRecords: prevData.unclaimedCompRecords,
        claimedCompRecords: prevData.claimedCompRecords,
        odRecords: prevData.odRecords,
        birthdayMessage: personalBirthdayMessage || birthdayMessage,
        workAnniversaryMessage: personalAnniversaryMessage || anniversaryMessage,
        companyAnnouncements: [...new Set([...prevData.companyAnnouncements, ...companyAnnouncements])].slice(-5),
      }));
    } catch (err) {
      console.error('Dashboard fetch error:', err.response ? err.response.data : err.message);
      setError(err.response?.data?.message || 'Failed to fetch dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Poll for updates every 5 minutes to refresh announcements
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000); // Refresh every 5 minutes
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    const now = new Date();
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const today = new Date(now.getTime() + istOffsetMs);
    const hour = today.getHours();
    setGreeting(hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening');

    const quotes = [
      'Fall in love with the process ❤️‍🔥✨',
      'Keep pushing forward 🚀💼',
      'Embrace the journey 🌄🛤️',
      'Stay focused, stay strong 🎯💪',
      'Believe in Yourself 💡✨',
      'Trust the Process 🌱🙌',
      'This too shall pass 🌱🙌',
      'Find joy in the ordinary 🌱🙌',
      'Good things take time 🌱🙌',
    ];
    const quoteIndex = Math.floor(Math.random() * quotes.length);
    setQuote(quotes[quoteIndex]);
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

  let cardCount = 3; // Casual, Unpaid, Compensatory
  if (user.employeeType === 'Confirmed') {
    cardCount += 2; // Medical + Restricted Holiday
  }

  return (
    <ContentLayout title="My Workspace">
      <div className="flex flex-col items-center w-full px-4 overflow-x-hidden">
        {/* Greeting, Quote, Birthday, Anniversary, and Holiday Messages */}
        <div className="w-full max-w-[1200px] bg-gradient-to-r from-blue-50 to-indigo-100 p-6 rounded-lg mb-6 text-center shadow-lg relative">
          <h1 className="text-3xl font-bold text-indigo-800">{`${greeting}, ${user?.name || 'User'}!`}</h1>
          <p className="text-lg text-green-600 font-semibold mt-2">{quote}</p>
         
          {showHolidayMessage && (
            <div className="absolute top-0 left-0 w-full bg-gradient-to-r from-yellow-400 to-orange-400 text-white p-4 rounded-t-lg animate-slide-down">
              <p className="text-lg font-semibold">{holidayMessage}</p>
            </div>
          )}
        </div>

       {/* <div className="w-full max-w-[1200px] bg-gradient-to-r from-blue-50 to-blue-100 p-6 rounded-lg mb-6 text-center shadow-lg relative">
           {data.birthdayMessage && (
            <p className="text-xl text-blue-600 font-semibold mt-2">{data.birthdayMessage}</p>
          )}
          {data.workAnniversaryMessage && (
            <p className="text-xl text-blue-600 font-semibold mt-2">{data.workAnniversaryMessage}</p>
          )}
          {data.companyAnnouncements.length > 0 && (
            <div className="mt-4">
              <h3 className="text-3xl font-semibold text-red-700">Company Announcements</h3>
              <p>
              {data.companyAnnouncements.map((announcement, index) => (
                <p key={index} className="text-mg font-semibold text-indigo-700">{announcement}</p>
              ))}
              </p>
            </div>
          )}
      </div> */}

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
                    Availed: {data.paidLeavesRemaining.monthly}
                  </p>
                  <p className="text-md text-blue-700">Allowed: 12</p>
                  <p className="text-md text-blue-600">Balance: {data.paidLeavesRemaining.monthly}/12</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-blue-700">
                    Availed: {data.paidLeavesRemaining.monthly}
                  </p>
                  <p className="text-md text-blue-600">Allowed: 1</p>
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
                <p className="text-2xl font-bold text-green-700">Availed: {data.medicalLeaves}</p>
                <p className="text-md text-green-600">Allowed: [3, 4, 7]</p>
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
                <p className="text-2xl font-bold text-yellow-700">Availed: {data.restrictedHolidays}</p>
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

          {/* Compensatory Leave */}
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

          {/* Clock Card */}
          {cardCount < 5 && (
            <Card className="col-span-2 w-full h-50 bg-gradient-to-br from-gray-200 to-gray-200 shadow-md hover:shadow-lg transition-shadow">
              <CardContent className="p-4 h-full w-full flex flex-row items-center justify-around">
                <div className="flex items-center justify-center w-1/2">
                  <Clock value={currentTime} size={100} />
                </div>
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

        {/* Other Records */}
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