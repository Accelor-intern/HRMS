import React, { useEffect, useState, useContext, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { AuthContext } from "../context/AuthContext";
import api from "../services/api";
import ContentLayout from "./ContentLayout";
import Pagination from "./Pagination";
import { Card, CardContent } from "../components/ui/card";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";

function Attendance() {
  const { user } = useContext(AuthContext);
  const initialFilters = useMemo(
    () => ({
      employeeId: user?.loginType === "Employee" ? user?.employeeId || "" : "",
      name: "",
      departmentId:
        user?.loginType === "HOD" && user?.department
          ? user.department._id
          : "all",
      fromDate: new Date().toISOString().split("T")[0],
      toDate: new Date().toISOString().split("T")[0],
      status: "all",
    }),
    [user]
  );
  const [attendance, setAttendance] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [total, setTotal] = useState(0);
  const [absenceAlerts, setAbsenceAlerts] = useState({});
  const [apologizeOpen, setApologizeOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [employeeRoles, setEmployeeRoles] = useState({});
  const [reason, setReason] = useState("");
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [rejectionOpen, setRejectionOpen] = useState(false);
  const [approvalReason, setApprovalReason] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [apologyCounts, setApologyCounts] = useState({});

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await api.get("/departments");
      setDepartments(res.data);
    } catch (err) {
      console.error("Error fetching departments:", err);
      setError("Failed to load departments");
    }
  }, []);

  const formatDateDisplay = (dateStr) => {
    const dateUTC = new Date(dateStr);
    const dateIST = new Date(dateUTC.getTime() + 5.5 * 60 * 60 * 1000);
    return dateIST.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const fetchAttendance = useCallback(async (filterParams) => {
    setLoading(true);
    setError(null);
    try {
      const normalizedFilters = { ...filterParams };
      if (normalizedFilters.fromDate && !normalizedFilters.toDate) {
        normalizedFilters.toDate = normalizedFilters.fromDate;
      }
      if (
        normalizedFilters.fromDate &&
        normalizedFilters.toDate &&
        new Date(normalizedFilters.toDate) < new Date(normalizedFilters.fromDate)
      ) {
        setError("To Date cannot be earlier than From Date.");
        setLoading(false);
        return;
      }
      if (normalizedFilters.departmentId === "all") {
        delete normalizedFilters.departmentId;
      }
      const res = await api.get("/attendance", { params: normalizedFilters });
      const attendanceData = res.data.attendance || [];
      setAttendance(attendanceData);
      setTotal(res.data.total || 0);

      if (user?.loginType === "Admin") {
        const alertsRes = await api.get("/attendance/absence-alerts");
        const alerts = alertsRes.data.reduce((acc, alert) => {
          acc[alert.employeeId] = alert;
          return acc;
        }, {});
        setAbsenceAlerts(alerts);
      }

      // Fetch apology counts for the current month
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
      const countsRes = await api.get("/attendance/apology-counts", {
        params: { month: currentMonth },
      });
      setApologyCounts(countsRes.data);

      const keyCounts = {};
      attendanceData.forEach((record) => {
        const key = `${record.employeeId}-${new Date(record.logDate).toISOString().split("T")[0]}`;
        keyCounts[key] = (keyCounts[key] || 0) + 1;
        if (keyCounts[key] > 1) {
          console.warn(`Duplicate attendance record found in frontend for key: ${key}`, record);
        }
      });

      if (attendanceData.length === 0) {
        setError(
          filterParams.employeeId || filterParams.name
            ? "No attendance records found for the specified Employee ID or Name."
            : "No attendance records found for the selected date or filters."
        );
      }
    } catch (err) {
      console.error("Error fetching attendance:", err);
      //setError(err.response?.data?.message || "Failed to load attendance data");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user?.loginType === "HOD" && user?.department) {
      setDepartments([{ _id: user.department._id, name: user.department.name }]);
      fetchAttendance({
        ...initialFilters,
        departmentId: user.department._id,
      });
    } else if (user?.loginType === "Employee") {
      fetchAttendance({
        ...initialFilters,
        employeeId: user?.employeeId || "",
      });
    } else if (user) {
      fetchDepartments();
      fetchAttendance(initialFilters);
    }
  }, [user, fetchDepartments, fetchAttendance, initialFilters]);

  useEffect(() => {
    const fetchEmployeeRoles = async () => {
      const roles = {};
      for (const record of attendance) {
        if (!employeeRoles[record.employeeId] && user?.loginType === "CEO" && record.laApproval === "Pending") {
          try {
            const res = await api.get(`/employees/${record.employeeId}`);
            roles[record.employeeId] = res.data.loginType;
          } catch (err) {
            console.error(`Error fetching role for ${record.employeeId}:`, err);
            roles[record.employeeId] = null;
          }
        }
      }
      if (Object.keys(roles).length > 0) {
        setEmployeeRoles(prev => ({ ...prev, ...roles }));
      }
    };
    fetchEmployeeRoles();
  }, [attendance, user, employeeRoles]);

  const handleChange = (name, value) => {
    setFilters({ ...filters, [name]: value });
  };

  const handleFilter = () => {
    if (filters.employeeId && !/^[A-Za-z0-9]+$/.test(filters.employeeId)) {
      setError("Invalid Employee ID format.");
      return;
    }
    setCurrentPage(1);
    fetchAttendance(filters);
  };

  const handleDownload = async (status) => {
    try {
      const normalizedFilters = { ...filters, status };
      if (normalizedFilters.departmentId === "all") {
        delete normalizedFilters.departmentId;
      }
      const res = await api.get("/attendance/download", {
        params: normalizedFilters,
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `attendance_${status}_${filters.fromDate}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error("Error downloading Excel:", err);
      setError("Failed to download attendance report");
    }
  };

  const handleSendNotification = async (employeeId, alertType) => {
    try {
      await api.post("/attendance/send-absence-notification", {
        employeeId,
        alertType,
      });
      setError(null);
      const alertsRes = await api.get("/attendance/absence-alerts");
      const alerts = alertsRes.data.reduce((acc, alert) => {
        acc[alert.employeeId] = alert;
        return acc;
      }, {});
      setAbsenceAlerts(alerts);
    } catch (err) {
      console.error("Error sending notification:", err);
      setError(err.response?.data?.message || "Failed to send notification");
    }
  };

  const paginatedAttendance = attendance.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const formatTime = (minutes) => {
    if (!minutes) return "00:00";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
  };

  const calculateTotalTime = (timeIn, timeOut) => {
    if (!timeIn || !timeOut) return "00:00";
    const [inHours, inMins] = timeIn.split(":").map(Number);
    const [outHours, outMins] = timeOut.split(":").map(Number);
    const totalMins = (outHours * 60 + outMins) - (inHours * 60 + inMins);
    return formatTime(totalMins);
  };

  const calculateOT = (timeIn, timeOut) => {
    if (!timeIn || !timeOut) return "-";
    const [inHours, inMins] = timeIn.split(":").map(Number);
    const [outHours, outMins] = timeOut.split(":").map(Number);
    const totalInMins = inHours * 60 + inMins;
    const totalOutMins = outHours * 60 + outMins;
    const standardEndMins = 17 * 60 + 30;
    let totalMins = totalOutMins - totalInMins;
    if (totalMins < 0) return "N/A";
    let otMins = 0;
    if (totalOutMins > standardEndMins) {
      otMins = totalOutMins - standardEndMins;
    }
    if (otMins < 60) return "N/A";
    const otHours = Math.floor(otMins / 60); // Round down to nearest hour
    return `${otHours.toString().padStart(2, "0")}:00`;
  };

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

  const isLateArrivalEligible = (timeIn, logDate) => {
    if (!timeIn || !logDate) return false;
    const [hours, mins] = timeIn.split(":").map(Number);
    const totalMins = hours * 60 + mins;
    const currentDate = new Date();
    const recordDate = new Date(logDate);
    const currentTimeIST = new Date(currentDate.getTime() + 5.5 * 60 * 60 * 1000);
    const currentHours = currentTimeIST.getHours();
    const currentMins = currentTimeIST.getMinutes();
    const currentTotalMins = currentHours * 60 + currentMins;
    const startWindow = 9 * 60 + 20; // 09:20 IST
    const endWindow = 17 * 60 + 30; // 17:30 IST
    const isSameDay = currentDate.toDateString() === recordDate.toDateString();
    
    return (
      isSameDay &&
      currentTotalMins >= startWindow &&
      currentTotalMins <= endWindow &&
      totalMins >= 540 && // 09:00
      totalMins <= 555 // 09:15
    );
  };

  const handleApologizeClick = (record) => {
    const employeeApologyCount = apologyCounts[record.employeeId]?.count || 0;
    if (employeeApologyCount >= 3) {
      setError("You have reached the maximum number of apologies (3) for this month.");
      return;
    }
    setSelectedRecord(record);
    setApologizeOpen(true);
  };

  const handleApologizeSubmit = async () => {
    if (!reason.trim()) {
      setError("Reason of Late Arrival is required.");
      return;
    }
    setLoading(true);
    try {
      const [inHours, inMins] = selectedRecord.timeIn.split(":").map(Number);
      const totalMins = inHours * 60 + inMins;
      let updatedStatus = selectedRecord.status;
      if (totalMins < 720) { // Before 12:00 PM (FN)
        updatedStatus = updatedStatus.replace(
          /FN: Late Arrival/,
          "FN: Late Arrival (Approval Pending)"
        );
      } else { // After 12:00 PM (AN)
        updatedStatus = updatedStatus.replace(
          /AN: Late Arrival/,
          "AN: Late Arrival (Approval Pending)"
        );
      }
      const response = await api.put(`/attendance/${selectedRecord._id}`, {
        status: updatedStatus,
        laApproval: "Pending",
        laReason: reason,
      });
      setAttendance(attendance.map((a) =>
        a._id === selectedRecord._id ? { ...a, status: updatedStatus, laApproval: "Pending", laReason: reason } : a
      ));
      setApologyCounts(prev => ({
        ...prev,
        [selectedRecord.employeeId]: {
          count: (prev[selectedRecord.employeeId]?.count || 0) + 1,
        },
      }));
      setApologizeOpen(false);
      setReason("");
      setError(null);
      alert("Request Submitted Successfully");
    } catch (err) {
      console.error("Error submitting apology:", err.response ? err.response.data : err.message);
      setError(err.response?.data?.message || "Failed to submit apology. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleApproveClick = (record) => {
    setSelectedRecord(record);
    setApprovalOpen(true);
  };

  const handleApproveSubmit = async () => {
    if (!approvalReason.trim()) {
      setError("Reason for approval is required.");
      return;
    }
    setLoading(true);
    try {
      const [inHours, inMins] = selectedRecord.timeIn.split(":").map(Number);
      const totalMins = inHours * 60 + inMins;
      let updatedStatus = selectedRecord.status;
      if (totalMins < 720) { // Before 12:00 PM (FN)
        updatedStatus = updatedStatus.replace(
          /FN: Late Arrival \(Approval Pending\)/,
          "FN: Late Arrival (Allowed)"
        );
      } else { // After 12:00 PM (AN)
        updatedStatus = updatedStatus.replace(
          /AN: Late Arrival \(Approval Pending\)/,
          "AN: Late Arrival (Allowed)"
        );
      }
      await api.put(`/attendance/${selectedRecord._id}`, {
        status: updatedStatus,
        laApproval: "Allowed",
        laReason: selectedRecord.laReason,
        approvalReason: approvalReason,
      });
      setAttendance(attendance.map((a) =>
        a._id === selectedRecord._id ? { ...a, status: updatedStatus, laApproval: "Allowed", approvalReason } : a
      ));
      setApprovalOpen(false);
      setApprovalReason("");
      setError(null);
      alert("Request Approved Successfully");
    } catch (err) {
      console.error("Error approving:", err.response ? err.response.data : err.message);
      setError(err.response?.data?.message || "Failed to approve. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRejectClick = (record) => {
    setSelectedRecord(record);
    setRejectionOpen(true);
  };

  const handleRejectSubmit = async () => {
    if (!rejectionReason.trim()) {
      setError("Reason for rejection is required.");
      return;
    }
    setLoading(true);
    try {
      const [inHours, inMins] = selectedRecord.timeIn.split(":").map(Number);
      const totalMins = inHours * 60 + inMins;
      let updatedStatus = selectedRecord.status;
      if (totalMins < 720) { // Before 12:00 PM (FN)
        updatedStatus = updatedStatus.replace(
          /FN: Late Arrival \(Approval Pending\)/,
          "FN: Late Arrival (Denied)"
        );
      } else { // After 12:00 PM (AN)
        updatedStatus = updatedStatus.replace(
/AN: Late Arrival \(Approval Pending\)/,
          "AN: Late Arrival (Denied)"
        );
      }
      await api.put(`/attendance/${selectedRecord._id}`, {
        status: updatedStatus,
        laApproval: "Denied",
        laReason: selectedRecord.laReason,
        rejectionReason: rejectionReason,
      });
      setAttendance(attendance.map((a) =>
        a._id === selectedRecord._id ? { ...a, status: updatedStatus, laApproval: "Denied", rejectionReason } : a
      ));
      setRejectionOpen(false);
      setRejectionReason("");
      setError(null);
      alert("Request Rejected Successfully");
    } catch (err) {
      console.error("Error rejecting:", err.response ? err.response.data : err.message);
      setError(err.response?.data?.message || "Failed to reject. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDetailsClick = (record) => {
    setSelectedRecord(record);
    setDetailsOpen(true);
  };

  const hodDepartmentName =
    user?.loginType === "HOD" && user?.department
      ? departments.find((dep) => dep._id === user.department._id)?.name || "Unknown"
      : "";

  return (
    <ContentLayout title="Attendance List">
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
            className="mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4"
          >
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="employeeId">Employee ID</Label>
              <Input
                id="employeeId"
                name="employeeId"
                value={filters.employeeId}
                onChange={(e) => handleChange("employeeId", e.target.value)}
                placeholder="Employee ID"
                disabled={user?.loginType === "Employee"}
                className="mt-1 border-gray-300 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                value={filters.name}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="Employee Name"
                className="mt-1 border-gray-300 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="departmentId">Department</Label>
              {user?.loginType === "HOD" ? (
                <Input
                  id="departmentId"
                  value={hodDepartmentName}
                  readOnly
                  className="mt-1 border-gray-300 bg-gray-100 cursor-not-allowed"
                  placeholder="Your Department"
                />
              ) : user?.loginType === "Employee" ? (
                <Input
                  id="departmentId"
                  value={user?.department?.name || "Unknown"}
                  readOnly
                  className="mt-1 border-gray-300 bg-gray-100 cursor-not-allowed"
                  placeholder="Your Department"
                />
              ) : (
                <Select
                  onValueChange={(value) => handleChange("departmentId", value)}
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
              <Label htmlFor="fromDate">From Date</Label>
              <Input
                id="fromDate"
                name="fromDate"
                type="date"
                value={filters.fromDate}
                onChange={(e) => handleChange("fromDate", e.target.value)}
                className="mt-1 border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                disabled={loading}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="toDate">To Date</Label>
              <Input
                id="toDate"
                name="toDate"
                type="date"
                value={filters.toDate}
                onChange={(e) => handleChange("toDate", e.target.value)}
                className="mt-1 border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                disabled={loading}
              />
            </div>
            <div className="flex gap-2 items-end">
              <Button
                onClick={handleFilter}
                className="px-4 py-2 bg-blue-600 text-white"
              >
                Filter
              </Button>
            </div>
          </motion.div>
          {loading ? (
            <p className="text-center py-4">Loading...</p>
          ) : attendance.length === 0 ? (
            <div className="text-center py-8 rounded-lg bg-gray-100">
              <p className="text-lg font-semibold">
                No attendance records found.
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
                      <TableHead className="font-semibold">Time IN</TableHead>
                      <TableHead className="font-semibold">Time OUT</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="font-semibold">Total Time</TableHead>
                      <TableHead className="font-semibold">OT</TableHead>
                      {user?.loginType === "Admin" && (
                        <TableHead className="font-semibold">Action</TableHead>
                      )}
                      {(user?.loginType === "HOD" || user?.loginType === "Admin") && (
                        <TableHead className="font-semibold">Late Arrival</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedAttendance.map((a) => (
                      <TableRow
                        key={a._id}
                        className="hover:bg-gray-50"
                      >
                        <TableCell>{a.employeeId}</TableCell>
                        <TableCell>{a.name}</TableCell>
                        <TableCell>{formatDateDisplay(a.logDate)}</TableCell>
                        <TableCell>{a.timeIn || "-"}</TableCell>
                        <TableCell>{a.timeOut || "-"}</TableCell>
                        <TableCell>
                          {highlightStatus(a.status)}
                          {a.halfDay ? ` (${a.halfDay})` : ""}
                        </TableCell>
                        <TableCell>{calculateTotalTime(a.timeIn, a.timeOut)}</TableCell>
                        <TableCell>{calculateOT(a.timeIn, a.timeOut) || "-"}</TableCell>
                        {user?.loginType === "Admin" && (
                          <TableCell>
                            {absenceAlerts[a.employeeId]?.days === 3 && (
                              <Button
                                onClick={() =>
                                  handleSendNotification(a.employeeId, "warning")
                                }
                                className="bg-yellow-600 hover:bg-yellow-700 text-white"
                              >
                                Send Warning
                              </Button>
                            )}
                            {absenceAlerts[a.employeeId]?.days === 5 && (
                              <Button
                                onClick={() =>
                                  handleSendNotification(a.employeeId, "termination")
                                }
                                className="bg-red-600 hover:bg-red-700 text-white"
                              >
                                Send Termination Notice
                              </Button>
                            )}
                          </TableCell>
                        )}
                        {((user?.loginType === "HOD" && a.employeeId !== user.employeeId && a.laApproval === "Pending") || 
                          (user?.loginType === "CEO" && a.laApproval === "Pending" && (employeeRoles[a.employeeId] === "HOD" || !employeeRoles[a.employeeId]))) && (
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                onClick={() => handleApproveClick(a)}
                                className="bg-green-600 hover:bg-green-700 text-white"
                              >
                                Approve
                              </Button>
                              <Button
                                onClick={() => handleRejectClick(a)}
                                className="bg-red-600 hover:bg-red-700 text-white"
                              >
                                Reject
                              </Button>
                            </div>
                          </TableCell>
                        )}
                        {(user?.loginType === "HOD" || user?.loginType === "Admin" || user?.loginType === "Employee") && (a.laApproval === "Allowed" || a.laApproval === "Denied" || a.laApproval === "Pending") && (
                          <TableCell>
                            <Button
                              onClick={() => handleDetailsClick(a)}
                              className="bg-blue-500 hover:bg-blue-600 text-white"
                            >
                              View Details
                            </Button>
                          </TableCell>
                        )}
                        {["Employee", "HOD"].includes(user?.loginType) && a.employeeId === user.employeeId && isLateArrivalEligible(a.timeIn, a.logDate) && !(/Approval Pending|Allowed|Denied/.test(a.status)) && (
                          <TableCell>
                            <Button
                              onClick={() => handleApologizeClick(a)}
                              className="bg-yellow-500 hover:bg-yellow-600 text-white"
                              disabled={(apologyCounts[a.employeeId]?.count || 0) >= 3}
                            >
                              Apologize
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  onClick={() => handleDownload("Present")}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  Download Present
                </Button>
                <Button
                  onClick={() => handleDownload("Absent")}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  Download Absent
                </Button>
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
          <Dialog open={apologizeOpen} onOpenChange={setApologizeOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reason for Late Arrival</DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <Label htmlFor="reason">Reason (Required)</Label>
                <Input
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Enter reason for late arrival"
                  className="mt-1"
                />
                {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
              </div>
              <DialogFooter>
                <Button
                  onClick={() => setApologizeOpen(false)}
                  className="mr-2"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleApologizeSubmit}
                  className="bg-blue-600 text-white"
                >
                  Submit
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={approvalOpen} onOpenChange={setApprovalOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reason for Approval</DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <Label htmlFor="approvalReason">Reason (Required)</Label>
                <Input
                  id="approvalReason"
                  value={approvalReason}
                  onChange={(e) => setApprovalReason(e.target.value)}
                  placeholder="Enter reason for approval"
                  className="mt-1"
                />
                {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
              </div>
              <DialogFooter>
                <Button
                  onClick={() => setApprovalOpen(false)}
                  className="mr-2"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleApproveSubmit}
                  className="bg-green-600 text-white"
                >
                  Approve
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={rejectionOpen} onOpenChange={setRejectionOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reason for Rejection</DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <Label htmlFor="rejectionReason">Reason (Required)</Label>
                <Input
                  id="rejectionReason"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Enter reason for rejection"
                  className="mt-1"
                />
                {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
              </div>
              <DialogFooter>
                <Button
                  onClick={() => setRejectionOpen(false)}
                  className="mr-2"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleRejectSubmit}
                  className="bg-red-600 text-white"
                >
                  Reject
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Late Arrival Details</DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <div className="mb-4">
                  <Label className="font-semibold">Employee Reason</Label>
                  <p>{selectedRecord?.laReason || "No reason provided"}</p>
                </div>
                <div>
                  <Label className="font-semibold">HOD Reason</Label>
                  <p>{(selectedRecord?.approvalReason || selectedRecord?.rejectionReason) || "No reason provided"}</p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => setDetailsOpen(false)}
                  className="bg-blue-600 text-white"
                >
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </ContentLayout>
  );
}

export default Attendance;