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
import '../App.css';

function LeaveForm() {
  const { user } = useContext(AuthContext);
  const [leaveSegments, setLeaveSegments] = useState([
    {
      leaveType: "",
      isEmergency: true,
      dates: {
       from: new Date().toISOString().split("T")[0], // Set to todays date for emeergency
        to: "",
        fromDuration: "full",
        fromSession: "forenoon",
        toDuration: "full",
        toSession: "forenoon",
      },
      compensatoryEntryId: "",
      restrictedHoliday: "",
      projectDetails: "",
      medicalCertificate: null,
    },
  ]);
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
  const [showLeaveRules, setShowLeaveRules] = useState(false);

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
        console.error("Error fetching employee data:", err);
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
        console.error("Error fetching restricted holidays:", err);
      }
    };

    const fetchDepartmentEmployees = async () => {
      try {
        const params = {};
        if (leaveSegments[0].dates.from) {
          params.startDate = leaveSegments[0].dates.from;
          params.endDate = leaveSegments[0].dates.to || leaveSegments[0].dates.from;
          params.fromDuration = leaveSegments[0].dates.fromDuration;
          params.fromSession =
            leaveSegments[0].dates.fromDuration === "half"
              ? leaveSegments[0].dates.fromSession
              : undefined;
          params.toDuration = leaveSegments[0].dates.to ? leaveSegments[0].dates.toDuration : undefined;
          params.toSession =
            leaveSegments[0].dates.to && leaveSegments[0].dates.toDuration === "half"
              ? leaveSegments[0].dates.toSession
              : undefined;
        }
        const res = await api.get("/employees/department", { params });
        setEmployees(res.data);
      } catch (err) {
        console.error("Error fetching department employees:", err);
      }
    };

    fetchEmployeeData();
    fetchRestrictedHolidays();
    fetchDepartmentEmployees();
  }, [
    leaveSegments[0].dates.from,
    leaveSegments[0].dates.to,
    leaveSegments[0].dates.fromDuration,
    leaveSegments[0].dates.fromSession,
    leaveSegments[0].dates.toDuration,
    leaveSegments[0].dates.toSession,
  ]);

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
          ...(value === "half" && {
            fromSession: newSegments[index].dates.fromSession || "forenoon",
          }),
          ...(value === "full" && { fromSession: "" }),
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
          ...(value === "half" && {
            toSession: newSegments[index].dates.toSession || "forenoon",
          }),
          ...(value === "full" && { toSession: "" }),
        },
      };
    } else if (name === `toSession-${index}`) {
      newSegments[index] = {
        ...newSegments[index],
        dates: {
          ...newSegments[index].dates,
          toSession: value,
        },
      };
    } else if (name.includes("dates")) {
      const field = name.split(".")[1];
      newSegments[index] = {
        ...newSegments[index],
        dates: {
          ...newSegments[index].dates,
          [field]: value,
          ...(field === "from" &&
            newSegments[index].leaveType === "Restricted Holidays" && {
              to: value,
            }),
        },
      };
    } else if (name === "medicalCertificate") {
      const file = e.target.files[0];
      if (file && file.size > 5 * 1024 * 1024) {
        alert("File size exceeds 5MB limit");
        e.target.value = null;
        return prev;
      }
      if (
        file &&
        !["image/jpeg", "image/jpg", "application/pdf"].includes(file.type)
      ) {
        alert("Only JPEG/JPG or PDF files are allowed");
        e.target.value = null;
        return prev;
      }
      newSegments[index] = {
        ...newSegments[index],
        medicalCertificate: file,
      };
    } else if (name === "isEmergency") {
      // Only allow changing isEmergency for the first segment (though disabled now)
      if (index === 0) {
        newSegments[index] = {
          ...newSegments[index],
          isEmergency: value === "true",
          dates: {
            ...newSegments[index].dates,
            from: value === "true" ? new Date().toISOString().split("T")[0] : "",
            to: "",
            fromDuration: "full",
            fromSession: "forenoon",
            toDuration: "full",
            toSession: "forenoon",
          },
          leaveType: "",
        };
      }
    } else {
      newSegments[index] = {
        ...newSegments[index],
        [name]: value,
      };
    }

    return newSegments;
  });
};


  const handleCommonFieldChange = (e) => {
    const { name, value } = e.target;
    setCommonFields((prev) => ({ ...prev, [name]: value }));
  };

  const handleCompensatoryEntryChange = (index, value) => {
    setLeaveSegments((prev) => {
      const newSegments = [...prev];
      newSegments[index] = { ...newSegments[index], compensatoryEntryId: value };
      return newSegments;
    });
  };

  const handleChargeGivenToChange = (value) => {
    setCommonFields((prev) => ({ ...prev, chargeGivenTo: value }));
  };

  const handleRestrictedHolidayChange = (index, value) => {
    setLeaveSegments((prev) => {
      const newSegments = [...prev];
      newSegments[index] = { ...newSegments[index], restrictedHoliday: value };
      return newSegments;
    });
  };

  const addLeaveSegment = () => {
    setLeaveSegments((prev) => [
      ...prev,
      {
        leaveType: "",
        isEmergency: false,
        dates: {
          from: "",
          to: "",
          fromDuration: "full",
          fromSession: "forenoon",
          toDuration: "full",
          toSession: "forenoon",
        },
        compensatoryEntryId: "",
        restrictedHoliday: restrictedHolidays.length > 0 ? restrictedHolidays[0].value : "",
        projectDetails: "",
        medicalCertificate: null,
      },
    ]);
  };

  const removeLeaveSegment = (index) => {
    setLeaveSegments((prev) => prev.filter((_, i) => i !== index));
  };

  const calculateLeaveDays = (segment) => {
    if (!segment.dates.from) return 0;

    if (segment.dates.fromDuration === "full" && !segment.dates.to) {
      const fromDate = new Date(segment.dates.from);
      return fromDate.getDay() === 0 ? 0 : 1;
    }

    if (segment.dates.fromDuration === "half") {
      if (segment.dates.fromSession === "forenoon") {
        const fromDate = new Date(segment.dates.from);
        return fromDate.getDay() === 0 ? 0 : 0.5;
      }
      if (segment.dates.fromSession === "afternoon") {
        if (!segment.dates.to) {
          const fromDate = new Date(segment.dates.from);
          return fromDate.getDay() === 0 ? 0 : 0.5;
        }
        const from = new Date(segment.dates.from);
        const to = new Date(segment.dates.to);
        if (to < from) return 0;
        let days = 0;
        let current = new Date(from);
        while (current <= to) {
          if (current.getDay() !== 0) {
            days += 1;
          }
          current.setDate(current.getDate() + 1);
        }
        if (segment.dates.toDuration === "full") {
          return days - 0.5;
        }
        if (
          segment.dates.toDuration === "half" &&
          segment.dates.toSession === "forenoon"
        ) {
          return to.getDay() === 0 ? days - 1 : days - 0.5;
        }
        return 0;
      }
    }

    if (segment.dates.fromDuration === "full" && segment.dates.to) {
      const from = new Date(segment.dates.from);
      const to = new Date(segment.dates.to);
      if (to < from) return 0;
      let days = 0;
      let current = new Date(from);
      while (current <= to) {
        if (current.getDay() !== 0) {
          days += 1;
        }
        current.setDate(current.getDate() + 1);
      }
      if (segment.dates.toDuration === "half") {
        days -= to.getDay() === 0 ? 0 : 0.5;
      }
      return days;
    }

    return 0;
  };

  const restrictedHolidayDates = [
    new Date(2025, 7, 9),   // Raksha Bandhan
    new Date(2025, 7, 16),  // Janmashtami
    new Date(2025, 9, 9),   // Karva Chauth
    new Date(2025, 11, 25), // Christmas
  ];

  const validateSegment = (segment, index) => {
    if (!segment.leaveType) return "Leave Type is required";
    if (!commonFields.reason) return "Reason is required";
    if (!commonFields.chargeGivenTo) return "Charge Given To is required";
    if (!commonFields.emergencyContact) return "Emergency Contact is required";
    if (!segment.dates.from) return "From Date is required";
    if (segment.dates.to && new Date(segment.dates.to) < new Date(segment.dates.from))
      return "To Date cannot be earlier than From Date";
    if (!["full", "half"].includes(segment.dates.fromDuration))
      return 'From Duration must be "full" or "half"';
    if (
      segment.dates.fromDuration === "half" &&
      !["forenoon", "afternoon"].includes(segment.dates.fromSession)
    )
      return 'From Session must be "forenoon" or "afternoon"';
    if (segment.dates.to && !["full", "half"].includes(segment.dates.toDuration))
      return 'To Duration must be "full" or "half"';
    if (
      segment.dates.to &&
      segment.dates.toDuration === "half" &&
      segment.dates.toSession !== "forenoon"
    )
      return 'To Session must be "forenoon" for Half Day To Duration';

    const today = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(today.getTime() + istOffset);
    istTime.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(istTime);
    tomorrow.setDate(istTime.getDate() + 1);
    const sevenDaysAgo = new Date(istTime);
    sevenDaysAgo.setDate(istTime.getDate() - 7);
    const minDateMedical = sevenDaysAgo.toISOString().split("T")[0];
    const maxDateMedical = istTime.toISOString().split("T")[0];
    const minDateOther = tomorrow.toISOString().split("T")[0];
    const currentDate = istTime.toISOString().split("T")[0];

    if (
      segment.dates.from &&
      segment.leaveType !== "Medical" &&
      !segment.isEmergency
    ) {
      const fromDate = new Date(segment.dates.from);
      if (fromDate <= istTime)
        return "From Date must be after today for this leave type";
    }
    if (segment.leaveType === "Medical" && segment.dates.fromDuration === "full") {
      const from = new Date(segment.dates.from);
      const to = new Date(segment.dates.to);
      let days = calculateLeaveDays(segment);
      if (days !== 3 && days !== 4 && days !== 7)
        return "Medical leave must be exactly 3, 4, or 7 days";
    }
    if (segment.isEmergency) {
      if (!canApplyEmergencyLeave)
        return "You are not authorized to apply for Emergency Leave";
      const leaveDays = calculateLeaveDays(segment);
      if (leaveDays > 1)
        return "Emergency leave must be half day or one full day";
      if (
        segment.dates.from !== currentDate ||
        (segment.dates.to && segment.dates.to !== currentDate)
      ) {
        return "Emergency leave must be for the current date only";
      }
    }
    if (segment.leaveType === "Compensatory") {
      if (!segment.compensatoryEntryId)
        return "Compensatory leave entry is required";
      const entry = compensatoryEntries.find(
        (e) => e._id === segment.compensatoryEntryId
      );
      if (!entry || entry.status !== "Available")
        return "Invalid or unavailable compensatory leave entry";
      const leaveDays = calculateLeaveDays(segment);
      const hoursNeeded = leaveDays === 0.5 ? 4 : 8;
      if (entry.hours !== hoursNeeded) {
        return `Selected entry (${entry.hours} hours) does not match leave duration (${leaveDays === 0.5 ? "Half Day (4 hours)" : "Full Day (8 hours)"})`;
      }
    }
    if (segment.leaveType === "Restricted Holidays") {
      if (!segment.restrictedHoliday)
        return "Please select a restricted holiday";
      const fromDate = new Date(segment.dates.from);
      const isValidRHDate = restrictedHolidayDates.some(
        (rh) => rh.toDateString() === fromDate.toDateString()
      );
      if (!isValidRHDate)
        return "Please select a valid Restricted Holiday date";
    }
    if (
      segment.leaveType === "Casual" &&
      user?.employeeType === "Confirmed" &&
      segment.dates.fromDuration === "full" &&
      segment.dates.to
    ) {
      const leaveDays = calculateLeaveDays(segment);
      if (leaveDays > 3) return `Segment ${index + 1}: Only 3 CL can be availed in a row`;
    }
    if (segment.leaveType === "Medical") {
      if (!user || user.employeeType !== "Confirmed")
        return "Medical leave is only available for Confirmed employees";
    }
    if (segment.leaveType === "Medical" && segment.dates.fromDuration === "half")
      return "Medical leave cannot be applied as a half-day leave";
    if (
      segment.leaveType === "Maternity" &&
      (!user || user.gender?.trim().toLowerCase() !== "female")
    )
      return "Maternity leave is only available for female employees";
    if (
      segment.leaveType === "Maternity" &&
      (!user || user.employeeType !== "Confirmed")
    )
      return "Maternity leave is only available for Confirmed employees";
    if (segment.leaveType === "Maternity" && segment.dates.fromDuration === "full") {
      const from = new Date(segment.dates.from);
      const to = new Date(segment.dates.to || segment.dates.from);
      let days = calculateLeaveDays(segment);
      if (days !== 90) return "Maternity leave must be exactly 90 days";
    }
    if (segment.leaveType === "Maternity" && segment.dates.fromDuration === "half")
      return "Maternity leave cannot be applied as a half-day leave";
    if (
      segment.leaveType === "Paternity" &&
      (!user || user.gender?.trim().toLowerCase() !== "male")
    ) {
      return "Paternity leave is only available for male employees";
    }
    if (
      segment.leaveType === "Paternity" &&
      (!user || user.employeeType !== "Confirmed")
    ) {
      return "Paternity leave is only available for Confirmed employees";
    }
    if (segment.leaveType === "Paternity" && segment.dates.fromDuration === "full") {
      const from = new Date(segment.dates.from);
      const to = new Date(segment.dates.to || segment.dates.from);
      let days = calculateLeaveDays(segment);
      if (days !== 7) return "Paternity leave must be exactly 7 days";
    }
    if (segment.leaveType === "Paternity" && segment.dates.fromDuration === "half")
      return "Paternity leave cannot be applied as a half-day leave";
    return null;
  };

const handleSubmit = async (e) => {
  e.preventDefault();

  for (const segment of leaveSegments) {
    const validationError = validateSegment(segment, leaveSegments.indexOf(segment));
    if (validationError) {
      alert(`Error in Leave Segment ${leaveSegments.indexOf(segment) + 1}: ${validationError}`);
      return;
    }
  }

  setSubmitting(true);

  try {
    // 1️⃣ Fetch compositeLeaveId only if multiple segments
    let compositeLeaveId = null;
    if (leaveSegments.length > 1) {
      const idRes = await api.get("/leaves/next-composite-id");
      compositeLeaveId = idRes.data.compositeLeaveId;
    }

    // 2️⃣ Submit each segment individually (your existing style)
    for (const segment of leaveSegments) {
      const leaveData = new FormData();
      leaveData.append("leaveType", segment.leaveType);
      leaveData.append("fullDay[from]", segment.dates.from || "");
      leaveData.append("fullDay[fromDuration]", segment.dates.fromDuration);
      if (segment.dates.fromDuration === "half") {
        leaveData.append("fullDay[fromSession]", segment.dates.fromSession);
      }
      if (segment.dates.to) {
        leaveData.append("fullDay[to]", segment.dates.to);
        leaveData.append("fullDay[toDuration]", segment.dates.toDuration);
        if (segment.dates.toDuration === "half") {
          leaveData.append("fullDay[toSession]", segment.dates.toSession);
        }
      }
      leaveData.append("reason", commonFields.reason);
      leaveData.append("chargeGivenTo", commonFields.chargeGivenTo);
      leaveData.append("emergencyContact", commonFields.emergencyContact);
      if (segment.leaveType === "Compensatory") {
        leaveData.append("compensatoryEntryId", segment.compensatoryEntryId);
      }
      if (segment.leaveType === "Restricted Holidays") {
        leaveData.append("restrictedHoliday", segment.restrictedHoliday);
      }
      leaveData.append("projectDetails", segment.projectDetails);
      leaveData.append("user", user.id);
      if (segment.medicalCertificate) {
        leaveData.append("medicalCertificate", segment.medicalCertificate);
      }
      leaveData.append("isEmergency", segment.isEmergency);

      // 3️⃣ Add compositeLeaveId only if it exists
      if (compositeLeaveId) {
        leaveData.append("compositeLeaveId", compositeLeaveId);
      }

      await api.post("/leaves", leaveData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (segment.isEmergency) {
        try {
          await api.patch(`/employees/${user.id}/emergency-leave-disable`);
          setCanApplyEmergencyLeave(false);
        } catch (disableError) {
          console.error("Error disabling emergency leave toggle:", disableError);
        }
      }
    }

    // 4️⃣ Post-submission cleanup
    alert("Leave form submitted successfully");
    setLeaveSegments([
      {
        leaveType: "",
        isEmergency: false,
        dates: {
          from: "",
          to: "",
          fromDuration: "full",
          fromSession: "forenoon",
          toDuration: "full",
          toSession: "forenoon",
        },
        compensatoryEntryId: "",
        restrictedHoliday: restrictedHolidays.length > 0 ? restrictedHolidays[0].value : "",
        projectDetails: "",
        medicalCertificate: null,
      },
    ]);
    setCommonFields({
      reason: "",
      chargeGivenTo: "",
      emergencyContact: "",
    });

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

    const employeeRes = await api.get("/employees/department");
    setEmployees(employeeRes.data);

  } catch (err) {
    console.error("Leave submit error:", err.response?.data || err.message);
    const errorMessage =
      err.response?.data?.message || "An error occurred while submitting the leave";
    alert(`Error: ${errorMessage}`);
  } finally {
    setSubmitting(false);
  }
};

  const today = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(today.getTime() + istOffset);
  istTime.setUTCHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(istTime);
  sevenDaysAgo.setDate(istTime.getDate() - 7);
  const tomorrow = new Date(istTime);
  tomorrow.setDate(istTime.getDate() + 1);
  const minDateMedical = sevenDaysAgo.toISOString().split("T")[0];
  const maxDateMedical = istTime.toISOString().split("T")[0];
  const minDateOther = tomorrow.toISOString().split("T")[0];
  const currentDate = istTime.toISOString().split("T")[0];

  const getCalendarDates = () => {
    const dates = [];
    leaveSegments.forEach((segment) => {
      if (segment.dates.from) {
        const from = new Date(segment.dates.from);
        dates.push(from);
        if (segment.dates.to) {
          const to = new Date(segment.dates.to);
          let current = new Date(from);
          while (current <= to) {
            dates.push(new Date(current));
            current.setDate(current.getDate() + 1);
          }
        }
      }
    });
    return dates;
  };

  const isHoliday = (date) => {
    const holidayList = [
      { month: 0, day: 26 }, // Republic Day
      { month: 2, day: 14 }, // Holi
      { month: 7, day: 15 }, // Independence Day
      { month: 9, day: 2 },  // Gandhi Jayanti
      { month: 9, day: 21 }, // Diwali
      { month: 9, day: 22 }, // Vishwakarma Day
      { month: 10, day: 5 }, // Guru Nanak Jayanti
    ];

    return (
      holidayList.some(h => date.getDate() === h.day && date.getMonth() === h.month) ||
      date.getDay() === 0
    );
  };

  const restrictedHolidayList = [
    { label: "Raksha Bandhan", date: new Date(2025, 7, 9) },
    { label: "Janmashtami", date: new Date(2025, 7, 16) },
    { label: "Karva Chauth", date: new Date(2025, 9, 9) },
    { label: "Christmas", date: new Date(2025, 11, 25) },
  ];

  const isRestrictedHoliday = (date) => {
    return restrictedHolidayList.some(
      (rh) => rh.date.toDateString() === date.toDateString()
    );
  };

  const tileClassName = ({ date, view }) => {
    if (view === "month") {
      const classes = [];

      if (isHoliday(date)) classes.push("bg-red-200");
      if (isRestrictedHoliday(date)) classes.push("restricted-holiday");
      if (date.getDay() === 0) classes.push("sun");

      if (getCalendarDates().some(d => d.toDateString() === date.toDateString())) {
        classes.push("bg-blue-200");
      }

      return classes.join(" ");
    }
    return "";
  };

  const formatDate = (isoDate) => {
    const [year, month, day] = isoDate.split("-");
    return `${day}-${month}-${year}`;
  };

  const getTotalCasualLeaveDays = () => {
    return leaveSegments
      .filter((segment) => segment.leaveType === "Casual")
      .reduce((sum, segment) => sum + calculateLeaveDays(segment), 0);
  };

  const isLWPTaken = () => {
    return leaveSegments.some(segment => segment.leaveType === "Leave Without Pay(LWP)");
  };

  const getLeaveTypes = () => {
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
    return baseTypes;
  };

  const getLeaveBalanceDisplay = () => {
    const isConfirmed = user?.employeeType === "Confirmed";
    const clTotal = isConfirmed ? 12 : 1; // 12/year for Confirmed, 1/year for others
    
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
        
          balance:leaveBalances.medicalLeaves,
            availed: 7 - leaveBalances.medicalLeaves,
          total: 7,
        },
        {
          type: "Restricted Holidays",
         
          balance:leaveBalances.restrictedHolidays,
           availed: 1 - leaveBalances.restrictedHolidays,
          total: 1,
        }
      );
    }
    return balances;
  };

  return (
    <ContentLayout title="Apply for Leave">
      <div className="flex flex-col md:flex-row gap-6">
        <div className="mb-6">
          <h4 className="text-md font-medium mb-2">Leave Balances</h4>
          <div className="grid grid-cols-1 gap-4">
            {getLeaveBalanceDisplay().map((balance, index) => (
              <div
                key={index}
                className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-pointer"
              >
                <h5 className="text-sm font-semibold text-blue-800 mb-2">{balance.type}</h5>
                <div className="text-sm text-gray-700 space-y-1">
                  <span>Availed: {balance.availed}</span><br></br>
                  <span>Balance: {balance.type === "Leave Without Pay (LWP)" ? "N/A" : balance.balance}</span><br></br>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1 max-w-xl">
          <Card className="shadow-lg border">
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                {leaveSegments.map((segment, index) => (
                  <div key={index} className="border-b pb-6 mb-6">
                    <h3 className="text-2xl font-semibold mb-4 text-green-700 text-center">
                      {segment.isEmergency ? "Leave Form" : "Leave Form"}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {canApplyEmergencyLeave && (
                        <div className="col-span-2">
                          <Label className="text-blue-800">Leave Category</Label>
   <Select
            onValueChange={(value) =>
              handleSegmentChange(index, { target: { name: "isEmergency", value } })
            }
            value={segment.isEmergency.toString()}
            disabled={true} // Disable the entire select for all segments
          >
            <SelectTrigger className="bg-white text-blue-900 font-bold border-gray-700">
              <SelectValue placeholder="Select emergency status" />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 text-white border-gray-700">
              <SelectItem value="false" disabled={segment.isEmergency} className="hover:bg-gray-700">Regular Leave</SelectItem>
              <SelectItem value="true" disabled={!segment.isEmergency} className="hover:bg-gray-700">Emergency Leave</SelectItem>
            </SelectContent>
          </Select>
                        </div>
                      )}
                      <div className="col-span-2">
                        <Label htmlFor={`leaveType-${index}`} className="text-blue-800">Leave Type</Label>
                        <Select
                          onValueChange={(value) =>
                            handleSegmentChange(index, { target: { name: "leaveType", value } })
                          }
                          value={segment.leaveType}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select leave type" />
                          </SelectTrigger>
                          <SelectContent>
                            {getLeaveTypes().map((type) => (
                              <SelectItem
                                key={type.value}
                                value={type.value}
                                disabled={
                                  (type.value === "Casual" && index > 0 && leaveSegments[0].leaveType === "Casual" && getTotalCasualLeaveDays() >= 3) ||
                                  (type.value === "Restricted Holidays" && index > 0 && leaveSegments[0].leaveType === "Restricted Holidays" && calculateLeaveDays(leaveSegments[0]) >= 1) ||
                                  (type.value === "Leave Without Pay(LWP)" && isLWPTaken() && segment.leaveType !== "Leave Without Pay(LWP)")
                                }
                              >
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Label htmlFor={`dates.from-${index}`} className="text-blue-800">From Date</Label>
                        <div className="flex items-center gap-6">
                          <Input
                            id={`dates.from-${index}`}
                            name="dates.from"
                            type="date"
                            value={segment.dates.from}
                            onChange={(e) => handleSegmentChange(index, e)}
                            min={segment.leaveType === "Medical" ? minDateMedical : segment.isEmergency ? currentDate : minDateOther}
                            max={segment.leaveType === "Medical" ? maxDateMedical : segment.isEmergency ? currentDate : ""}
                            disabled={segment.isEmergency}
                            className="flex-1"
                          />
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-4">
                              <label className="flex items-center">
                                <input
                                  type="radio"
                                  name={`fromDuration-${index}`}
                                  value="full"
                                  checked={segment.dates.fromDuration === "full"}
                                  onChange={(e) => handleSegmentChange(index, e)}
                                  className="mr-2"
                                /> Full Day
                              </label>
                              <label className="flex items-center">
                                <input
                                  type="radio"
                                  name={`fromDuration-${index}`}
                                  value="half"
                                  checked={segment.dates.fromDuration === "half"}
                                  onChange={(e) => handleSegmentChange(index, e)}
                                  className="mr-2"
                                /> Half Day
                              </label>
                            </div>
                            {segment.dates.fromDuration === "half" && (
                              <div className="ml-6 mt-2">
                                <select
                                  name={`fromSession-${index}`}
                                  value={segment.dates.fromSession}
                                  onChange={(e) => handleSegmentChange(index, e)}
                                  className="border rounded px-3 py-2 mt-1 w-40 text-sm"
                                >
                                  <option value="forenoon">Forenoon</option>
                                  <option value="afternoon">Afternoon</option>
                                </select>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <Label htmlFor={`dates.to-${index}`} className="text-blue-800">To Date</Label>
                        <div className="flex items-center gap-6">
                          <Input
                            id={`dates.to-${index}`}
                            name="dates.to"
                            type="date"
                            value={segment.dates.to}
                            onChange={(e) => handleSegmentChange(index, e)}
                            min={segment.dates.from || minDateOther}
                            max={
                              segment.leaveType === "Medical" && segment.dates.from
                                ? new Date(new Date(segment.dates.from).setDate(new Date(segment.dates.from).getDate() + 6))
                                    .toISOString()
                                    .split("T")[0]
                                : segment.isEmergency
                                ? currentDate
                                : ""
                            }
                            disabled={
                              segment.dates.fromDuration === "half" && segment.dates.fromSession === "forenoon" ||
                              segment.leaveType === "Restricted Holidays"
                            }
                            className="flex-1"
                          />
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-4">
                              <label className="flex items-center">
                                <input
                                  type="radio"
                                  name={`toDuration-${index}`}
                                  value="full"
                                  checked={segment.dates.toDuration === "full"}
                                  onChange={(e) => handleSegmentChange(index, e)}
                                  className="mr-2"
                                /> Full Day
                              </label>
                              <label className="flex items-center">
                                <input
                                  type="radio"
                                  name={`toDuration-${index}`}
                                  value="half"
                                  checked={segment.dates.toDuration === "half"}
                                  onChange={(e) => handleSegmentChange(index, e)}
                                  className="mr-2"
                                /> Half Day
                              </label>
                            </div>
                            {segment.dates.toDuration === "half" && (
                              <div className="ml-6 mt-2">
                                <select
                                  name={`toSession-${index}`}
                                  value={segment.dates.toSession}
                                  onChange={(e) => handleSegmentChange(index, e)}
                                  className="border rounded px-3 py-2 mt-1 w-40 text-sm"
                                >
                                  <option value="forenoon">Forenoon</option>
                                  <option value="afternoon" disabled>Afternoon</option>
                                </select>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="col-span-2 flex items-center justify-between">
                        <div>
                          <Label className="text-blue-800">Leave Days</Label>
                          <p className="mt-1 text-sm text-green-700">
                            {calculateLeaveDays(segment)} days
                          </p>
                          {getTotalCasualLeaveDays() > 3 && segment.leaveType === "Casual" && (
                            <p className="text-sm text-red-600 mt-1">
                              Max 3 consecutive Casual Leaves (CL) can be availed.
                            </p>
                          )}
                          {segment.leaveType === "Restricted Holidays" && 
                            segment.dates.from && 
                            !restrictedHolidayDates.some(rh => 
                              rh.toDateString() === new Date(segment.dates.from).toDateString()
                            ) && (
                            <p className="text-sm text-red-600 mt-1">
                              Please select a valid Restricted Holiday date.
                            </p>
                          )}
                        </div>
                        <Button
                          type="button"
                          onClick={addLeaveSegment}
                          className="bg-green-600 hover:bg-green-700 text-white h-fit"
                        >
                          Add Leave
                        </Button>
                      </div>
                      {segment.leaveType === "Compensatory" && (
                        <>
                          <div className="col-span-2">
                            <Label htmlFor={`compensatoryBalance-${index}`} className="text-blue-800">
                              Compensatory Leave Balance
                            </Label>
                            <p className="mt-1 text-sm">{compensatoryBalance} hours</p>
                          </div>
                          <div className="col-span-2">
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
                                      {new Date(entry.date).toLocaleDateString()} -{" "}
                                      {entry.hours} hours
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-2">
                            <Label htmlFor={`projectDetails-${index}`} className="text-blue-800">Project Details</Label>
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
                        <div className="col-span-2">
                          <Label htmlFor={`restrictedHoliday-${index}`} className="text-blue-800">Restricted Holiday</Label>
                          <Select
                            onValueChange={(value) => handleRestrictedHolidayChange(index, value)}
                            value={segment.restrictedHoliday}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select holiday" />
                            </SelectTrigger>
                            <SelectContent>
                              {restrictedHolidayList.map((holiday) => (
                                <SelectItem key={holiday.label} value={holiday.label}>
                                  {holiday.label} - {holiday.date.toLocaleDateString()}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {segment.leaveType === "Medical" && segment.dates.fromDuration === "full" && (
                        <div className="col-span-2">
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
                            Note: If not uploaded now, you must submit a medical certificate within 24 hours of rejoining the office, then only your ML will be taken into consideration.
                          </p>
                        </div>
                      )}
                      {leaveSegments.length > 1 && (
                        <div className="col-span-2">
                          <Button
                            type="button"
                            onClick={() => removeLeaveSegment(index)}
                            className="bg-red-600 hover:bg-red-700 text-white"
                          >
                            Remove
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div className="col-span-2">
                  <Label htmlFor="reason" className="text-blue-800">Reason</Label>
                  <Textarea
                    id="reason"
                    name="reason"
                    value={commonFields.reason}
                    onChange={handleCommonFieldChange}
                    rows={3}
                    placeholder="Enter reason..."
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
                        placeholder={
                          employees.length === 0
                            ? "No available employees"
                            : "Select employee"
                        }
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
                  <Label htmlFor="emergencyContact" className="text-blue-800">Emergency Contact Add. & No.</Label>
                  <Input
                    id="emergencyContact"
                    name="emergencyContact"
                    type="text"
                    value={commonFields.emergencyContact}
                    onChange={handleCommonFieldChange}
                    placeholder="Enter emergency contact"
                  />
                </div>
                <div className="col-span-2 flex justify-end mt-4">
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {submitting ? "Submitting..." : "Submit All Leaves"}
                  </Button>
                </div>
                {leaveSegments.length > 0 && (
 <div className="col-span-2 mt-6">
  <h3 className="text-lg font-semibold mb-4 text-blue-800">Leave Summary</h3>

  <div className="overflow-x-auto">
    <table className="min-w-full border-collapse table-auto">
      <thead>
        <tr className="bg-gray-100">
          <th className="border p-2 text-left min-w-[80px]">Segment</th>
          <th className="border p-2 text-left min-w-[120px]">Leave Type</th>
          <th className="border p-2 text-left min-w-[140px]">From Date</th>
          <th className="border p-2 text-left min-w-[140px]">To Date</th>
          <th className="border p-2 text-left min-w-[80px]">Days</th>
        </tr>
      </thead>
      <tbody>
        {leaveSegments.map((segment, index) => (
          <tr key={index}>
            <td className="border p-2">{index + 1}</td>
            <td className="border p-2 truncate">{segment.leaveType || "Not selected"}</td>
            <td className="border p-2">
              {segment.dates.from ? formatDate(segment.dates.from) : "Not selected"}
            </td>
            <td className="border p-2">
              {segment.dates.to ? formatDate(segment.dates.to) : "Not selected"}
            </td>
            <td className="border p-2">{calculateLeaveDays(segment)} days</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>

                )}
              </form>
            </CardContent>
          </Card>
        </div>
        <div className="w-full md:w-80 bg-gray-50 p-4 rounded-lg shadow">
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
                <li>1. It is mandatory to plan your leaves and seek approvals in advance to avoid hampering time-bound tasks, especially for more than two consecutive leaves.</li>
                <li>2. A maximum of three (3) consecutive Casual Leaves (CL) can be availed at a time, irrespective of the available CL balance.</li>
                <li>3. Employees are allowed to choose one holiday per year from the list of Restricted Holidays.</li>
                <li>4. Extra leaves taken will be counted as without pay. No relaxation will be given in this regard.</li>
                <li>5. If an employee works on weekends or holidays, they may request compensatory leave after HOD approval.</li>
                <li>6. Leaves attached to Sundays or holidays require prior approval, else they will be considered as LEAVE WITHOUT PAY.</li>
                <li>7. Seven Medical leaves are permissible per year, availed in a maximum of 2 splits. For 3 or more consecutive days, a medical certificate is required within 24 hours of rejoining the office.</li>
                <li>8. Emergency Leave can be applied only for the current day with prior HOD approval.</li>
                <li>9. Leaves are not encashable.</li>
                <li>10. No leaves are permitted during the notice period.</li>
                <li>11. If a leave request for CL, ML, or Compensatory Off is rejected and still taken, the days will be subject to salary deduction.</li>
                <li>12. Absence without information for 3+ days may lead to warnings; 5+ days may result in termination.</li>
                <li>13. No short leaves are permitted; only Half Day or Full Day leaves are allowed.</li>
              </ul>
            </div>
          )}
          <div>
            <h4 className="text-md font-medium mb-2">Calendar</h4>
            <Calendar
              value={getCalendarDates()}
              tileClassName={tileClassName}
              minDate={new Date()}
            />
            <div className="mt-4 space-y-1 text-sm text-gray-700">
              <p><span className="inline-block w-4 h-4 bg-red-200 border border-red-400 mr-2"></span> Yearly Holiday (YH)</p>
              <p><span className="inline-block w-4 h-4 bg-purple-200 border border-purple-400 mr-2"></span> Restricted Holiday (RH)</p>
            </div>
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}

export default LeaveForm;