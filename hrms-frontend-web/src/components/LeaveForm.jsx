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
import dayjs from "dayjs";

function LeaveForm() {
  const { user } = useContext(AuthContext);
  const getToday = () => dayjs().startOf("day");
  const getSevenDaysAgo = () => getToday().subtract(7, "day");
  const getSevenDaysLater = (fromDate) => dayjs(fromDate).add(7, "day");

 const istOffset = 5.5 * 60 * 60 * 1000;
const today = new Date();
const istTime = new Date(today.getTime() + istOffset);
istTime.setUTCHours(0, 0, 0, 0);

const minDateBase = new Date(istTime); // Base minimum date (tomorrow for non-medical)
minDateBase.setDate(minDateBase.getDate() + 1);

const minDateMedical = new Date(istTime); // Minimum date for medical (7 days ago)
minDateMedical.setDate(minDateMedical.getDate() + 1);

const maxDateBase = new Date(istTime);
maxDateBase.setDate(istTime.getDate() + 60);

// Function to get dynamic minDate based on leaveType
const getMinDate = (leaveType) => {
  return leaveType === "Medical" ? minDateMedical.toISOString().split("T")[0] : minDateBase.toISOString().split("T")[0];
};

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
  const [initialLeaveBalances, setInitialLeaveBalances] = useState(null);
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
  const [isAfter7AM, setIsAfter7AM] = useState(false);
  const [showRHList, setShowRHList] = useState({});
  const [isFormFilled, setIsFormFilled] = useState(false);

  const RH_OPTIONS = [
    { value: "2025-08-09", label: "Raksha Bandhan — 09/08/2025" },
    { value: "2025-08-16", label: "Janmashtami — 16/08/2025" },
    { value: "2025-10-09", label: "Karva Chauth — 09/10/2025" },
    { value: "2025-12-25", label: "Christmas — 25/12/2025" },
  ];

  useEffect(() => {
    const fetchEmployeeData = async () => {
      try {
        const res = await api.get("/dashboard/employee-info");
        setCompensatoryBalance(res.data.compensatoryLeaves || 0);
        setCompensatoryEntries(res.data.compensatoryAvailable || []);
        setCanApplyEmergencyLeave(res.data.canApplyEmergencyLeave || false);
        const balances = {
          compensatoryAvailable: res.data.compensatoryLeaves || 0,
          paidLeaves: res.data.paidLeaves || 0,
          unpaidLeavesTaken: res.data.unpaidLeavesTaken || 0,
          medicalLeaves: res.data.medicalLeaves || 0,
          restrictedHolidays: res.data.restrictedHolidays || 0,
        };
        setLeaveBalances(balances);
        if (!initialLeaveBalances) {
          setInitialLeaveBalances(balances);
        }
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

    const checkTimeRestriction = () => {
      const now = new Date();
      const istNow = new Date(now.getTime() + istOffset);
      const hours = istNow.getUTCHours();
      const minutes = istNow.getUTCMinutes();
      const isAfter = hours > 7 || (hours === 7 && minutes > 0);
      setIsAfter7AM(isAfter);
    };

    fetchEmployeeData();
    fetchRestrictedHolidays();
    fetchDepartmentEmployees();
    checkTimeRestriction();
  }, []);

  useEffect(() => {
    const isFilled = leaveSegments.every(
      (segment) =>
        segment.leaveType &&
        segment.dates.from &&
        (segment.dates.fromDuration !== "half" || segment.dates.fromSession) &&
        (!segment.dates.to || (segment.dates.toDuration !== "half" || segment.dates.toSession)) &&
        commonFields.reason &&
        commonFields.chargeGivenTo &&
        commonFields.emergencyContact
    );
    setIsFormFilled(isFilled);
  }, [leaveSegments, commonFields]);

const handleSegmentChange = (index, e) => {
  const { name, value } = e.target;
  setLeaveSegments((prev) => {
    const newSegments = [...prev];
if (name === "leaveType") {
      newSegments[index] = {
        ...newSegments[index],
        [name]: value,
        dates: {
          ...newSegments[index].dates,
          from: value === "Medical" && !newSegments[index].dates.from
            ? minDateMedical.toISOString().split("T")[0]
            : newSegments[index].dates.from,
          to: value === "Medical" && !newSegments[index].dates.to
            ? getSevenDaysLater(minDateMedical.toISOString().split("T")[0]).toISOString().split("T")[0]
            : newSegments[index].dates.to,
        },
      };
    }

    
   else if (name === `fromDuration-${index}`) {
      newSegments[index] = {
        ...newSegments[index],
        dates: {
          ...newSegments[index].dates,
          fromDuration: value,
          fromSession: value === "half" ? newSegments[index].dates.fromSession || "forenoon" : "",
          to: value === "half" ? newSegments[index].dates.from : newSegments[index].dates.to,
          toDuration: value === "half" ? "half" : newSegments[index].dates.toDuration,
          toSession: value === "half" ? "forenoon" : newSegments[index].dates.toSession,
        },
      };
    } else if (name === `fromSession-${index}`) {
      newSegments[index] = {
        ...newSegments[index],
        dates: {
          ...newSegments[index].dates,
          fromSession: value,
          to: value === "forenoon" && newSegments[index].dates.fromDuration === "half" ? newSegments[index].dates.from : newSegments[index].dates.to,
          toDuration: value === "forenoon" && newSegments[index].dates.fromDuration === "half" ? "half" : newSegments[index].dates.toDuration,
          toSession: value === "forenoon" && newSegments[index].dates.fromDuration === "half" ? "forenoon" : newSegments[index].dates.toSession,
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
      const toDate = new Date(value);
      newSegments[index].dates.to = value;
      newSegments[index].dates.toDuration = "full";
      newSegments[index].dates.toSession = "";
    } else if (name.includes("dates")) {
      const field = name.split(".")[1];
      newSegments[index] = {
        ...newSegments[index],
        dates: {
          ...newSegments[index].dates,
          [field]: value,
          ...(field === "from" && newSegments[index].leaveType === "Medical" && {
            to: new Date(new Date(value).getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
          }),
          ...(field === "from" && newSegments[index].leaveType === "Maternity" && {
            to: new Date(new Date(value).getTime() + 89 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
          }),
          ...(field === "from" && newSegments[index].leaveType === "Paternity" && {
            to: new Date(new Date(value).getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
          }),
          ...(field === "from" && newSegments[index].leaveType === "Restricted Holidays" && { to: value }),
          ...(field === "from" && newSegments[index].dates.fromDuration === "half" && newSegments[index].dates.fromSession === "forenoon" && {
            to: value
          }),
        },
      };
    } else if (name === "medicalCertificate") {
      const file = e.target.files[0];
      if (file && file.size > 5 * 1024 * 60 * 1024) {
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

    // Real-time validation and recalculation
    const error = validateSegment(newSegments[index], index);
    if (error) {
      setValidationErrors((prev) => [...prev.filter((e) => !e.includes(`Segment ${index + 1}`)), error]);
      toast.error(error);
    } else {
      setValidationErrors((prev) => prev.filter((e) => !e.includes(`Segment ${index + 1}`)));
    }
    return newSegments;
  });
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
  const totalConsecutiveDays = getTotalConsecutiveDays();
  if (totalConsecutiveDays >= 3) {
    toast.error("Cannot exceed 3 consecutive days, including Sundays and Yearly Holidays.");
    return;
  }

  // Check for Thu-Fri-Sat and Mon-Tue-Wed combination before adding
  let allFromDates = leaveSegments.map((seg) => seg.dates.from && new Date(seg.dates.from));
  let allToDates = leaveSegments.map((seg) => seg.dates.to && new Date(seg.dates.to)).filter(Boolean);
  if (leaveSegments.some((seg) => !seg.dates.to && seg.dates.from)) {
    allToDates = allToDates.concat(leaveSegments.map((seg) => seg.dates.from && new Date(seg.dates.from)).filter(Boolean));
  }
  const minDate = new Date(Math.min.apply(null, allFromDates.filter(Boolean)));
  const maxDate = new Date(Math.max.apply(null, allToDates));
  const daysDiff = Math.floor((maxDate - minDate) / (1000 * 60 * 60 * 24)) + 1;

if (daysDiff >= 3 && hasInvalidWeekdayStretch(minDate, maxDate)) {
  toast.error("Cannot take leave for 3 consecutive weekdays in Mon–Wed or Thu–Sat block.");
  return;
}


  setLeaveSegments((prev) => {
    const lastSegment = prev[prev.length - 1];
    let nextFromDate = "";
    if (lastSegment?.dates?.to) {
      let toDate = new Date(lastSegment.dates.to);
      toDate.setDate(toDate.getDate() + 1);
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

  const restrictedHolidayDates = [
    new Date(2025, 7, 9),
    new Date(2025, 7, 16),
    new Date(2025, 9, 9),
    new Date(2025, 11, 25),
  ];

  const yearlyHolidayDates = [
    new Date(2025, 0, 26),
    new Date(2025, 2, 14),
    new Date(2025, 7, 15),
    new Date(2025, 9, 2),
    new Date(2025, 9, 21),
    new Date(2025, 9, 22),
    new Date(2025, 10, 5),
  ];

  const isHoliday = (date) => {
    return (
      yearlyHolidayDates.some((h) => h.toDateString() === date.toDateString()) ||
      date.getDay() === 0
    );
  };

  const isRestrictedHoliday = (date) => {
    return restrictedHolidayDates.some((rh) => rh.toDateString() === date.toDateString());
  };

const calculateLeaveDays = (segment) => {
  if (!segment.dates.from) return 0;
  const fromDate = new Date(segment.dates.from);
  const toDate = segment.dates.to ? new Date(segment.dates.to) : fromDate;
  if (toDate < fromDate) return 0;

  if (segment.leaveType === "Medical" || segment.leaveType === "Maternity" || segment.leaveType === "Paternity") {
    const days = Math.floor((toDate - fromDate) / (1000 * 60 * 60 * 24)) + 1;
    return days;
  }

  let days = 0;
  let current = new Date(fromDate);
  while (current <= toDate) {
    if (!isHoliday(current) || isRestrictedHoliday(current)) {
      days += 1;
    }
    current.setDate(current.getDate() + 1);
  }

  // Adjust for same-day scenario with duration
  if (fromDate.toDateString() === toDate.toDateString()) {
    if (segment.dates.fromDuration === "half" && segment.dates.toDuration === "half") {
      return segment.dates.fromSession === segment.dates.toSession ? 0.5 : 0.5;
    }
    return segment.dates.fromDuration === "half" ? 0.5: 1;
  }

  // Adjust for half-day durations
  if (segment.dates.fromDuration === "half") days -= 0.5;
  if (segment.dates.toDuration === "half" && segment.dates.to) days -= 0.5;

  return days > 0 ? days : 0;
};

  const getTotalConsecutiveDays = () => {
    if (leaveSegments.length === 0 || !leaveSegments[0].dates.from) return 0;
    
    let minDate = null;
    let maxDate = null;

    leaveSegments.forEach((segment) => {
      if (segment.dates.from) {
        const from = new Date(segment.dates.from);
        if (!minDate || from < minDate) minDate = from;
        if (segment.dates.to) {
          const to = new Date(segment.dates.to);
          if (!maxDate || to > maxDate) maxDate = to;
        } else if (!maxDate || from > maxDate) {
          maxDate = from;
        }
      }
    });

    if (!minDate || !maxDate) return 0;

    const totalDays = Math.floor((maxDate - minDate) / (1000 * 60 * 60 * 24)) + 1;
    return totalDays;
  };

  const hasInvalidWeekdayStretch = (startDate, endDate) => {
  let current = new Date(startDate);
  let weekdaysInRow = [];

  while (current <= endDate) {
    const day = current.getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat

    if (day >= 1 && day <= 6) {
      weekdaysInRow.push(day);
      if (weekdaysInRow.length >= 3) {
        const seq = weekdaysInRow.slice(-3).sort().join(",");
        if (seq === "1,2,3" || seq === "4,5,6") {
          return true; // Found Mon–Tue–Wed OR Thu–Fri–Sat
        }
      }
    } else {
      weekdaysInRow = []; // reset on Sunday
    }

    current.setDate(current.getDate() + 1);
  }

  return false;
};



const validateSegment = (segment, index) => {
  // if (!segment.leaveType) return "Leave Type is required";
  // if (!commonFields.reason) return "Reason is required";
  // if (!commonFields.chargeGivenTo) return "Charge Given To is required";
  // if (!commonFields.emergencyContact) return "Emergency Contact is required";
  // if (!segment.dates.from) return "From Date is required";
  // if (segment.dates.to && new Date(segment.dates.to) < new Date(segment.dates.from))
  //   return "To Date cannot be earlier than From Date";
  // if (!["full", "half"].includes(segment.dates.fromDuration))
  //   return "From Duration must be 'full' or 'half'";
  // if (segment.dates.fromDuration === "half" && !["forenoon", "afternoon"].includes(segment.dates.fromSession))
  //   return "From Session must be 'forenoon' or 'afternoon'";
  // if (segment.dates.to && !["full", "half"].includes(segment.dates.toDuration))
  //   return "To Duration must be 'full' or 'half'";
  // if (segment.dates.to && segment.dates.toDuration === "half" && segment.dates.toSession !== "forenoon")
  //   return "To Session must be 'forenoon' for Half Day To Duration";

  // Collect all segment dates for global validation
  let allFromDates = [];
  let allToDates = [];
  leaveSegments.forEach((seg) => {
    if (seg.dates.from) allFromDates.push(new Date(seg.dates.from));
    if (seg.dates.to) allToDates.push(new Date(seg.dates.to));
    if (!seg.dates.to && seg.dates.from) allToDates.push(new Date(seg.dates.from));
  });
  const minDate = new Date(Math.min.apply(null, allFromDates));
  const maxDate = new Date(Math.max.apply(null, allToDates));
  const daysDiff = Math.floor((maxDate - minDate) / (1000 * 60 * 60 * 24)) + 1;

 if (daysDiff >= 3) {
  if (hasInvalidWeekdayStretch(minDate, maxDate)) {
    return "Cannot take leave for 3 consecutive weekdays in Mon–Wed or Thu–Sat block.";
  }
}



  if (segment.leaveType === "Medical") {
    if (segment.dates.fromDuration === "half") return "Medical leave cannot be applied as a half-day leave";
    const days = calculateLeaveDays(segment);
    if (days !== 3 && days !== 4 && days !== 7) return "Medical leave must be exactly 3, 4, or 7 days";
    if (leaveSegments.some((seg, i) => i !== index && seg.leaveType && seg.leaveType !== "Medical"))
      return "Medical leave must be applied alone";
  }

  if (segment.isEmergency) {
    if (!canApplyEmergencyLeave) return "You are not authorized to apply for Emergency Leave";
    if (isAfter7AM) return "Emergency Leave applications are only accepted before 7:00 AM IST. Please contact your Head of Department for further assistance.";
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
    if (
      leaveSegments.some(
        (seg, i) => i !== index && seg.leaveType === "Restricted Holidays" && seg.restrictedHoliday
      )
    ) {
      return "Restricted Holiday already selected in another segment";
    }
  }

  if (segment.leaveType === "Casual" && !user?.employeeType === "Confirmed") {
    const leaveDays = calculateLeaveDays(segment);
    if (leaveDays > 1) return "Non-confirmed employees can only apply for 1 Casual Leave day";
  }

  if (segment.leaveType === "Medical" && (!user || user.employeeType !== "Confirmed"))
    return "Medical leave is only available for Confirmed employees";

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

  if (segment.leaveType === "Leave Without Pay(LWP)" && leaveBalances.paidLeaves > 0 && user?.employeeType === "Confirmed") {
    return "Leave Without Pay (LWP) is not allowed when Casual Leave balance is available";
  }

  if (
    segment.dates.from === segment.dates.to &&
    segment.dates.fromDuration === "half" &&
    segment.dates.toDuration === "half" &&
    segment.dates.fromSession === segment.dates.toSession
  ) {
   // return "Invalid duration combination for same-day leave";
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
      if (segment.dates.to) {
        formData.append(`segments[${index}][fullDay][to]`, segment.dates.to);
        formData.append(`segments[${index}][fullDay][toDuration]`, segment.dates.toDuration || "full");
        formData.append(`segments[${index}][fullDay][toSession]`, segment.dates.toSession || "");
      }

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
      alert("Leave request submitted successfully");
      const updatedBalances = await api.get("/dashboard/employee-info");
      setLeaveBalances({
        compensatoryAvailable: updatedBalances.data.compensatoryLeaves || 0,
        paidLeaves: updatedBalances.data.paidLeaves || 0,
        unpaidLeavesTaken: updatedBalances.data.unpaidLeavesTaken || 0,
        medicalLeaves: updatedBalances.data.medicalLeaves || 0,
        restrictedHolidays: updatedBalances.data.restrictedHolidays || 0,
      });
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
      setIsFormFilled(false);
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
      return new Date(leaveSegments[index].leaveType === "Medical" ? minDateMedical : istTime);
    }
    const lastSegment = leaveSegments[index - 1];
    if (lastSegment?.dates?.to) {
      let minDateSeg = new Date(lastSegment.dates.to);
      minDateSeg.setDate(minDateSeg.getDate() + 1);
      return minDateSeg;
    }
    return new Date(istTime);
  };

const getMaxDateForToDate = (index) => {
  const segment = leaveSegments[index];
  if (!segment.dates.from) return maxDateBase;
  const fromDate = new Date(segment.dates.from);

  // Special cases for Medical, Maternity, and Paternity leaves
  if (segment.leaveType === "Medical") {
    let maxLimit = new Date(fromDate);
    maxLimit.setDate(fromDate.getDate() + 6);
    return maxLimit > maxDateBase ? maxDateBase : maxLimit;
  } else if (segment.leaveType === "Maternity") {
    let maxLimit = new Date(fromDate);
    maxLimit.setDate(fromDate.getDate() + 89);
    return maxLimit > maxDateBase ? maxDateBase : maxLimit;
  } else if (segment.leaveType === "Paternity") {
    let maxLimit = new Date(fromDate);
    maxLimit.setDate(fromDate.getDate() + 6);
    return maxLimit > maxDateBase ? maxDateBase : maxLimit;
  }

  // Find the earliest From Date across all segments
  let earliestFromDate = fromDate;
  leaveSegments.forEach((seg, i) => {
    if (seg.dates.from && i !== index) {
      const segFromDate = new Date(seg.dates.from);
      if (segFromDate < earliestFromDate) {
        earliestFromDate = segFromDate;
      }
    }
  });

  // Calculate the maximum To Date to ensure total consecutive days do not exceed 3
  let maxLimit = new Date(fromDate);
  let totalConsecutiveDays = getTotalConsecutiveDays();
  let remainingDays = 3 - totalConsecutiveDays + (segment.dates.fromDuration === "half" ? 0.5 : 1);

  // If the segment's From Date is after the earliest, adjust remaining days
  const daysFromEarliest = Math.floor((fromDate - earliestFromDate) / (1000 * 60 * 60 * 24));
  remainingDays = Math.max(0, 3 - daysFromEarliest - (segment.dates.fromDuration === "half" ? 0.5 : 1));

  // Adjust for afternoon start to extend to the third day's forenoon
  if (segment.dates.fromDuration === "half" && segment.dates.fromSession === "afternoon") {
    remainingDays += 1; // Extend by one day to account for afternoon start
  }

  maxLimit.setDate(fromDate.getDate() + Math.floor(remainingDays));
  return maxLimit > maxDateBase ? maxDateBase : maxLimit;
};


  const isLastDayFullDisabled = (index) => {
    const segment = leaveSegments[index];
    if (!segment.dates.from || !segment.dates.to || segment.leaveType === "Medical" || segment.leaveType === "Maternity" || segment.leaveType === "Paternity") return false;
    const totalConsecutiveDays = getTotalConsecutiveDays();
    const fromDate = new Date(segment.dates.from);
    const toDate = new Date(segment.dates.to);
    
    return (
      segment.dates.fromDuration === "half" &&
      segment.dates.fromSession === "afternoon" &&
      totalConsecutiveDays >= 3 &&
      toDate.toDateString() === getMaxDateForToDate(index).toDateString()
    );
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
        if (segment.dates.from) {
          const from = new Date(segment.dates.from);
          const to = segment.dates.to ? new Date(segment.dates.to) : from;
          const rawDiff = Math.round((to - from) / (1000 * 60 * 60 * 24)) + 1;

          let adjustment = 0;
          if (segment.dates.fromDuration === "half") adjustment -= 0.5;
          if (segment.dates.toDuration === "half" && segment.dates.to) adjustment -= 0.5;

          totalDays += rawDiff + adjustment;
        }
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
  const hasMedicalLeave = leaveSegments.some((seg) => seg.leaveType === "Medical");
  const hasNonMedicalLeave = leaveSegments.some(
    (seg) => seg.leaveType && seg.leaveType !== "Medical"
  );
  const rhTaken = leaveSegments.some(
    (seg, i) => i !== index && seg.leaveType === "Restricted Holidays" && seg.restrictedHoliday
  );
  const rhAvailed = initialLeaveBalances?.restrictedHolidays === 0 && leaveBalances.restrictedHolidays === 0;
  const hasCLSelected = leaveSegments.some(
    (seg, i) => i !== index && seg.leaveType === "Casual"
  );

  // Base types array, excluding LWP if CL balance > 0 for confirmed employees
  let baseTypes = [
    { value: "Casual", label: "Casual" },
    { value: "Compensatory", label: "Compensatory" },
  ];
  if (!(isConfirmed && leaveBalances.paidLeaves > 0)) {
    baseTypes.push({ value: "Leave Without Pay(LWP)", label: "Leave Without Pay (LWP)" });
  }

if (isConfirmed) {
  if (gender === "female" && user?.maritalStatus === "married") {
    if (!hasNonMedicalLeave) {
      baseTypes.push({ value: "Medical", label: "Medical" });
    }
    if (!rhTaken && !rhAvailed) {
      baseTypes.push({ value: "Restricted Holidays", label: "Restricted Holidays" });
    }
    baseTypes.push({ value: "Maternity", label: "Maternity" });
  } else if (gender === "male" && user?.maritalStatus === "married") {
    if (!hasNonMedicalLeave) {
      baseTypes.push({ value: "Medical", label: "Medical" });
    }
    if (!rhTaken && !rhAvailed) {
      baseTypes.push({ value: "Restricted Holidays", label: "Restricted Holidays" });
    }
    baseTypes.push({ value: "Paternity", label: "Paternity" });
  } else {
    if (!hasNonMedicalLeave) {
      baseTypes.push({ value: "Medical", label: "Medical" });
    }
    if (!rhTaken && !rhAvailed) {
      baseTypes.push({ value: "Restricted Holidays", label: "Restricted Holidays" });
    }
  }
}

  const clAlreadyTaken = leaveSegments.some(
    (seg, i) => i < index && seg.leaveType === "Casual"
  );

  return baseTypes.map((type) => {
    const isNonConfirmed = !isConfirmed;
    const clBalance = leaveBalances.paidLeaves;
    const totalCLDays = getTotalCasualLeaveDays();

    let disableCL = false;
    let disableLWP = false;

    if (isNonConfirmed) {
      if (type.value === "Leave Without Pay(LWP)" && clBalance === 1) {
        disableLWP = true;
      }
      if (type.value === "Casual" && hasCLSelected) {
        disableCL = true;
      }
      if (type.value === "Casual" && totalCLDays >= 1) {
        disableCL = true;
      }
    }

    if (index > 0) {
      const prevSegment = leaveSegments[index - 1];
      const prevToDate = prevSegment.dates.to ? new Date(prevSegment.dates.to) : new Date(prevSegment.dates.from);
      const nextDay = new Date(prevToDate);
      nextDay.setDate(nextDay.getDate() + 1);

      const isAfterYH = yearlyHolidayDates.some((yh) => yh.toDateString() === prevToDate.toDateString()) &&
                        !isHoliday(nextDay) && !isRestrictedHoliday(nextDay);

      if (isAfterYH) {
        if (type.value === "Casual" && clBalance > 0) {
          disableCL = false;
        } else if (type.value === "Leave Without Pay(LWP)" && clBalance === 0) {
          disableLWP = false;
        } else if (type.value === "Casual" && clBalance === 0) {
          disableCL = true;
        }
      } else if (type.value === "Casual" && leaveSegments[0].leaveType === "Casual") {
        disableCL = true;
      }
    }

    return {
      ...type,
      disabled: clAlreadyTaken
        ? (
            type.value === "Casual" ||
            (type.value === "Compensatory" && leaveBalances.compensatoryAvailable === 0)
          )
        : (
            (type.value === "Compensatory" && leaveBalances.compensatoryAvailable === 0) ||
            (type.value === "Medical" && leaveBalances.medicalLeaves === 0) ||
            (type.value === "Restricted Holidays" && (leaveBalances.restrictedHolidays === 0 || rhTaken || rhAvailed)) ||
            (type.value === "Maternity" && leaveBalances.paidLeaves === 0) ||
            (type.value === "Paternity" && leaveBalances.paidLeaves === 0) ||
            (type.value === "Medical" && hasNonMedicalLeave) ||
            (type.value === "Casual" && disableCL) ||
            (type.value === "Leave Without Pay(LWP)" && disableLWP)
          )
    };
  });
};
  const getLeaveBalanceDisplay = () => {
    const isConfirmed = user?.employeeType === "Confirmed";
    const clTotal = isConfirmed ? 12 : 1;
    const balanceCL = initialLeaveBalances?.paidLeaves || leaveBalances.paidLeaves;
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
        availed: (initialLeaveBalances?.compensatoryAvailable || leaveBalances.compensatoryAvailable) / 8,
        balance: (initialLeaveBalances?.compensatoryAvailable || leaveBalances.compensatoryAvailable) / 8,
        total: (initialLeaveBalances?.compensatoryAvailable || leaveBalances.compensatoryAvailable) / 8,
      },
      {
        type: "Leave Without Pay (LWP)",
        availed: initialLeaveBalances?.unpaidLeavesTaken || leaveBalances.unpaidLeavesTaken,
        balance: "N/A",
        total: "N/A",
      },
    ];
    if (isConfirmed) {
      balances.push(
        {
          type: "Medical Leave",
          balance: initialLeaveBalances?.medicalLeaves || leaveBalances.medicalLeaves,
          availed: 7 - (initialLeaveBalances?.medicalLeaves || leaveBalances.medicalLeaves),
          total: 7,
        },
        {
          type: "Restricted Holidays",
          balance: initialLeaveBalances?.restrictedHolidays || leaveBalances.restrictedHolidays,
          availed: 1 - (initialLeaveBalances?.restrictedHolidays || leaveBalances.restrictedHolidays),
          total: 1,
        }
      );
    }
    return balances;
  };

  const isToDateDisabled = (segment) => {
    if (!segment || !segment.dates) return false;
    const { fromDuration, fromSession, from, to } = segment.dates;
    return (
      (fromDuration === "half" && fromSession === "forenoon" && from === to) ||
      segment.isEmergency ||
      //segment.leaveType === "Medical" ||
      segment.leaveType === "Maternity" ||
      segment.leaveType === "Paternity" ||
      segment.leaveType === "Restricted Holidays"
    );
  };

  const isAddLeaveDisabled = () => {
    const lastSegment = leaveSegments[leaveSegments.length - 1];
    const fields = lastSegment?.dates || {};

    const isFromDateForenoonHalfDay =
      fields.fromDuration === "half" && fields.fromSession === "forenoon";

    const isIncomplete =
      !lastSegment.leaveType ||
      !fields.from ||
      (fields.fromDuration === "half" && !fields.fromSession) ||
      (fields.to && fields.toDuration === "half" && !fields.toSession);

    const isLogicalBlock =
      getTotalConsecutiveDays() >= 3 && 
      lastSegment.leaveType !== "Medical" &&
      lastSegment.leaveType !== "Maternity" &&
      lastSegment.leaveType !== "Paternity";

    const isToDateForenoonHalfDay =
      fields.to &&
      fields.toDuration === "half" &&
      fields.toSession === "forenoon";

    return (
      isIncomplete ||
      isLogicalBlock ||
      isToDateForenoonHalfDay ||
      isFromDateForenoonHalfDay ||
      lastSegment.leaveType === "Medical" ||
      lastSegment.leaveType === "Maternity" ||
      lastSegment.leaveType === "Paternity"
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
        {isAfter7AM && canApplyEmergencyLeave && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            <p>
              Unplanned Leave applications are only accepted before 7:00 AM IST. Please contact your Head of Department for further assistance.
            </p>
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
                              disabled={isAfter7AM}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select leave category" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="true">Unplanned Leave</SelectItem>
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
                        {segment.leaveType === "Restricted Holidays" && (
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() => setShowRHList((prev) => ({ ...prev, [index]: !prev[index] }))}
                              className="border border-gray-300 px-2 py-2 rounded w-full text-left hover:bg-blue-50 transition"
                            >
                              RH Reference
                              {segment.restrictedHoliday
                                ? RH_OPTIONS.find((rh) => rh.value === segment.restrictedHoliday)?.label
                                : "Select RH Holiday"}
                            </button>
                            {showRHList?.[index] && (
                              <ol className="mt-2 pl-5 list-decimal text-sm text-gray-800 space-y-1">
                                {RH_OPTIONS.filter(
                                  (rh) =>
                                    !leaveSegments.some(
                                      (seg, i) =>
                                        i !== index &&
                                        seg.leaveType === "Restricted Holidays" &&
                                        seg.restrictedHoliday === rh.value
                                    )
                                ).map((rh) => (
                                  <li
                                    key={rh.value}
                                    className={`cursor-pointer hover:text-blue-700 ${
                                      segment.restrictedHoliday === rh.value ? "font-semibold text-blue-800" : ""
                                    }`}
                                    onClick={() => {
                                      handleRestrictedHolidayChange(index, rh.value);
                                      setShowRHList((prev) => ({ ...prev, [index]: false }));
                                    }}
                                  >
                                    {rh.label}
                                  </li>
                                ))}
                              </ol>
                            )}
                          </div>
                        )}
                        <div>
                          <Label htmlFor={`dates.from-${index}`} className="text-blue-800">From Date</Label>
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                           <Input
  id={`dates.from-${index}`}
  name="dates.from"
  type="date"
  value={segment.dates.from}
  onChange={(e) => handleSegmentChange(index, e)}
  min={getMinDate(segment.leaveType)} // Dynamic min date based on leaveType
  max={maxDateBase.toISOString().split("T")[0]}
  disabled={segment.isEmergency || index > 0}
  className="w-full sm:w-40"
/>
                            {segment.leaveType !== "Restricted Holidays" && !segment.isEmergency && (
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
                                      disabled={segment.leaveType === "Medical" || segment.leaveType === "Maternity" || segment.leaveType === "Paternity"}
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
                                      disabled={segment.leaveType === "Medical" || segment.leaveType === "Maternity" || segment.leaveType === "Paternity"}
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
                        {segment.leaveType !== "Restricted Holidays" && !segment.isEmergency && (
                          <div>
                            <Label htmlFor={`dates.to-${index}`} className="text-blue-800">To Date</Label>
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                             <Input
  id={`dates.to-${index}`}
  name="dates.to"
  type="date"
  value={segment.dates.to}
  onChange={(e) => handleSegmentChange(index, e)}
  min={segment.dates.from || istTime.toISOString().split("T")[0]}
  max={getMaxDateForToDate(index).toISOString().split("T")[0]}
  disabled={isToDateDisabled(segment)}
  className="w-full sm:w-40"
/>
                              {segment.dates.from !== segment.dates.to && segment.dates.to && segment.leaveType !== "Medical" && segment.leaveType !== "Maternity" && segment.leaveType !== "Paternity" && (
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
                                        disabled={isLastDayFullDisabled(index)}
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
                                {getTotalConsecutiveDays() > 3 && segment.leaveType !== "Medical" && segment.leaveType !== "Maternity" && segment.leaveType !== "Paternity" && (
                                  <p className="mt-1 text-sm text-red-600">
                                    Error: Cannot exceed 3 consecutive days, including Sundays and Yearly Holidays.
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
                      disabled={submitting || (isAfter7AM && leaveSegments[0].isEmergency)}
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
                  <li>2. Max 3 consecutive days allowed, including Sundays and Yearly Holidays.</li>
                  <li>3. One Restricted Holiday per year.</li>
                  <li>4. Extra leaves are counted as Leave Without Pay.</li>
                  <li>5. Compensatory leave requires HOD approval.</li>
                  <li>6. Leaves attached to Sundays/holidays need prior approval.</li>
                  <li>7. Seven Medical leaves per year, max 2 splits, certificate required for 3+ days.</li>
                  <li>8. Unplanned Leave only for the current day with HOD approval.</li>
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
               minDate={istTime}
              // maxDate={maxDateBase}
               // tileDisabled={tileDisabled}
                tileClassName={tileClassName}
                className="w-full"
              />
              <div className="mt-2 text-sm text-red-700">
                Note: Leaves exceeding 3 consecutive days, including Sundays/YH, require separate HOD approval.
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