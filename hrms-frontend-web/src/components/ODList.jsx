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
  DialogClose,
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
import Pagination from "./Pagination";
import api from "../services/api";
import ContentLayout from "./ContentLayout";
import { AuthContext } from "../context/AuthContext";

function ODList() {
  const { user } = useContext(AuthContext);
  const initialFilters = useMemo(
    () => ({
      employeeId: user?.loginType === "Employee" ? user?.employeeId || "" : "",
      name: "",
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
  const [showApprovalModal, setShowApprovalModal] = useState(null);
  const [approvalReason, setApprovalReason] = useState("");
  const [unlockStatus, setUnlockStatus] = useState({});

  const fetchODs = useCallback(
    async (filterParams) => {
      setLoading(true);
      setError(null);
      try {
        const normalizedFilters = {
          ...filterParams,
          page: currentPage,
          limit: itemsPerPage,
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
        console.log("Fetching with filters:", normalizedFilters);
        const res = await api.get("/od", { params: normalizedFilters });
        console.log("API Response:", res.data);
        const updatedRecords = res.data.odRecords.map((od) => ({
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
        setOdRecords(updatedRecords || []);
        setTotal(res.data.total || 0);
        if (res.data.odRecords.length === 0) {
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
    [currentPage, itemsPerPage, user, viewMode]
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

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await api.get("/employees");
      setEmployees(res.data);
    } catch (err) {
      console.error("Error fetching employees:", err);
      setError("Failed to load employees");
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    if (user?.loginType === "HOD" && user?.department) {
      setDepartments([{ _id: user.department._id, name: user.department.name }]);
      const hodFilters = {
        ...initialFilters,
        departmentId: viewMode === "approval" ? user.department._id : "all",
        employeeId: viewMode === "own" ? user.employeeId : "",
      };
      setFilters(hodFilters);
      setTempFilters(hodFilters);
      fetchODs(hodFilters);
      fetchEmployees();
    } else if (user?.loginType === "Employee") {
      const empFilters = {
        ...initialFilters,
        employeeId: user?.employeeId || "",
      };
      setFilters(empFilters);
      setTempFilters(empFilters);
      fetchODs(empFilters);
    } else if (user) {
      fetchDepartments();
      fetchEmployees();
      setFilters(initialFilters);
      setTempFilters(initialFilters);
      fetchODs(initialFilters);
    }
  }, [user, fetchDepartments, fetchEmployees, fetchODs, initialFilters, viewMode]);

  useEffect(() => {
    fetchODs(filters);
  }, [currentPage, itemsPerPage, fetchODs]);

  const handleChange = (name, value) => {
    setTempFilters({ ...tempFilters, [name]: value });
  };

  const handleFilter = () => {
    setFilters(tempFilters);
    setCurrentPage(1);
    fetchODs(tempFilters);
  };

 const handleApproval = async (id, status, currentStage, reason = "") => {
  try {
    const odToUpdate = odRecords.find((record) => record._id === id);
    const isWithin30Days =
      new Date(odToUpdate.dateOut) >=
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    if (!isWithin30Days && odToUpdate.status[currentStage] !== "Pending") {
      alert("Cannot change status after 30 days.");
      return;
    }

    const odData = { 
      status, 
      reason: status === "Rejected" || unlockStatus[id] ? (reason.trim() || "No reason provided") : reason 
    };
    await api.put(`/od/${id}/approve`, odData);

    const updatedODs = odRecords.map((record) => {
      if (record._id === id) {
        let newStatus = { ...record.status };
        if (status === "Rejected") {
          newStatus.hod = currentStage === "hod" ? "Rejected" : newStatus.hod;
          newStatus.ceo = currentStage === "hod" || currentStage === "ceo" ? "N/A" : newStatus.ceo;
          newStatus.admin = currentStage === "hod" || currentStage === "ceo" || currentStage === "admin" ? "N/A" : newStatus.admin;
        } else {
          newStatus[currentStage] = status;
          if (status === "Approved" && currentStage === "hod") {
            newStatus.ceo = "Pending";
            newStatus.admin = "Pending";
          } else if (["Approved", "Submitted"].includes(status) && currentStage === "ceo") {
            newStatus.admin = "Pending";
          }
        }
        return { ...record, status: newStatus };
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
   // alert(`Failed to update OD status: ${err.response?.data?.message || err.message}`);
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
    if (user?.loginType === "HOD" && viewMode === "approval" && user?.employeeId) {
      return odRecords.filter(
        (od) =>
          od.employeeId !== user.employeeId &&
          (od.name && user.name ? od.name !== user.name : true)
      );
    }
    return odRecords;
  }, [odRecords, user, viewMode]);

  return (
    <ContentLayout title="OD List">
      <Card className="w-full mx-auto shadow-lg border">
        <CardContent className="p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-100 text-red-700 rounded">
              {error}
            </div>
          )}
          {user?.loginType === "HOD" && (
            <div className="mb-4 flex gap-4">
              <Button
                onClick={() => setViewMode("approval")}
                className={`px-4 py-2 rounded-lg ${
                  viewMode === "approval"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 !text-white-700"
                } hover:bg-blue-600 transition-colors`}
              >
                Approval Requests
              </Button>
              <Button
                onClick={() => setViewMode("own")}
                className={`px-4 py-2 rounded-lg ${
                  viewMode === "own"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 !text-white-700"
                } hover:bg-gray-700 transition-colors`}
              >
                My OD Requests
              </Button>
            </div>
          )}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
          >
            {user?.loginType === "HOD" ? (
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
                  }}
                  value={tempFilters.employeeId}
                  disabled={viewMode === "own"}
                >
                  <SelectTrigger className="border px-3 py-2 rounded-md w-full">
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
            ) : user?.loginType === "Employee" ? (
              <div className="flex-1 min-w-[200px]">
                <Label htmlFor="employeeId">Employee ID</Label>
                <Input
                  id="employeeId"
                  name="employeeId"
                  value={tempFilters.employeeId}
                  onChange={(e) => handleChange("employeeId", e.target.value)}
                  placeholder="Employee ID"
                  disabled
                  className="mt-1 border-gray-300 bg-gray-100 cursor-not-allowed"
                />
              </div>
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
                  }}
                  value={tempFilters.employeeId}
                >
                  <SelectTrigger className="border px-3 py-2 rounded-md w-full">
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
                  onValueChange={(value) => handleChange("departmentId", value)}
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
                  <TableHead className="font-semibold">Status (HOD)</TableHead>
                  <TableHead className="font-semibold">Status (CEO)</TableHead>
                  <TableHead className="font-semibold">Status (Admin)</TableHead>
                  {["HOD", "Admin", "CEO"].includes(user?.loginType) &&
                    viewMode !== "own" && (
                      <TableHead className="font-semibold">Action</TableHead>
                    )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell
                      colSpan={
                        ["HOD", "Admin", "CEO"].includes(user?.loginType) &&
                        viewMode !== "own"
                          ? 11
                          : 10
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
                        ["HOD", "Admin", "CEO"].includes(user?.loginType) &&
                        viewMode !== "own"
                          ? 11
                          : 10
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
                        <TableCell>
                          {new Date(od.dateOut).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {new Date(od.dateIn).toLocaleDateString()}
                        </TableCell>
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
                        <TableCell>{od.status.hod || "Pending"}</TableCell>
                        <TableCell>{od.status.ceo || "Pending"}</TableCell>
                        <TableCell>{od.status.admin || "Pending"}</TableCell>
                        {["HOD", "Admin", "CEO"].includes(user?.loginType) &&
                          viewMode !== "own" && (
                            <TableCell>
                              {user.loginType === "HOD" &&
                                od.status?.hod === "Pending" && (
                                  <div className="flex gap-2">
                                    <Button
                                      variant="default"
                                      size="sm"
                                      className="bg-blue-600 hover:bg-blue-700 text-white"
                                      onClick={() =>
                                        setShowApprovalModal({
                                          id: od._id,
                                          action: "approve",
                                          stage: "hod"
                                        })
                                      }
                                      disabled={
                                        loading || od.status?.hod !== "Pending"
                                      }
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
                                          stage: "hod"
                                        })
                                      }
                                      disabled={
                                        loading || od.status?.hod !== "Pending"
                                      }
                                      aria-label={`Reject OD for ${od.name}`}
                                    >
                                      Reject
                                    </Button>
                                  </div>
                                )}
                              {user.loginType === "CEO" &&
                                ["Approved", "Submitted"].includes(od.status?.hod) &&
                                od.status?.ceo === "Pending" && (
                                  <div className="flex gap-2">
                                    <Button
                                      variant="default"
                                      size="sm"
                                      className="bg-blue-600 hover:bg-blue-700 text-white"
                                      onClick={() =>
                                        setShowApprovalModal({
                                          id: od._id,
                                          action: "approve",
                                          stage: "ceo"
                                        })
                                      }
                                      disabled={
                                        loading || od.status?.ceo !== "Pending"
                                      }
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
                                          stage: "ceo"
                                        })
                                      }
                                      disabled={
                                        loading || od.status?.ceo !== "Pending"
                                      }
                                      aria-label={`Reject OD for ${od.name}`}
                                    >
                                      Reject
                                    </Button>
                                  </div>
                                )}
                              {user.loginType === "Admin" &&
                                od.status?.ceo === "Approved" &&
                                od.status?.admin === "Pending" && (
                                  <div className="flex gap-2">
                                    <Button
                                      variant="default"
                                      size="sm"
                                      className="bg-blue-600 hover:bg-blue-700 text-white"
                                      onClick={() =>
                                        setShowApprovalModal({
                                          id: od._id,
                                          action: "acknowledge",
                                          stage: "admin"
                                        })
                                      }
                                      disabled={
                                        loading || od.status?.admin !== "Pending"
                                      }
                                      aria-label={`Acknowledge OD for ${od.name}`}
                                    >
                                      Acknowledge
                                    </Button>
                                  </div>
                                )}
                              {(user.loginType === "HOD" &&
                                od.status?.hod !== "Pending") ||
                              (user.loginType === "CEO" &&
                                od.status?.ceo !== "Pending") ||
                              (user.loginType === "Admin" &&
                                od.status?.admin !== "Pending") ? (
                                !unlockStatus[od._id] ? (
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
                                ) : (
                                  <div className="flex gap-2">
                                    <Button
                                      variant="default"
                                      size="sm"
                                      className="bg-blue-600 hover:bg-blue-700 text-white"
                                      onClick={() =>
                                        setShowApprovalModal({
                                          id: od._id,
                                          action: user.loginType === "Admin" ? "acknowledge" : "approve",
                                          stage: user.loginType.toLowerCase()
                                        })
                                      }
                                      disabled={loading}
                                      aria-label={`Grant Approval for ${od.name}`}
                                    >
                                      {user.loginType === "Admin" ? "Acknowledge" : "Grant Approval"}
                                    </Button>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      className="bg-red-600 hover:bg-red-700 text-white"
                                      onClick={() =>
                                        setShowApprovalModal({
                                          id: od._id,
                                          action: "reject",
                                          stage: user.loginType.toLowerCase()
                                        })
                                      }
                                      disabled={loading}
                                      aria-label={`Dismiss Approval for ${od.name}`}
                                    >
                                      Dismiss Approval
                                    </Button>
                                  </div>
                                )
                              ) : null}
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
                      <strong>Date Out:</strong>{" "}
                      {new Date(selectedOD.dateOut).toLocaleDateString()}
                    </p>
                    <p>
                      <strong>Time Out:</strong> {selectedOD.timeOut || "N/A"}
                    </p>
                    <p>
                      <strong>Date In:</strong>{" "}
                      {new Date(selectedOD.dateIn).toLocaleDateString()}
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
                        {selectedOD.statusHistory?.map((history, index) => (
                          <li key={index} className="text-sm">
                            <strong>{history.stage.toUpperCase()}:</strong> {history.status} 
                            {history.reason && ` (Reason: ${history.reason})`} 
                            on {new Date(history.changedAt).toLocaleString()}
                          </li>
                        ))}
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
        {showApprovalModal?.action === "approve" || showApprovalModal?.action === "acknowledge"
          ? showApprovalModal.action === "acknowledge" ? "Acknowledge OD" : "Approve OD"
          : "Reject OD"}
      </DialogTitle>
      <DialogDescription>
        {showApprovalModal?.action === "approve" || showApprovalModal?.action === "acknowledge"
          ? "Optionally provide a reason for approving this OD request."
          : "Please provide a reason for rejecting this OD request."}
      </DialogDescription>
    </DialogHeader>
    <div className="space-y-4 mt-4">
      <div>
        <Label htmlFor="reason">Reason {showApprovalModal?.action === "approve" || showApprovalModal?.action === "acknowledge" ? "(Optional)" : "(Required)"}</Label>
        <Textarea
          id="reason"
          value={approvalReason}
          onChange={(e) => setApprovalReason(e.target.value)}
          placeholder={showApprovalModal?.action === "approve" || showApprovalModal?.action === "acknowledge"
            ? "Enter reason (optional)"
            : "Enter reason (required)"}
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
            const odRecord = odRecords.find((record) => record._id === showApprovalModal?.id);
            const status = showApprovalModal.action === "acknowledge" ? "Acknowledged" : 
                          showApprovalModal.action === "approve" ? "Approved" : "Rejected";
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
          disabled={(showApprovalModal?.action === "reject" || unlockStatus[showApprovalModal?.id]) && !approvalReason.trim()}
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