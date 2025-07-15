import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Dashboard from '../components/Dashboard';
import Profile from '../components/Profile';
import LeaveList from '../components/LeaveList';
import EmployeeList from '../components/EmployeeList';
import Attendance from '../components/Attendance';
import ODList from '../components/ODList';
import ApproveOT from '../components/OTApproval';
import PunchMissedList from '../components/PunchMissedList';

function CEO() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <div className="flex-1 pt-16">
        <Routes>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="profile" element={<Profile />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="approve-leaves" element={<LeaveList />} />
          <Route path="employees" element={<EmployeeList />} />
          <Route path="approve-od" element={<ODList />} />
          <Route path="approve-ot" element={<ApproveOT />} />
          <Route path="approve-punch-missed" element={<PunchMissedList />} />
        </Routes>
      </div>
    </div>
  );
}

export default CEO;
