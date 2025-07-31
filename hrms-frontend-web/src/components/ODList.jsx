import React, {
  useEffect,
  useState,
  useContext,
  useCallback,
  useMemo,
} from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "../components/ui/select";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { useNavigate } from "react-router-dom";
import Pagination from "./Pagination";
import api from "../services/api";
import ContentLayout from "./ContentLayout";
import { AuthContext } from "../context/AuthContext";

function ODList() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const initialFilters = useMemo(
    () => ({
      employeeId: user?.loginType === "Employee" ? user?.employeeId || "" : "",
      name: user?.loginType === "Employee" ? user?.name || "" : "",
      departmentId:
        user?.loginType === "HOD" && user?.department
          ? user.department._id
          : "all",
      status: "all",
      fromDate: "",
      toDate: "",
    }),
    [user]
  );
  const [odRecords, setOdRecords] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [tempFilters, setTempFilters] = useState(initialFilters);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedOD, setSelectedOD] = useState(null);
  const [selectedPunchOD, setSelectedPunchOD] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [total, setTotal] = useState(0);
  const [viewMode, setViewMode] = useState("approval");
  const [viewType, setViewType] = useState("pending");
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [showApprovalModal, setShowApprovalModal] = useState(null);
  const [approvalReason, setApprovalReason] = useState("");
  const [unlockStatus, setUnlockStatus] = useState({});
  const [showGuidelinesModal, setShowGuidelinesModal] = useState(false);

  // Generate list of months for filtering (last 12 months)
  const months = useMemo(() => {
    const monthsList = [{ value: "all", label: "All Months" }];
    const today = new Date();
    for (let i = 0; i < 6; i++) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      monthsList.push({
        value: `${date.getFullYear()}-${date.getMonth() + 1}`,
        label: date.toLocaleString("default", { month: "long", year: "numeric" }),
      });
    }
    return monthsList;
  }, []);

  // Format date to dd/mm/yyyy
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const fetchODs = useCallback(
    async (filterParams) => {
      setLoading(true);
      setError(null);
      try {
        const normalizedFilters = {
          ...filterParams,
          page: currentPage,
          limit: itemsPerPage,
          viewType,
          selectedMonth: viewType === "past" ? selectedMonth : undefined,
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
          if (normalizedFilters.employeeId === user?.employeeId) {
            normalizedFilters.employeeId = "";
          }
        }
        // Add role-based filtering for viewType
        if (viewType === "pending") {
          if (user?.loginType === "HOD") {
            normalizedFilters.pendingStage =
              viewMode === "own" ? "initial" : "initial,admin,hod";
          } else if (user?.loginType === "CEO") {
            normalizedFilters.pendingStage = "ceo";
          } else if (user?.loginType === "Admin") {
            normalizedFilters.pendingStage = "admin,finalAdmin";
          } else if (user?.loginType === "Employee") {
            normalizedFilters.employeeId = user?.employeeId || "";
            normalizedFilters.isFutureOrCurrent = true;
          }
        } else if (viewType === "past") {
          if (user?.loginType === "Employee") {
            normalizedFilters.employeeId = user?.employeeId || "";
            normalizedFilters.isPast = true;
          } else {
            normalizedFilters.handledBy = user?._id;
          }
        }
        console.log("Fetching with filters:", normalizedFilters);
        const res = await api.get("/od", { params: normalizedFilters });
        console.log("API Response:", res.data);
        let updatedRecords = res.data.odRecords.map((od) => ({
          ...od,
          punchPairs:
            od.actualPunchTimes &&
            Array.isArray(od.actualPunchTimes) &&
            od.actualPunchTimes.length > 1
              ? od.actualPunchTimes.slice(1, -1).map((punch, index) => ({
                  actualTimeOut: punch.actualTimeOut,
                  actualTimeIn: od.actualPunchTimes[index + 2]?.actualTimeIn,
                }))
              : [],
        }));
        // Frontend fallback for month filtering
        if (viewType === "past" && selectedMonth !== "all") {
          const [year, month] = selectedMonth.split("-").map(Number);
          updatedRecords = updatedRecords.filter((od) => {
            const dateOut = new Date(od.dateOut);
            return (
              dateOut.getFullYear() === year && dateOut.getMonth() + 1 === month
            );
          });
        }
        setOdRecords(updatedRecords || []);
        setTotal(res.data.total || updatedRecords.length);
        if (updatedRecords.length === 0) {
          setError(
            filterParams.employeeId
              ? "No OD records found for the specified Employee ID."
              : "No OD records found for the selected filters."
          );
        }
      } catch (err) {
        console.error("Error fetching OD list:", err);
        setError(
          err.response?.data?.message ||
            err.message ||
            "Failed to fetch OD records. Please try again."
        );
      } finally {
        setLoading(false);
      }
    },
    [currentPage, itemsPerPage, user, viewMode, viewType, selectedMonth]
  );

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await api.get("/departments");
      setDepartments(res.data);
    } catch (err) {
      console.error("Error fetching departments:", err);
      setError("Failed to load departments");
    }
  }, []);

  const fetchEmployees = useCallback(
    async (departmentId = null) => {
      try {
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
        console.error("Error fetching employees:", err);
        setError("Failed to load employees");
      }
    },
    [user?.loginType]
  );

  useEffect(() => {
    if (!user) return;
    let newFilters = { ...initialFilters };
    let departmentIdForEmployees = null;

    if (user?.loginType === "HOD" && user?.department) {
      setDepartments([{ _id: user.department._id, name: user.department.name }]);
      newFilters = {
        ...initialFilters,
        departmentId: viewMode === "approval" ? user.department._id : "all",
        employeeId: viewMode === "own" ? user.employeeId : "",
        name: viewMode === "own" ? user.name : "",
      };
      departmentIdForEmployees = viewMode === "own" ? null : user.department._id;
      setFilters(newFilters);
      setTempFilters(newFilters);
      fetchODs(newFilters);
      fetchEmployees(departmentIdForEmployees);
    } else if (user?.loginType === "Employee") {
      newFilters = {
        ...initialFilters,
        employeeId: user?.employeeId || "",
        name: user?.name || "",
      };
      setFilters(newFilters);
      setTempFilters(newFilters);
      fetchODs(newFilters);
    } else {
      fetchDepartments();
      fetchEmployees();
      setFilters(initialFilters);
      setTempFilters(initialFilters);
      fetchODs(initialFilters);
    }
  }, [user, fetchDepartments, fetchEmployees, fetchODs, initialFilters, viewMode]);

  useEffect(() => {
    fetchODs(filters);
  }, [currentPage, itemsPerPage, fetchODs, viewType, selectedMonth]);

  const handleChange = (name, value) => {
    setTempFilters((prev) => {
      const newFilters = { ...prev, [name]: value };
      if (name === "employeeId" && value === "all") {
        newFilters.name = "";
      } else if (name === "employeeId") {
        const selectedEmployee = employees.find(emp => emp.employeeId === value);
        newFilters.name = selectedEmployee?.name || "";
      }
      return newFilters;
    });
  };

  const handleFilter = () => {
    setFilters(tempFilters);
    setCurrentPage(1);
    fetchODs(tempFilters);
  };

  const handleApproval = async (id, status, stage, reason = "") => {
    try {
      const odToUpdate = odRecords.find((record) => record._id === id);
      const isWithin30Days =
        new Date(odToUpdate.dateOut) >=
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      if (
        !isWithin30Days &&
        (odToUpdate.initialStatus !== "Pending" ||
          odToUpdate.status[stage] !== "Pending")
      ) {
        alert("Cannot change status after 30 days.");
        return;
      }

      const odData = {
        status,
        reason:
          status === "Denied" || status === "Rejected" || unlockStatus[id]
            ? reason.trim() || "No reason provided"
            : reason,
      };
      const response = await api.put(`/od/${id}/approve`, odData, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

      const updatedODs = odRecords.map((record) => {
        if (record._id === id) {
          let newStatus = { ...record.status };
          let newInitialStatus = record.initialStatus;
          if (stage === "initial") {
            newInitialStatus = status;
            if (status === "Denied") {
              newStatus.admin = "N/A";
              newStatus.hod = "N/A";
              newStatus.ceo = "N/A";
              newStatus.finalAdmin = "N/A";
            } else if (status === "Allowed") {
              newStatus.admin = "Pending";
            }
          } else if (stage === "admin") {
            newStatus.admin = status;
            if (status === "Denied") {
              newStatus.hod = "N/A";
              newStatus.ceo = "N/A";
              newStatus.finalAdmin = "N/A";
            } else if (status === "Allowed") {
              newStatus.hod = "Pending";
            }
          } else if (stage === "hod") {
            newStatus.hod = status;
            if (status === "Rejected") {
              newStatus.ceo = "N/A";
              newStatus.finalAdmin = "N/A";
            } else if (status === "Approved") {
              newStatus.ceo = "Pending";
            }
          } else if (stage === "ceo") {
            newStatus.ceo = status;
            if (status === "Rejected") {
              newStatus.finalAdmin = "N/A";
            } else if (status === "Approved") {
              newStatus.finalAdmin = "Pending";
            }
          } else if (stage === "finalAdmin") {
            newStatus.finalAdmin = status;
          }
          return {
            ...record,
            status: newStatus,
            initialStatus: newInitialStatus,
            statusHistory: [
              ...(record.statusHistory || []),
              {
                stage,
                status,
                reason: reason || "No reason provided",
                changedBy: user._id,
                changedAt: new Date(),
              },
            ],
          };
        }
        return record;
      });
      setOdRecords(updatedODs);
      setUnlockStatus((prev) => ({ ...prev, [id]: false }));
      alert(`OD ${status.toLowerCase()} successfully.`);

      await api.post("/notifications", {
        userId: odToUpdate.employeeId,
        adminId: "admin-user-id",
        message: `OD status for ${odToUpdate.name} has been updated to ${status} by ${user.loginType}. Reason: ${reason || "No reason provided"}`,
      });
    } catch (err) {
      console.error("Approval error:", err);
      // alert(
      //   `Failed to update OD status: ${
      //     err.response?.data?.message || err.message || "Server error"
      //   }`
      // );
    }
  };

  const handleUnlock = (id) => {
    setUnlockStatus((prev) => ({ ...prev, [id]: true }));
  };

  const hodDepartmentName =
    user?.loginType === "HOD" && user?.department
      ? departments.find((dep) => dep._id === user.department._id)?.name ||
        "Unknown"
      : "";

 const filteredOdRecords = useMemo(() => {
  let records = [...odRecords];

  // HOD shouldn't see own records
  if (user?.loginType === "HOD" && viewMode === "approval" && user?.employeeId) {
    records = records.filter(
      (od) =>
        od.employeeId !== user.employeeId &&
        (od.name && user.name ? od.name !== user.name : true)
    );
  }

  // CEO should not see certain records
  if (user?.loginType === "CEO" && viewType === "pending") {
    records = records.filter(
      (od) =>
        !(
          (od.initialStatus === "Allowed" && od.status?.hod === "Rejected") ||
          od.initialStatus === "Denied"
        )
    );
  }

  return records;
}, [odRecords, user, viewMode, viewType]);


  const filteredEmployees = useMemo(() => {
    let result = employees;
    if (tempFilters.departmentId && tempFilters.departmentId !== "all") {
      result = result.filter((emp) => {
        const deptId =
          typeof emp.department === "object"
            ? emp.department._id
            : emp.department;
        return deptId === tempFilters.departmentId;
      });
    }
    return result;
  }, [employees, tempFilters.departmentId]);

  const isExtendODAllowed = (od) => {
    const dateOut = new Date(od.dateOut);
    const dateIn = new Date(od.dateIn);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dateOut.toDateString() !== dateIn.toDateString() && dateIn >= today;
  };

  const isFinalized = (od) => {
    return (
      od.status.finalAdmin === "Acknowledged" ||
      od.initialStatus === "Denied" ||
      od.status.admin === "Denied" ||
      od.status.hod === "Rejected" ||
      od.status.ceo === "Rejected"
    );
  };

  return (
    <ContentLayout title={user?.loginType === "Employee" ? "My ODs" : "OD List"}>
      <Card className="w-full mx-auto shadow-lg border">
        <CardContent className="p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-100 text-red-700 rounded">
              {error}
            </div>
          )}
          <div className="mb-4 flex gap-4">
            {user?.loginType === "HOD" && (
              <>
                {/* <Button
                  onClick={() => setViewMode("approval")}
                  className={`px-4 py-2 rounded-lg ${
                    viewMode === "approval"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-700"
                  } hover:bg-blue-600 hover:text-white transition-colors`}
                >
                  Approval Requests
                </Button> */}
                {/* <Button
                  onClick={() => setViewMode("own")}
                  className={`px-4 py-2 rounded-lg ${
                    viewMode === "own"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-700"
                  } hover:bg-blue-600 hover:text-white transition-colors`}
                >
                  My ODs
                </Button> */}
               
              </>
            )}
            <Button
              onClick={() => {
                setViewType("pending");
                setSelectedMonth("all");
                setCurrentPage(1);
              }}
              className={`px-4 py-2 rounded-lg ${
                viewType === "pending"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700"
              } hover:bg-blue-600 hover:text-white transition-colors`}
            >
              {user?.loginType === "Employee" ? "Pending ODs" : "Pending Approvals"}
            </Button>
            <Button
              onClick={() => {
                setViewType("past");
                setSelectedMonth("all");
                setCurrentPage(1);
              }}
              className={`px-4 py-2 rounded-lg ${
                viewType === "past"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700"
              } hover:bg-blue-600 hover:text-white transition-colors`}
            >
              {user?.loginType === "Employee" ? "Past ODs" : "Past Approvals"}
            </Button>
            {viewType === "past" && (
              <Select
                onValueChange={(value) => {
                  setSelectedMonth(value);
                  setCurrentPage(1);
                }}
                value={selectedMonth}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select Month" />
                </SelectTrigger>
                <SelectContent>
                  {months.map((month) => (
                    <SelectItem key={month.value} value={month.value}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
             <Button
                  onClick={() => setShowGuidelinesModal(true)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 hover:text-white transition-colors"
                >
                  Module Usage
                </Button>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
          >
            {user?.loginType === "HOD" ? (
              viewMode === "own" ? (
                <>
                  <div className="flex-1 min-w-[200px]">
                    <Label htmlFor="employeeName" className="text-sm font-medium">
                      Employee Name
                    </Label>
                    <Input
                      id="employeeName"
                      value={user?.name || "Unknown"}
                      readOnly
                      className="mt-1 border-gray-300 bg-gray-100 cursor-not-allowed"
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
                      className="mt-1 border-gray-300 bg-gray-100 cursor-not-allowed"
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
                      className="mt-1 border-gray-300 bg-gray-100 cursor-not-allowed"
                      placeholder="Your Department"
                    />
                  </div>
                </>
              ) : (
                <div className="flex-1 min-w-[200px] relative">
                  <Label htmlFor="employeeName" className="text-sm font-medium">
                    Employee Name or ID
                  </Label>
                  <Select
                    onValueChange={(value) => {
                      const selectedEmployee = employees.find(
                        (emp) => emp.employeeId === value
                      );
                      handleChange("name", selectedEmployee?.name || "");
                      handleChange("employeeId", value);
                      fetchODs({
                        ...tempFilters,
                        name: selectedEmployee?.name || "",
                        employeeId: value,
                      });
                    }}
                    value={tempFilters.employeeId || ""}
                    disabled={viewMode === "own"}
                  >
                    <SelectTrigger className="border px-3 py-2 rounded-md w-full">
                      <SelectValue placeholder="Select Employee Name" />
                    </SelectTrigger>
                    <SelectContent className="z-50 max-h-60 overflow-y-auto">
                      <SelectItem value="all">All Employees</SelectItem>
                      {filteredEmployees.map((emp) => (
                        <SelectItem key={emp._id} value={emp.employeeId}>
                          {emp.name} ({emp.employeeId})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )
            ) : user?.loginType === "Employee" ? (
              <>
                <div className="flex-1 min-w-[200px]">
                  <Label htmlFor="employeeName" className="text-sm font-medium">
                    Employee Name
                  </Label>
                  <Input
                    id="employeeName"
                    value={user?.name || "Unknown"}
                    readOnly
                    className="mt-1 border-gray-300 bg-gray-100 cursor-not-allowed"
                    placeholder="Your Name"
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <Label htmlFor="employeeId" className="text-sm font-medium">
                    Employee ID
                  </Label>
                  <Input
                    id="employeeId"
                    value={tempFilters.employeeId}
                    readOnly
                    className="mt-1 border-gray-300 bg-gray-100 cursor-not-allowed"
                    placeholder="Employee ID"
                  />
                </div>
              </>
            ) : (
              <div className="flex-1 min-w-[200px] relative">
                <Label htmlFor="employeeName" className="text-sm font-medium">
                  Employee Name or ID
                </Label>
                <Select
                  onValueChange={(value) => {
                    const selectedEmployee = employees.find(
                      (emp) => emp.employeeId === value
                    );
                    handleChange("name", selectedEmployee?.name || "");
                    handleChange("employeeId", value);
                    fetchODs({
                      ...tempFilters,
                      name: selectedEmployee?.name || "",
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
                    {filteredEmployees.map((emp) => (
                      <SelectItem key={emp._id} value={emp.employeeId}>
                        {emp.name} ({emp.employeeId})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
                  onValueChange={(value) => {
                    handleChange("departmentId", value);
                    fetchEmployees(value);
                  }}
                  value={tempFilters.departmentId}
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
              <Label htmlFor="status">Approval Status (Any Stage)</Label>
              <Select
                onValueChange={(value) => handleChange("status", value)}
                value={tempFilters.status}
                disabled={loading}
              >
                <SelectTrigger
                  id="status"
                  className="mt-1 border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                >
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent className="z-50">
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Allowed">Allowed</SelectItem>
                  <SelectItem value="Denied">Denied</SelectItem>
                  <SelectItem value="Approved">Approved</SelectItem>
                  <SelectItem value="Rejected">Rejected</SelectItem>
                  <SelectItem value="Acknowledged">Acknowledged</SelectItem>
                  <SelectItem value="N/A">N/A</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="fromDate">From Date</Label>
              <Input
                id="fromDate"
                name="fromDate"
                type="date"
                value={tempFilters.fromDate}
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
                value={tempFilters.toDate}
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
          <div className="overflow-x-auto">
            <Table className="min-w-full">
              <TableHeader>
                <TableRow className="border-b">
                  <TableHead className="font-semibold">Employee</TableHead>
                  <TableHead className="font-semibold">Date Out</TableHead>
                  <TableHead className="font-semibold">Date In</TableHead>
                  <TableHead className="font-semibold">Purpose</TableHead>
                  <TableHead className="font-semibold">Place/Unit</TableHead>
                  <TableHead className="font-semibold">View Details</TableHead>
                  <TableHead className="font-semibold">Punch Details</TableHead>
                  <TableHead className="font-semibold">Initial Status (HoD)</TableHead>
                  <TableHead className="font-semibold">Initial Status (Admin)</TableHead>
                  <TableHead className="font-semibold">Status (HOD)</TableHead>
                  <TableHead className="font-semibold">Status (CEO)</TableHead>
                  <TableHead className="font-semibold">Status (Admin)</TableHead>
                  {["HOD", "CEO", "Admin"].includes(user?.loginType) &&
                    viewMode !== "own" && (
                      <TableHead className="font-semibold">Action</TableHead>
                    )}
                  {user?.loginType === "Employee" && (
                    <TableHead className="font-semibold">Extend OD</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell
                      colSpan={
                        user?.loginType === "Employee"
                          ? 13
                          : ["HOD", "CEO", "Admin"].includes(user?.loginType) &&
                            viewMode !== "own"
                          ? 13
                          : 12
                      }
                      className="text-center py-4"
                    >
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredOdRecords.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={
                        user?.loginType === "Employee"
                          ? 13
                          : ["HOD", "CEO", "Admin"].includes(user?.loginType) &&
                            viewMode !== "own"
                          ? 13
                          : 12
                      }
                      className="text-center py-4"
                    >
                      No OD records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOdRecords.map((od) => {
                    const isWithin30Days =
                      new Date(od.dateOut) >=
                      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                    return (
                      <TableRow key={od._id} className="hover:bg-gray-50">
                        <TableCell>{od.name}</TableCell>
                        <TableCell>{formatDate(od.dateOut)}</TableCell>
                        <TableCell>{formatDate(od.dateIn)}</TableCell>
                        <TableCell>{od.purpose}</TableCell>
                        <TableCell>{od.placeUnitVisit}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            onClick={() => setSelectedOD(od)}
                            className="bg-blue-600 text-white"
                          >
                            View
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            onClick={() => setSelectedPunchOD(od)}
                            className="bg-green-600 text-white"
                          >
                            Punch Details
                          </Button>
                        </TableCell>
                        <TableCell>{od.initialStatus || "Pending"}</TableCell>
                        <TableCell>{od.status.admin || "Pending"}</TableCell>
                        <TableCell>{od.status.hod || "Pending"}</TableCell>
                        <TableCell>{od.status.ceo || "Pending"}</TableCell>
                        <TableCell>{od.status.finalAdmin || "Pending"}</TableCell>
                        {["HOD", "CEO", "Admin"].includes(user?.loginType) &&
                          viewMode !== "own" && (
                            <TableCell>
                              {user.loginType === "HOD" &&
                                od.initialStatus === "Pending" && (
                                  <div className="flex gap-2">
                                    <Button
                                      variant="default"
                                      size="sm"
                                      className="bg-blue-600 hover:bg-blue-700 text-white"
                                      onClick={() =>
                                        setShowApprovalModal({
                                          id: od._id,
                                          action: "allow",
                                          stage: "initial",
                                        })
                                      }
                                      disabled={loading || od.initialStatus !== "Pending"}
                                      aria-label={`Allow OD for ${od.name}`}
                                    >
                                      Allow
                                    </Button>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      className="bg-red-600 hover:bg-red-700 text-white"
                                      onClick={() =>
                                        setShowApprovalModal({
                                          id: od._id,
                                          action: "deny",
                                          stage: "initial",
                                        })
                                      }
                                      disabled={loading || od.initialStatus !== "Pending"}
                                      aria-label={`Deny OD for ${od.name}`}
                                    >
                                      Deny
                                    </Button>
                                  </div>
                                )}
                              {user.loginType === "Admin" &&
                                od.initialStatus === "Allowed" &&
                                od.status.admin === "Pending" && (
                                  <div className="flex gap-2">
                                    <Button
                                      variant="default"
                                      size="sm"
                                      className="bg-blue-600 hover:bg-blue-700 text-white"
                                      onClick={() =>
                                        setShowApprovalModal({
                                          id: od._id,
                                          action: "allow",
                                          stage: "admin",
                                        })
                                      }
                                      disabled={loading || od.status.admin !== "Pending"}
                                      aria-label={`Allow OD for ${od.name}`}
                                    >
                                      Allow
                                    </Button>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      className="bg-red-600 hover:bg-red-700 text-white"
                                      onClick={() =>
                                        setShowApprovalModal({
                                          id: od._id,
                                          action: "deny",
                                          stage: "admin",
                                        })
                                      }
                                      disabled={loading || od.status.admin !== "Pending"}
                                      aria-label={`Deny OD for ${od.name}`}
                                    >
                                      Deny
                                    </Button>
                                  </div>
                                )}
                              {user.loginType === "HOD" &&
                                od.initialStatus === "Allowed" &&
                                od.status.admin === "Allowed" &&
                                od.status.hod === "Pending" && (
                                  <div className="flex gap-2">
                                    <Button
                                      variant="default"
                                      size="sm"
                                      className="bg-blue-600 hover:bg-blue-700 text-white"
                                      onClick={() =>
                                        setShowApprovalModal({
                                          id: od._id,
                                          action: "approve",
                                          stage: "hod",
                                        })
                                      }
                                      disabled={loading || od.status.hod !== "Pending"}
                                      aria-label={`Approve OD for ${od.name}`}
                                    >
                                      Approve
                                    </Button>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      className="bg-red-600 hover:bg-red-700 text-white"
                                      onClick={() =>
                                        setShowApprovalModal({
                                          id: od._id,
                                          action: "reject",
                                          stage: "hod",
                                        })
                                      }
                                      disabled={loading || od.status.hod !== "Pending"}
                                      aria-label={`Reject OD for ${od.name}`}
                                    >
                                      Reject
                                    </Button>
                                  </div>
                                )}
                              {user.loginType === "CEO" &&
                                od.initialStatus === "Allowed" &&
                                od.status.admin === "Allowed" &&
                                od.status.hod === "Approved" &&
                                od.status.ceo === "Pending" && (
                                  <div className="flex gap-2">
                                    <Button
                                      variant="default"
                                      size="sm"
                                      className="bg-blue-600 hover:bg-blue-700 text-white"
                                      onClick={() =>
                                        setShowApprovalModal({
                                          id: od._id,
                                          action: "approve",
                                          stage: "ceo",
                                        })
                                      }
                                      disabled={loading || od.status.ceo !== "Pending"}
                                      aria-label={`Approve OD for ${od.name}`}
                                    >
                                      Approve
                                    </Button>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      className="bg-red-600 hover:bg-red-700 text-white"
                                      onClick={() =>
                                        setShowApprovalModal({
                                          id: od._id,
                                          action: "reject",
                                          stage: "ceo",
                                        })
                                      }
                                      disabled={loading || od.status.ceo !== "Pending"}
                                      aria-label={`Reject OD for ${od.name}`}
                                    >
                                      Reject
                                    </Button>
                                  </div>
                                )}
                              {user.loginType === "Admin" &&
                                od.initialStatus === "Allowed" &&
                                od.status.admin === "Allowed" &&
                                od.status.hod === "Approved" &&
                                od.status.ceo === "Approved" &&
                                od.status.finalAdmin === "Pending" && (
                                  <div className="flex gap-2">
                                    <Button
                                      variant="default"
                                      size="sm"
                                      className="bg-blue-600 hover:bg-blue-700 text-white"
                                      onClick={() =>
                                        setShowApprovalModal({
                                          id: od._id,
                                          action: "acknowledge",
                                          stage: "finalAdmin",
                                        })
                                      }
                                      disabled={loading || od.status.finalAdmin !== "Pending"}
                                      aria-label={`Acknowledge OD for ${od.name}`}
                                    >
                                      Acknowledge
                                    </Button>
                                  </div>
                                )}
                              {isFinalized(od) && !unlockStatus[od._id] && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="bg-yellow-500 hover:bg-yellow-600 text-white"
                                  onClick={() => handleUnlock(od._id)}
                                  disabled={loading || !isWithin30Days}
                                  aria-label={`Unlock OD for ${od.name}`}
                                >
                                  Unlock
                                </Button>
                              )}
                              {isFinalized(od) && unlockStatus[od._id] && (
                                <div className="flex gap-2">
                                  <Button
                                    variant="default"
                                    size="sm"
                                    className="bg-blue-600 hover:bg-blue-700 text-white"
                                    onClick={() =>
                                      setShowApprovalModal({
                                        id: od._id,
                                        action:
                                          user.loginType === "Admin" ? "acknowledge" : "approve",
                                        stage:
                                          user.loginType === "Admin" &&
                                          od.status.admin === "Pending"
                                            ? "admin"
                                            : user.loginType === "Admin"
                                            ? "finalAdmin"
                                            : user.loginType.toLowerCase(),
                                      })
                                    }
                                    disabled={loading}
                                    aria-label={`Grant Approval for ${od.name}`}
                                  >
                                    {user.loginType === "Admin" ? "Acknowledge" : "Approve"}
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    className="bg-red-600 hover:bg-red-700 text-white"
                                    onClick={() =>
                                      setShowApprovalModal({
                                        id: od._id,
                                        action: "reject",
                                        stage:
                                          user.loginType === "Admin" &&
                                          od.status.admin === "Pending"
                                            ? "admin"
                                            : user.loginType === "Admin"
                                            ? "finalAdmin"
                                            : user.loginType.toLowerCase(),
                                      })
                                    }
                                    disabled={loading}
                                    aria-label={`Dismiss Approval for ${od.name}`}
                                  >
                                    Reject
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          )}
                        {user?.loginType === "Employee" && (
                          <TableCell>
                            <Button
                              size="sm"
                              onClick={() =>
                                navigate("/employee/od", { state: { od: od } })
                              }
                              className="bg-red-600 text-white hover:bg-red-700"
                              disabled={!isExtendODAllowed(od)}
                              aria-label={`Extend OD for ${od.name}`}
                            >
                              Extend OD
                            </Button>
                          </TableCell>
                        )}
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
              open={showGuidelinesModal}
              onOpenChange={() => setShowGuidelinesModal(false)}
            >
              <DialogContent className="max-w-lg max-h-[530px] p-6 bg-white shadow-lg rounded-lg border border-gray-200">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold text-red-800">
                    OD Approval Guidelines
                  </DialogTitle>
                  <DialogDescription className="text-gray-600">
                    Guidelines for Heads of Department (HODs) and Admins on managing OD requests.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700">
                    <li>
                      <strong className="text-base text-blue-800">Review OD Details:</strong> The details provided in the OD request, accessible via the "View Details" button, include the purpose, place/unit of visit, and requested dates/times. Verify these details for accuracy and relevance to the employee's duties.
                    </li>
                    <li>
                      <strong className="text-base text-blue-800">Cross-Check Punch Details:</strong> Use the "Punch Details" button to review the actual punch-in and punch-out times recorded for the OD. These should align with the submitted OD details to confirm the employee's activities during the OD period.
                    </li>
                    <li>
                      <strong className="text-base text-blue-800">Approval Flow:</strong>
                      <ul className="list-circle pl-5 mt-1">
                        <li><strong>HOD Initial Decision:</strong> HODs first decide to "Allow" or "Deny" the OD request. If denied, a reason is required.</li>
                        <li><strong>Admin Permission:</strong> If HOD allows, Admins decide to "Allow" or "Deny" the OD, determining if the employee can leave the premises. A reason is required for denial.</li>
                        <li><strong>HOD Approval:</strong> If Admin allows, HODs can "Approve" or "Reject" the OD based on criteria (e.g., punch times). A reason is required for rejection.</li>
                        <li><strong>CEO Approval:</strong> If HOD approves, CEOs can "Approve" or "Reject" the OD. A reason is required for rejection.</li>
                        <li><strong>Admin Acknowledgment:</strong> If CEO approves, Admins acknowledge the OD to finalize the process.</li>
                      </ul>
                    </li>
                    <li>
                      <strong className="text-base text-blue-800">Re-evaluate Decisions:</strong> A <span className="text-red-800">30 Days Window</span> is provided for re-evaluation. Use the "Unlock" button, available after final acknowledgment or denial/rejection, to revisit a previously finalized OD if new information (e.g., punch time discrepancies) suggests misuse. Upon unlocking, you can either:
                      <ul className="list-circle pl-5 mt-1">
                        <li><strong className="text-base text-blue-800">Grant Approval:</strong> Re-approve, re-allow, or acknowledge the OD request with an optional reason.</li>
                        <li><strong className="text-base text-blue-800">Dismiss Approval:</strong> Reject or deny the OD request, providing a mandatory reason for the change.</li>
                      </ul>
                    </li>
                  </ul>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog
              open={!!selectedOD}
              onOpenChange={() => setSelectedOD(null)}
              className="relative"
            >
              <DialogContent className="max-w-md p-4 bg-white shadow-lg rounded-lg border border-gray-200">
                <DialogHeader>
                  <DialogTitle className="text-lg font-semibold">
                    OD Details for {selectedOD?.name}
                  </DialogTitle>
                  <DialogDescription>
                    Detailed information about the selected OD request.
                  </DialogDescription>
                </DialogHeader>
                {selectedOD && (
                  <div className="space-y-3 mt-4">
 <p>
   <span className="text-blue-800 font-bold">Initial Status: </span>{" "}
  {selectedOD?.initialStatus === "Denied" || selectedOD?.status?.admin === "Denied" 
    ? <span className="text-red-600 font-semibold">Denied</span> 
    : selectedOD?.initialStatus === "Pending" || selectedOD?.status?.admin === "Pending"  
      ? <span className="text-yellow-600 font-semibold">Pending</span> 
      : selectedOD?.initialStatus === "Allowed" && selectedOD?.status?.admin === "Allowed" 
        ? <span className="text-green-600 font-semibold">Allowed</span> 
        : <span className="text-gray-600">N/A</span>}
</p>
                    <p>
                      <strong>Date Out:</strong>{" "}
                      {formatDate(selectedOD.dateOut)}
                    </p>
                    <p>
                      <strong>Time Out:</strong> {selectedOD.timeOut || "N/A"}
                    </p>
                    <p>
                      <strong>Date In:</strong>{" "}
                      {formatDate(selectedOD.dateIn)}
                    </p>
                    <p>
                      <strong>Time In:</strong> {selectedOD.timeIn || "N/A"}
                    </p>
                    <p>
                      <strong>Purpose:</strong> {selectedOD.purpose}
                    </p>
                    <p>
                      <strong>Place/Unit Visit:</strong>{" "}
                      {selectedOD.placeUnitVisit}
                    </p>
    <p>
  <strong>Status History:</strong>
  <ul className="list-disc pl-5 mt-2">
    {selectedOD?.statusHistory?.length > 0 ? (
      selectedOD.statusHistory.map((history, index) => {
        const stageDisplay = index === 0 ? "INITIAL REQUEST" :
                            index === 1 || history.stage === "hod" ? "HOD" : 
                            index === 2 && history.stage === "admin" ? "ADMIN" :
                            history.stage === "admin" ? "ADMIN" :
                            history.stage === "hod" ? "HOD" :
                            history.stage === "ceo" ? "CEO" :
                            history.stage === "finalAdmin" ? "ADMIN" :
                            history.stage;
        const stageColor = index === 0 ? "" :
                          index === 1 || history.stage === "hod" ? "" : 
                          index === 2 && history.stage === "admin" ? "" :
                          history.stage === "admin" ? "" :
                          history.stage === "ceo" ? "" :
                          "";
        return (
          <li key={index} className={`text-sm ${stageColor}`}>
            <strong>{stageDisplay}:</strong>{" "}
            {history.status}
         {(history.reason && history.reason.trim() !== "" && history.status !== "Allowed" && history.status !== "Acknowledged" && history.status !== "Approved") && ` (Reason: ${history.reason})`}
            {" on "}
           {(() => {
  const date = new Date(history.changedAt);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `${day}/${month}/${year}, ${time}`;
})()}

          </li>
        );
      })
    ) : (
      <li className="text-sm">No status history available</li>
    )}
  </ul>
</p>
                  </div>
                )}
              </DialogContent>
            </Dialog>
            <Dialog
              open={!!selectedPunchOD}
              onOpenChange={() => setSelectedPunchOD(null)}
              className="relative"
            >
              <DialogContent className="max-w-md p-4 bg-white shadow-lg rounded-lg border border-gray-200">
                <DialogHeader>
                  <DialogTitle className="text-lg font-semibold">
                    Punch Details for {selectedPunchOD?.name}
                  </DialogTitle>
                </DialogHeader>
                {selectedPunchOD && selectedPunchOD.actualPunchTimes && (
                  <div className="space-y-2 mt-2">
                    <u>Actual Punch Times:</u>
                    <ul className="list-disc pl-5 mt-2">
                      {selectedPunchOD.actualPunchTimes.length > 1 &&
                        selectedPunchOD.actualPunchTimes.map(
                          (punch, index, array) => {
                            if (index >= array.length - 1) return null;

                            const timeOut = punch.actualTimeOut
                              ? new Date(punch.actualTimeOut)
                                  .toISOString()
                                  .split("T")[1]
                                  .split(".")[0]
                              : "N/A";
                            const timeIn = array[index + 1]?.actualTimeIn
                              ? new Date(array[index + 1].actualTimeIn)
                                  .toISOString()
                                  .split("T")[1]
                                  .split(".")[0]
                              : "N/A";

                            return (
                              <li key={punch.punchId} className="text-sm">
                                <strong>Pair {index + 1}:</strong>{" "}
                                <span>Time Out: {timeOut}</span>{" "}
                                <span>→ Time In: {timeIn}</span>
                              </li>
                            );
                          }
                        )}
                    </ul>
                  </div>
                )}
              </DialogContent>
            </Dialog>
            <Dialog
              open={!!showApprovalModal}
              onOpenChange={() => {
                setShowApprovalModal(null);
                setApprovalReason("");
              }}
            >
              <DialogContent className="max-w-md p-4 bg-white shadow-lg rounded-lg border border-gray-200">
                <DialogHeader>
                  <DialogTitle className="text-lg font-semibold">
                    {showApprovalModal?.action === "allow"
                      ? "Allow OD"
                      : showApprovalModal?.action === "deny"
                      ? "Deny OD"
                      : showApprovalModal?.action === "approve"
                      ? "Approve OD"
                      : showApprovalModal?.action === "reject"
                      ? "Reject OD"
                      : "Acknowledge OD"}
                  </DialogTitle>
                  <DialogDescription>
                    {showApprovalModal?.action === "allow" ||
                    showApprovalModal?.action === "approve" ||
                    showApprovalModal?.action === "acknowledge"
                      ? "Optionally provide a reason for this action."
                      : "Please provide a reason for this action."}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <Label htmlFor="reason">
                      Reason{" "}
                      {showApprovalModal?.action === "allow" ||
                      showApprovalModal?.action === "approve" ||
                      showApprovalModal?.action === "acknowledge"
                        ? "(Optional)"
                        : "(Required)"}
                    </Label>
                    <Textarea
                      id="reason"
                      value={approvalReason}
                      onChange={(e) => setApprovalReason(e.target.value)}
                      placeholder={
                        showApprovalModal?.action === "allow" ||
                        showApprovalModal?.action === "approve" ||
                        showApprovalModal?.action === "acknowledge"
                          ? "Enter reason (optional)"
                          : "Enter reason (required)"
                      }
                      className="mt-1 border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowApprovalModal(null);
                        setApprovalReason("");
                      }}
                      className="border-gray-300"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        const odRecord = odRecords.find(
                          (record) => record._id === showApprovalModal?.id
                        );
                        const status =
                          showApprovalModal.action === "allow"
                            ? "Allowed"
                            : showApprovalModal.action === "deny"
                            ? "Denied"
                            : showApprovalModal.action === "approve"
                            ? "Approved"
                            : showApprovalModal.action === "reject"
                            ? "Rejected"
                            : "Acknowledged";
                        handleApproval(
                          showApprovalModal.id,
                          status,
                          showApprovalModal.stage,
                          approvalReason
                        );
                        setShowApprovalModal(null);
                        setApprovalReason("");
                      }}
                      className="bg-blue-600 text-white hover:bg-blue-700"
                      disabled={
                        (showApprovalModal?.action === "deny" ||
                          showApprovalModal?.action === "reject" ||
                          unlockStatus[showApprovalModal?.id]) &&
                        !approvalReason.trim()
                      }
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </ContentLayout>
  );
}

export default ODList;