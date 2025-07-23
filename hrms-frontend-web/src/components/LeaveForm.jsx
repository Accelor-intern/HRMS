import React, { useState, useContext, useEffect } from "react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "../components/ui/select";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { AuthContext } from "../context/AuthContext";
import api from "../services/api";
import ContentLayout from "./ContentLayout";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "../App.css";

function LeaveForm() {
  const { user } = useContext(AuthContext);

  const istOffset = 5.5 * 60 * 60 * 1000;
  const today = new Date();
  const istTime = new Date(today.getTime() + istOffset);
  istTime.setUTCHours(0, 0, 0, 0);

  const minDate = new Date(istTime);
  minDate.setDate(minDate.getDate() + 1);
  const minDateMedical = new Date(istTime);
  const maxDateBase = new Date(istTime);
  maxDateBase.setDate(istTime.getDate() + 60); // 60-day window

  const [commonFields, setCommonFields] = useState({
    reason: "",
    chargeGivenTo: "",
    emergencyContact: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [compensatoryBalance, setCompensatoryBalance] = useState(0);
  const [compensatoryEntries, setCompensatoryEntries] = useState([]);
  const [canApplyEmergencyLeave, setCanApplyEmergencyLeave] = useState(false);
  const [restrictedHolidays, setRestrictedHolidays] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [leaveBalances, setLeaveBalances] = useState({
    compensatoryAvailable: 0,
    paidLeaves: 0,
    unpaidLeavesTaken: 0,
    medicalLeaves: 0,
    restrictedHolidays: 0,
  });
  const [leaveSegments, setLeaveSegments] = useState([
    {
      leaveType: "",
      isEmergency: false,
      dates: {
        from: "",
        to: "",
        fromDuration: "full",
        fromSession: "",
        toDuration: "full",
        toSession: "",
      },
      compensatoryEntryId: "",
      restrictedHoliday: "",
      projectDetails: "",
      medicalCertificate: null,
    },
  ]);
  const [showLeaveRules, setShowLeaveRules] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);

  useEffect(() => {
    const fetchEmployeeData = async () => {
      try {
        const res = await api.get("/dashboard/employee-info");
        setCompensatoryBalance(res.data.compensatoryLeaves || 0);
        setCompensatoryEntries(res.data.compensatoryAvailable || []);
        setCanApplyEmergencyLeave(res.data.canApplyEmergencyLeave || false);
        setLeaveBalances({
          compensatoryAvailable: res.data.compensatoryLeaves || 0,
          paidLeaves: res.data.paidLeaves || 0,
          unpaidLeavesTaken: res.data.unpaidLeavesTaken || 0,
          medicalLeaves: res.data.medicalLeaves || 0,
          restrictedHolidays: res.data.restrictedHolidays || 0,
        });
      } catch (err) {
        toast.error("Failed to fetch employee data");
      }
    };

    const fetchRestrictedHolidays = async () => {
      try {
        const res = await api.get("/holidays/restricted");
        setRestrictedHolidays(res.data);
        setLeaveSegments((prev) =>
          prev.map((segment) => ({
            ...segment,
            restrictedHoliday: res.data.length > 0 ? res.data[0].value : "",
          }))
        );
      } catch (err) {
        toast.error("Failed to fetch restricted holidays");
      }
    };

    const fetchDepartmentEmployees = async () => {
      try {
        const params = {};
        if (leaveSegments[0].dates.from) {
          params.startDate = leaveSegments[0].dates.from;
          params.endDate = leaveSegments[0].dates.to || leaveSegments[0].dates.from;
          params.fromDuration = leaveSegments[0].dates.fromDuration;
          params.fromSession = leaveSegments[0].dates.fromDuration === "half" ? leaveSegments[0].dates.fromSession : undefined;
          params.toDuration = leaveSegments[0].dates.to ? leaveSegments[0].dates.toDuration : undefined;
          params.toSession = leaveSegments[0].dates.to && leaveSegments[0].dates.toDuration === "half" ? leaveSegments[0].dates.toSession : undefined;
        }
        const res = await api.get("/employees/department", { params });
        setEmployees(res.data);
      } catch (err) {
        toast.error("Failed to fetch department employees");
      }
    };

    fetchEmployeeData();
    fetchRestrictedHolidays();
    fetchDepartmentEmployees();
  }, [leaveSegments]);

const handleSegmentChange = (index, e) => {
  const { name, value } = e.target;
  setLeaveSegments((prev) => {
    const newSegments = [...prev];
    if (name === `fromDuration-${index}`) {
      newSegments[index] = {
        ...newSegments[index],
        dates: {
          ...newSegments[index].dates,
          fromDuration: value,
          fromSession: value === "half" ? newSegments[index].dates.fromSession || "forenoon" : "",
        },
      };
    } else if (name === `fromSession-${index}`) {
      newSegments[index] = {
        ...newSegments[index],
        dates: {
          ...newSegments[index].dates,
          fromSession: value,
        },
      };
    } else if (name === `toDuration-${index}`) {
      newSegments[index] = {
        ...newSegments[index],
        dates: {
          ...newSegments[index].dates,
          toDuration: value,
          toSession: value === "half" ? "forenoon" : "",
        },
      };
    } else if (name === `toSession-${index}`) {
      newSegments[index] = {
        ...newSegments[index],
        dates: { ...newSegments[index].dates, toSession: value },
      };
    } else if (name === `to-${index}`) {
      const fromDate = new Date(newSegments[index].dates.from);
      const toDate = new Date(value);
      const daysDiff = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24));
      const isLastDay = daysDiff <= 3 && newSegments[index].dates.fromDuration === "half" && newSegments[index].dates.fromSession === "afternoon";

      newSegments[index] = {
        ...newSegments[index],
        dates: {
          ...newSegments[index].dates,
          to: value,
          toDuration: isLastDay ? "half" : newSegments[index].dates.toDuration,
          toSession: isLastDay ? "forenoon" : newSegments[index].dates.toSession,
        },
      };
    } else if (name.includes("dates")) {
      const field = name.split(".")[1];
      newSegments[index] = {
        ...newSegments[index],
        dates: {
          ...newSegments[index].dates,
          [field]: value,
          ...(field === "from" && { to: value }),
          ...(field === "from" && newSegments[index].leaveType === "Restricted Holidays" && { to: value }),
        },
      };
    } else if (name === "medicalCertificate") {
      const file = e.target.files[0];
      if (file && file.size > 5 * 1024 * 1024) {
        toast.error("File size exceeds 5MB limit");
        e.target.value = null;
        return prev;
      }
      if (file && !["image/jpeg", "image/jpg", "application/pdf"].includes(file.type)) {
        toast.error("Only JPEG/JPG or PDF files are allowed");
        e.target.value = null;
        return prev;
      }
      newSegments[index] = { ...newSegments[index], medicalCertificate: file };
    } else if (name === "isEmergency") {
      if (index === 0) {
        newSegments[index] = {
          ...newSegments[index],
          isEmergency: value === "true",
          dates: {
            ...newSegments[index].dates,
            from: value === "true" ? istTime.toISOString().split("T")[0] : "",
            to: value === "true" ? istTime.toISOString().split("T")[0] : "",
            fromDuration: "full",
            fromSession: "",
            toDuration: "full",
            toSession: "",
          },
          leaveType: value === "true" ? "Emergency" : "",
        };
      }
    } else {
      newSegments[index] = { ...newSegments[index], [name]: value };
    }
    return newSegments;
  });
  setValidationErrors([]);
};

  const handleCommonFieldChange = (e) => {
    const { name, value } = e.target;
    setCommonFields((prev) => ({ ...prev, [name]: value }));
    setValidationErrors([]);
  };

  const handleCompensatoryEntryChange = (index, value) => {
    setLeaveSegments((prev) => {
      const newSegments = [...prev];
      newSegments[index] = { ...newSegments[index], compensatoryEntryId: value };
      return newSegments;
    });
    setValidationErrors([]);
  };

  const handleChargeGivenToChange = (value) => {
    setCommonFields((prev) => ({ ...prev, chargeGivenTo: value }));
    setValidationErrors([]);
  };

  const handleRestrictedHolidayChange = (index, value) => {
    setLeaveSegments((prev) => {
      const newSegments = [...prev];
      newSegments[index] = { ...newSegments[index], restrictedHoliday: value };
      return newSegments;
    });
    setValidationErrors([]);
  };

  const addLeaveSegment = () => {
    if (getTotalLeaveDays() >= 3) {
      toast.error("Maximum of 3 leave days reached. Contact your HOD for additional leave approval.");
      return;
    }
    setLeaveSegments((prev) => {
      const lastSegment = prev[prev.length - 1];
      let nextFromDate = "";
      if (lastSegment?.dates?.to) {
        let toDate = new Date(lastSegment.dates.to);
        do {
          toDate.setDate(toDate.getDate() + 1);
        } while (isHoliday(toDate) && !isRestrictedHoliday(toDate));
        nextFromDate = toDate.toISOString().split("T")[0];
      }
      return [
        ...prev,
        {
          leaveType: "",
          isEmergency: false,
          dates: {
            from: nextFromDate,
            to: nextFromDate,
            fromDuration: "full",
            fromSession: "",
            toDuration: "full",
            toSession: "",
          },
          compensatoryEntryId: "",
          restrictedHoliday: restrictedHolidays.length > 0 ? restrictedHolidays[0].value : "",
          projectDetails: "",
          medicalCertificate: null,
        },
      ];
    });
  };

  const removeLeaveSegment = (index) => {
    setLeaveSegments((prev) => prev.filter((_, i) => i !== index));
    setValidationErrors([]);
  };

const calculateLeaveDays = (segment) => {
  if (!segment.dates.from) return 0;
  const fromDate = new Date(segment.dates.from);
  const toDate = segment.dates.to ? new Date(segment.dates.to) : fromDate;
  if (toDate < fromDate) return 0;

  let days = 0;
  let current = new Date(fromDate);
  while (current <= toDate) {
    if (!isHoliday(current) || isRestrictedHoliday(current)) {
      days += 1;
    }
    current.setDate(current.getDate() + 1);
  }
  if (segment.dates.fromDuration === "half") days -= 0.5;
  if (segment.dates.toDuration === "half" && segment.dates.to) days -= 0.5;
  // Ensure 0.5 days for single-day half-day
  if (fromDate.toDateString() === toDate.toDateString() && segment.dates.fromDuration === "half") {
    return 0.5;
  }
  return days > 0 ? days : 0;
};

  const restrictedHolidayDates = [
    new Date(2025, 7, 9),
    new Date(2025, 7, 16),
    new Date(2025, 9, 9),
    new Date(2025, 11, 25),
  ];

  const isHoliday = (date) => {
    const holidayList = [
      { month: 0, day: 26 },
      { month: 2, day: 14 },
      { month: 7, day: 15 },
      { month: 9, day: 2 },
      { month: 9, day: 21 },
      { month: 9, day: 22 },
      { month: 10, day: 5 },
    ];
    return (
      holidayList.some((h) => date.getDate() === h.day && date.getMonth() === h.month) ||
      date.getDay() === 0
    );
  };

  const isRestrictedHoliday = (date) => {
    return restrictedHolidayDates.some((rh) => rh.toDateString() === date.toDateString());
  };

  const validateSegment = (segment, index) => {
    if (!segment.leaveType) return "Leave Type is required";
    if (!commonFields.reason) return "Reason is required";
    if (!commonFields.chargeGivenTo) return "Charge Given To is required";
    if (!commonFields.emergencyContact) return "Emergency Contact is required";
    if (!segment.dates.from) return "From Date is required";
    if (segment.dates.to && new Date(segment.dates.to) < new Date(segment.dates.from))
      return "To Date cannot be earlier than From Date";
    if (!["full", "half"].includes(segment.dates.fromDuration))
      return "From Duration must be 'full' or 'half'";
    if (segment.dates.fromDuration === "half" && !["forenoon", "afternoon"].includes(segment.dates.fromSession))
      return "From Session must be 'forenoon' or 'afternoon'";
    if (segment.dates.to && !["full", "half"].includes(segment.dates.toDuration))
      return "To Duration must be 'full' or 'half'";
    if (segment.dates.to && segment.dates.toDuration === "half" && segment.dates.toSession !== "forenoon")
      return "To Session must be 'forenoon' for Half Day To Duration";
    if (getTotalLeaveDays() > 3)
      return "Total leave days cannot exceed 3. Contact your HOD for additional leave approval.";
    if (segment.leaveType !== "Medical" && !segment.isEmergency) {
      const fromDate = new Date(segment.dates.from);
      if (fromDate <= istTime) return "From Date must be after today for this leave type";
    }
    if (segment.leaveType === "Medical" && segment.dates.fromDuration === "full") {
      const days = calculateLeaveDays(segment);
      if (days !== 3 && days !== 4 && days !== 7) return "Medical leave must be exactly 3, 4, or 7 days";
    }
    if (segment.isEmergency) {
      if (!canApplyEmergencyLeave) return "You are not authorized to apply for Emergency Leave";
      const leaveDays = calculateLeaveDays(segment);
      if (leaveDays > 1) return "Emergency leave must be half day or one full day";
      if (
        segment.dates.from !== istTime.toISOString().split("T")[0] ||
        (segment.dates.to && segment.dates.to !== istTime.toISOString().split("T")[0])
      ) {
        return "Emergency leave must be for the current date only";
      }
    }
    if (segment.leaveType === "Compensatory") {
      if (!segment.compensatoryEntryId) return "Compensatory leave entry is required";
      const entry = compensatoryEntries.find((e) => e._id === segment.compensatoryEntryId);
      if (!entry || entry.status !== "Available") return "Invalid or unavailable compensatory leave entry";
      const leaveDays = calculateLeaveDays(segment);
      const hoursNeeded = leaveDays === 0.5 ? 4 : 8;
      if (entry.hours !== hoursNeeded)
        return `Selected entry (${entry.hours} hours) does not match leave duration (${leaveDays === 0.5 ? "Half Day (4 hours)" : "Full Day (8 hours)"})`;
    }
    if (segment.leaveType === "Restricted Holidays") {
      if (!segment.restrictedHoliday) return "Please select a restricted holiday";
      const fromDate = new Date(segment.dates.from);
      const isValidRHDate = restrictedHolidayDates.some(
        (rh) => rh.toDateString() === fromDate.toDateString()
      );
      if (!isValidRHDate) return "Please select a valid Restricted Holiday date";
    }
    if (segment.leaveType === "Casual" && user?.employeeType === "Confirmed") {
      const leaveDays = calculateLeaveDays(segment);
      if (leaveDays > 3) return `Segment ${index + 1}: Only 3 CL can be availed in a row`;
    }
    if (segment.leaveType === "Medical" && (!user || user.employeeType !== "Confirmed"))
      return "Medical leave is only available for Confirmed employees";
    if (segment.leaveType === "Medical" && segment.dates.fromDuration === "half")
      return "Medical leave cannot be applied as a half-day leave";
    if (segment.leaveType === "Maternity" && (!user || user.gender?.trim().toLowerCase() !== "female"))
      return "Maternity leave is only available for female employees";
    if (segment.leaveType === "Maternity" && (!user || user.employeeType !== "Confirmed"))
      return "Maternity leave is only available for Confirmed employees";
    if (segment.leaveType === "Maternity" && segment.dates.fromDuration === "full") {
      const days = calculateLeaveDays(segment);
      if (days !== 90) return "Maternity leave must be exactly 90 days";
    }
    if (segment.leaveType === "Paternity" && (!user || user.gender?.trim().toLowerCase() !== "male"))
      return "Paternity leave is only available for male employees";
    if (segment.leaveType === "Paternity" && (!user || user.employeeType !== "Confirmed"))
      return "Paternity leave is only available for Confirmed employees";
    if (segment.leaveType === "Paternity" && segment.dates.fromDuration === "full") {
      const days = calculateLeaveDays(segment);
      if (days !== 7) return "Paternity leave must be exactly 7 days";
    }
    return null;
  };

  const getTotalLeaveDays = () => {
    return leaveSegments.reduce((sum, segment) => sum + calculateLeaveDays(segment), 0);
  };

  const validateFormData = (segments, commonFields) => {
    const errors = [];
    if (!commonFields.reason) errors.push("Reason is required");
    if (!commonFields.chargeGivenTo) errors.push("Charge Given To is required");
    if (!commonFields.emergencyContact) errors.push("Emergency Contact is required");

    segments.forEach((segment, index) => {
      if (!segment.leaveType) errors.push(`Segment ${index + 1}: Leave Type is required`);
      if (!segment.dates.from) errors.push(`Segment ${index + 1}: From Date is required`);
      if (segment.dates.fromDuration === "half" && !segment.dates.fromSession)
        errors.push(`Segment ${index + 1}: From Session is required for half-day`);
      if (segment.dates.to && segment.dates.toDuration === "half" && !segment.dates.toSession)
        errors.push(`Segment ${index + 1}: To Session is required for half-day`);
      if (segment.leaveType === "Compensatory" && !segment.compensatoryEntryId)
        errors.push(`Segment ${index + 1}: Compensatory Entry is required`);
      if (segment.leaveType === "Restricted Holidays" && !segment.restrictedHoliday)
        errors.push(`Segment ${index + 1}: Restricted Holiday is required`);
    });

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setValidationErrors([]);

    const segmentErrors = leaveSegments.map((segment, index) => validateSegment(segment, index)).filter((error) => error);
    const formDataErrors = validateFormData(leaveSegments, commonFields);
    const allErrors = [...segmentErrors, ...formDataErrors];

    if (allErrors.length > 0) {
      setValidationErrors(allErrors);
      toast.error(allErrors[0]);
      setSubmitting(false);
      return;
    }

    const formData = new FormData();
    formData.append("reason", commonFields.reason || "");
    formData.append("chargeGivenTo", commonFields.chargeGivenTo || "");
    formData.append("emergencyContact", commonFields.emergencyContact || "");

    leaveSegments.forEach((segment, index) => {
      formData.append(`segments[${index}][leaveType]`, segment.leaveType || "");
      formData.append(`segments[${index}][isEmergency]`, segment.isEmergency ? "true" : "false");
      formData.append(`segments[${index}][fullDay][from]`, segment.dates.from || "");
      formData.append(`segments[${index}][fullDay][fromDuration]`, segment.dates.fromDuration || "full");
      formData.append(`segments[${index}][fullDay][fromSession]`, segment.dates.fromSession || "");
      formData.append(`segments[${index}][fullDay][to]`, segment.dates.to || "");
      formData.append(`segments[${index}][fullDay][toDuration]`, segment.dates.to ? (segment.dates.toDuration || "full") : "");
      formData.append(`segments[${index}][fullDay][toSession]`, segment.dates.to ? (segment.dates.toSession || "") : "");
      formData.append(`segments[${index}][compensatoryEntryId]`, segment.compensatoryEntryId || "");
      formData.append(`segments[${index}][restrictedHoliday]`, segment.restrictedHoliday || "");
      formData.append(`segments[${index}][projectDetails]`, segment.projectDetails || "");
      if (segment.medicalCertificate) {
        formData.append(`segments[${index}][medicalCertificate]`, segment.medicalCertificate);
      }
    });

    try {
      const response = await api.post("/leaves", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Leave request submitted successfully");
      setLeaveSegments([
        {
          leaveType: "",
          isEmergency: false,
          dates: {
            from: "",
            to: "",
            fromDuration: "full",
            fromSession: "",
            toDuration: "full",
            toSession: "",
          },
          compensatoryEntryId: "",
          restrictedHoliday: restrictedHolidays.length > 0 ? restrictedHolidays[0].value : "",
          projectDetails: "",
          medicalCertificate: null,
        },
      ]);
      setCommonFields({ reason: "", chargeGivenTo: "", emergencyContact: "" });
    } catch (error) {
      const errorMessage = error.response?.data?.message || "Failed to submit leave request";
      const segmentErrors = error.response?.data?.errors || [];
      if (segmentErrors.length > 0) {
        const detailedErrors = segmentErrors.map((err) => `Segment ${err.segmentIndex + 1}: ${err.message}`);
        setValidationErrors(detailedErrors);
        toast.error(detailedErrors.join("; "));
      } else {
        setValidationErrors([errorMessage]);
        toast.error(errorMessage);
      }
      console.error("Submission error:", error.response?.data);
    } finally {
      setSubmitting(false);
    }
  };

  const getMinDateForSegment = (index) => {
    if (index === 0) {
      return new Date(leaveSegments[index].leaveType === "Medical" ? minDateMedical : minDate);
    }
    const lastSegment = leaveSegments[index - 1];
    if (lastSegment?.dates?.to) {
      let minDateSeg = new Date(lastSegment.dates.to);
      do {
        minDateSeg.setDate(minDateSeg.getDate() + 1);
      } while (isHoliday(minDateSeg) && !isRestrictedHoliday(minDateSeg));
      return minDateSeg;
    }
    return new Date(minDate);
  };

  const getMaxDateForToDate = (index) => {
  const segment = leaveSegments[index];
  if (!segment.dates.from) return maxDateBase;
  const fromDate = new Date(segment.dates.from);
  const totalLeaveDays = getTotalLeaveDays();
  const daysUsedInSegment = calculateLeaveDays(segment);
  const remainingDays = 3 - (totalLeaveDays - daysUsedInSegment);

  let maxLimit = new Date(fromDate);
  let daysCount = segment.dates.fromDuration === "half" ? 0.5 : 1; // Start with half or full day

  while (daysCount < remainingDays) {
    maxLimit.setDate(maxLimit.getDate() + 1);
    if (!isHoliday(maxLimit) || isRestrictedHoliday(maxLimit)) {
      daysCount += 1;
    }
  }

  // Add one more day if remaining includes a half-day slot
  if (remainingDays > daysCount && daysCount < 3) {
    maxLimit.setDate(maxLimit.getDate() + 1);
  }

  return maxLimit > maxDateBase ? maxDateBase : maxLimit;
};

  const tileClassName = ({ date, view }) => {
    if (view === "month") {
      const classes = [];
      if (isHoliday(date)) classes.push("bg-red-200");
      if (date.getDay() === 0) classes.push("sun");
      if (isRestrictedHoliday(date)) classes.push("bg-purple-200");
      return classes.join(" ");
    }
    return "";
  };

  const tileDisabled = ({ date, view }) => {
    if (view === "month") {
      const minDateForSegment = getMinDateForSegment(0);
      const maxDateForSegment = maxDateBase;
      return date < minDateForSegment || date > maxDateForSegment;
    }
    return false;
  };

  const formatDate = (isoDate) => {
    if (!isoDate) return "Not selected";
    const [year, month, day] = isoDate.split("-");
    return `${day}-${month}-${year}`;
  };

  const getTotalCasualLeaveDays = () => {
    return leaveSegments
      .filter((segment) => segment.leaveType === "Casual")
      .reduce((sum, segment) => sum + calculateLeaveDays(segment), 0);
  };

  const getLeaveDuration = () => {
    let minDate = null;
    let maxDate = null;
    let totalDays = 0;

    leaveSegments.forEach((segment) => {
      if (segment.dates.from) {
        const fromDate = new Date(segment.dates.from);
        if (!minDate || fromDate < minDate) minDate = fromDate;
        if (segment.dates.to) {
          const toDate = new Date(segment.dates.to);
          if (!maxDate || toDate > maxDate) maxDate = toDate;
        } else if (!maxDate || fromDate > maxDate) {
          maxDate = fromDate;
        }
        totalDays += calculateLeaveDays(segment);
      }
    });

    return {
      from: minDate ? formatDate(minDate.toISOString().split("T")[0]) : "Not selected",
      to: maxDate ? formatDate(maxDate.toISOString().split("T")[0]) : "Not selected",
      totalDays,
    };
  };

  const isLWPTaken = () => {
    return leaveSegments.some((segment) => segment.leaveType === "Leave Without Pay(LWP)");
  };

  const getLeaveTypes = (index) => {
    const isConfirmed = user?.employeeType === "Confirmed";
    const gender = user?.gender?.trim().toLowerCase();
    const baseTypes = [
      { value: "Casual", label: "Casual" },
      { value: "Compensatory", label: "Compensatory" },
      { value: "Leave Without Pay(LWP)", label: "Leave Without Pay (LWP)" },
    ];
    if (isConfirmed) {
      if (gender === "female") {
        baseTypes.push(
          { value: "Medical", label: "Medical" },
          { value: "Maternity", label: "Maternity" },
          { value: "Restricted Holidays", label: "Restricted Holidays" }
        );
      } else if (gender === "male") {
        baseTypes.push(
          { value: "Medical", label: "Medical" },
          { value: "Paternity", label: "Paternity" },
          { value: "Restricted Holidays", label: "Restricted Holidays" }
        );
      } else {
        baseTypes.push(
          { value: "Medical", label: "Medical" },
          { value: "Restricted Holidays", label: "Restricted Holidays" }
        );
      }
    }
    return baseTypes.map((type) => ({
      ...type,
      disabled:
        (index > 0 && leaveSegments[0].leaveType === "Casual" && type.value === "Casual") ||
        (type.value === "Leave Without Pay(LWP)" && isLWPTaken() && leaveSegments[index].leaveType !== "Leave Without Pay(LWP)"),
    }));
  };

  const getLeaveBalanceDisplay = () => {
    const isConfirmed = user?.employeeType === "Confirmed";
    const clTotal = isConfirmed ? 12 : 1;
    const balanceCL = leaveBalances.paidLeaves;
    const availedCL = clTotal - balanceCL;
    const balances = [
      {
        type: "Casual Leave (CL)",
        availed: availedCL,
        balance: balanceCL,
        total: clTotal,
      },
      {
        type: "Compensatory",
        availed: leaveBalances.compensatoryAvailable / 8,
        balance: leaveBalances.compensatoryAvailable / 8,
        total: leaveBalances.compensatoryAvailable / 8,
      },
      {
        type: "Leave Without Pay (LWP)",
        availed: leaveBalances.unpaidLeavesTaken,
        balance: "N/A",
        total: "N/A",
      },
    ];
    if (isConfirmed) {
      balances.push(
        {
          type: "Medical Leave",
          balance: leaveBalances.medicalLeaves,
          availed: 7 - leaveBalances.medicalLeaves,
          total: 7,
        },
        {
          type: "Restricted Holidays",
          balance: leaveBalances.restrictedHolidays,
          availed: 1 - leaveBalances.restrictedHolidays,
          total: 1,
        }
      );
    }
    return balances;
  };

 const isAddLeaveDisabled = () => {
  const lastSegment = leaveSegments[leaveSegments.length - 1];
  return (
    (getTotalLeaveDays() >= 3 && !lastSegment.leaveType === "Medical") ||
    (lastSegment.dates.fromDuration === "half" && lastSegment.dates.fromSession === "forenoon") ||
    (lastSegment.dates.toDuration === "half" && lastSegment.dates.toSession === "forenoon")
  );
};

  return (
    <ContentLayout title="Apply for Leave">
      <div className="flex flex-col gap-6 px-4 sm:px-6 lg:px-8">
        {validationErrors.length > 0 && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            <ul className="list-disc pl-5">
              {validationErrors.map((error, idx) => (
                <li key={idx}>{error}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="w-full lg:w-1/4 mb-6">
            <h3 className="text-lg font-semibold mb-4 text-red-700">Leave Balances</h3>
            <div className="grid grid-cols-1 gap-4">
              {getLeaveBalanceDisplay().map((balance, index) => (
                <div
                  key={index}
                  className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-pointer"
                >
                  <h5 className="text-sm font-semibold text-blue-800 mb-2">{balance.type}</h5>
                  <div className="text-sm text-gray-700 space-y-1">
                    <span>Availed: {balance.availed}</span>
                    <br />
                    <span>Balance: {balance.type === "Leave Without Pay (LWP)" ? "N/A" : balance.balance}</span>
                    <br />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="w-full lg:w-2/4">
            <Card className="shadow-lg border">
              <CardContent className="p-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                  {leaveSegments.map((segment, index) => (
                    <div key={index} className="border-b pb-6 mb-6">
                      {index === 0 && (
                        <h3 className="text-2xl font-semibold mb-4 text-green-700 text-center">
                          Leave Form
                        </h3>
                      )}
                      <div className="grid grid-cols-1 gap-6">
                        {canApplyEmergencyLeave && index === 0 && (
                          <div>
                            <Label className="text-blue-800">Leave Category</Label>
                            <Select
                              onValueChange={(value) =>
                                handleSegmentChange(index, { target: { name: "isEmergency", value } })
                              }
                              value={segment.isEmergency.toString()}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select leave category" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="true">Emergency Leave</SelectItem>
                                <SelectItem value="false">Regular Leave</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        <div>
                          <Label htmlFor={`leaveType-${index}`} className="text-blue-800">Leave Type</Label>
                          <Select
                            onValueChange={(value) =>
                              handleSegmentChange(index, { target: { name: "leaveType", value } })
                            }
                            value={segment.leaveType}
                            disabled={segment.isEmergency}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select leave type" />
                            </SelectTrigger>
                            <SelectContent>
                              {getLeaveTypes(index).map((type) => (
                                <SelectItem key={type.value} value={type.value} disabled={type.disabled}>
                                  {type.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                    <div>
  <Label htmlFor={`dates.from-${index}`} className="text-blue-800">From Date</Label>
  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
    <Input
      id={`dates.from-${index}`}
      name="dates.from"
      type="date"
      value={segment.dates.from}
      onChange={(e) => handleSegmentChange(index, e)}
      min={
        segment.leaveType === "Medical"
          ? minDateMedical.toISOString().split("T")[0]
          : minDate.toISOString().split("T")[0]
      }
      max={maxDateBase.toISOString().split("T")[0]}
      disabled={segment.isEmergency || index > 0}
      className="w-full sm:w-40"
    />
    {!segment.isEmergency && (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-4">
          <label className="flex items-center text-sm">
            <input
              type="radio"
              name={`fromDuration-${index}`}
              value="full"
              checked={segment.dates.fromDuration === "full"}
              onChange={(e) => handleSegmentChange(index, e)}
              className="mr-2"
            />
            Full Day
          </label>
          <label className="flex items-center text-sm">
            <input
              type="radio"
              name={`fromDuration-${index}`}
              value="half"
              checked={segment.dates.fromDuration === "half"}
              onChange={(e) => handleSegmentChange(index, e)}
              className="mr-2"
            />
            Half Day
          </label>
        </div>
        {segment.dates.fromDuration === "half" && (
          <div className="mt-2">
            <select
              name={`fromSession-${index}`}
              value={segment.dates.fromSession}
              onChange={(e) => handleSegmentChange(index, e)}
              className="border rounded px-3 py-2 w-full sm:w-40 text-sm"
            >
              <option value="forenoon">Forenoon</option>
              <option value="afternoon">Afternoon</option>
            </select>
          </div>
        )}
      </div>
    )}
  </div>
</div>

{!segment.isEmergency && (
  <div>
    <Label htmlFor={`dates.to-${index}`} className="text-blue-800">To Date</Label>
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
      <Input
        id={`dates.to-${index}`}
        name="dates.to"
        type="date"
        value={segment.dates.to}
        onChange={(e) => handleSegmentChange(index, e)}
        min={segment.dates.from || minDate.toISOString().split("T")[0]}
        max={getMaxDateForToDate(index).toISOString().split("T")[0]}
        className="w-full sm:w-40"
      />
      {segment.dates.from !== segment.dates.to && segment.dates.to && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-4">
            <label className="flex items-center text-sm">
              <input
                type="radio"
                name={`toDuration-${index}`}
                value="full"
                checked={segment.dates.toDuration === "full"}
                onChange={(e) => handleSegmentChange(index, e)}
                className="mr-2"
              />
              Full Day
            </label>
            <label className="flex items-center text-sm">
              <input
                type="radio"
                name={`toDuration-${index}`}
                value="half"
                checked={segment.dates.toDuration === "half"}
                onChange={(e) => handleSegmentChange(index, e)}
                className="mr-2"
              />
              Half Day
            </label>
          </div>
          {segment.dates.toDuration === "half" && (
            <div className="mt-2">
              <select
                name={`toSession-${index}`}
                value={segment.dates.toSession}
                onChange={(e) => handleSegmentChange(index, e)}
                className="border rounded px-3 py-2 w-full sm:w-40 text-sm"
              >
                <option value="forenoon">Forenoon</option>
                <option value="afternoon">Afternoon</option>
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  </div>
)}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <div>
                            <Label className="text-blue-800">Leave Days</Label>
                            <p className="mt-1 text-sm text-green-700">{calculateLeaveDays(segment)} days</p>
                            {index === leaveSegments.length - 1 && (
                              <>
                                {getTotalCasualLeaveDays() > 3 && segment.leaveType === "Casual" && (
                                  <p className="mt-1 text-sm text-red-600">
                                    Error: Max 3 consecutive Casual Leaves (CL) can be availed.
                                  </p>
                                )}
                                {segment.leaveType === "Restricted Holidays" &&
                                  segment.dates.from &&
                                  !restrictedHolidayDates.some((rh) => rh.toDateString() === new Date(segment.dates.from).toDateString()) && (
                                    <p className="mt-1 text-sm text-red-600">
                                      Error: Please select a valid Restricted Holiday date.
                                    </p>
                                  )}
                                {getTotalLeaveDays() >= 3 && (
                                  <p className="mt-1 text-sm text-red-600">
                                    Note: Maximum of 3 leave days reached. Contact your HOD for additional leave approval.
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                          {index === leaveSegments.length - 1 && (
                            <Button
                              type="button"
                              onClick={addLeaveSegment}
                              className="bg-green-600 hover:bg-green-700 text-white h-fit text-sm"
                              disabled={isAddLeaveDisabled()}
                            >
                              Add Leave
                            </Button>
                          )}
                        </div>
                        {segment.leaveType === "Compensatory" && (
                          <>
                            <div>
                              <Label htmlFor={`compensatoryBalance-${index}`} className="text-blue-800">
                                Compensatory Leave Balance
                              </Label>
                              <p className="mt-1 text-sm">{compensatoryBalance} hours</p>
                            </div>
                            <div>
                              <Label htmlFor={`compensatoryEntryId-${index}`} className="text-blue-800">
                                Compensatory Leave Entry
                              </Label>
                              <Select
                                onValueChange={(value) => handleCompensatoryEntryChange(index, value)}
                                value={segment.compensatoryEntryId}
                                disabled={compensatoryEntries.length === 0}
                              >
                                <SelectTrigger>
                                  <SelectValue
                                    placeholder={
                                      compensatoryEntries.length === 0
                                        ? "No available entries"
                                        : "Select compensatory entry"
                                    }
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  {compensatoryEntries
                                    .filter((entry) => entry.status === "Available")
                                    .map((entry) => (
                                      <SelectItem key={entry._id} value={entry._id}>
                                        {new Date(entry.date).toLocaleDateString()} - {entry.hours} hours
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label htmlFor={`projectDetails-${index}`} className="text-blue-800">
                                Project Details
                              </Label>
                              <Textarea
                                name="projectDetails"
                                value={segment.projectDetails}
                                onChange={(e) => handleSegmentChange(index, e)}
                                rows={2}
                              />
                            </div>
                          </>
                        )}
                        {segment.leaveType === "Restricted Holidays" && (
                          <div>
                            <Label htmlFor={`restrictedHoliday-${index}`} className="text-blue-800">
                              Restricted Holiday
                            </Label>
                            <Select
                              onValueChange={(value) => handleRestrictedHolidayChange(index, value)}
                              value={segment.restrictedHoliday}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select holiday" />
                              </SelectTrigger>
                              <SelectContent>
                                {restrictedHolidayDates.map((holiday, idx) => (
                                  <SelectItem key={idx} value={holiday.toISOString().split("T")[0]}>
                                    {holiday.toLocaleDateString()}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        {segment.leaveType === "Medical" && segment.dates.fromDuration === "full" && (
                          <div>
                            <Label htmlFor={`medicalCertificate-${index}`} className="text-blue-800">
                              Medical Certificate (JPEG/PDF, max 5MB, optional)
                            </Label>
                            <Input
                              id={`medicalCertificate-${index}`}
                              name="medicalCertificate"
                              type="file"
                              accept="image/jpeg,image/jpg,application/pdf"
                              onChange={(e) => handleSegmentChange(index, e)}
                            />
                            <p className="text-sm text-yellow-600 mt-2">
                              Note: If not uploaded now, you must submit a medical certificate within 24 hours of rejoining.
                            </p>
                          </div>
                        )}
                        {leaveSegments.length > 1 && (
                          <div>
                            <Button
                              type="button"
                              onClick={() => removeLeaveSegment(index)}
                              className="bg-red-600 hover:bg-red-700 text-white text-sm"
                            >
                              Remove
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  <div>
                    <Label htmlFor="reason" className="text-blue-800">
                      Reason <span className="text-red-600">*</span>
                    </Label>
                    <Textarea
                      id="reason"
                      name="reason"
                      value={commonFields.reason}
                      onChange={handleCommonFieldChange}
                      rows={3}
                      placeholder="Enter reason..."
                      className="w-full"
                    />
                  </div>
                  <div>
                    <Label htmlFor="chargeGivenTo" className="text-blue-800">Charge Given To</Label>
                    <Select
                      onValueChange={handleChargeGivenToChange}
                      value={commonFields.chargeGivenTo}
                      disabled={employees.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={employees.length === 0 ? "No available employees" : "Select employee"}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((employee) => (
                          <SelectItem key={employee._id} value={employee._id}>
                            {employee.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="emergencyContact" className="text-blue-800">
                      Contact Address & Mobile Number During Leave
                    </Label>
                    <Input
                      id="emergencyContact"
                      name="emergencyContact"
                      type="text"
                      value={commonFields.emergencyContact}
                      onChange={handleCommonFieldChange}
                      placeholder="Enter Contact Address & Mobile Number"
                      className="w-full"
                    />
                  </div>
                  <div className="flex justify-end mt-4">
                    <Button
                      type="submit"
                      disabled={submitting}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-sm"
                    >
                      {submitting ? "Submitting..." : "Submit All Leaves"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
          <div className="w-full lg:w-1/4 bg-gray-50 p-4 rounded-lg shadow">
            <h3 className="text-lg font-semibold mb-4 text-red-700">Leave Rules & Calendar</h3>
            <Button
              onClick={() => setShowLeaveRules(!showLeaveRules)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 mb-4"
            >
              {showLeaveRules ? "Collapse Leave Rules" : "Refer Leave Rules"}
            </Button>
            {showLeaveRules && (
              <div className="max-h-96 overflow-y-auto pr-2 mb-6">
                <ul className="text-sm space-y-2 text-gray-700">
                  <li>1. Plan leaves in advance for more than two consecutive days.</li>
                  <li>2. Max 3 consecutive Casual Leaves (CL) allowed.</li>
                  <li>3. One Restricted Holiday per year.</li>
                  <li>4. Extra leaves are counted as Leave Without Pay.</li>
                  <li>5. Compensatory leave requires HOD approval.</li>
                  <li>6. Leaves attached to Sundays/holidays need prior approval.</li>
                  <li>7. Seven Medical leaves per year, max 2 splits, certificate required for 3+ days.</li>
                  <li>8. Emergency Leave only for the current day with HOD approval.</li>
                  <li>9. Leaves are not encashable.</li>
                  <li>10. No leaves during notice period.</li>
                  <li>11. Rejected leaves taken will lead to salary deduction.</li>
                  <li>12. Absence without information for 3+ days may lead to warnings.</li>
                  <li>13. Only Half Day or Full Day leaves allowed.</li>
                </ul>
              </div>
            )}
            <div>
              <h4 className="text-md font-medium mb-2">Calendar</h4>
              <Calendar
                minDate={minDate}
                maxDate={maxDateBase}
                tileDisabled={tileDisabled}
                tileClassName={tileClassName}
                className="w-full"
              />
              <div className="mt-2 text-sm text-red-700">
                Note: Leaves exceeding 3 days require separate HOD approval.
              </div>
              <div className="mt-4 space-y-1 text-sm text-gray-700">
                <p>
                  <span className="inline-block w-4 h-4 bg-red-200 border border-red-400 mr-2"></span> Yearly Holiday (YH)
                </p>
                <p>
                  <span className="inline-block w-4 h-4 bg-purple-200 border border-purple-400 mr-2"></span> Restricted Holiday (RH)
                </p>
              </div>
            </div>
          </div>
        </div>
        {leaveSegments.length > 0 && (
          <Card className="shadow-lg border w-full">
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
                <h3 className="text-lg font-semibold text-blue-800">Leave Summary</h3>
                <div className="text-sm text-blue-800 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div>
                    <span className="font-semibold">From:</span>
                    <span className="font-bold text-red-700 ml-1">{getLeaveDuration().from}</span>
                  </div>
                  <div>
                    <span className="font-semibold">To:</span>
                    <span className="font-bold text-red-700 ml-1">{getLeaveDuration().to}</span>
                  </div>
                  <div>
                    <span className="font-semibold">Total:</span>
                    <span className="font-bold text-red-700 ml-1">{getLeaveDuration().totalDays} day(s)</span>
                  </div>
                </div>
              </div>
              <div className="w-full overflow-x-auto">
                <table className="w-full border-collapse table-auto">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-2 text-left text-sm">Segment</th>
                      <th className="border p-2 text-left text-sm">Leave Type</th>
                      <th className="border p-2 text-left text-sm">From Date</th>
                      <th className="border p-2 text-left text-sm">To Date</th>
                      <th className="border p-2 text-left text-sm">Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaveSegments.map((segment, index) => (
                      <tr key={index}>
                        <td className="border p-2 text-sm">{index + 1}</td>
                        <td className="border p-2 text-sm">{segment.leaveType || "Not selected"}</td>
                        <td className="border p-2 text-sm">{segment.dates.from ? formatDate(segment.dates.from) : "Not selected"}</td>
                        <td className="border p-2 text-sm">{segment.dates.to ? formatDate(segment.dates.to) : "Not selected"}</td>
                        <td className="border p-2 text-sm">{calculateLeaveDays(segment)} days</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}

export default LeaveForm;

