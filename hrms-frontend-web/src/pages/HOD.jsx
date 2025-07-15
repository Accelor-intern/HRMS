import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Dashboard from '../components/Dashboard';
import Profile from '../components/Profile';
import EmployeeList from '../components/EmployeeList';
import LeaveForm from '../components/LeaveForm';
import ODForm from '../components/ODForm';
import LeaveList from '../components/LeaveList';
import ODList from '../components/ODList';
import Attendance from '../components/Attendance';
import MyDashboard from '../components/EmployeeDashboard';
import ApproveOT from '../components/OTApproval';
import PunchMissedForm from '../components/PunchMissedForm';
import PunchMissedList from '../components/PunchMissedList';
import ShiftManagement from '../components/ShiftManagement';
import HodMyLeaveList from '../components/HodMyLeaveList';
import HodOdList from '../components/HodOdList';

function HOD() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <div className="flex-1 pt-16">
        <Routes>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="employee-dashboard" element={<MyDashboard />} />
          <Route path="profile" element={<Profile />} />
          <Route path="employees" element={<EmployeeList />} />
          <Route path="leave" element={<LeaveForm />} />
          <Route path="od" element={<ODForm />} />
           <Route path="leave-list" element={<LeaveList />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="approve-leave" element={<LeaveList />} />
          <Route path="approve-od" element={<ODList />} />
          <Route path="approve-ot" element={<ApproveOT />} />
          <Route path="punch-missed" element={<PunchMissedForm />} />
          <Route path="approve-punch-missed" element={<PunchMissedList />} />
          <Route path="/shift-management" element={<ShiftManagement />} />
          <Route path="/hod-my-leave-list" element={<HodMyLeaveList />} />
          <Route path="/hod-od-list" element={<HodOdList />} />
        </Routes>
      </div>
    </div>
  );
}

export default HOD;
