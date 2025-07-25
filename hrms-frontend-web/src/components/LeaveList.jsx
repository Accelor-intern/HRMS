// Leave list updated version with Pending/Past Approvals toggle and mobile responsiveness (version 1.2)
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
import CalendarComponent from "./CalendarComponent";


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
  const [approvalFilter, setApprovalFilter] = useState("pending"); // New state for toggle
  const [showCalendar, setShowCalendar] = useState(false); // New state for toggling calendar visibility

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

      const leaveData = {};

      let validStatus = status;
      if (currentStage === "admin" && status !== "Acknowledged") {
        validStatus = "Acknowledged";
      } else if (["hod", "ceo"].includes(currentStage) && !["Approved", "Rejected"].includes(status)) {
        validStatus = "Approved";
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
      }

      leaveData.status = validStatus;

      const response = await api.put(`/leaves/${id}/approve`, leaveData);
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
    "2025-08-15",
    "2025-10-02",
    "2025-10-22",
    "2025-10-23",
    "2025-11-05",
  ];

  const getLeaveDuration = (leave) => {
    if (leave.halfDay?.date) {
      return 0.5;
    }
    if (leave.fullDay?.from) {
      const from = new Date(leave.fullDay.from);
      const to = leave.fullDay.to ? new Date(leave.fullDay.to) : from;
      if (to < from) return 0;

      let days = 0;
      let currentDate = new Date(from);
      while (currentDate <= to) {
        const dayOfWeek = currentDate.getDay();
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
   // Apply Pending / Past filter
  if (user?.loginType === "HOD" && viewMode === "approval") {
    filtered = approvalFilter === "pending"
      ? filtered.filter((group) => group.leaves.some((leave) => leave.status?.hod === "Pending"))
      : filtered.filter((group) => group.leaves.every((leave) => leave.status?.hod !== "Pending"));
  } else if (user?.loginType === "CEO") {
    filtered = approvalFilter === "pending"
      ? filtered.filter((group) => group.leaves.some((leave) => leave.status?.ceo === "Pending"))
      : filtered.filter((group) => group.leaves.every((leave) => leave.status?.ceo !== "Pending"));
  }

  
    return filtered.sort((a, b) => {
      const aHasPendingHod = a.leaves.some((leave) => leave.status?.hod === "Pending");
      const bHasPendingHod = b.leaves.some((leave) => leave.status?.hod === "Pending");
      
      if (aHasPendingHod && !bHasPendingHod) return -1;
      if (!aHasPendingHod && bHasPendingHod) return 1;
      
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
      
      return aHasPendingHod ? aDate - bDate : bDate - aDate;
    });
  }, [groupedLeaves, user, viewMode, approvalFilter]);

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
      className={`inline-block px-2 py-1 rounded-md text-sm mr-1 mb-1 ${leaveType === "Leave Without Pay(LWP)"
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

  const renderApprovalTimeFrame = (leave) => {
    const approvedDatesRaw =
      leaveAdjustments?.[selectedLeave?._id]?.approvedDates ||
      selectedLeave?.approvedDates ||
      [];

    const adjustedDays =
      leaveAdjustments?.[selectedLeave?._id]?.adjustedDays || 0;

    return getLeaveDates?.(leave)
      ?.filter((date) => {
        const jsDate = new Date(date);
        return (
          jsDate instanceof Date &&
          !isNaN(jsDate) &&
          jsDate.getDay() !== 0 &&
          !yearlyHolidays?.includes(date)
        );
      })
      ?.map((date) => {
        const isoDate = new Date(date).toISOString().split("T")[0];
        const approvedSet = new Set(
          approvedDatesRaw.map((d) =>
            new Date(typeof d === "string" ? d : d?.date || d)
              .toISOString()
              .split("T")[0]
          )
        );
        const rejectedSet = new Set(
          (selectedLeave?.rejectedDates || []).map((rd) =>
            new Date(typeof rd === "string" ? rd : rd?.date)
              .toISOString()
              .split("T")[0]
          )
        );
        const isRejected = rejectedSet.has(isoDate);
        const isSelected = approvedSet.has(isoDate);
        const canSelectMore = approvedSet.size < adjustedDays;

        return (
          <div key={date} className="flex items-center gap-2 mb-1">
            <input
              type="checkbox"
              checked={isSelected}
              disabled={isRejected || (!isSelected && !canSelectMore)}
              onChange={() => {
                const newDates = isSelected
                  ? approvedDatesRaw.filter((d) => {
                      const dIso = new Date(typeof d === "string" ? d : d?.date || d)
                        .toISOString()
                        .split("T")[0];
                      return dIso !== isoDate;
                    })
                  : [...approvedDatesRaw, date];

                if (newDates.length > adjustedDays) return;

                handleAdjustmentChange?.(
                  selectedLeave?._id,
                  "approvedDates",
                  newDates,
                  getLeaveDuration?.(selectedLeave) || 0
                );
              }}
              id={`date-${selectedLeave?._id}-${date}`}
              aria-label={`Select ${formatISTDate?.(date) || date} for ${selectedLeave?.leaveType || "leave"}`}
            />
            <span
              className={`text-sm ${isSelected ? "" : isRejected ? "text-red-700 line-through font-semibold" : "text-yellow-700 font-semibold"}`}
            >
              {formatISTDate?.(date) || date}
            </span>
            {!isSelected && isRejected && (
              <span className="text-xs text-red-800 font-semibold ml-1">
                (Rejected)
              </span>
            )}
            {!isSelected && !isRejected && (
              <span className="text-xs text-red-600 ml-1">(Not Approved)</span>
            )}
          </div>
        );
      });
  };

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
    <ContentLayout title="Leave List">
      <div className="bg-white min-h-screen">
        <div className="mb-4 p-4 bg-blue-50 rounded-lg">
          <h3 className="text-lg sm:text-xl font-medium mb-2 text-blue-800"><strong>Abbreviations</strong></h3>
          <div className="flex flex-wrap gap-4">
            {Object.entries(shortFormFlashcard).map(([short, full]) => (
              <span key={short} className="text-xs sm:text-sm">
                <strong>{short}:</strong> {full}
              </span>
            ))}
          </div>
        </div>
        <Card>
          <CardContent className="p-4 sm:p-6">
            {error && (
              <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}
            {fileError && (
              <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg text-sm">
                {fileError}
              </div>
            )}
            {["HOD", "CEO"].includes(user?.loginType) && viewMode !== "own" && (
              <div className="mb-4 flex gap-2 sm:gap-4">
                <Button
                  onClick={() => setApprovalFilter("pending")}
                  className={`px-3 py-1 sm:px-4 sm:py-2 text-sm sm:text-base rounded-md transition-colors ${
                    approvalFilter === "pending"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                  }`}
                >
                  Pending Approvals
                </Button>
                <Button
                  onClick={() => setApprovalFilter("past")}
                  className={`px-3 py-1 sm:px-4 sm:py-2 text-sm sm:text-base rounded-md transition-colors ${
                    approvalFilter === "past"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                  }`}
                >
                  Past Approvals
                </Button>
              </div>
            )}
        <motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5 }}
  className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
>
  {user?.loginType === "Employee" ? (
    <>
      <div className="min-w-0">
        <Label htmlFor="employeeName" className="text-sm font-medium">
          Employee Name
        </Label>
        <Input
          id="employeeName"
          value={user?.name || ""}
          readOnly
          className="mt-1 border-gray-300 bg-gray-100 cursor-not-allowed rounded-md text-sm w-full"
          placeholder="Your Name"
        />
      </div>
      <div className="min-w-0">
        <Label htmlFor="departmentId" className="text-sm font-medium">
          Department
        </Label>
        <Input
          id="departmentId"
          value={user?.department?.name || "Unknown"}
          readOnly
          className="mt-1 border-gray-300 bg-gray-100 cursor-not-allowed rounded-md text-sm w-full"
          placeholder="Your Department"
        />
      </div>
    </>
  ) : user?.loginType === "HOD" ? (
    <>
      {viewMode === "own" ? (
        <>
          <div className="min-w-0">
            <Label htmlFor="employeeName" className="text-sm font-medium">
              Employee Name
            </Label>
            <Input
              id="employeeName"
              value={user?.name || "Unknown"}
              readOnly
              className="mt-1 border-gray-300 bg-gray-100 cursor-not-allowed rounded-md text-sm w-full"
              placeholder="Your Name"
            />
          </div>
          <div className="min-w-0">
            <Label htmlFor="employeeId" className="text-sm font-medium">
              Employee ID
            </Label>
            <Input
              id="employeeId"
              value={user?.employeeId || "Unknown"}
              readOnly
              className="mt-1 border-gray-300 bg-gray-100 cursor-not-allowed rounded-md text-sm w-full"
              placeholder="Your Employee ID"
            />
          </div>
          <div className="min-w-0">
            <Label htmlFor="departmentId" className="text-sm font-medium">
              Department
            </Label>
            <Input
              id="departmentId"
              value={hodDepartmentName}
              readOnly
              className="mt-1 border-gray-300 bg-gray-100 cursor-not-allowed rounded-md text-sm w-full"
              placeholder="Your Department"
            />
          </div>
        </>
      ) : (
        <>
          <div className="min-w-0">
            <Label htmlFor="employeeName" className="text-sm font-medium">
              Employee Name or ID
            </Label>
            <Select
              onValueChange={(value) => {
                const selectedEmployee = employees.find((emp) => emp.employeeId === value);
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
              <SelectTrigger className="mt-1 border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md text-sm w-full">
                <SelectValue placeholder="Select Employee Name" />
              </SelectTrigger>
              <SelectContent className="z-50 max-h-60 overflow-y-auto">
                <SelectItem value="all">All Employees</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp._id} value={emp.employeeId}>
                    {emp.name} ({emp.employeeId})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <Label htmlFor="departmentId" className="text-sm font-medium">
              Department
            </Label>
            <Input
              id="departmentId"
              value={hodDepartmentName}
              readOnly
              className="mt-1 border-gray-300 bg-gray-100 cursor-not-allowed rounded-md text-sm w-full"
              placeholder="Your Department"
            />
          </div>
        </>
      )}
    </>
  ) : (
    <>
      <div className="min-w-0">
        <Label htmlFor="employeeName" className="text-sm font-medium">
          Employee Name or ID
        </Label>
        <Select
          onValueChange={(value) => {
            const selectedEmployee = employees.find((emp) => emp.employeeId === value);
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
          <SelectTrigger className="mt-1 border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md text-sm w-full">
            <SelectValue placeholder="Select Employee Name" />
          </SelectTrigger>
          <SelectContent className="z-50 max-h-60 overflow-y-auto">
            <SelectItem value="all">All Employees</SelectItem>
            {employees.map((emp) => (
              <SelectItem key={emp._id} value={emp.employeeId}>
                {emp.name} ({emp.employeeId})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-0">
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
            className="mt-1 border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md text-sm w-full"
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
  <div className="min-w-0">
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
        className="mt-1 border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md text-sm w-full"
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
  <div className="min-w-0">
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
        className="mt-1 border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md text-sm w-full"
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
  <div className="min-w-0">
    <Label htmlFor="fromDate" className="text-sm font-medium">
      From Date
    </Label>
    <Input
      id="fromDate"
      name="fromDate"
      type="date"
      value={tempFilters.fromDate}
      onChange={(e) => handleChange("fromDate", e.target.value)}
      className="mt-1 border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md text-sm w-full"
      disabled={loading}
    />
  </div>
  <div className="min-w-0">
    <Label htmlFor="toDate" className="text-sm font-medium">
      To Date
    </Label>
    <Input
      id="toDate"
      name="toDate"
      type="date"
      value={tempFilters.toDate}
      onChange={(e) => handleChange("toDate", e.target.value)}
      className="mt-1 border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md text-sm w-full"
      disabled={loading}
    />
  </div>
  <div className="flex gap-2 items-end">
    <Button
      onClick={handleFilter}
      className="px-3 py-1 sm:px-4 sm:py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors text-sm w-full sm:w-auto"
    >
      Filter
    </Button>
  </div>
</motion.div>
         <div className="w-full overflow-x-auto">
  <Table className="w-full min-w-[800px] border-separate" style={{ borderSpacing: 0 }}>
    <TableHeader>
      <TableRow className="border-b bg-gray-50">
        <TableHead className="font-semibold px-2 sm:px-4 py-2 sm:py-3 text-left text-xs sm:text-sm">
          Employee
        </TableHead>
        <TableHead className="font-semibold px-2 sm:px-9 py-2 sm:py-3 text-left text-xs sm:text-sm">
          L.A Date
        </TableHead>
        <TableHead className="font-semibold px-2 sm:px-4 py-2 sm:py-3 text-left text-xs sm:text-sm">
          Type
        </TableHead>
        <TableHead className="font-semibold px-2 sm:px-9 py-2 sm:py-3 text-left text-xs sm:text-sm">
          Time Frame
        </TableHead>
        <TableHead className="font-semibold px-2 sm:px-4 py-2 sm:py-3 text-left text-xs sm:text-sm">
          View Details
        </TableHead>
        <TableHead className="font-semibold px-2 sm:px-4 py-2 sm:py-3 text-left text-xs sm:text-sm">
          Status (HOD)
        </TableHead>
        <TableHead className="font-semibold px-2 sm:px-4 py-2 sm:py-3 text-left text-xs sm:text-sm">
          Status (CEO)
        </TableHead>
        <TableHead className="font-semibold px-2 sm:px-4 py-2 sm:py-3 text-left text-xs sm:text-sm">
          Status (Admin)
        </TableHead>
        {["HOD", "Admin", "CEO"].includes(user?.loginType) && viewMode !== "own" && (
          <TableHead className="font-semibold px-2 sm:px-4 py-2 sm:py-3 text-left text-xs sm:text-sm">
            Actions
          </TableHead>
        )}
        <TableHead className="font-semibold px-2 sm:px-4 py-2 sm:py-3 text-left text-xs sm:text-sm">
          Remarks
        </TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {loading ? (
        <TableRow>
          <TableCell
            colSpan={
              ["HOD", "Admin", "CEO"].includes(user?.loginType) && viewMode !== "own" ? 10 : 9
            }
            className="text-center py-4 text-sm"
          >
            Loading...
          </TableCell>
        </TableRow>
      ) : filteredGroupedLeaves.length === 0 ? (
        <TableRow>
          <TableCell
            colSpan={
              ["HOD", "Admin", "CEO"].includes(user?.loginType) && viewMode !== "own" ? 10 : 9
            }
            className="text-center py-4 text-sm"
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
                  ...group.leaves.map((l) => new Date(l.fullDay?.from || l.halfDay?.date || l.createdAt))
                )
              )} - ${formatISTDate(
                Math.max(
                  ...group.leaves.map((l) => new Date(l.fullDay?.to || l.halfDay?.date || l.createdAt))
                )
              )}`
            : formatISTDate(
                firstLeave.fullDay?.from || firstLeave.halfDay?.date || firstLeave.createdAt
              ) +
              (firstLeave.fullDay?.to ? ` - ${formatISTDate(firstLeave.fullDay.to)}` : "");
          return (
            <TableRow
              key={group._id}
              className={`hover:bg-gray-50 border-b ${isEmergency ? "text-red-700" : ""}`}
            >
              <TableCell className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                <div className={group.composite ? "pl-0" : ""}>{firstLeave.name}</div>
              </TableCell>
              <TableCell className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                {formatISTDate(firstLeave.createdAt)}
              </TableCell>
              <TableCell className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                {group.composite
                  ? group.leaves.map((l) => getLeaveTypeBadge(l.leaveType))
                  : getLeaveTypeBadge(firstLeave.leaveType)}
              </TableCell>
              <TableCell className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
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
              <TableCell className="px-2 sm:px-4 py-2 sm:py-3">
                <Button
                  size="sm"
                  onClick={() => {
                    setSelectedLeave(group.composite ? group : group.leaves[0]);
                    setLeaveAdjustments({});
                  }}
                  className="bg-blue-600 text-white hover:bg-blue-700 rounded-md text-xs sm:text-sm px-2 sm:px-3 py-1 w-full sm:w-auto"
                >
                  View
                </Button>
              </TableCell>
              <TableCell className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
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
              <TableCell className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
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
              <TableCell className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
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
              {["HOD", "Admin", "CEO"].includes(user?.loginType) && viewMode !== "own" && (
                <TableCell className="px-2 sm:px-4 py-2 sm:py-3">
                  {group.composite ? (
                    <div className="space-y-0">
                      {group.leaves.map((leave, index) => (
                        <div
                          key={leave._id}
                          className={`flex flex-col sm:flex-row items-center justify-between gap-2 py-1 ${
                            index % 2 === 0 ? "bg-gray-100" : "bg-white"
                          }`}
                        >
                          <span className="inline-block w-12 text-left">
                            {getLeaveTypeBadge(leave.leaveType)}
                          </span>
                          {user.loginType === "HOD" && leave.status.hod === "Pending" && (
                            <>
                              <Button
                                variant="default"
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 text-white rounded-md text-xs sm:text-sm px-2 sm:px-3 py-1 w-full sm:w-auto mt-1 sm:mt-0"
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
                                disabled={loading || leave.status.hod !== "Pending"}
                              >
                                Approve
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                className="bg-red-600 hover:bg-red-700 text-white rounded-md text-xs sm:text-sm px-2 sm:px-3 py-1 w-full sm:w-auto mt-1 sm:mt-0"
                                onClick={() => handleRejection(leave._id, "hod")}
                                disabled={loading || leave.status.hod !== "Pending"}
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
                                  className="bg-green-600 hover:bg-green-700 text-white rounded-md text-xs sm:text-sm px-2 sm:px-3 py-1 w-full sm:w-auto mt-1 sm:mt-0"
                                  onClick={() => triggerConfirmation(leave._id, "Approved", "ceo")}
                                  disabled={loading || leave.status.ceo !== "Pending"}
                                >
                                  Approve
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="bg-red-600 hover:bg-red-700 text-white rounded-md text-xs sm:text-sm px-2 sm:px-3 py-1 w-full sm:w-auto mt-1 sm:mt-0"
                                  onClick={() => handleRejection(leave._id, "ceo")}
                                  disabled={loading || leave.status.ceo !== "Pending"}
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
                                className="bg-green-600 hover:bg-green-700 text-white rounded-md text-xs sm:text-sm px-2 sm:px-3 py-1 w-full sm:w-auto mt-1 sm:mt-0"
                                onClick={() => handleApproval(leave._id, "Acknowledged", "admin")}
                                disabled={loading || leave.status.admin !== "Pending"}
                              >
                                Acknowledge
                              </Button>
                            )}
                          {(leave.status.hod !== "Pending" && leave.status.hod !== "Submitted") && (
                            <span className="text-sm text-gray-500">Done</span>
                          )}
                          {(leave.status.ceo !== "Pending" && leave.status.ceo !== "Submitted") && (
                            <span className="text-sm text-gray-500"></span>
                          )}
                          {(leave.status.admin !== "Pending" && leave.status.admin !== "Submitted") && (
                            <span className="text-sm text-gray-500"></span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row items-center gap-2">
                      <span className="inline-block w-12 text-left">
                        {getLeaveTypeBadge(firstLeave.leaveType)}
                      </span>
                      {user.loginType === "HOD" && firstLeave.status.hod === "Pending" && (
                        <>
                          <Button
                            variant="default"
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white rounded-md text-xs sm:text-sm px-2 sm:px-3 py-1 w-full sm:w-auto mt-1 sm:mt-0"
                            onClick={() =>
                              triggerConfirmation(
                                firstLeave._id,
                                "Approved",
                                "hod",
                                "",
                                leaveAdjustments[firstLeave._id]?.adjustedDays !== undefined
                                  ? leaveAdjustments[firstLeave._id].adjustedDays
                                  : getLeaveDuration(firstLeave),
                                leaveAdjustments[firstLeave._id]?.approvedDates || []
                              )
                            }
                            disabled={loading || firstLeave.status.hod !== "Pending"}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="bg-red-600 hover:bg-red-700 text-white rounded-md text-xs sm:text-sm px-2 sm:px-3 py-1 w-full sm:w-auto mt-1 sm:mt-0"
                            onClick={() => handleRejection(firstLeave._id, "hod")}
                            disabled={loading || firstLeave.status.hod !== "Pending"}
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
                              className="bg-green-600 hover:bg-green-700 text-white rounded-md text-xs sm:text-sm px-2 sm:px-3 py-1 w-full sm:w-auto mt-1 sm:mt-0"
                              onClick={() => triggerConfirmation(firstLeave._id, "Approved", "ceo")}
                              disabled={loading || firstLeave.status.ceo !== "Pending"}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="bg-red-600 hover:bg-red-700 text-white rounded-md text-xs sm:text-sm px-2 sm:px-3 py-1 w-full sm:w-auto mt-1 sm:mt-0"
                              onClick={() => handleRejection(firstLeave._id, "ceo")}
                              disabled={loading || firstLeave.status.ceo !== "Pending"}
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
                            className="bg-green-600 hover:bg-green-700 text-white rounded-md text-xs sm:text-sm px-2 sm:px-3 py-1 w-full sm:w-auto mt-1 sm:mt-0"
                            onClick={() => handleApproval(firstLeave._id, "Acknowledged", "admin")}
                            disabled={loading || firstLeave.status.admin !== "Pending"}
                          >
                            Acknowledge
                          </Button>
                        )}
                      {(firstLeave.status.hod !== "Pending" && firstLeave.status.hod !== "Submitted") && (
                        <span className="text-sm text-gray-500">Done</span>
                      )}
                      {(firstLeave.status.ceo !== "Pending" && firstLeave.status.ceo !== "Submitted") && (
                        <span className="text-sm text-gray-500"></span>
                      )}
                      {(firstLeave.status.admin !== "Pending" && firstLeave.status.admin !== "Submitted") && (
                        <span className="text-sm text-gray-500"></span>
                      )}
                    </div>
                  )}
                </TableCell>
              )}
              <TableCell className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                {group.composite ? (
                  <div className="space-y-1">
                    {group.leaves.map((leave) => (
                      <div key={leave._id} className="text-sm">
                        {(leave.remarks && leave.remarks !== "N/A" || leave.rejectedDates.length > 0) ? (
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedRemarkLeave(leave);
                              setShowRemarksDialog(true);
                            }}
                            className="bg-blue-600 text-white hover:bg-blue-700 rounded-md text-xs sm:text-sm px-2 sm:px-3 py-1 w-full sm:w-auto"
                          >
                            View Remarks
                          </Button>
                        ) : (
                          <span>-</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (firstLeave.remarks && firstLeave.remarks !== "N/A" || firstLeave.rejectedDates.length > 0) ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      setSelectedRemarkLeave(firstLeave);
                      setShowRemarksDialog(true);
                    }}
                    className="bg-blue-600 text-white hover:bg-blue-700 rounded-md text-xs sm:text-sm px-2 sm:px-3 py-1 w-full sm:w-auto"
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
</div>
            <Pagination
  currentPage={currentPage}
  itemsPerPage={itemsPerPage}
  totalItems={
    approvalFilter === "pending"
      ? filteredGroupedLeaves.filter((group) =>
          user?.loginType === "HOD"
            ? group.leaves.some((leave) => leave.status?.hod === "Pending")
            : user?.loginType === "CEO"
            ? group.leaves.some((leave) => leave.status?.ceo === "Pending")
            : true
        ).length
      : total
  }
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
                  setShowCalendar(false);
                }}
              >
                <DialogContent className="max-w-full sm:max-w-5xl max-h-[98vh] overflow-y-auto p-4 sm:p-6"> {/* Increased max-w from 4xl to 5xl */}
            <DialogHeader>
                    <DialogTitle className="text-lg sm:text-xl">Leave Application Details</DialogTitle>
                    <DialogDescription className="text-sm">
                      {selectedLeave?.composite
                        ? "Details of the composite leave application."
                        : "Details of the selected leave application."}
                    </DialogDescription>
                  </DialogHeader>
                  {selectedLeave && (
                    <div className="space-y-4 sm:space-y-6">
                      <div className="border p-3 sm:p-4 rounded-lg bg-gray-50">
                        <p className="text-sm font-medium text-gray-700">
                          <strong>Leave Application Date:</strong>{" "}
                          {formatISTDate?.(
                            selectedLeave.composite
                              ? Math.min(
                                  ...selectedLeave.leaves
                                    ?.map((l) => new Date(l?.createdAt))
                                    ?.filter((d) => d instanceof Date && !isNaN(d))
                                )
                              : new Date(selectedLeave?.createdAt)
                          ) || "N/A"}
                        </p>
                     </div>
                <Button
                  onClick={() => setShowCalendar(!showCalendar)}
                  className="bg-blue-600 text-white hover:bg-blue-700 rounded-md text-xs sm:text-sm px-3 py-1 w-full sm:w-auto"
                >
                  {showCalendar ? "Hide Calendar" : "Refer Calendar"}
                </Button>
                {showCalendar && (
                  <div className="border p-3 sm:p-4 rounded-lg bg-gray-50">
                    <CalendarComponent
                      selectedDates={
                        selectedLeave.composite
                          ? getCompositeLeaveDates(selectedLeave.leaves).map((date) => new Date(date))
                          : getLeaveDates(selectedLeave).map((date) => new Date(date))
                      }
                      onChange={() => {}} // No-op since we only display, not select
                    />
                  </div>
                )}

                      {selectedLeave.composite ? (
                        selectedLeave.leaves?.map((leave) => (
                          <div
                            key={leave?._id}
                            className="border p-3 sm:p-4 rounded-lg bg-gray-50 mb-4 last:mb-0"
                          >
                            <h3 className="font-semibold text-base sm:text-lg mb-2">
                              {getLeaveTypeBadge?.(leave?.leaveType) || "Unknown Leave Type"}
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm text-gray-700">
                              <p>
                                <strong>From:</strong>{" "}
                                {formatISTDate?.(
                                  leave?.fullDay?.from ||
                                    leave?.halfDay?.date ||
                                    leave?.createdAt
                                ) || "N/A"}
                                {leave?.fullDay?.fromDuration === "half" &&
                                  ` (${leave?.fullDay.fromSession})`}
                              </p>
                              <p>
                                <strong>To:</strong>{" "}
                                {leave?.fullDay?.to
                                  ? `${formatISTDate?.(leave.fullDay.to) || "N/A"}${
                                      leave?.fullDay.toDuration === "half"
                                        ? ` (${leave?.fullDay.toSession})`
                                        : ""
                                    }`
                                  : "N/A"}
                              </p>
                              <p>
                                <strong>Leave Duration:</strong>{" "}
                                {formatDurationDisplay?.(getLeaveDuration?.(leave)) || "N/A"}
                              </p>
                              <p>
                                <strong>Reason:</strong> {leave?.reason || "N/A"}
                              </p>
                              <p>
                                <strong>Charge Given To:</strong>{" "}
                                {leave?.chargeGivenTo?.name || "N/A"}
                              </p>
                              <p>
                                <strong className="text-sm font-medium">Emergency Contact:</strong>{" "}
                                {leave?.emergencyContact || "N/A"}
                              </p>
                              {leave?.compensatoryDate && (
                                <p>
                                  <strong>Compensatory Date:</strong>{" "}
                                  {formatISTDate?.(leave.compensatoryDate) || "N/A"}
                                </p>
                              )}
                              {leave?.projectDetails && (
                                <p>
                                  <strong>Project Details:</strong> {leave.projectDetails}
                                </p>
                              )}
                              {leave?.restrictedHoliday && (
                                <p>
                                  <strong>Restricted Holiday:</strong> {leave.restrictedHoliday}
                                </p>
                              )}
                              {leave?.medicalCertificate && (
                                <p>
                                  <strong>Medical Certificate:</strong>{" "}
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      handleViewFile?.(leave.medicalCertificate?._id)
                                    }
                                    className="bg-blue-600 text-white hover:bg-blue-700 rounded-md disabled:opacity-50 text-xs sm:text-sm px-2 sm:px-3 py-1"
                                    disabled={fileError || !leave.medicalCertificate?._id}
                                    aria-label={`View medical certificate for ${leave?.leaveType || "leave"} ${leave?._id}`}
                                  >
                                    View {leave.medicalCertificate.filename}
                                  </Button>
                                </p>
                              )}
                              {leave?.approvedDates?.length > 0 && (
                                <p>
                                  <strong>Approved Dates:</strong>{" "}
                                  {leave.approvedDates
                                    ?.map((ad) =>
                                      `${formatISTDate?.(ad?.date) || "N/A"}${
                                        ad?.duration ? ` (${ad.duration})` : ""
                                      }`
                                    )
                                    .join(", ") || "N/A"}
                                </p>
                              )}
                              {leave?.rejectedDates?.length > 0 && (
                                <p>
                                  <strong>Rejected Dates:</strong>{" "}
                                  {leave.rejectedDates
                                    ?.map((rd) =>
                                      `${formatISTDate?.(rd?.date) || "N/A"}${
                                        rd?.duration ? ` (${rd.duration})` : ""
                                      }`
                                    )
                                    .join(", ") || "N/A"}
                                </p>
                              )}
                            </div>
                            {user?.loginType === "Employee" && leave?.status && (
                              <div className="mt-4">
                                {leave.status.hod === "Approved" && leave.status.ceo === "Approved" ? (
                                  <p className="text-green-600 text-sm">🎉 Hurray! Your Leave has been Approved ✅</p>
                                ) : leave.status.hod === "Rejected" ||
                                  leave.status.ceWords !== "Rejected" ||
                                  leave.status.admin === "Rejected" ? (
                                  <p className="text-red-600 text-sm">😔 Sorry, Your Leave has been Rejected ❌</p>
                                ) : (leave.status.hod === "Pending" ||
                                    leave.status.hod === "Submitted" ||
                                    leave.status.ceo === "Pending" ||
                                    leave.status.ceo === "Submitted") && (
                                  <p className="text-yellow-600 text-sm">⏳ Some more time, Your Leave is pending for approval</p>
                                )}
                              </div>
                            )}
                            {user.loginType === "HOD" && leave?.status?.hod === "Pending" && (
                              <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                                <div className="flex items-center gap-2">
                                  <Label htmlFor={`adjustedDays-${leave?._id}`} className="text-sm font-medium">
                                    Approved Days
                                  </Label>
                                  <Input
                                    id={`adjustedDays-${leave?._id}`}
                                    type="number"
                                    min="0"
                                    max={getLeaveDuration?.(leave) || 0}
                                    value={
                                      leaveAdjustments?.[leave?._id]?.adjustedDays ?? getLeaveDuration?.(leave) ?? 0
                                    }
                                    onChange={(e) =>
                                      handleAdjustmentChange?.(
                                        leave?._id,
                                        "adjustedDays",
                                        e.target.value ? parseFloat(e.target.value) : null,
                                        getLeaveDuration?.(leave) || 0
                                      )
                                    }
                                    className="border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md w-20 sm:w-24 text-sm"
                                    aria-label={`Adjust days for ${leave?.leaveType || "leave"} ${leave?._id}`}
                                  />
                                </div>
                                
                                {leaveAdjustments?.[leave?._id]?.adjustedDays !== undefined &&
                                  leaveAdjustments[leave?._id]?.adjustedDays < (getLeaveDuration?.(leave) || 0) && (
                                    <div className="flex flex-col gap-2">
                                      <Label className="text-sm font-medium">Approval Time Frame</Label>
                                      <div className="border p-2 rounded-md bg-white shadow-sm">
                                        {renderApprovalTimeFrame(leave)}
                                      </div>
                                    </div>
                                  )}
                                <div className="flex gap-2 items-center">
                                  <Button
                                    variant="default"
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700 text-white rounded-md disabled:opacity-50 text-xs sm:text-sm px-2 sm:px-3 py-1"
                                    onClick={() =>
                                      triggerConfirmation?.(
                                        leave?._id,
                                        "Approved",
                                        "hod",
                                        "",
                                        leaveAdjustments?.[leave?._id]?.adjustedDays ?? getLeaveDuration?.(leave) ?? 0,
                                        leaveAdjustments?.[leave?._id]?.approvedDates || []
                                      )
                                    }
                                    disabled={
                                      loading ||
                                      leave?.status?.hod !== "Pending"
                                      // ||
                                     // (leaveAdjustments?.[leave?._id]?.adjustedDays ?? 0) === 0
                                    }
                                    aria-label={`Approve ${leave?.leaveType || "leave"} ${leave?._id} for ${leave?.name}`}
                                  >
                                    Approve
                                    {leaveAdjustments?.[leave?._id]?.adjustedDays !== undefined &&
                                      ` (${leaveAdjustments[leave?._id].adjustedDays} days)`}
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    className="bg-red-600 hover:bg-red-700 text-white rounded-md disabled:opacity-50 text-xs sm:text-sm px-2 sm:px-3 py-1"
                                    onClick={() => handleRejection?.(leave?._id, "hod")}
                                    disabled={loading || leave?.status?.hod !== "Pending"}
                                    aria-label={`Reject ${leave?.leaveType || "leave"} ${leave?._id} for ${leave?.name}`}
                                  >
                                    Reject
                                  </Button>
                                </div>
                              </div>
                            )}
                            {user.loginType === "CEO" &&
                              ["Approved", "Submitted"].includes(leave?.status?.hod) &&
                              leave?.status?.ceo === "Pending" && (
                                <div className="mt-4 flex flex-col gap-4">
                                  <div className="flex items-center gap-2">
                                    <Label
                                      htmlFor={`adjustedDays-${leave?._id}`}
                                      className="text-sm font-medium"
                                    >
                                      Approved Days
                                    </Label>
                                    <Input
                                      id={`adjustedDays-${leave?._id}`}
                                      type="number"
                                      min="0"
                                      max={
                                        leave?.approvedDates?.length ||
                                        leaveAdjustments?.[leave?._id]?.approvedDates?.length ||
                                        leaveAdjustments?.[leave?._id]?.adjustedDays ||
                                        getLeaveDuration?.(leave) ||
                                        0
                                      }
                                      value={
                                        leaveAdjustments?.[leave?._id]?.adjustedDays ??
                                        leave?.approvedDates?.length ??
                                        leaveAdjustments?.[leave?._id]?.approvedDates?.length ??
                                        leaveAdjustments?.[leave?._id]?.adjustedDays ??
                                        getLeaveDuration?.(leave) ??
                                        0
                                      }
                                      onChange={(e) =>
                                        handleAdjustmentChange?.(
                                          leave?._id,
                                          "adjustedDays",
                                          e.target.value ? parseFloat(e.target.value) : null,
                                          leave?.approvedDates?.length ||
                                            leaveAdjustments?.[leave?._id]?.approvedDates?.length ||
                                            leaveAdjustments?.[leave?._id]?.adjustedDays ||
                                            getLeaveDuration?.(leave) ||
                                            0
                                        )
                                      }
                                      className="border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md w-20 sm:w-24 text-sm"
                                      aria-label={`Adjust days for ${leave?.leaveType || "leave"} ${leave?._id}`}
                                    />
                                  </div>
                                  {leaveAdjustments?.[leave?._id]?.adjustedDays !== undefined &&
                                    leaveAdjustments[leave?._id]?.adjustedDays <
                                      (leave?.approvedDates?.length ||
                                        leaveAdjustments?.[leave?._id]?.approvedDates?.length ||
                                        getLeaveDuration?.(leave) ||
                                        0) && (
                                      <div className="flex flex-col gap-2">
                                        <Label className="text-sm font-medium">Approval Time Frame</Label>
                                        <div className="border p-2 rounded-md bg-white shadow-sm">
                                          {getLeaveDates?.(leave)
                                            ?.filter((date) => {
                                              const jsDate = new Date(date);
                                              return (
                                                jsDate instanceof Date &&
                                                !isNaN(jsDate) &&
                                                jsDate.getDay() !== 0 &&
                                                !yearlyHolidays?.includes(date) &&
                                                !new Set(
                                                  leave?.rejectedDates?.map((rd) =>
                                                    new Date(typeof rd === "string" ? rd : rd.date).toISOString().split("T")[0]
                                                  )
                                                ).has(jsDate.toISOString().split("T")[0])
                                              );
                                            })
                                            ?.map((date) => {
                                              const approvedDatesRaw =
                                                leaveAdjustments?.[leave?._id]?.approvedDates ||
                                                leave?.approvedDates ||
                                                [];
                                              const adjustedDays =
                                                leaveAdjustments?.[leave?._id]?.adjustedDays || 0;
                                              const isoDate = new Date(date).toISOString().split("T")[0];
                                              const approvedSet = new Set(
                                                approvedDatesRaw.map((d) =>
                                                  new Date(typeof d === "string" ? d : d?.date || d)
                                                    .toISOString()
                                                    .split("T")[0]
                                                )
                                              );
                                              const rejectedSet = new Set(
                                                (leave?.rejectedDates || []).map((rd) =>
                                                  new Date(typeof rd === "string" ? rd : rd?.date)
                                                    .toISOString()
                                                    .split("T")[0]
                                                )
                                              );
                                              const isRejected = rejectedSet.has(isoDate);
                                              const isSelected = approvedSet.has(isoDate);
                                              const canSelectMore = approvedSet.size < adjustedDays;
                                              return (
                                                <div key={date} className="flex items-center gap-2 mb-1">
                                                  <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    disabled={isRejected}
                                                    onChange={() => {
                                                      const newDates = isSelected
                                                        ? approvedDatesRaw.filter((d) => {
                                                            const dIso = new Date(typeof d === "string" ? d : d?.date || d)
                                                              .toISOString()
                                                              .split("T")[0];
                                                            return dIso !== isoDate;
                                                          })
                                                        : [...approvedDatesRaw, date];
                                                      handleAdjustmentChange?.(
                                                        leave?._id,
                                                        "approvedDates",
                                                        newDates,
                                                        getLeaveDuration?.(leave) || 0
                                                      );
                                                    }}
                                                    id={`date-${leave?._id}-${date}`}
                                                    aria-label={`Select ${formatISTDate?.(date) || date} for ${leave?.leaveType || "leave"}`}
                                                  />
                                                  <span
                                                    className={`text-sm ${isSelected ? "" : isRejected ? "text-red-700 line-through font-semibold" : "text-yellow-700 font-semibold"}`}
                                                  >
                                                    {formatISTDate?.(date) || date}
                                                  </span>
                                                  {!isSelected && isRejected && (
                                                    <span className="text-xs text-red-800 font-semibold ml-1">
                                                      (Rejected)
                                                    </span>
                                                  )}
                                                  {!isSelected && !isRejected && (
                                                    <span className="text-xs text-yellow-600 ml-1">
                                                      (Not Approved)
                                                    </span>
                                                  )}
                                                </div>
                                              );
                                            })}
                                          <div className="text-sm text-gray-500 mt-1">
                                            {leaveAdjustments?.[leave?._id]?.approvedDates?.length ||
                                              leave?.approvedDates?.length ||
                                              0}/{leaveAdjustments?.[leave?._id]?.adjustedDays || 0} days selected
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  <div className="flex gap-2 items-center">
                                    <Button
                                      variant="default"
                                      size="sm"
                                      className="bg-green-600 hover:bg-green-700 text-white rounded-md disabled:opacity-50 text-xs sm:text-sm px-2 sm:px-3 py-1"
                                      onClick={() =>
                                        triggerConfirmation?.(
                                          leave?._id,
                                          "Approved",
                                          "ceo",
                                          "",
                                          leaveAdjustments?.[leave?._id]?.adjustedDays ??
                                            leave?.approvedDates?.length ??
                                            leaveAdjustments?.[leave?._id]?.approvedDates?.length ??
                                            leaveAdjustments?.[leave?._id]?.adjustedDays ??
                                            getLeaveDuration?.(leave) ??
                                            0,
                                          leaveAdjustments?.[leave?._id]?.approvedDates || leave?.approvedDates || []
                                        )
                                      }
                                      disabled={
                                        loading ||
                                        leave?.status?.ceo !== "Pending" ||
                                        (leaveAdjustments?.[leave?._id]?.adjustedDays ?? 0) === 0
                                      }
                                      aria-label={`Approve ${leave?.leaveType || "leave"} ${leave?._id} for ${leave?.name}`}
                                    >
                                      Approve
                                      {leaveAdjustments?.[leave?._id]?.adjustedDays !== undefined &&
                                        ` (${leaveAdjustments[leave?._id].adjustedDays} days)`}
                                    </Button>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      className="bg-red-600 hover:bg-red-700 text-white rounded-md disabled:opacity-50 text-xs sm:text-sm px-2 sm:px-3 py-1"
                                      onClick={() => handleRejection?.(leave?._id, "ceo")}
                                      disabled={loading || leave?.status?.ceo !== "Pending"}
                                      aria-label={`Reject ${leave?.leaveType || "leave"} ${leave?._id} for ${leave?.name}`}
                                    >
                                      Reject
                                    </Button>
                                  </div>
                                </div>
                              )}
                            {user.loginType === "Admin" &&
                              leave?.status?.ceo === "Approved" &&
                              leave?.status?.admin === "Pending" && (
                                <div className="mt-4 flex gap-2 items-center">
                                  <Button
                                    variant="default"
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700 text-white rounded-md disabled:opacity-50 text-xs sm:text-sm px-2 sm:px-3 py-1"
                                    onClick={() =>
                                      handleApproval(leave?._id, "Acknowledged", "admin")
                                    }
                                    disabled={loading || leave?.status?.admin !== "Pending"}
                                    aria-label={`Acknowledge ${leave?.leaveType || "leave"} ${leave?._id} for ${leave?.name}`}
                                  >
                                    Acknowledge
                                  </Button>
                                </div>
                              )}
                          </div>
                        ))
                      ) : (
                        <div className="border p-3 sm:p-4 rounded-lg bg-gray-50">
                          <h3 className="font-semibold text-base sm:text-lg mb-2">
                            {getLeaveTypeBadge?.(selectedLeave?.leaveType) || "Unknown Leave Type"}
                          </h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm text-gray-700">
                            <p>
                              <strong>From:</strong>{" "}
                              {formatISTDate?.(
                                selectedLeave?.fullDay?.from ||
                                  selectedLeave?.halfDay?.date ||
                                  selectedLeave?.createdAt
                              ) || "N/A"}
                              {selectedLeave?.fullDay?.fromDuration === "half" &&
                                ` (${selectedLeave?.fullDay.fromSession})`}
                            </p>
                            <p>
                              <strong>To:</strong>{" "}
                              {selectedLeave?.fullDay?.to
                                ? `${formatISTDate?.(selectedLeave.fullDay.to) || "N/A"}${
                                    selectedLeave?.fullDay.toDuration === "half"
                                      ? ` (${selectedLeave?.fullDay.toSession})`
                                      : ""
                                  }`
                                : "N/A"}
                            </p>
                            <p>
                              <strong>Leave Duration:</strong>{" "}
                              {formatDurationDisplay?.(getLeaveDuration?.(selectedLeave)) || "N/A"}
                            </p>
                            <p>
                              <strong>Reason:</strong> {selectedLeave?.reason || "N/A"}
                            </p>
                            <p>
                              <strong>Charge Given To:</strong>{" "}
                              {selectedLeave?.chargeGivenTo?.name || "N/A"}
                            </p>
                            <p>
                              <strong className="text-sm font-medium">Emergency Contact:</strong>{" "}
                              {selectedLeave?.emergencyContact || "N/A"}
                            </p>
                            {selectedLeave?.compensatoryDate && (
                              <p>
                                <strong>Compensatory Date:</strong>{" "}
                                {formatISTDate?.(selectedLeave.compensatoryDate) || "N/A"}
                              </p>
                            )}
                            {selectedLeave?.projectDetails && (
                              <p>
                                <strong>Project Details:</strong> {selectedLeave.projectDetails}
                              </p>
                            )}
                            {selectedLeave?.restrictedHoliday && (
                              <p>
                                <strong>Restricted Holiday:</strong> {selectedLeave.restrictedHoliday}
                              </p>
                            )}
                            {selectedLeave?.medicalCertificate && (
                              <p>
                                <strong>Medical Certificate:</strong>{" "}
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    handleViewFile?.(selectedLeave.medicalCertificate?._id)
                                  }
                                  className="bg-blue-600 text-white hover:bg-blue-700 rounded-md disabled:opacity-50 text-xs sm:text-sm px-2 sm:px-3 py-1"
                                  disabled={fileError || !selectedLeave.medicalCertificate?._id}
                                  aria-label={`View medical certificate for ${selectedLeave?.leaveType || "leave"} ${selectedLeave?._id}`}
                                >
                                  View {selectedLeave.medicalCertificate.filename}
                                </Button>
                              </p>
                            )}
                            {selectedLeave?.approvedDates?.length > 0 && (
                              <p>
                                <strong>Approved Dates:</strong>{" "}
                                {selectedLeave.approvedDates
                                  ?.map((ad) =>
                                    `${formatISTDate?.(ad?.date) || "N/A"}${
                                      ad?.duration ? ` (${ad.duration})` : ""
                                    }`
                                  )
                                  .join(", ") || "N/A"}
                              </p>
                            )}
                            {selectedLeave?.rejectedDates?.length > 0 && (
                              <p>
                                <strong>Rejected Dates:</strong>{" "}
                                {selectedLeave.rejectedDates
                                  ?.map((rd) =>
                                    `${formatISTDate?.(rd?.date) || "N/A"}${
                                      rd?.duration ? ` (${rd.duration})` : ""
                                    }`
                                  )
                                  .join(", ") || "N/A"}
                              </p>
                            )}
                          </div>
                          {user?.loginType === "Employee" && selectedLeave?.status && (
                            <div className="mt-4">
                              {selectedLeave.status.hod === "Approved" &&
                              selectedLeave.status.ceo === "Approved" ? (
                                <p className="text-green-600 text-sm">🎉 Hurray! Your Leave has been Approved✅</p>
                              ) : selectedLeave.status.hod === "Rejected" ||
                                selectedLeave.status.ceo === "Rejected" ||
                                selectedLeave.status.admin === "Rejected" ? (
                                <p className="text-red-600 text-sm">😔 Sorry, Your Leave has been Rejected ❌</p>
                              ) : (selectedLeave.status.hod === "Pending" ||
                                  selectedLeave.status.hod === "Submitted" ||
                                  selectedLeave.status.ceo === "Pending" ||
                                  selectedLeave.status.ceo === "Submitted") && (
                                <p className="text-yellow-600 text-sm">⏳ Some more time, Your Leave is pending for approval</p>
                              )}
                            </div>
                          )}
                          {user.loginType === "HOD" && selectedLeave?.status?.hod === "Pending" && (
                            <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                              <div className="flex items-center gap-2">
                                <Label
                                  htmlFor={`adjustedDays-${selectedLeave?._id}`}
                                  className="text-sm font-medium"
                                >
                                  Approved Days
                                </Label>
                                <Input
                                  id={`adjustedDays-${selectedLeave?._id}`}
                                  type="number"
                                  min="0"
                                  max={getLeaveDuration?.(selectedLeave) || 0}
                                  value={
                                    leaveAdjustments?.[selectedLeave?._id]?.adjustedDays ??
                                    getLeaveDuration?.(selectedLeave) ??
                                    0
                                  }
                                  onChange={(e) =>
                                    handleAdjustmentChange?.(
                                      selectedLeave?._id,
                                      "adjustedDays",
                                      e.target.value ? parseFloat(e.target.value) : null,
                                      getLeaveDuration?.(selectedLeave) || 0
                                    )
                                  }
                                  className="border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md w-20 sm:w-24 text-sm"
                                  aria-label={`Adjust days for ${selectedLeave?.leaveType || "leave"} ${selectedLeave?._id}`}
                                />
                              </div>
                              {leaveAdjustments?.[selectedLeave?._id]?.adjustedDays !== undefined &&
                                leaveAdjustments[selectedLeave?._id]?.adjustedDays <
                                  (getLeaveDuration?.(selectedLeave) || 0) && (
                                  <div className="flex flex-col gap-2">
                                    <Label className="text-sm font-medium">Approval Time Frame</Label>
                                    <div className="border p-2 rounded-md bg-white shadow-sm">
                                      {renderApprovalTimeFrame(selectedLeave)}
                                    </div>
                                  </div>
                                )}
                              <div className="flex gap-2 items-center">
                                <Button
                                  variant="default"
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700 text-white rounded-md disabled:opacity-50 text-xs sm:text-sm px-2 sm:px-3 py-1"
                                  onClick={() =>
                                    triggerConfirmation?.(
                                      selectedLeave?._id,
                                      "Approved",
                                      "hod",
                                      "",
                                      leaveAdjustments?.[selectedLeave?._id]?.adjustedDays ??
                                        getLeaveDuration?.(selectedLeave) ??
                                        0,
                                      leaveAdjustments?.[selectedLeave?._id]?.approvedDates || []
                                    )
                                  }
                                  disabled={
                                    loading ||
                                    selectedLeave?.status?.hod !== "Pending" 
                                    //||
                                   // (leaveAdjustments?.[selectedLeave?._id]?.adjustedDays ?? 0) === 0
                                  }
                                  aria-label={`Approve ${selectedLeave?.leaveType || "leave"} ${selectedLeave?._id} for ${selectedLeave?.name}`}
                                >
                                  Approve
                                  {leaveAdjustments?.[selectedLeave?._id]?.adjustedDays !== undefined &&
                                    ` (${leaveAdjustments[selectedLeave?._id].adjustedDays} days)`}
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="bg-red-600 hover:bg-red-700 text-white rounded-md disabled:opacity-50 text-xs sm:text-sm px-2 sm:px-3 py-1"
                                  onClick={() => handleRejection?.(selectedLeave?._id, "hod")}
                                  disabled={loading || selectedLeave?.status?.hod !== "Pending"}
                                  aria-label={`Reject ${selectedLeave?.leaveType || "leave"} ${selectedLeave?._id} for ${selectedLeave?.name}`}
                                >
                                  Reject
                                </Button>
                              </div>
                            </div>
                          )}
                          {user.loginType === "CEO" &&
                            ["Approved", "Submitted"].includes(selectedLeave?.status?.hod) &&
                            selectedLeave?.status?.ceo === "Pending" && (
                              <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                                <div className="flex items-center gap-2">
                                  <Label
                                    htmlFor={`adjustedDays-${selectedLeave?._id}`}
                                    className="text-sm font-medium"
                                  >
                                    Approved Days
                                  </Label>
                                  <Input
                                    id={`adjustedDays-${selectedLeave?._id}`}
                                    type="number"
                                    min="0"
                                    max={
                                      selectedLeave?.approvedDates?.length ||
                                      leaveAdjustments?.[selectedLeave?._id]?.approvedDates?.length ||
                                      getLeaveDuration?.(selectedLeave) ||
                                      0
                                    }
                                    value={
                                      leaveAdjustments?.[selectedLeave?._id]?.adjustedDays ??
                                      selectedLeave?.approvedDates?.length ??
                                      leaveAdjustments?.[selectedLeave?._id]?.approvedDates?.length ??
                                      getLeaveDuration?.(selectedLeave) ??
                                      0
                                    }
                                    onChange={(e) =>
                                      handleAdjustmentChange?.(
                                        selectedLeave?._id,
                                        "adjustedDays",
                                        e.target.value ? parseFloat(e.target.value) : null,
                                        selectedLeave?.approvedDates?.length ||
                                          leaveAdjustments?.[selectedLeave?._id]?.approvedDates?.length ||
                                          getLeaveDuration?.(selectedLeave) ||
                                          0
                                      )
                                    }
                                    className="border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md w-20 sm:w-24 text-sm"
                                    aria-label={`Adjust days for ${selectedLeave?.leaveType || "leave"} ${selectedLeave?._id}`}
                                  />
                                </div>
                                {leaveAdjustments?.[selectedLeave?._id]?.adjustedDays !== undefined &&
                                  leaveAdjustments[selectedLeave?._id]?.adjustedDays <
                                    (selectedLeave?.approvedDates?.length ||
                                      leaveAdjustments?.[selectedLeave?._id]?.approvedDates?.length ||
                                      getLeaveDuration?.(selectedLeave) ||
                                      0) && (
                                    <div className="flex flex-col gap-2">
                                      <Label className="text-sm font-medium">Approval Time Frame</Label>
                                      <div className="border p-2 rounded-md bg-white shadow-sm">
                                        {renderApprovalTimeFrame(selectedLeave)}
                                      </div>
                                    </div>
                                  )}
                                <div className="flex gap-2 items-center">
                                  <Button
                                    variant="default"
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700 text-white rounded-md disabled:opacity-50 text-xs sm:text-sm px-2 sm:px-3 py-1"
                                    onClick={() =>
                                      triggerConfirmation?.(
                                        selectedLeave?._id,
                                        "Approved",
                                        "ceo",
                                        "",
                                        leaveAdjustments?.[selectedLeave?._id]?.adjustedDays ??
                                          selectedLeave?.approvedDates?.length ??
                                          leaveAdjustments?.[selectedLeave?._id]?.approvedDates?.length ??
                                          getLeaveDuration?.(selectedLeave) ??
                                          0,
                                        leaveAdjustments?.[selectedLeave?._id]?.approvedDates ||
                                          selectedLeave?.approvedDates ||
                                          []
                                      )
                                    }
                                    disabled={
                                      loading ||
                                      selectedLeave?.status?.ceo !== "Pending" 
                                      //||
                                      //(leaveAdjustments?.[selectedLeave?._id]?.adjustedDays ?? 0) === 0
                                    }
                                    aria-label={`Approve ${selectedLeave?.leaveType || "leave"} ${selectedLeave?._id} for ${selectedLeave?.name}`}
                                  >
                                    Approve
                                    {leaveAdjustments?.[selectedLeave?._id]?.adjustedDays !== undefined &&
                                      ` (${leaveAdjustments[selectedLeave?._id].adjustedDays} days)`}
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    className="bg-red-600 hover:bg-red-700 text-white rounded-md disabled:opacity-50 text-xs sm:text-sm px-2 sm:px-3 py-1"
                                    onClick={() => handleRejection?.(selectedLeave?._id, "ceo")}
                                    disabled={loading || selectedLeave?.status?.ceo !== "Pending"}
                                    aria-label={`Reject ${selectedLeave?.leaveType || "leave"} ${selectedLeave?._id} for ${selectedLeave?.name}`}
                                  >
                                    Reject
                                  </Button>
                                </div>
                              </div>
                            )}
                          {user.loginType === "Admin" &&
                            selectedLeave?.status?.ceo === "Approved" &&
                            selectedLeave?.status?.admin === "Pending" && (
                              <div className="mt-4 flex gap-2 items-center">
                                <Button
                                  variant="default"
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700 text-white rounded-md disabled:opacity-50 text-xs sm:text-sm px-2 sm:px-3 py-1"
                                  onClick={() =>
                                    handleApproval(selectedLeave?._id, "Acknowledged", "admin")
                                  }
                                  disabled={loading || selectedLeave?.status?.admin !== "Pending"}
                                  aria-label={`Acknowledge ${selectedLeave?.leaveType || "leave"} ${selectedLeave?._id} for ${selectedLeave?.name}`}
                                >
                                  Acknowledge
                                </Button>
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                  )}
                </DialogContent>
              </Dialog>
              <Dialog open={showRejectionDialog} onOpenChange={setShowRejectionDialog}>
                <DialogContent className="max-w-full sm:max-w-md p-4 sm:p-6">
                  <DialogHeader>
                    <DialogTitle className="text-lg sm:text-xl">Reject Leave</DialogTitle>
                    <DialogDescription className="text-sm">
                      Please provide a reason for rejecting this leave application.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="my-4">
                    <Label htmlFor="rejectionRemarks" className="text-sm font-medium">
                      Remarks
                    </Label>
                    <Input
                      id="rejectionRemarks"
                      value={rejectionRemarks}
                      onChange={(e) => setRejectionRemarks(e.target.value)}
                      className="mt-1 border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md text-sm"
                      placeholder="Enter reason for rejection"
                      aria-label="Reason for rejecting leave application"
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setShowRejectionDialog(false)}
                      className="text-sm"
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={confirmRejection}
                      className="bg-red-600 hover:bg-red-700 text-white rounded-md text-sm"
                      disabled={!rejectionRemarks.trim()}
                    >
                      Confirm Rejection
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Dialog open={showRemarksDialog} onOpenChange={setShowRemarksDialog}>
                <DialogContent className="max-w-full sm:max-w-md p-4 sm:p-6">
                  <DialogHeader>
                    <DialogTitle className="text-lg sm:text-xl">Leave Remarks</DialogTitle>
                    <DialogDescription className="text-sm">
                      Details of remarks for this leave application.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="my-4 text-sm text-gray-700">
                    <p>
                      <strong>Remarks:</strong>{" "}
                      {selectedRemarkLeave?.remarks && selectedRemarkLeave.remarks !== 'N/A'
                        ? selectedRemarkLeave.remarks
                        : "No remarks provided."}
                    </p>
                    {selectedRemarkLeave?.rejectedDates?.length > 0 && (
                      <p className="mt-2">
                        <strong>Rejected Dates:</strong>{" "}
                        {selectedRemarkLeave.rejectedDates
                          .map((rd) =>
                            `${formatISTDate?.(rd?.date) || "N/A"}${
                              rd?.duration ? ` (${rd.duration})` : ""
                            }`
                          )
                          .join(", ") || "N/A"}
                      </p>
                    )}
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setShowRemarksDialog(false)}
                      className="text-sm"
                    >
                      Close
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Dialog open={showConfirmationDialog} onOpenChange={setShowConfirmationDialog}>
                <DialogContent className="max-w-full sm:max-w-md p-4 sm:p-6">
                  <DialogHeader>
                    <DialogTitle className="text-lg sm:text-xl">Confirm Approval</DialogTitle>
                    <DialogDescription className="text-sm">
                      Please confirm the approval details for this leave application.
                    </DialogDescription>
                  </DialogHeader>
                  {confirmationData && (
                    <div className="my-4 text-sm text-gray-700">
                      <p>
                        <strong>Action:</strong> {confirmationData.status}
                      </p>
                      <p>
                        <strong>Approved Days:</strong>{" "}
                        {formatDurationDisplay(confirmationData.days)}
                      </p>
                      {confirmationData.approvedDates?.length > 0 && (
                        <p>
                          <strong>Approved Dates:</strong>{" "}
                          {confirmationData.approvedDates
                            .map((date) => formatISTDate(date))
                            .join(", ") || "N/A"}
                        </p>
                      )}
                      {confirmationData.rejectedDates?.length > 0 && (
                        <p>
                          <strong>Rejected Dates:</strong>{" "}
                          {confirmationData.rejectedDates
                            .map((date) => formatISTDate(date))
                            .join(", ") || "N/A"}
                        </p>
                      )}
                    </div>
                  )}
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setShowConfirmationDialog(false)}
                      className="text-sm"
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="default"
                      onClick={() =>
                        handleApproval(
                          confirmationData?.id,
                          confirmationData?.status,
                          confirmationData?.currentStage,
                          confirmationData?.remarks,
                          confirmationData?.days,
                          confirmationData?.approvedDates
                        )
                      }
                      className="bg-green-600 hover:bg-green-700 text-white rounded-md text-sm"
                    >
                      Confirm
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </div>
  
    
    </ContentLayout>
);
}

export default LeaveList;
