import React, { useState, useContext, useEffect } from 'react';
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import ContentLayout from './ContentLayout';
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import '../App.css';

function ODForm() {
  const { user } = useContext(AuthContext);
  
  const getCurrentDate = () => new Date().toISOString().split("T")[0];
  const getCurrentTime = () => {
    const now = new Date();
    return now.toTimeString().slice(0, 5);
  };

  const [form, setForm] = useState({
    dateOut: getCurrentDate(),
    timeOut: getCurrentTime(),
    dateIn: getCurrentDate(),
    timeIn: '',
    numberOfDays: '',
    purpose: '',
    placeUnitVisit: '',
    estimatedTime: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [quote, setQuote] = useState('');
  const [isSingleDay, setIsSingleDay] = useState(null);

  const quotes = [
    { text: "Success is where preparation and opportunity meet.", author: "Bobby Unser" },
    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { text: "Productivity is never an accident. It is always the result of a commitment to excellence.", author: "Paul J. Meyer" },
    { text: "Time is the most valuable thing a man can spend.", author: "Theophrastus" },
  ];

  useEffect(() => {
    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
    setQuote(`${randomQuote.text} — ${randomQuote.author}`);
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    let updatedForm = { ...form, [name]: value };

    // Calculate Date In based on No. of Days for multiple days
    if (isSingleDay === false && name === 'numberOfDays' && value) {
      const days = parseInt(value);
      if (!isNaN(days) && days > 0 && updatedForm.dateOut) {
        const dateOut = new Date(updatedForm.dateOut);
        dateOut.setDate(dateOut.getDate() + days - 1);
        updatedForm.dateIn = dateOut.toISOString().split("T")[0];
      } else {
        updatedForm.dateIn = updatedForm.dateOut;
      }
    }

    // Set Date In same as Date Out for single day
    if (isSingleDay === true && name === 'dateOut') {
      updatedForm.dateIn = value;
    }

    // Calculate Time In based on Estimated Time for single-day trips
    if (isSingleDay === true && (name === 'estimatedTime' || name === 'timeOut') && updatedForm.estimatedTime && updatedForm.timeOut) {
      const [hours, minutes] = updatedForm.timeOut.split(':').map(Number);
      const estimatedHours = parseFloat(updatedForm.estimatedTime);
      if (!isNaN(estimatedHours)) {
        const totalMinutes = hours * 60 + minutes + estimatedHours * 60;
        const newHours = Math.floor(totalMinutes / 60) % 24;
        const newMinutes = totalMinutes % 60;
        updatedForm.timeIn = `${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}`;
      } else {
        updatedForm.timeIn = '';
      }
    }

    setForm(updatedForm);
  };

  const handleTripTypeChange = (isSingle) => {
    setIsSingleDay(isSingle);
    setForm({
      dateOut: getCurrentDate(),
      timeOut: getCurrentTime(),
      dateIn: getCurrentDate(),
      timeIn: '',
      numberOfDays: '',
      purpose: '',
      placeUnitVisit: '',
      estimatedTime: '',
    });
  };

  const validateForm = () => {
    if (isSingleDay === null) return 'Please select trip type (Single Day or Multiple Days)';
    if (!form.dateOut) return 'Date Out is required';
    if (!form.timeOut) return 'Time Out is required';
    if (isSingleDay === false && !form.numberOfDays) return 'Number of Days is required';
    if (isSingleDay === false && form.dateOut && form.dateIn && new Date(form.dateOut) > new Date(form.dateIn)) {
      return 'Date Out must be before or equal to Date In';
    }
    if (isSingleDay === true && !form.timeIn && !form.estimatedTime) {
      return 'Estimated Time or Time In is required for single-day trips';
    }
    if (!form.purpose) return 'Purpose is required';
    if (!form.placeUnitVisit) return 'Place/Unit Visit is required';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      alert(validationError);
      return;
    }
    setSubmitting(true);
    try {
      const odData = {
        dateOut: form.dateOut,
        timeOut: form.timeOut,
        dateIn: form.dateIn,
        timeIn: form.timeIn || null,
        numberOfDays: form.numberOfDays || null,
        purpose: form.purpose,
        placeUnitVisit: form.placeUnitVisit,
        estimatedTime: form.estimatedTime || null,
        user: user.id,
      };
      await api.post('/od', odData);
      alert('OD request submitted successfully');
      setForm({
        dateOut: getCurrentDate(),
        timeOut: getCurrentTime(),
        dateIn: getCurrentDate(),
        timeIn: '',
        numberOfDays: '',
        purpose: '',
        placeUnitVisit: '',
        estimatedTime: '',
      });
      setIsSingleDay(null);
    } catch (err) {
      console.error('OD submit error:', err.response?.data || err.message);
      const errorMessage = err.response?.data?.message || 'An error occurred while submitting the OD request';
      alert(`Error: ${errorMessage}`);
    } finally {
      setSubmitting(false);
    }
  };

  const getCalendarDates = () => {
    const dates = [];
    if (form.dateOut) {
      const from = new Date(form.dateOut);
      dates.push(from);
      if (form.dateIn) {
        const to = new Date(form.dateIn);
        let current = new Date(from);
        while (current <= to) {
          dates.push(new Date(current));
          current.setDate(current.getDate() + 1);
        }
      }
    }
    return dates;
  };

  const isHoliday = (date) => {
    const holidayList = [
      { month: 0, day: 26 },  // Republic Day
      { month: 2, day: 14 },  // Holi
      { month: 7, day: 15 },  // Independence Day
      { month: 9, day: 2 },   // Gandhi Jayanti
      { month: 9, day: 21 },  // Diwali
      { month: 9, day: 22 },  // Vishwakarma Day
      { month: 10, day: 5 },  // Guru Nanak Jayanti
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

return (
  <ContentLayout title="Apply for OD">
    <div className="flex flex-col md:flex-row gap-6 max-w-9xl mx-auto">
      {/* Left Side: Important Notes */}
      <div className="w-full md:w-[30%] bg-gray-50 p-4 rounded-lg shadow">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-red-700 mb-4">Important Notes</h3>
          <div className="text-sm text-gray-600">
            <ol className="list-decimal pl-5 space-y-2">
              <li>Person on OD should submit daily report to their immediate Head via email at contact@accelorindia.com.</li>
              <li>Submit a report/PPT on returning back to immediate Head and O/o Admin.</li>
              <li>Person on OD should submit their duly signed TA Bills to O/o Admin within two days of joining the office.</li>
            </ol>
            </div>
          </CardContent>
        </div>

        {/* Center: Form */}
        <div className="flex-grow min-w-[40%] h-[600px] w-full">
          <Card className="shadow-lg border">
            <CardContent className="p-6">
              <h3 className="text-2xl font-semibold text-green-700 text-center mb-4">OD Form</h3>
              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Trip Type Selection */}
                <div className="col-span-1 md:col-span-2">
                  <Label className="text-blue-800">OD Type</Label>
                  <div className="flex gap-4 mt-2">
                    <Button
                      type="button"
                      onClick={() => handleTripTypeChange(true)}
                      className={`w-full max-w-xs ${isSingleDay === true ? 'bg-blue-600 text-white' : '!bg-blue-100 text-gray-700'}`}
                    >
                      Single Day
                    </Button>
                    <Button
                      type="button"
                      onClick={() => handleTripTypeChange(false)}
                      className={`w-full max-w-xs ${isSingleDay === false ? 'bg-blue-600 text-white' : '!bg-blue-100 text-gray-700'}`}
                    >
                      Multiple Days
                    </Button>
                  </div>
                </div>

                {/* Date and Time Section - Always Visible */}
                <div className="col-span-1">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="dateOut" className="text-blue-800">Date Out</Label>
                      <Input
                        id="dateOut"
                        name="dateOut"
                        type="date"
                        value={form.dateOut}
                        onChange={handleChange}
                        min={getCurrentDate()}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="numberOfDays" className="text-blue-800">Number of Days</Label>
                      <Input
                        id="numberOfDays"
                        name="numberOfDays"
                        type="number"
                        min="1"
                        value={form.numberOfDays}
                        onChange={handleChange}
                        placeholder="e.g., 2"
                        disabled={isSingleDay === true}
                      />
                    </div>
                    <div>
                      <Label htmlFor="dateIn" className="text-blue-800">Date In</Label>
                      <Input
                        id="dateIn"
                        name="dateIn"
                        type="date"
                        value={form.dateIn}
                        onChange={handleChange}
                        min={form.dateOut || getCurrentDate()}
                        readOnly={isSingleDay === true}
                      />
                    </div>
                  </div>
                </div>
                <div className="col-span-1">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="timeOut" className="text-blue-800">Time Out</Label>
                      <Input
                        id="timeOut"
                        name="timeOut"
                        type="time"
                        value={form.timeOut}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="estimatedTime" className="text-blue-800">Estimated Time (Hours)</Label>
                      <Input
                        id="estimatedTime"
                        name="estimatedTime"
                        type="number"
                        step="0.5"
                        min="0"
                        value={form.estimatedTime}
                        onChange={handleChange}
                        placeholder="e.g., 2.5"
                      
                      />
                    </div>
                    <div>
                      <Label htmlFor="timeIn" className="text-blue-800">Time In</Label>
                      <Input
                        id="timeIn"
                        name="timeIn"
                        type="time"
                        value={form.timeIn}
                        onChange={handleChange}
                        readOnly={isSingleDay && form.estimatedTime !== ''}
                      />
                    </div>
                  </div>
                </div>
                {/* Purpose and Place Section */}
                <div className="col-span-1 md:col-span-2">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="purpose" className="text-blue-800">Purpose</Label>
                      <Textarea
                        id="purpose"
                        name="purpose"
                        value={form.purpose}
                        onChange={handleChange}
                        rows={3}
                        placeholder="Enter purpose..."
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="placeUnitVisit" className="text-blue-800">Place/Unit Visit</Label>
                      <Input
                        id="placeUnitVisit"
                        name="placeUnitVisit"
                        type="text"
                        value={form.placeUnitVisit}
                        onChange={handleChange}
                        placeholder="Enter place/unit visit"
                        required
                      />
                    </div>
                  </div>
                </div>
                <div className="col-span-1 md:col-span-2 flex justify-center mt-4">
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full max-w-xs bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {submitting ? 'Submitting...' : 'Submit OD'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Quote and Calendar */}
        <div className="w-full md:w-[30%] space-y-6">
          <Card className="shadow-lg border bg-gradient-to-br from-gray-50 to-pink-100">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-red-700 mb-4">Quote of the Day</h3>
              <p className="text-gray-700 italic">"{quote}"</p>
            </CardContent>
          </Card>

          <Card className="shadow-lg border bg-gray-50">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-4 text-green-700">Calendar</h3>
              <Calendar
                value={getCalendarDates()}
                tileClassName={tileClassName}
                minDate={new Date()}
              />
              <div className="mt-4 space-y-1 text-sm text-gray-700">
                <p><span className="inline-block w-4 h-4 bg-red-200 border border-red-400 mr-2"></span> Yearly Holiday (YH)</p>
                <p><span className="inline-block w-4 h-4 bg-purple-200 border border-purple-400 mr-2"></span> Restricted Holiday (RH)</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ContentLayout>
);
}

export default ODForm;