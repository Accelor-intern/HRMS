import React, { useEffect, useState, useContext, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "../components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog";
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
import { useFileHandler } from "../hooks/useFileHandler";
import Pagination from "./Pagination";
import api from "../services/api";
import ContentLayout from "./ContentLayout";
import { AuthContext } from "../context/AuthContext";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "../components/ui/select";

function HodMyLeaveList() {
  const { user } = useContext(AuthContext);
  const initialFilters = useMemo(
    () => ({
      fromDate: "",
      toDate: "",
      leaveType: "all",
      status: "all",
    }),
    []
  );
  const [leaves, setLeaves] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [tempFilters, setTempFilters] = useState(initialFilters);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [total, setTotal] = useState(0);
  const { handleViewFile, error: fileError } = useFileHandler(selectedLeave?.medicalCertificate?._id);

  const fetchLeaves = useCallback(async () => {
    if (!user?.employeeId || user?.loginType !== "HOD") {
      setError("Unauthorized access or missing employee ID.");
      setLeaves([]);
      setTotal(0);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = {
        employeeId: user.employeeId,
        page: currentPage,
        limit: itemsPerPage,
        ...filters,
      };
      if (params.fromDate && !params.toDate) {
        params.toDate = params.fromDate;
      }
      if (params.fromDate && params.toDate && new Date(params.toDate) < new Date(params.fromDate)) {
        setError("To Date cannot be earlier than From Date.");
        setLoading(false);
        return;
      }
      if (params.leaveType === "all") delete params.leaveType;
      if (params.status === "all") delete params.status;
      const res = await api.get("/leaves", { params });
      if (res.data && Array.isArray(res.data.leaves)) {
        setLeaves(res.data.leaves);
        setTotal(res.data.total ?? res.data.leaves.length);
        if (res.data.leaves.length === 0) {
          setError("No leave records found for you.");
        }
      } else {
        setLeaves([]);
        setTotal(0);
        setError("No valid leave data received from the server.");
      }
    } catch (err) {
      console.error("Error fetching leave list:", err);
      setError("Failed to fetch leaves. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, user?.employeeId, user?.loginType, filters]);

  useEffect(() => {
    fetchLeaves();
  }, [fetchLeaves]);

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

  const getLeaveDuration = (leave) => {
    if (leave.halfDay?.date) return 0.5;
    if (leave.fullDay?.from) {
      const from = new Date(leave.fullDay.from);
      const to = leave.fullDay.to ? new Date(leave.fullDay.to) : from;
      let days = (to - from) / (1000 * 60 * 60 * 24) + 1;
      if (leave.fullDay.fromDuration === "half") days -= 0.5;
      if (leave.fullDay.toDuration === "half") days -= 0.5;
      return days > 0 ? days : 0;
    }
    return 0;
  };

  const formatDurationDisplay = (days) => {
    return `${days} day${days === 1 ? "" : "s"}`;
  };

  const groupedLeaves = useMemo(() => {
    const groups = {};
    leaves.forEach((leave) => {
      const key = leave.compositeLeaveId || leave._id;
      if (!groups[key]) groups[key] = [];
      groups[key].push(leave);
    });
    return Object.values(groups).map((group) => ({
      _id: group[0].compositeLeaveId || group[0]._id,
      composite: group.length > 1,
      leaves: group.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    }));
  }, [leaves]);

  const handleChange = (name, value) => {
    setTempFilters({ ...tempFilters, [name]: value });
  };

  const handleFilter = () => {
    setFilters(tempFilters);
    setCurrentPage(1);
    fetchLeaves();
  };

  return (
    <ContentLayout title="My Leave Requests">
      <div className="bg-white">
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
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5 }}
  className="mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4"
>
  <div className="flex-1 min-w-[200px]">
    <Label htmlFor="hodName" className="text-sm font-medium">
      HoD Name
    </Label>
    <Input
      id="hodName"
      value={user?.name || "Unknown"}
      readOnly
      className="mt-1 border-gray-300 bg-gray-100 cursor-not-allowed rounded-md"
      placeholder="Your Name"
    />
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
        <SelectItem value="CL">CL</SelectItem>
        <SelectItem value="ML">ML</SelectItem>
        <SelectItem value="Maternity">Maternity</SelectItem>
        <SelectItem value="Paternity">Paternity</SelectItem>
        <SelectItem value="Compensatory">Compensatory</SelectItem>
        <SelectItem value="RH">RH</SelectItem>
        <SelectItem value="LWP">LWP</SelectItem>
      </SelectContent>
    </Select>
  </div>
  <div className="flex-1 min-w-[200px]">
    <Label htmlFor="status" className="text-sm font-medium">
      Approval Status
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
        <TableHead className="font-semibold px-4 py-3 text-left">Name</TableHead>
        <TableHead className="font-semibold px-4 py-3 text-left">L.A. Date</TableHead>
        <TableHead className="font-semibold px-4 py-3 text-left">Type</TableHead>
        <TableHead className="font-semibold px-4 py-3 text-left">Time Frame</TableHead>
        <TableHead className="font-semibold px-4 py-3 text-left">Duration</TableHead>
        <TableHead className="font-semibold px-4 py-3 text-left">Status (HOD)</TableHead>
        <TableHead className="font-semibold px-4 py-3 text-left">Status (CEO)</TableHead>
        <TableHead className="font-semibold px-4 py-3 text-left">Status (Admin)</TableHead>
        <TableHead className="font-semibold px-4 py-3 text-left">View Details</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {loading ? (
        <TableRow>
          <TableCell colSpan={9} className="text-center py-4">
            Loading...
          </TableCell>
        </TableRow>
      ) : groupedLeaves.length === 0 ? (
        <TableRow>
          <TableCell colSpan={9} className="text-center py-4">
            No leave records found.
          </TableCell>
        </TableRow>
      ) : (
        groupedLeaves.map((group) => {
          const firstLeave = group.leaves[0];
          const dateRange = group.composite
            ? `${formatISTDate(
                Math.min(...group.leaves.map((l) => new Date(l.createdAt)))
              )} - ${formatISTDate(
                Math.max(...group.leaves.map((l) => new Date(l.createdAt)))
              )}`
            : formatISTDate(firstLeave.createdAt);
          return (
            <TableRow key={group._id} className="hover:bg-gray-50 border-b">
              <TableCell className="px-4 py-3">{user.name}</TableCell>
              <TableCell className="px-4 py-3">{dateRange}</TableCell>
              <TableCell className="px-4 py-3">
                {group.composite
                  ? group.leaves.map((leave) => leave.leaveType).join(", ")
                  : firstLeave.leaveType}
              </TableCell>
              <TableCell className="px-4 py-3">
                {group.composite
                  ? `${formatISTDate(
                      Math.min(...group.leaves.map((l) => new Date(l.fullDay?.from || l.halfDay?.date)))
                    )} - ${formatISTDate(
                      Math.max(...group.leaves.map((l) => new Date(l.fullDay?.to || l.halfDay?.date)))
                    )}`
                  : `${formatISTDate(firstLeave.fullDay?.from || firstLeave.halfDay?.date)} - ${formatISTDate(firstLeave.fullDay?.to)}`}
              </TableCell>
              <TableCell className="px-4 py-3">
                {formatDurationDisplay(getLeaveDuration(firstLeave))}
              </TableCell>
              <TableCell className="px-4 py-3">{firstLeave.status.hod || "Pending"}</TableCell>
              <TableCell className="px-4 py-3">{firstLeave.status.ceo || "Pending"}</TableCell>
              <TableCell className="px-4 py-3">{firstLeave.status.admin || "Pending"}</TableCell>
              <TableCell className="px-4 py-3">
                <Button
                  size="sm"
                  onClick={() => setSelectedLeave(group.composite ? group : firstLeave)}
                  className="bg-blue-600 text-white hover:bg-blue-700 rounded-md"
                >
                  View
                </Button>
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
    onPageSizeChange={setItemsPerPage}
  />
</div>
            <Dialog
              open={!!selectedLeave}
              onOpenChange={() => setSelectedLeave(null)}
            >
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Leave Application Details</DialogTitle>
                  <DialogDescription>
                    {selectedLeave?.composite
                      ? "Details of your composite leave application."
                      : "Details of your selected leave application."}
                  </DialogDescription>
                </DialogHeader>
                {selectedLeave && (
                  <div className="space-y-4">
                    {selectedLeave.composite ? (
                      selectedLeave.leaves.map((leave, index) => (
                        <div
                          key={leave._id}
                          className="border p-4 rounded-lg bg-gray-50 mb-4 last:mb-0"
                        >
                          <h3 className="font-semibold text-lg mb-2">{leave.leaveType}</h3>
                          <div className="grid grid-cols-2 gap-4 text-sm text-gray-700">
                            <p><strong>Duration:</strong> {formatDurationDisplay(getLeaveDuration(leave))}</p>
                            <p><strong>From:</strong> {formatISTDate(leave.fullDay?.from || leave.halfDay?.date)}</p>
                            <p><strong>To:</strong> {formatISTDate(leave.fullDay?.to) || "N/A"}</p>
                            <p><strong>Reason:</strong> {leave.reason || "N/A"}</p>
                            <p><strong>Charge Given To:</strong> {leave.chargeGivenTo?.name || "N/A"}</p>
                            <p><strong>Emergency Contact:</strong> {leave.emergencyContact || "N/A"}</p>
                            {leave.medicalCertificate && (
                              <p>
                                <strong>Medical Certificate:</strong>
                                <Button
                                  size="sm"
                                  onClick={() => handleViewFile(leave.medicalCertificate?._id)}
                                  className="bg-blue-600 text-white hover:bg-blue-700 rounded-md ml-2"
                                  disabled={fileError}
                                >
                                  View {leave.medicalCertificate.filename}
                                </Button>
                              </p>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="border p-4 rounded-lg bg-gray-50">
                        <h3 className="font-semibold text-lg mb-2">{selectedLeave.leaveType}</h3>
                        <div className="grid grid-cols-2 gap-4 text-sm text-gray-700">
                          <p><strong>Duration:</strong> {formatDurationDisplay(getLeaveDuration(selectedLeave))}</p>
                          <p><strong>From:</strong> {formatISTDate(selectedLeave.fullDay?.from || selectedLeave.halfDay?.date)}</p>
                          <p><strong>To:</strong> {formatISTDate(selectedLeave.fullDay?.to) || "N/A"}</p>
                          <p><strong>Reason:</strong> {selectedLeave.reason || "N/A"}</p>
                          <p><strong>Charge Given To:</strong> {selectedLeave.chargeGivenTo?.name || "N/A"}</p>
                          <p><strong>Emergency Contact:</strong> {selectedLeave.emergencyContact || "N/A"}</p>
                          {selectedLeave.medicalCertificate && (
                            <p>
                              <strong>Medical Certificate:</strong>
                              <Button
                                size="sm"
                                onClick={handleViewFile}
                                className="bg-blue-600 text-white hover:bg-blue-700 rounded-md ml-2"
                                disabled={fileError}
                              >
                                View {selectedLeave.medicalCertificate.filename}
                              </Button>
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <DialogFooter className="mt-4">
                  <Button
                    onClick={() => setSelectedLeave(null)}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-md"
                  >
                    Close
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

export default HodMyLeaveList;