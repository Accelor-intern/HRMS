import React, { useEffect, useState, useContext, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
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
  DialogDescription,
  DialogFooter,
} from "../components/ui/dialog";
import Pagination from "./Pagination";
import api from "../services/api";
import ContentLayout from "./ContentLayout";
import { AuthContext } from "../context/AuthContext";
import { useFileHandler } from "../hooks/useFileHandler";
import SplashScreen from "./SplashScreen";

function LeaveList() {
  const { user } = useContext(AuthContext);
  const initialFilters = useMemo(
    () => ({
      employeeId: user?.loginType === "Employee" ? user?.employeeId || "" : "",
      employeeName: user?.loginType === "Employee" ? user?.name || "" : "",
      departmentId:
        user?.loginType === "HOD" && user?.department
          ? user.department._id
          : "all",
      leaveType: "all",
      status: "all",
      fromDate: "",
      toDate: "",
    }),
    [user]
  );

  const [leaves, setLeaves] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [tempFilters, setTempFilters] = useState(initialFilters);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [total, setTotal] = useState(0);
  const [rejectionRemarks, setRejectionRemarks] = useState("");
  const [showRejectionDialog, setShowRejectionDialog] = useState(false);
  const [showRemarksDialog, setShowRemarksDialog] = useState(false);
  const [selectedRemarkLeave, setSelectedRemarkLeave] = useState(null);
  const [pendingRejection, setPendingRejection] = useState(null);
  const [viewMode, setViewMode] = useState("approval");
  const [leaveAdjustments, setLeaveAdjustments] = useState({});
  const [showConfirmationDialog, setShowConfirmationDialog] = useState(false);
  const [confirmationData, setConfirmationData] = useState(null);
  

  const { handleViewFile, error: fileError } = useFileHandler(
    selectedLeave?.medicalCertificate?._id
  );

  const fetchDepartments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/departments");
      setDepartments(res.data);
    } catch (err) {
      console.error("Error fetching departments:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEmployees = useCallback(async (departmentId = null) => {
    try {
      setLoading(true);
      let res;
      if (user?.loginType === "HOD" && departmentId && departmentId !== "all") {
        res = await api.get(`/employees/by-department/${departmentId}`);
      } else {
        const params = departmentId && departmentId !== "all" ? { departmentId } : {};
        res = await api.get("/employees", { params });
      }
      const filtered = res.data.filter(emp => emp.employeeId !== user?.employeeId);
      setEmployees(filtered);
    } catch (err) {
      console.error("Error fetching employees:", err?.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  }, [user?.loginType]);

  const fetchLeaves = useCallback(
    async (filterParams) => {
      setLoading(true);
      setError(null);
      try {
        const normalizedFilters = {
          ...filterParams,
          page: currentPage,
          limit: itemsPerPage,
          leaveType: filterParams.leaveType === "all" ? undefined : filterParams.leaveType,
          employeeId: filterParams.employeeId === "all" ? undefined : filterParams.employeeId,
        };
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
        if (user?.loginType === "HOD" && viewMode === "own") {
          normalizedFilters.employeeId = user?.employeeId || "";
          delete normalizedFilters.departmentId;
        } else if (user?.loginType === "HOD" && viewMode === "approval") {
          normalizedFilters.departmentId = user?.department?._id;
          if (normalizedFilters.employeeId === "all" || normalizedFilters.employeeId === user?.employeeId) {
            delete normalizedFilters.employeeId;
          }
        }
        const res = await api.get("/leaves", { params: normalizedFilters });
        if (res.data && Array.isArray(res.data.leaves)) {
          setLeaves(res.data.leaves);
          setTotal(res.data.total ?? res.data.leaves.length);
          if (res.data.leaves.length === 0) {
            setError(
              filterParams.employeeId || filterParams.employeeName
                ? "No leave records found for the specified employee."
                : "No leave records found for the selected filters."
            );
          }
        } else {
          setLeaves([]);
          setTotal(0);
          setError("No valid leave data received from the server.");
        }
      } catch (err) {
        console.error("Error fetching leave list:", err);
        setError(
          err.response?.data?.message || "Failed to fetch leaves. Please try again."
        );
      } finally {
        setLoading(false);
      }
    },
    [currentPage, itemsPerPage, user, viewMode]
  );

  useEffect(() => {
    if (!user) return;

    let newFilters = { ...initialFilters };
    let departmentIdForEmployees = null;

    if (user.loginType === "HOD" && user.department) {
      newFilters = {
        ...initialFilters,
        departmentId: viewMode === "approval" ? user.department._id : "all",
        employeeId: viewMode === "own" ? user.employeeId : "",
        employeeName: viewMode === "own" ? user.name : "",
      };
      departmentIdForEmployees = viewMode === "own" ? null : user.department._id;
    } else if (user.loginType === "Employee") {
      newFilters = {
        ...initialFilters,
        employeeId: user?.employeeId || "",
        employeeName: user?.name || "",
      };
    }

    setFilters(newFilters);
    setTempFilters(newFilters);

    fetchDepartments();
    fetchEmployees(departmentIdForEmployees);
    fetchLeaves(newFilters);
  }, [user, viewMode, fetchDepartments, fetchEmployees, fetchLeaves, initialFilters]);

  useEffect(() => {
    fetchLeaves(filters);
  }, [filters, currentPage, itemsPerPage, fetchLeaves]);

  const handleChange = (name, value) => {
    setTempFilters((prev) => {
      const newFilters = { ...prev, [name]: value };
      if (name === "employeeId" && value === "all") {
        newFilters.employeeName = "";
      } else if (name === "employeeId") {
        const selectedEmployee = employees.find(emp => emp.employeeId === value);
        newFilters.employeeName = selectedEmployee?.name || "";
      }
      return newFilters;
    });
  };

  const handleEmployeeSearch = (value) => {
    const selectedEmployee = employees.find(emp => 
      emp.employeeId.toLowerCase() === value.toLowerCase() || 
      emp.name.toLowerCase().includes(value.toLowerCase())
    );
    setTempFilters({
      ...tempFilters,
      employeeId: selectedEmployee?.employeeId || value,
      employeeName: selectedEmployee?.name || value,
    });
  };

  const handleFilter = () => {
    if (tempFilters.employeeId && !/^[A-Za-z0-9]+$/.test(tempFilters.employeeId)) {
      setError("Invalid Employee ID format.");
      return;
    }
    setFilters(tempFilters);
    setCurrentPage(1);
    fetchLeaves(tempFilters);
  };

const handleAdjustmentChange = (leaveId, field, value, maxDays) => {
  setLeaveAdjustments((prev) => {
    const newAdjustments = { ...prev, [leaveId]: { ...prev[leaveId], [field]: value } };
    if (field === "adjustedDays" && value !== null && value <= maxDays) {
      const leave = leaves.find(l => l._id === leaveId);
      const allDates = leave.composite ? getCompositeLeaveDates(leave.leaves) : getLeaveDates(leave);
      newAdjustments[leaveId].approvedDates = allDates.slice(0, Math.min(value, allDates.length));
    } else if (field === "adjustedDays" && (value === null || value > maxDays)) {
      newAdjustments[leaveId].approvedDates = [];
    }
    return newAdjustments;
  });
};


const handleApproval = async (id, status, currentStage, remarks = "", days = null, approvedDates = []) => {
  try {
    const leave = leaves.find(l => l._id === id);
    if (!leave) return;

    const totalDays = leave.composite ? getCompositeLeaveDuration(leave.leaves) : getLeaveDuration(leave);
    const allLeaveDates = leave.composite ? getCompositeLeaveDates(leave.leaves) : getLeaveDates(leave);
    let rejectedDates = [];

    // Initialize leaveData object
    const leaveData = {};

    // Determine valid status based on currentStage and user role (simplified assumption based on context)
    let validStatus = status; // Default to the passed status
    if (currentStage === "admin" && status !== "Acknowledged") {
      validStatus = "Acknowledged"; // Force Acknowledged for Admin
    } else if (["hod", "ceo"].includes(currentStage) && !["Approved", "Rejected"].includes(status)) {
      validStatus = "Approved"; // Default to Approved if invalid for HOD/CEO
    }

    if (days !== null && approvedDates.length) {
      leaveData.approvedDays = days;
      leaveData.approvedDates = approvedDates.map(date => ({
        date: date,
        duration: leave.approvedDates?.find(ad => ad.date === date)?.duration || 'full'
      }));
      rejectedDates = allLeaveDates.filter(d => !approvedDates.includes(d));
      leaveData.rejectedDates = rejectedDates.map(date => ({
        date: date,
        duration: leave.rejectedDates?.find(rd => rd.date === date)?.duration || 'full'
      }));
      if (rejectedDates.length > 0) {
        if (!remarks.trim()) {
          setError("Remarks are required when rejecting partial days.");
          return;
        }
        leaveData.remarks = remarks;
        console.log("Partial rejection data sent:", { ...leaveData, remarks });
      }
    } else if (validStatus === "Approved") {
      leaveData.approvedDates = allLeaveDates.map(date => ({
        date: date,
        duration: 'full'
      }));
      leaveData.rejectedDates = [];
    } else if (validStatus === "Rejected") {
      leaveData.rejectedDates = allLeaveDates.map(date => ({
        date: date,
        duration: 'full'
      }));
      leaveData.approvedDates = [];
      if (!remarks.trim()) {
        setError("Remarks are required for rejection.");
        return;
      }
      leaveData.remarks = remarks;
      console.log("Full rejection data sent:", { ...leaveData, remarks });
    }

    if (validStatus === "Rejected" && ["hod", "ceo"].includes(currentStage) && !remarks.trim()) {
      setError("Remarks are required for rejection.");
      return;
    }

    // Set the status in leaveData
    leaveData.status = validStatus;

    // Send the request with both approvedDates and rejectedDates
    const response = await api.put(`/leaves/${id}/approve`, leaveData);
    console.log("API response:", response.data);

    const updatedLeaves = leaves.map((l) => {
      if (l._id === id) {
        const newStatus = { ...l.status, [currentStage]: validStatus };
        if (validStatus === "Approved") {
          if (currentStage === "hod") {
            newStatus.ceo = "Pending";
          } else if (currentStage === "ceo") {
            newStatus.admin = "Pending";
          }
        } else if (validStatus === "Rejected") {
          newStatus.hod = "Rejected";
          newStatus.ceo = "N/A";
          newStatus.admin = "N/A";
        }
        return {
          ...l,
          status: newStatus,
          remarks: (validStatus === "Rejected" || (days !== null && rejectedDates.length > 0)) ? remarks : l.remarks,
          approvedDates: leaveData.approvedDates || [],
          rejectedDates: leaveData.rejectedDates || [],
        };
      }
      return l;
    });
    setLeaves(updatedLeaves);
    alert(`Leave ${validStatus.toLowerCase()} successfully${days !== null ? ` for ${days} days` : ""}.`);
  } catch (err) {
    console.error("Approval error:", err);
    setError(
      `Error processing leave approval: ${err.response?.data?.message || err.message}`
    );
  } finally {
    setShowConfirmationDialog(false);
    setConfirmationData(null);
  }
};

  const handleRejection = (id, stage) => {
    setPendingRejection({ id, stage });
    setRejectionRemarks("");
    setShowRejectionDialog(true);
  };

  const confirmRejection = () => {
    if (!rejectionRemarks.trim()) {
      setError("Please enter remarks for rejection.");
      return;
    }
    handleApproval(
      pendingRejection.id,
      "Rejected",
      pendingRejection.stage,
      rejectionRemarks
    );
    setShowRejectionDialog(false);
    setPendingRejection(null);
  };

const yearlyHolidays = [
  "2025-08-15", // Independence Day
  "2025-10-02", // Gandhi Jayanti
  "2025-10-22", // Diwali 2025
  "2025-10-23", // Vishwakarma Jayanti
  "2025-11-05", // Guru Nanak Jayanti
];

const getLeaveDuration = (leave) => {
  if (leave.halfDay?.date) {
    return 0.5; // Half day leave
  }
  if (leave.fullDay?.from) {
    const from = new Date(leave.fullDay.from);
    const to = leave.fullDay.to ? new Date(leave.fullDay.to) : from;
    if (to < from) return 0;

    let days = 0;
    let currentDate = new Date(from);
    while (currentDate <= to) {
      const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      const dateStr = currentDate.toISOString().split('T')[0];
      if (dayOfWeek !== 0 && !yearlyHolidays.includes(dateStr)) {
        days += 1;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const fromDuration = leave.fullDay.fromDuration || "full";
    const toDuration = leave.fullDay.toDuration || "full";
    if (fromDuration === "half") days -= 0.5;
    if (toDuration === "half" && to > from) days -= 0.5;

    return days > 0 ? days : 0;
  }
  return 0;
};

const getLeaveDates = (leave) => {
  const dates = [];
  if (leave.halfDay?.date) {
    dates.push(new Date(leave.halfDay.date).toISOString().split('T')[0]);
  } else if (leave.fullDay?.from) {
    const from = new Date(leave.fullDay.from);
    const to = leave.fullDay.to ? new Date(leave.fullDay.to) : from;
    let currentDate = new Date(from);
    while (currentDate <= to) {
      const dayOfWeek = currentDate.getDay();
      const dateStr = currentDate.toISOString().split('T')[0];
      if (dayOfWeek !== 0 && !yearlyHolidays.includes(dateStr)) {
        dates.push(dateStr);
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }
  return dates;
};

  const isEmergencyLeave = (leave) => {
    const createdAt = new Date(leave.createdAt).toISOString().split('T')[0];
    const leaveDates = getLeaveDates(leave);
    return leaveDates.includes(createdAt) && leave.status?.hod === 'Pending';
  };

  const emergencyLeaveCount = useMemo(() => {
    return leaves.filter(leave =>
      isEmergencyLeave(leave) && leave.status?.hod === 'Pending'
    ).length;
  }, [leaves]);

const formatDurationDisplay = (days) => {
  return `${days} day${days === 1 ? "" : "s"}`;
};

const formatISTDate = (date) => {
  if (!date) return "Invalid Date";
  const d = new Date(date);
  d.setHours(d.getHours() + 5);
  d.setMinutes(d.getMinutes() + 30);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).replace(/(\d+)\/(\d+)\/(\d+)/, "$1-$2-$3");
};

const getCompositeLeaveDuration = (leaves) => {
  return leaves.reduce((total, leave) => total + getLeaveDuration(leave), 0);
};

const getCompositeLeaveDates = (leaves) => {
  const allDates = [];
  leaves.forEach(leave => {
    allDates.push(...getLeaveDates(leave));
  });
  return [...new Set(allDates)].sort();
};

  const hodDepartmentName =
    user?.loginType === "HOD" && user?.department
      ? departments.find((dep) => dep._id === user.department._id)?.name ||
        "Unknown"
      : "";

  const groupedLeaves = useMemo(() => {
    const groups = {};
    leaves.forEach((leave) => {
      const key = leave.compositeLeaveId || leave._id;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(leave);
    });
    return Object.values(groups).map((group) => ({
      _id: group[0].compositeLeaveId || group[0]._id,
      composite: group.length > 1,
      leaves: group.sort((a, b) => {
        const aDate = new Date(a.fullDay?.from || a.halfDay?.date || a.createdAt);
        const bDate = new Date(b.fullDay?.from || b.halfDay?.date || b.createdAt);
        return aDate - bDate;
      }),
    }));
  }, [leaves]);

// Update filteredGroupedLeaves useMemo to sort by latest createdAt
const filteredGroupedLeaves = useMemo(() => {
  let filtered = groupedLeaves;
  if (user?.loginType === "CEO") {
    filtered = filtered.filter((group) =>
      !group.leaves.some((leave) => leave.leaveType === "Medical" && !leave.medicalCertificate)
    );
  }
  if (user?.loginType === "HOD" && viewMode === "approval" && user?.employeeId) {
    filtered = filtered.filter((group) => {
      const isHodLeave = group.leaves.some(
        (leave) =>
          leave.employeeId === user.employeeId ||
          (leave.name && user.name && leave.name === user.name)
      );
      return !isHodLeave;
    });
  }
  return filtered.sort((a, b) => {
    const aHasPendingHod = a.leaves.some((leave) => leave.status?.hod === "Pending");
    const bHasPendingHod = b.leaves.some((leave) => leave.status?.hod === "Pending");
    
    if (aHasPendingHod && !bHasPendingHod) return -1; // Pending HOD leaves come first
    if (!aHasPendingHod && bHasPendingHod) return 1;
    
    // If both have same HOD status (both pending or both not pending)
    const aDate = new Date(
      Math.min(
        ...a.leaves.map((l) => new Date(l.createdAt))
      )
    );
    const bDate = new Date(
      Math.min(
        ...b.leaves.map((l) => new Date(l.createdAt))
      )
    );
    
    // For pending HOD leaves, sort ascending (oldest first)
    // For non-pending HOD leaves, sort descending (newest first)
    return aHasPendingHod ? aDate - bDate : bDate - aDate;
  });
}, [groupedLeaves, user, viewMode]);

  const shortFormFlashcard = {
    LWP: "Leave Without Pay",
    CL: "Casual Leave",
    ML: "Medical Leave",
    RH: "Restricted Holiday",
  };

  const filteredEmployees = useMemo(() => {
    let result = employees;
    if (tempFilters.departmentId && tempFilters.departmentId !== "all") {
      result = result.filter((emp) => {
        const deptId = typeof emp.department === "object" ? emp.department._id : emp.department;
        return deptId === tempFilters.departmentId;
      });
    }
    return result;
  }, [employees, tempFilters.departmentId]);

  const getLeaveTypeBadge = (leaveType) => (
    <span
      className={`inline-block px-2 py-1 rounded-md text-sm mr-1 mb-1 ${
        leaveType === "Leave Without Pay(LWP)"
          ? "bg-red-100 text-red-800"
          : leaveType === "Casual"
          ? "bg-blue-100 text-blue-800"
          : leaveType === "Medical"
          ? "bg-green-100 text-green-800"
          : leaveType === "Restricted Holidays"
          ? "bg-orange-100 text-orange-800"
          : leaveType === "Maternity"
          ? "bg-pink-100 text-pink-800"
          : leaveType === "Paternity"
          ? "bg-purple-100 text-purple-800"
          : leaveType === "Compensatory"
          ? "bg-yellow-100 text-yellow-800"
          : "bg-gray-100 text-gray-800"
      }`}
    >
      {leaveType === "Leave Without Pay(LWP)"
        ? "LWP"
        : leaveType === "Casual"
        ? "CL"
        : leaveType === "Medical"
        ? "ML"
        : leaveType === "Restricted Holidays"
        ? "RH"
        : leaveType}
    </span>
  );

// Update the triggerConfirmation function
const triggerConfirmation = (id, status, currentStage, remarks = "", days = null, approvedDates = []) => {
  const leave = leaves.find(l => l._id === id);
  if (!leave) return;
  const totalDays = leave.composite ? getCompositeLeaveDuration(leave.leaves) : getLeaveDuration(leave);
  const allDates = leave.composite ? getCompositeLeaveDates(leave.leaves) : getLeaveDates(leave);
  const rejectedDates = allDates.filter(d => !approvedDates.includes(d));
  setConfirmationData({ 
    id, 
    status, 
    currentStage, 
    remarks, 
    days: days !== null ? days : totalDays, 
    approvedDates: approvedDates.length ? approvedDates : allDates.slice(0, Math.min(days || totalDays, allDates.length)), 
    rejectedDates, 
    totalDays 
  });
  setShowConfirmationDialog(true);
};

  return (
   <>
    <SplashScreen />
    <ContentLayout title="Leave List">
      <div className="bg-white">
        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <h3 className="text-xl font-medium mb-2 text-blue-800"><strong>Abbreviations</strong></h3>
          <div className="flex flex-wrap gap-4">
            {Object.entries(shortFormFlashcard).map(([short, full]) => (
              <span key={short} className="text-sm">
                <strong>{short}:</strong> {full}
              </span>
            ))}
          </div>
          {/* <div className="mt-2 text-sm font-medium text-red-600">
            Emergency Leaves: {emergencyLeaveCount}
          </div> */}
        </div>
        <Card>
          <CardContent className="p-6">
            {error && (
              <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">
                {error}
              </div>
            )}
            {fileError && (
              <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">
                {fileError}
              </div>
            )}
            {user?.loginType === "HOD" && (
              <div className="mb-4 flex gap-4">
                {/* View mode buttons commented out as per original code */}
              </div>
            )}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4"
            >
              {user?.loginType === "Employee" ? (
                <>
                  <div className="flex-1 min-w-[200px]">
                    <Label htmlFor="employeeName" className="text-sm font-medium">
                      Employee Name
                    </Label>
                    <Input
                      id="employeeName"
                      value={user?.name || ""}
                      readOnly
                      className="mt-1 border-gray-300 bg-gray-100 cursor-not-allowed rounded-md"
                      placeholder="Your Name"
                    />
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <Label htmlFor="departmentId" className="text-sm font-medium">
                      Department
                    </Label>
                    <Input
                      id="departmentId"
                      value={user?.department?.name || "Unknown"}
                      readOnly
                      className="mt-1 border-gray-300 bg-gray-100 cursor-not-allowed rounded-md"
                      placeholder="Your Department"
                    />
                  </div>
                </>
              ) : user?.loginType === "HOD" ? (
                <>
                  {viewMode === "own" ? (
                    <>
                      <div className="flex-1 min-w-[200px]">
                        <Label htmlFor="employeeName" className="text-sm font-medium">
                          Employee Name
                        </Label>
                        <Input
                          id="employeeName"
                          value={user?.name || "Unknown"}
                          readOnly
                          className="mt-1 border-gray-300 bg-gray-100 cursor-not-allowed rounded-md"
                          placeholder="Your Name"
                        />
                      </div>
                      <div className="flex-1 min-w-[200px]">
                        <Label htmlFor="employeeId" className="text-sm font-medium">
                          Employee ID
                        </Label>
                        <Input
                          id="employeeId"
                          value={user?.employeeId || "Unknown"}
                          readOnly
                          className="mt-1 border-gray-300 bg-gray-100 cursor-not-allowed rounded-md"
                          placeholder="Your Employee ID"
                        />
                      </div>
                      <div className="flex-1 min-w-[200px]">
                        <Label htmlFor="departmentId" className="text-sm font-medium">
                          Department
                        </Label>
                        <Input
                          id="departmentId"
                          value={hodDepartmentName}
                          readOnly
                          className="mt-1 border-gray-300 bg-gray-100 cursor-not-allowed rounded-md"
                          placeholder="Your Department"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-[200px] relative">
                        <Label htmlFor="employeeName" className="text-sm font-medium">
                          Employee Name or ID
                        </Label>
                        <Select
                          onValueChange={(value) => {
                            const selectedEmployee = employees.find(emp => emp.employeeId === value);
                            handleChange("employeeName", selectedEmployee?.name || "");
                            handleChange("employeeId", value);
                            fetchLeaves({
                              ...tempFilters,
                              employeeName: selectedEmployee?.name || "",
                              employeeId: value,
                            });
                          }}
                          value={tempFilters.employeeId || ""}
                        >
                          <SelectTrigger className="border px-3 py-2 rounded-md w-full">
                            <SelectValue placeholder="Select Employee Name" />
                          </SelectTrigger>
                          <SelectContent className="z-50 max-h-60 overflow-y-auto">
                            <SelectItem value="all">All Employees</SelectItem>
                            {employees.map(emp => (
                              <SelectItem key={emp._id} value={emp.employeeId}>
                                {emp.name} ({emp.employeeId})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1 min-w-[200px]">
                        <Label htmlFor="departmentId" className="text-sm font-medium">
                          Department
                        </Label>
                        <Input
                          id="departmentId"
                          value={hodDepartmentName}
                          readOnly
                          className="mt-1 border-gray-300 bg-gray-100 cursor-not-allowed rounded-md"
                          placeholder="Your Department"
                        />
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-[200px] relative">
                    <Label htmlFor="employeeName" className="text-sm font-medium">
                      Employee Name or ID
                    </Label>
                    <Select
                      onValueChange={(value) => {
                        const selectedEmployee = employees.find(emp => emp.employeeId === value);
                        handleChange("employeeName", selectedEmployee?.name || "");
                        handleChange("employeeId", value);
                        fetchLeaves({
                          ...tempFilters,
                          employeeName: selectedEmployee?.name || "",
                          employeeId: value,
                        });
                      }}
                      value={tempFilters.employeeId || ""}
                    >
                      <SelectTrigger className="border px-3 py-2 rounded-md w-full">
                        <SelectValue placeholder="Select Employee Name" />
                      </SelectTrigger>
                      <SelectContent className="z-50 max-h-60 overflow-y-auto">
                        <SelectItem value="all">All Employees</SelectItem>
                        {employees.map(emp => (
                          <SelectItem key={emp._id} value={emp.employeeId}>
                            {emp.name} ({emp.employeeId})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <Label htmlFor="departmentId" className="text-sm font-medium">
                      Department
                    </Label>
                    <Select
                      onValueChange={(value) => {
                        handleChange("departmentId", value);
                        fetchEmployees(value);
                      }}
                      value={tempFilters.departmentId}
                      disabled={loading}
                    >
                      <SelectTrigger
                        id="departmentId"
                        className="mt-1 border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md"
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
                  </div>
                </>
              )}
              <div className="flex-1 min-w-[200px]">
                <Label htmlFor="leaveType" className="text-sm font-medium">
                  Leave Type
                </Label>
                <Select
                  onValueChange={(value) => handleChange("leaveType", value)}
                  value={tempFilters.leaveType}
                  disabled={loading}
                >
                  <SelectTrigger
                    id="leaveType"
                    className="mt-1 border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md"
                  >
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent className="z-50">
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="Casual">CL</SelectItem>
                    <SelectItem value="Medical">ML</SelectItem>
                    <SelectItem value="Maternity">Maternity</SelectItem>
                    <SelectItem value="Paternity">Paternity</SelectItem>
                    <SelectItem value="Compensatory">Compensatory</SelectItem>
                    <SelectItem value="Restricted Holidays">RH</SelectItem>
                    <SelectItem value="Leave Without Pay(LWP)">LWP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <Label htmlFor="status" className="text-sm font-medium">
                  Approval Status (Any Stage)
                </Label>
                <Select
                  onValueChange={(value) => handleChange("status", value)}
                  value={tempFilters.status}
                  disabled={loading}
                >
                  <SelectTrigger
                    id="status"
                    className="mt-1 border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md"
                  >
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent className="z-50">
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Approved">Approved</SelectItem>
                    <SelectItem value="Rejected">Rejected</SelectItem>
                    <SelectItem value="Acknowledged">Acknowledged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <Label htmlFor="fromDate" className="text-sm font-medium">
                  From Date
                </Label>
                <Input
                  id="fromDate"
                  name="fromDate"
                  type="date"
                  value={tempFilters.fromDate}
                  onChange={(e) => handleChange("fromDate", e.target.value)}
                  className="mt-1 border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md"
                  disabled={loading}
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <Label htmlFor="toDate" className="text-sm font-medium">
                  To Date
                </Label>
                <Input
                  id="toDate"
                  name="toDate"
                  type="date"
                  value={tempFilters.toDate}
                  onChange={(e) => handleChange("toDate", e.target.value)}
                  className="mt-1 border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md"
                  disabled={loading}
                />
              </div>
              <div className="flex gap-2 items-end">
                <Button
                  onClick={handleFilter}
                  className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors"
                >
                  Filter
                </Button>
              </div>
            </motion.div>
            <div className="w-full overflow-x-auto">
              <Table className="w-full border-separate" style={{ borderSpacing: 0 }}>
                <TableHeader>
                  <TableRow className="border-b bg-gray-50">
                    <TableHead className="font-semibold px-4 py-3 text-left">
                      Employee
                    </TableHead>
                    <TableHead className="font-semibold px-4 py-3 text-left" style={{ width: "100px", minWidth: "130px" }}>
                      L.A Date
                    </TableHead>
                    <TableHead className="font-semibold px-4 py-3 text-left">
                      Type
                    </TableHead>
                    <TableHead className="font-semibold px-4 py-3 text-left" style={{ width: "150px", minWidth: "130px" }}>
                      Time Frame
                    </TableHead>
                    <TableHead className="font-semibold px-4 py-3 text-left" style={{ width: "100px", minWidth: "130px" }}>
                      View Details
                    </TableHead>
                    <TableHead className="font-semibold px-4 py-3 text-left">
                      Status (HOD)
                    </TableHead>
                    <TableHead className="font-semibold px-4 py-3 text-left">
                      Status (CEO)
                    </TableHead>
                    <TableHead className="font-semibold px-4 py-3 text-left">
                      Status (Admin)
                    </TableHead>
                    {["HOD", "Admin", "CEO"].includes(user?.loginType) &&
                      viewMode !== "own" && (
                        <TableHead className="font-semibold px-4 py-3 text-left">
                          Actions
                        </TableHead>
                      )}
                    <TableHead className="font-semibold px-4 py-3 text-left">
                      Remarks
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell
                        colSpan={
                          ["HOD", "Admin", "CEO"].includes(user?.loginType) &&
                          viewMode !== "own"
                            ? 10
                            : 9
                        }
                        className="text-center py-4"
                      >
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : filteredGroupedLeaves.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={
                          ["HOD", "Admin", "CEO"].includes(user?.loginType) &&
                          viewMode !== "own"
                            ? 10
                            : 9
                        }
                        className="text-center py-4"
                      >
                        No leave records found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredGroupedLeaves.map((group) => {
                      const firstLeave = group.leaves[0];
                      const isEmergency = group.leaves.some(isEmergencyLeave);
                      const dateRange = group.composite
                        ? `${formatISTDate(
                            Math.min(
                              ...group.leaves.map((l) =>
                                new Date(l.fullDay?.from || l.halfDay?.date || l.createdAt)
                              )
                            )
                          )} - ${formatISTDate(
                            Math.max(
                              ...group.leaves.map((l) =>
                                new Date(l.fullDay?.to || l.halfDay?.date || l.createdAt)
                              )
                            )
                          )}`
                        : formatISTDate(
                            firstLeave.fullDay?.from ||
                              firstLeave.halfDay?.date ||
                              firstLeave.createdAt
                          ) +
                          (firstLeave.fullDay?.to
                            ? ` - ${formatISTDate(firstLeave.fullDay.to)}`
                            : "");
                      return (
                        <TableRow
                          key={group._id}
                          className={`hover:bg-gray-50 border-b ${isEmergency ? 'text-red-700' : ''}`}
                        >
                         <TableCell className="px-4 py-3" style={{ minWidth: '200px', paddingLeft: '15px' }}>
  <div className={group.composite ? "pl-0" : ""}>{firstLeave.name}</div>
  
</TableCell>
                          <TableCell className="px-4 py-3">
                            {formatISTDate(firstLeave.createdAt)}
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            {group.composite
                              ? group.leaves.map((l) => getLeaveTypeBadge(l.leaveType))
                              : getLeaveTypeBadge(firstLeave.leaveType)}
                          </TableCell>
<TableCell className="px-4 py-3">
  <div>
    <span className="text-black">{dateRange}</span>
    <br />
    <span className="text-red-600">
    {formatDurationDisplay(
  group.composite
    ? getCompositeLeaveDuration(group.leaves)
    : getLeaveDuration(firstLeave)
)}

    </span>
  </div>
</TableCell>
                          <TableCell className="px-4 py-3">
                            <Button
  size="sm"
  onClick={() => {
    console.log("Selected Leave:", selectedLeave); // Debug log
    setSelectedLeave(group.composite ? group : group.leaves[0]);
    setLeaveAdjustments({});
  }}
  className="bg-blue-600 text-white hover:bg-blue-700 rounded-md"
>
  View
</Button>
                          </TableCell>
                        <TableCell className="px-4 py-3">
  {group.composite
    ? group.leaves.map((leave, index) => (
        <div
          key={leave._id}
          className={`py-1 ${index % 2 === 0 ? "text-purple-600" : "bg-white"}`}
        >
          {leave.status ? leave.status.hod || "Pending" : "N/A"}
        </div>
      ))
    : firstLeave && firstLeave.status ? firstLeave.status.hod || "Pending" : "N/A"}
</TableCell>
                        
 <TableCell className="px-4 py-3">
  {group.composite
    ? group.leaves.map((leave, index) => (
        <div
          key={leave._id}
          className={`py-1 ${index % 2 === 0 ? "text-purple-600" : "bg-white"}`}
        >
          {leave.status ? leave.status.ceo || "Pending" : "N/A"}
        </div>
      ))
    : firstLeave && firstLeave.status ? firstLeave.status.ceo || "Pending" : "N/A"}
</TableCell>
                          <TableCell className="px-4 py-3">
                            {group.composite
                              ? group.leaves.map((leave, index) => (
                                  <div
                                    key={leave._id}
                                    className={`py-1 ${index % 2 === 0 ? "text-purple-600" : "bg-white"}`}
                                  >
                                    {leave.status.admin || "Pending"}
                                  </div>
                                ))
                              : firstLeave.status.admin || "Pending"}
                          </TableCell>
                          {["HOD", "Admin", "CEO"].includes(user?.loginType) &&
                            viewMode !== "own" && (
                   <TableCell className="px-4 py-2">
  {group.composite ? (
    <div className="space-y-0">
      {group.leaves.map((leave, index) => (
        <div
          key={leave._id}
          className={`flex items-center justify-between gap-2 py-1 ${
            index % 2 === 0 ? "bg-gray-100" : "bg-white"
          }`}
        >
          <div className="flex items-center gap-2" style={{ minWidth: '200px' }}>
            <span className="inline-block w-12 text-left">
              {getLeaveTypeBadge(leave.leaveType)}
            </span>
            {user.loginType === "HOD" &&
              leave.status.hod === "Pending" && (
                <>
                  <Button
                    variant="default"
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white rounded-md"
                    onClick={() =>
                      triggerConfirmation(leave._id, "Approved", "hod", "", leaveAdjustments[leave._id]?.adjustedDays !== undefined ? leaveAdjustments[leave._id].adjustedDays : getLeaveDuration(leave), leaveAdjustments[leave._id]?.approvedDates || [])
                    }
                    disabled={loading || leave.status.hod !== "Pending"}
                    aria-label={`Approve ${leave.leaveType} leave ${leave._id} for ${leave.name}`}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 text-white rounded-md"
                    onClick={() => handleRejection(leave._id, "hod")}
                    disabled={loading || leave.status.hod !== "Pending"}
                    aria-label={`Reject ${leave.leaveType} leave ${leave._id} for ${leave.name}`}
                  >
                    Reject
                  </Button>
                </>
              )}
            {user.loginType === "CEO" &&
              ["Approved", "Submitted"].includes(leave.status.hod) &&
              leave.status.ceo === "Pending" && (
                <>
                  <Button
                    variant="default"
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white rounded-md"
                    onClick={() =>
                      triggerConfirmation(leave._id, "Approved", "ceo")
                    }
                    disabled={loading || leave.status.ceo !== "Pending"}
                    aria-label={`Approve ${leave.leaveType} leave ${leave._id} for ${leave.name}`}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 text-white rounded-md"
                    onClick={() => handleRejection(leave._id, "ceo")}
                    disabled={loading || leave.status.ceo !== "Pending"}
                    aria-label={`Reject ${leave.leaveType} leave ${leave._id} for ${leave.name}`}
                  >
                    Reject
                  </Button>
                </>
              )}
            {user.loginType === "Admin" &&
              leave.status.ceo === "Approved" &&
              leave.status.admin === "Pending" && (
                <Button
                  variant="default"
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white rounded-md"
                  onClick={() =>
                    handleApproval(
                      leave._id,
                      "Acknowledged",
                      "admin"
                    )
                  }
                  disabled={loading || leave.status.admin !== "Pending"}
                  aria-label={`Acknowledge ${leave.leaveType} leave ${leave._id} for ${leave.name}`}
                >
                  Acknowledge
                </Button>
              )}
            {(leave.status.hod !== "Pending" &&
              leave.status.hod !== "Submitted") && (
                <span className="text-sm text-gray-500">
                  Done
                </span>
              )}
            {(leave.status.ceo !== "Pending" &&
              leave.status.ceo !== "Submitted") && (
                <span className="text-sm text-gray-500">
                </span>
              )}
            {(leave.status.admin !== "Pending" &&
              leave.status.admin !== "Submitted") && (
                <span className="text-sm text-gray-500">
                </span>
              )}
          </div>
        </div>
      ))}
    </div>
  ) : (
    <div className="flex items-center gap-2" style={{ minWidth: '200px' }}>
      <span className="inline-block w-12 text-left">
        {getLeaveTypeBadge(firstLeave.leaveType)}
      </span>
      {user.loginType === "HOD" && firstLeave.status.hod === "Pending" && (
        <>
          <Button
            variant="default"
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white rounded-md"
            onClick={() =>
              triggerConfirmation(firstLeave._id, "Approved", "hod", "", leaveAdjustments[firstLeave._id]?.adjustedDays !== undefined ? leaveAdjustments[firstLeave._id].adjustedDays : getLeaveDuration(firstLeave), leaveAdjustments[firstLeave._id]?.approvedDates || [])
            }
            disabled={loading || firstLeave.status.hod !== "Pending"}
            aria-label={`Approve ${firstLeave.leaveType} leave ${firstLeave._id} for ${firstLeave.name}`}
          >
            Approve
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="bg-red-600 hover:bg-red-700 text-white rounded-md"
            onClick={() => handleRejection(firstLeave._id, "hod")}
            disabled={loading || firstLeave.status.hod !== "Pending"}
            aria-label={`Reject ${firstLeave.leaveType} leave ${firstLeave._id} for ${firstLeave.name}`}
          >
            Reject
          </Button>
        </>
      )}
      {user.loginType === "CEO" &&
        ["Approved", "Submitted"].includes(firstLeave.status.hod) &&
        firstLeave.status.ceo === "Pending" && (
          <>
            <Button
              variant="default"
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white rounded-md"
              onClick={() =>
                triggerConfirmation(firstLeave._id, "Approved", "ceo")
              }
              disabled={loading || firstLeave.status.ceo !== "Pending"}
              aria-label={`Approve ${firstLeave.leaveType} leave ${firstLeave._id} for ${firstLeave.name}`}
            >
              Approve
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white rounded-md"
              onClick={() => handleRejection(firstLeave._id, "ceo")}
              disabled={loading || firstLeave.status.ceo !== "Pending"}
              aria-label={`Reject ${firstLeave.leaveType} leave ${firstLeave._id} for ${firstLeave.name}`}
            >
              Reject
            </Button>
          </>
        )}
      {user.loginType === "Admin" &&
        firstLeave.status.ceo === "Approved" &&
        firstLeave.status.admin === "Pending" && (
          <Button
            variant="default"
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white rounded-md"
            onClick={() =>
              handleApproval(
                firstLeave._id,
                "Acknowledged",
                "admin"
              )
            }
            disabled={loading || firstLeave.status.admin !== "Pending"}
            aria-label={`Acknowledge ${firstLeave.leaveType} leave ${firstLeave._id} for ${firstLeave.name}`}
          >
            Acknowledge
          </Button>
        )}
      {(firstLeave.status.hod !== "Pending" &&
        firstLeave.status.hod !== "Submitted") && (
          <span className="text-sm text-gray-500">
           Done
          </span>
        )}
      {(firstLeave.status.ceo !== "Pending" &&
        firstLeave.status.ceo !== "Submitted") && (
          <span className="text-sm text-gray-500">
          </span>
        )}
      {(firstLeave.status.admin !== "Pending" &&
        firstLeave.status.admin !== "Submitted") && (
          <span className="text-sm text-gray-500">
          </span>
        )}
    </div>
  )}
</TableCell>
                            )}
<TableCell className="px-4 py-3">
  {group.composite ? (
    <div className="space-y-1">
      {group.leaves.map((leave) => (
        <div key={leave._id} className="text-sm">
          {(leave.remarks && leave.remarks !== 'N/A' || leave.rejectedDates.length > 0) ? (
            <Button
              size="sm"
              onClick={() => {
                setSelectedRemarkLeave(leave);
                setShowRemarksDialog(true);
              }}
              className="bg-blue-600 text-white hover:bg-blue-700 rounded-md"
            >
              View Remarks
            </Button>
          ) : (
            <span>-</span>
          )}
        </div>
      ))}
    </div>
  ) : (firstLeave.remarks && firstLeave.remarks !== 'N/A' || firstLeave.rejectedDates.length > 0) ? (
    <Button
      size="sm"
      onClick={() => {
        setSelectedRemarkLeave(firstLeave);
        setShowRemarksDialog(true);
      }}
      className="bg-blue-600 text-white hover:bg-blue-700 rounded-md"
    >
      View Remarks
    </Button>
  ) : (
    <span>-</span>
  )}
</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
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
              <Dialog
                open={!!selectedLeave}
                onOpenChange={() => {
                  setSelectedLeave(null);
                  setLeaveAdjustments({});
                }}
              >
           <DialogContent className="max-w-4xl max-h-[98vh] overflow-y-auto">
  <DialogHeader>
    <DialogTitle>Leave Application Details</DialogTitle>
    <DialogDescription>
      {selectedLeave?.composite
        ? "Details of the composite leave application."
        : "Details of the selected leave application."}
    </DialogDescription>
  </DialogHeader>
 {selectedLeave && (
  <div className="space-y-6">
    <div className="border p-4 rounded-lg bg-gray-50">
      <p className="text-sm font-medium text-gray-700">
        <strong>Leave Application Date:</strong>{" "}
        {formatISTDate(
          selectedLeave.composite
            ? Math.min(
                ...selectedLeave.leaves.map((l) =>
                  new Date(l.createdAt)
                )
              )
            : selectedLeave.createdAt
        )}
      </p>
    </div>
    {selectedLeave.composite ? (
      selectedLeave.leaves.map((leave, index) => (
        <div
          key={leave._id}
          className="border p-4 rounded-lg bg-gray-50 mb-4 last:mb-0"
        >
          <h3 className="font-semibold text-lg mb-2">
            {getLeaveTypeBadge(leave.leaveType)}
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm text-gray-700">
            <p>
              <strong>From:</strong>{" "}
              {formatISTDate(
                leave.fullDay?.from || leave.halfDay?.date || leave.createdAt
              )}
              {leave.fullDay?.fromDuration === "half" &&
                ` (${leave.fullDay.fromSession})`}
            </p>
            <p>
              <strong>To:</strong>{" "}
              {leave.fullDay?.to
                ? `${formatISTDate(leave.fullDay.to)}${
                    leave.fullDay.toDuration === "half"
                      ? ` (${leave.fullDay.toSession})`
                      : ""
                  }`
                : "N/A"}
            </p>
           <p>
  <strong>Leave Duration:</strong>{" "}
  {formatDurationDisplay(getLeaveDuration(leave))}
</p>

            <p>
              <strong>Reason:</strong> {leave.reason || "N/A"}
            </p>
            <p>
              <strong>Charge Given To:</strong>{" "}
              {leave.chargeGivenTo?.name || "N/A"}
            </p>
            <p>
              <strong>Emergency Contact:</strong>{" "}
              {leave.emergencyContact || "N/A"}
            </p>
            {leave.compensatoryDate && (
              <p>
                <strong>Compensatory Date:</strong>{" "}
                {formatISTDate(leave.compensatoryDate)}
              </p>
            )}
            {leave.projectDetails && (
              <p>
                <strong>Project Details:</strong> {leave.projectDetails}
              </p>
            )}
            {leave.restrictedHoliday && (
              <p>
                <strong>Restricted Holiday:</strong>{" "}
                {leave.restrictedHoliday}
              </p>
            )}
            {leave.medicalCertificate && (
              <p>
                <strong>Medical Certificate:</strong>{" "}
                <Button
                  size="sm"
                  onClick={() =>
                    handleViewFile(leave.medicalCertificate?._id)
                  }
                  className="bg-blue-600 text-white hover:bg-blue-700 rounded-md"
                  disabled={fileError}
                >
                  View {leave.medicalCertificate.filename}
                </Button>
              </p>
            )}
            {leave.approvedDates?.length > 0 && (
              <p>
                <strong>Approved Dates:</strong>{" "}
                {leave.approvedDates.map(ad => `${formatISTDate(ad.date)}${ad.duration ? ` (${ad.duration})` : ''}`).join(', ')}
              </p>
            )}
            {leave.rejectedDates?.length > 0 && (
              <p>
                <strong>Rejected Dates:</strong>{" "}
                {leave.rejectedDates.map(rd => `${formatISTDate(rd.date)}${rd.duration ? ` (${rd.duration})` : ''}`).join(', ')}
              </p>
            )}
          </div>
          {user?.loginType === "Employee" && leave?.status && (
            <div className="mt-4">
              {leave.status.hod === "Approved" && leave.status.ceo === "Approved" && (
                <p className="text-green-600 ">
                 🎉 Hurray! Your leave has been approved. ✅
                </p>
              )}
              {(leave.status.hod === "Rejected" || leave.status.ceo === "Rejected" || leave.status.admin === "Rejected") && (
                <p className="text-red-600 ">
                  😔 Sorry,Your leave has been rejected. ❌
                </p>
              )}
              {(leave.status.hod !== "Approved" && leave.status.hod !== "Rejected" && leave.status.ceo !== "Approved" && leave.status.ceo !== "Rejected" && leave.status.ceo !== "Pending") && (
                <p className="text-yellow-600 ">
                  ⏳ Hey, your leave is pending for approval.
                </p>
              )}
            </div>
          )}
          {user.loginType === "HOD" && leave?.status?.hod === "Pending" && (
            <div className="mt-4 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label
                  htmlFor={`adjustedDays-${leave._id}`}
                  className="text-sm font-medium"
                >
                  Approved Days
                </Label>
                <Input
                  id={`adjustedDays-${leave._id}`}
                  type="number"
                  min="0"
                  max={getLeaveDuration(leave)}
                  value={
                    leaveAdjustments[leave._id]?.adjustedDays !== undefined
                      ? leaveAdjustments[leave._id].adjustedDays
                      : getLeaveDuration(leave)
                  }
                  onChange={(e) => {
                    const newDays = e.target.value ? parseFloat(e.target.value) : null;
                    handleAdjustmentChange(leave._id, "adjustedDays", newDays, getLeaveDuration(leave));
                  }}
                  className="border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md w-24"
                />
              </div>

{leaveAdjustments[leave._id]?.adjustedDays !== undefined &&
 leaveAdjustments[leave._id]?.adjustedDays < getLeaveDuration(leave) && (
<div className="flex flex-col gap-2">
 <Label className="text-sm font-medium">Approval Time Frame</Label>
<div className="border p-2 rounded-md bg-white shadow-sm">
  {(() => {
    const segmentDates = getLeaveDates(leave).filter((date) => {
      const jsDate = new Date(date);
      const isSunday = jsDate.getDay() === 0;
      const isHoliday = yearlyHolidays.includes(date);
      return !isSunday && !isHoliday;
    });

    const approvedDates = leaveAdjustments[leave._id]?.approvedDates || [];
    const adjustedDays = leaveAdjustments[leave._id]?.adjustedDays || 0;

    return segmentDates.map((date) => {
      const isSelected = approvedDates.includes(date);
      const canSelectMore = approvedDates.length < adjustedDays;

      return (
        <div key={date} className="flex items-center gap-2 mb-1">
          <input
            type="checkbox"
            checked={isSelected}
            disabled={!isSelected && !canSelectMore}
            onChange={() => {
              const newDates = isSelected
                ? approvedDates.filter((d) => d !== date)
                : [...approvedDates, date];

              if (newDates.length > adjustedDays) return;

              handleAdjustmentChange(
                leave._id,
                "approvedDates",
                newDates,
                getLeaveDuration(leave)
              );
            }}
          />
          <span>{formatISTDate(date)}</span>
        </div>
      );
    });
  })()}
  <div className="text-sm text-gray-500 mt-1">
    {leaveAdjustments[leave._id]?.approvedDates?.length || 0}/{leaveAdjustments[leave._id]?.adjustedDays || 0} days selected
  </div>
</div>

</div>
)}


              <div className="flex gap-2 items-center">
                <Button
                  variant="default"
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white rounded-md"
                  onClick={() =>
                    triggerConfirmation(
                      leave._id,
                      "Approved",
                      "hod",
                      "",
                      leaveAdjustments[leave._id]?.adjustedDays !== undefined
                        ? leaveAdjustments[leave._id].adjustedDays
                        : getLeaveDuration(leave),
                      leaveAdjustments[leave._id]?.approvedDates || []
                    )
                  }
                  disabled={
                    loading ||
                    leave.status.hod !== "Pending" ||
                    leaveAdjustments[leave._id]?.adjustedDays === 0
                  }
                >
                  Approve
                  {leaveAdjustments[leave._id]?.adjustedDays !== undefined &&
                    ` (${leaveAdjustments[leave._id].adjustedDays} days)`}
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 text-white rounded-md"
                    onClick={() => handleRejection(leave._id, "hod")}
                    disabled={loading || leave.status.hod !== "Pending"}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </div>
          )}
          {["HOD", "Admin", "CEO"].includes(user?.loginType) &&
            viewMode !== "own" && (
              <div className="mt-4 flex gap-2">
                {user.loginType === "CEO" &&
                  ["Approved", "Submitted"].includes(leave.status.hod) &&
                  leave?.status?.ceo === "Pending" && (
                    <>
                      <Button
                        variant="default"
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white rounded-md"
                        onClick={() =>
                          triggerConfirmation(leave._id, "Approved", "ceo")
                        }
                        disabled={loading || leave.status.ceo !== "Pending"}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="bg-red-600 hover:bg-red-700 text-white rounded-md"
                        onClick={() => handleRejection(leave._id, "ceo")}
                        disabled={loading || leave.status.ceo !== "Pending"}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                {user.loginType === "Admin" &&
                  leave?.status?.ceo === "Approved" &&
                  leave?.status?.admin === "Pending" && (
                    <Button
                      variant="default"
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white rounded-md"
                      onClick={() =>
                        handleApproval(
                          leave._id,
                          "Acknowledged",
                          "admin"
                        )
                      }
                      disabled={loading || leave.status.admin !== "Pending"}
                    >
                      Acknowledge
                    </Button>
                  )}
                {(leave.status.hod !== "Pending" &&
                  leave.status.hod !== "Submitted") &&
                  user.loginType === "HOD" && (
                    <span className="text-sm text-gray-500">
                      Action Completed
                    </span>
                  )}
                {(leave.status.ceo !== "Pending" &&
                  leave.status.ceo !== "Submitted") &&
                  user.loginType === "CEO" && (
                    <span className="text-sm text-gray-500">
                      Action Completed
                    </span>
                  )}
                {(leave.status.admin !== "Pending" &&
                  leave.status.admin !== "Submitted") &&
                  user.loginType === "Admin" && (
                    <span className="text-sm text-gray-500">
                      Action Completed
                    </span>
                  )}
              </div>
            )}
        </div>
      ))
    ) : (
      <div className="border p-4 rounded-lg bg-gray-50">
        <h3 className="font-semibold text-lg mb-2">
          {getLeaveTypeBadge(selectedLeave.leaveType)}
        </h3>
        <div className="grid grid-cols-2 gap-4 text-sm text-gray-700">
          <p>
            <strong>From:</strong>{" "}
            {formatISTDate(
              selectedLeave.fullDay?.from ||
                selectedLeave.halfDay?.date ||
                selectedLeave.createdAt
            )}
            {selectedLeave.fullDay?.fromDuration === "half" &&
              ` (${selectedLeave.fullDay.fromSession})`}
          </p>
          <p>
            <strong>To:</strong>{" "}
            {selectedLeave.fullDay?.to
              ? `${formatISTDate(selectedLeave.fullDay.to)}${
                  selectedLeave.fullDay.toDuration === "half"
                    ? ` (${selectedLeave.fullDay.toSession})`
                    : ""
                }`
              : "N/A"}
          </p>
          <p>
            <strong>Leave Duration:</strong>{" "}
            {formatDurationDisplay(getLeaveDuration(selectedLeave))}
          </p>
          <p>
            <strong>Reason:</strong> {selectedLeave.reason || "N/A"}
          </p>
          <p>
            <strong>Charge Given To:</strong>{" "}
            {selectedLeave.chargeGivenTo?.name || "N/A"}
          </p>
          <p>
            <strong>Emergency Contact:</strong>{" "}
            {selectedLeave.emergencyContact || "N/A"}
          </p>
          {selectedLeave.compensatoryDate && (
            <p>
              <strong>Compensatory Date:</strong>{" "}
              {formatISTDate(selectedLeave.compensatoryDate)}
            </p>
          )}
          {selectedLeave.projectDetails && (
            <p>
              <strong>Project Details:</strong>{" "}
              {selectedLeave.projectDetails}
            </p>
          )}
          {selectedLeave.restrictedHoliday && (
            <p>
              <strong>Restricted Holiday:</strong>{" "}
              {selectedLeave.restrictedHoliday}
            </p>
          )}
          {selectedLeave.medicalCertificate && (
            <p>
              <strong>Medical Certificate:</strong>{" "}
              <Button
                size="sm"
                onClick={handleViewFile}
                className="bg-blue-600 text-white hover:bg-blue-700 rounded-md"
                disabled={fileError}
              >
                View {selectedLeave.medicalCertificate.filename}
              </Button>
            </p>
          )}
          {selectedLeave.approvedDates?.length > 0 && (
            <p>
              <strong>Approved Dates:</strong>{" "}
              {selectedLeave.approvedDates.map(ad => `${formatISTDate(ad.date)}${ad.duration ? ` (${ad.duration})` : ''}`).join(', ')}
            </p>
          )}
          {selectedLeave.rejectedDates?.length > 0 && (
            <p>
              <strong>Rejected Dates:</strong>{" "}
              {selectedLeave.rejectedDates.map(rd => `${formatISTDate(rd.date)}${rd.duration ? ` (${rd.duration})` : ''}`).join(', ')}
            </p>
          )}
        </div>
 {user?.loginType === "Employee" && selectedLeave?.status && (
  <div className="mt-4">
    {selectedLeave.status.hod === "Approved" && selectedLeave.status.ceo === "Approved" && (
      <p className="text-green-600 ">
       🎉 Hurray! Your leave has been approved. ✅
      </p>
    )}
    {(selectedLeave.status.hod === "Rejected" || selectedLeave.status.ceo === "Rejected" || selectedLeave.status.admin === "Rejected") && (
      <p className="text-red-600 ">
       😔 Sorry,Your leave has been rejected. ❌
      </p>
    )}
    {(selectedLeave.status.hod !== "Approved" && selectedLeave.status.hod !== "Rejected" && selectedLeave.status.ceo !== "Approved" && selectedLeave.status.ceo !== "Rejected" && selectedLeave.status.ceo === "Pending" && selectedLeave.status.hod === "Pending") && (
      <p className="text-blue-800 ">
       ⏳ Hey, your leave is pending for approval.
      </p>
    )}
  </div>
)}
     {user.loginType === "HOD" && selectedLeave?.status?.hod === "Pending" && (
  <div className="mt-4 flex items-center gap-4">
    <div className="flex items-center gap-2">
      <Label
        htmlFor={`adjustedDays-${selectedLeave._id}`}
        className="text-sm font-medium"
      >
        Approved Days
      </Label>
      <Input
        id={`adjustedDays-${selectedLeave._id}`}
        type="number"
        min="0"
        max={getLeaveDuration(selectedLeave)}
        value={
          leaveAdjustments[selectedLeave._id]?.adjustedDays !== undefined
            ? leaveAdjustments[selectedLeave._id].adjustedDays
            : getLeaveDuration(selectedLeave)
        }
        onChange={(e) => {
          const newDays = e.target.value ? parseFloat(e.target.value) : null;
          handleAdjustmentChange(
            selectedLeave._id,
            "adjustedDays",
            newDays,
            getLeaveDuration(selectedLeave)
          );
        }}
        className="border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md w-24"
      />
    </div>
    {leaveAdjustments[selectedLeave._id]?.adjustedDays !== undefined &&
      leaveAdjustments[selectedLeave._id]?.adjustedDays < getLeaveDuration(selectedLeave) && (
<div className="flex flex-col gap-2">
  <Label className="text-sm font-medium">Approval Time Frame</Label>
  <div className="border p-2 rounded-md bg-white shadow-sm">
 {
  (
    selectedLeave.composite
      ? getCompositeLeaveDates(selectedLeave.leaves)
      : getLeaveDates(selectedLeave)
  )
    .filter((date) => {
      const jsDate = new Date(date);
      const isSunday = jsDate.getDay() === 0;
      const isHoliday = yearlyHolidays.includes(date);
      return !isSunday && !isHoliday;
    })
    .map((date) => {
      const approvedDates = leaveAdjustments[selectedLeave._id]?.approvedDates || [];
      const adjustedDays = leaveAdjustments[selectedLeave._id]?.adjustedDays || 0;
      const isSelected = approvedDates.includes(date);
      const canSelectMore = approvedDates.length < adjustedDays;

      return (
        <div key={date} className="flex items-center gap-2 mb-1">
          <input
            type="checkbox"
            checked={isSelected}
            disabled={!isSelected && !canSelectMore}
            onChange={() => {
              const newDates = isSelected
                ? approvedDates.filter((d) => d !== date)
                : [...approvedDates, date];

              if (newDates.length > adjustedDays) return;

              handleAdjustmentChange(
                selectedLeave._id,
                "approvedDates",
                newDates,
                getLeaveDuration(selectedLeave)
              );
            }}
          />
          <span>{formatISTDate(date)}</span>
        </div>
      );
    })
}


    <div className="text-sm text-gray-500 mt-1">
      {leaveAdjustments[selectedLeave._id]?.approvedDates?.length || 0}/{leaveAdjustments[selectedLeave._id]?.adjustedDays || 0} days selected
    </div>
  </div>
</div>
    )}
    <div className="flex gap-2 items-center">
      <Button
        variant="default"
        size="sm"
        className="bg-green-600 hover:bg-green-700 text-white rounded-md"
        onClick={() =>
          triggerConfirmation(
            selectedLeave._id,
            "Approved",
            "hod",
            "",
            leaveAdjustments[selectedLeave._id]?.adjustedDays !== undefined
              ? leaveAdjustments[selectedLeave._id].adjustedDays
              : getLeaveDuration(selectedLeave),
            leaveAdjustments[selectedLeave._id]?.approvedDates || []
          )
        }
        disabled={
          loading ||
          selectedLeave.status.hod !== "Pending" ||
          leaveAdjustments[selectedLeave._id]?.adjustedDays === 0
        }
      >
        Approve
        {leaveAdjustments[selectedLeave._id]?.adjustedDays !== undefined &&
          ` (${leaveAdjustments[selectedLeave._id].adjustedDays} days)`}
      </Button>
      <div className="flex items-center gap-2">
        <Button
          variant="destructive"
          size="sm"
          className="bg-red-600 hover:bg-red-700 text-white rounded-md"
          onClick={() =>
            handleRejection(selectedLeave._id, "hod")
          }
          disabled={
            loading || selectedLeave.status.hod !== "Pending"
          }
        >
          Reject
        </Button>
      </div>
    </div>
  </div>
)}
        {["HOD", "Admin", "CEO"].includes(user?.loginType) &&
          viewMode !== "own" && (
            <div className="mt-4 flex gap-2">
              {user.loginType === "CEO" &&
                ["Approved", "Submitted"].includes(
                  selectedLeave.status.hod
                ) &&
                selectedLeave?.status?.ceo === "Pending" && (
                  <>
                    <Button
                      variant="default"
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white rounded-md"
                      onClick={() =>
                        triggerConfirmation(
                          selectedLeave._id,
                          "Approved",
                          "ceo"
                        )
                      }
                      disabled={
                        loading || selectedLeave.status.ceo !== "Pending"
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="bg-red-600 hover:bg-red-700 text-white rounded-md"
                      onClick={() =>
                        handleRejection(selectedLeave._id, "ceo")
                      }
                      disabled={
                        loading || selectedLeave.status.ceo !== "Pending"
                      }
                    >
                      Reject
                    </Button>
                  </>
                )}
              {user.loginType === "Admin" &&
                selectedLeave?.status?.ceo === "Approved" &&
                selectedLeave?.status?.admin === "Pending" && (
                  <Button
                    variant="default"
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white rounded-md"
                    onClick={() =>
                      handleApproval(
                        selectedLeave._id,
                        "Acknowledged",
                        "admin"
                      )
                    }
                    disabled={
                      loading || selectedLeave.status.admin !== "Pending"
                    }
                  >
                    Acknowledge
                  </Button>
                )}
            {(selectedLeave?.status && selectedLeave.status.hod !== "Pending" && selectedLeave.status.hod !== "Submitted") &&
  user.loginType === "HOD" && (
    <span className="text-sm text-gray-500">
    Done
    </span>
  )}
             {(selectedLeave?.status && selectedLeave.status.ceo !== "Pending" && selectedLeave.status.ceo !== "Submitted") &&
  user.loginType === "CEO" && (
    <span className="text-sm text-gray-500">
     
    </span>
  )}
             {(selectedLeave?.status && selectedLeave.status.admin !== "Pending" && selectedLeave.status.admin !== "Submitted") &&
  user.loginType === "Admin" && (
    <span className="text-sm text-gray-500">
     
    </span>
  )}
            </div>
          )}
      </div>
    )}
  </div>
)}
<DialogFooter className="mt-4">
  <Button
    onClick={() => {
      setSelectedLeave(null);
      setLeaveAdjustments({});
    }}
    className="bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-md"
  >
    Close
  </Button>
</DialogFooter>
</DialogContent>
              </Dialog>
              <Dialog
                open={showRejectionDialog}
                onOpenChange={() => setShowRejectionDialog(false)}
              >
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Reject Leave</DialogTitle>
                    <DialogDescription>
                      Please provide a reason for rejecting this leave application.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <Label
                      htmlFor="rejectionRemarks"
                      className="text-sm font-medium"
                    >
                      Rejection Remarks
                    </Label>
                    <Input
                      id="rejectionRemarks"
                      value={rejectionRemarks}
                      onChange={(e) => setRejectionRemarks(e.target.value)}
                      placeholder="Enter reason for rejection"
                      className="border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md"
                    />
                  </div>
                  <DialogFooter className="mt-4">
                    <Button
                      onClick={() => setShowRejectionDialog(false)}
                      className="bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-md"
                    >
                      Cancel
                    </Button>
                    <Button
                      className="ml-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                      onClick={confirmRejection}
                    >
                      Confirm Rejection
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Dialog
                open={showRemarksDialog}
                onOpenChange={setShowRemarksDialog}
              >
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Remarks Details</DialogTitle>
                    <DialogDescription>
                      Detailed remarks for the selected leave application.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 p-4">
                    {selectedRemarkLeave?.remarks ? (
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <p className="whitespace-pre-wrap break-words">
                          {selectedRemarkLeave.remarks}
                        </p>
                        {selectedRemarkLeave.status.hod === "Rejected" && (
                          <p className="text-xs text-gray-500 mt-2">
                            Rejected by HOD on{" "}
                            {formatISTDate(selectedRemarkLeave.updatedAt)}
                          </p>
                        )}
                        {selectedRemarkLeave.status.ceo === "Rejected" && (
                          <p className="text-xs text-gray-500 mt-2">
                            Rejected by CEO on{" "}
                            {formatISTDate(selectedRemarkLeave.updatedAt)}
                          </p>
                        )}
                        {selectedRemarkLeave.status.admin === "Rejected" && (
                          <p className="text-xs text-gray-500 mt-2">
                            Rejected by Admin on{" "}
                            {formatISTDate(selectedRemarkLeave.updatedAt)}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-center">No remarks available.</p>
                    )}
                  </div>
                  <DialogFooter className="mt-4">
                    <Button
                      onClick={() => setShowRemarksDialog(false)}
                      className="bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-md"
                    >
                      Close
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
<Dialog
  open={showConfirmationDialog}
  onOpenChange={setShowConfirmationDialog}
>
  <DialogContent className="max-w-lg">
    <DialogHeader>
      <DialogTitle>Confirm Action</DialogTitle>
      <DialogDescription>
        {confirmationData && confirmationData.days !== null && confirmationData.days < (confirmationData.totalDays || 0)
          ? `Are you sure you want to approve ${confirmationData.days} day${confirmationData.days === 1 ? '' : 's'} (${confirmationData.approvedDates?.map(date => formatISTDate(date)).join(', ') || ''}) and reject ${confirmationData.totalDays - confirmationData.days} day${(confirmationData.totalDays - confirmationData.days) === 1 ? '' : 's'} (${confirmationData.rejectedDates?.map(date => formatISTDate(date)).join(', ') || ''})? Please provide remarks for rejected days.`
          : confirmationData ? `Are you sure you want to ${confirmationData.status?.toLowerCase() || 'process'} this leave?` : 'Please wait, loading confirmation details...'}
      </DialogDescription>
    </DialogHeader>
    <div className="space-y-3">
      {confirmationData && (confirmationData.days !== null && confirmationData.days < (confirmationData.totalDays || 0) || status === "Rejected") && (
        <div>
          <Label htmlFor="confirmationRemarks" className="text-sm font-medium">
            Remarks {(confirmationData.days !== null && confirmationData.days < (confirmationData.totalDays || 0)) ? "for Rejected Days" : "for Rejection"}
          </Label>
          <Input
            id="confirmationRemarks"
            value={rejectionRemarks}
            onChange={(e) => setRejectionRemarks(e.target.value)}
            placeholder={`Enter reason for ${(confirmationData.days !== null && confirmationData.days < (confirmationData.totalDays || 0)) ? 'rejecting partial days' : 'rejection'}`}
            className="border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md"
          />
        </div>
      )}
    </div>
    <DialogFooter className="mt-4">
      <Button
        onClick={() => setShowConfirmationDialog(false)}
        className="bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-md"
      >
        Cancel
      </Button>
      <Button
        className="ml-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
        onClick={() => {
          if (confirmationData && ((confirmationData.days !== null && confirmationData.days < (confirmationData.totalDays || 0)) || status === "Rejected") && !rejectionRemarks.trim()) {
            setError("Remarks are required for rejection.");
            return;
          }
          handleApproval(
            confirmationData?.id || '',
            confirmationData?.status || 'Approved',
            confirmationData?.currentStage || 'hod',
            rejectionRemarks,
            confirmationData?.days !== null ? confirmationData.days : getLeaveDuration(leaves.find(l => l._id === (confirmationData?.id || '')) || {}),
            confirmationData?.approvedDates || []
          );
        }}
      >
        Confirm
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
    
    </>
  );
}

export default LeaveList;