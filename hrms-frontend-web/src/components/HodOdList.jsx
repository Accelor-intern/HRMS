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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogDescription,
} from "../components/ui/dialog";
import Pagination from "./Pagination";
import api from "../services/api";
import ContentLayout from "./ContentLayout";
import { AuthContext } from "../context/AuthContext";

function HodOdList() {
  const { user } = useContext(AuthContext);
  const initialFilters = useMemo(
    () => ({
      employeeId: user?.employeeId || "",
    }),
    [user?.employeeId]
  );

  const [odRecords, setOdRecords] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [tempFilters, setTempFilters] = useState(initialFilters);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedOD, setSelectedOD] = useState(null);
  const [selectedPunchOD, setSelectedPunchOD] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [total, setTotal] = useState(0);

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
          setError("No OD records found for you.");
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
    [currentPage, itemsPerPage]
  );

  useEffect(() => {
    if (!user || user.loginType !== "HOD") return;
    const hodFilters = {
      ...initialFilters,
      employeeId: user.employeeId,
    };
    setFilters(hodFilters);
    setTempFilters(hodFilters);
    fetchODs(hodFilters);
  }, [user, fetchODs, initialFilters]);

  useEffect(() => {
    fetchODs(filters);
  }, [currentPage, itemsPerPage, fetchODs]);

  const handleChange = (name, value) => {
    setTempFilters({ ...tempFilters, [name]: value });
  };

  const handleFilter = () => {
    if (tempFilters.employeeId && !/^[A-Za-z0-9]+$/.test(tempFilters.employeeId)) {
      setError("Invalid Employee ID format.");
      return;
    }
    setFilters(tempFilters);
    setCurrentPage(1);
    fetchODs(tempFilters);
  };

  return (
    <ContentLayout title="OD List">
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
            className="mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
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
              <Label htmlFor="departmentId">Department</Label>
              <Input
                id="departmentId"
                value={user?.department?.name || "Unknown"}
                readOnly
                className="mt-1 border-gray-300 bg-gray-100 cursor-not-allowed"
                placeholder="Your Department"
              />
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-4">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : odRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-4">
                      No OD records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  odRecords.map((od) => (
                    <TableRow key={od._id} className="hover:bg-gray-50">
                      <TableCell>{od.name || user.name}</TableCell>
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
                    </TableRow>
                  ))
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
                    OD Details for {selectedOD?.name || user.name}
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
                    Punch Details for {selectedPunchOD?.name || user.name}
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
          </div>
        </CardContent>
      </Card>
    </ContentLayout>
  );
}

export default HodOdList;