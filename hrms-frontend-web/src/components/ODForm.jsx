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

  const [form, setForm] = useState({
    dateOut: getCurrentDate(),
    timeOut: '09:00', // Default for Single Day OD
    dateIn: getCurrentDate(),
    timeIn: '17:30', // Default for Single Day OD
    numberOfDays: '',
    purpose: '',
    placeUnitVisit: '',
    estimatedTime: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [quote, setQuote] = useState('');
  const [tripType, setTripType] = useState(null); // Changed from isSingleDay to tripType for clarity

  const quotes = [
    { text: "Success is where preparation and opportunity meet.", author: "Bobby Unser" },
    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { text: "Productivity is never an accident. It is always the result of a commitment to excellence.", author: "Paul J. Meyer" },
    { text: "Time is the most valuable thing a man can spend.", author: "Theophrastus" },
    { text: "Find your calm.", author: "Gabi Garcia" },
    { text: "A person is but the product of their thoughts. What they think, they become.", author: "Mahatma Gandhi" },
    { text: "All great achievements require time.", author: "Maya Angelou" },
    { text: "There are only two ways to live your life. One is as though nothing is a miracle. The other is as though everything is a miracle.", author: "Albert Einstein" },
    { text: "Low self esteem is like driving through life with your handbrake on.", author: "Maxwell Maltz" },
    { text: "Do more with less.", author: "Johit Joe" },
    { text: "Life shrinks or expands in proportion with one’s courage.", author: "Anais Nin" },
    { text: "What do you do with a mistake: recognize it, admit it, learn from it, forget it.", author: "Dean Smith" },
    { text: "If you are always trying to be normal you will never know how amazing you can be.", author: "Maya Angelou" },
    { text: "Perfection is not attainable, but if we chase perfection, we can catch excellence.", author: "Vince Lombardi" },
    { text: "Showing off is the fool's idea of glory.", author: "Bruce Lee" },
    { text: "Remember that failure is an event, not a person.", author: "Zig Ziglar" },
    { text: "Adapt what is useful, reject what is useless, and add what is specifically your own.", author: "Bruce Lee" },
    { text: "Inside of every problem lies an opportunity.", author: "Robert Kiyosaki" },
    { text: "Nobody ever got ready by waiting. You only get ready by starting.", author: "John C. Maxwell" },
    { text: "Never let success get to your head, and never let failure get to your heart.", author: "Drake" },
  ];

  useEffect(() => {
    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
    setQuote(`${randomQuote.text} — ${randomQuote.author}`);
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    let updatedForm = { ...form, [name]: value };

    // For Multiple Days OD: Calculate Date In based on Number of Days
    if (tripType === 'multiple' && name === 'numberOfDays' && value) {
      const days = parseInt(value);
      if (!isNaN(days) && days > 0 && updatedForm.dateOut) {
        const dateOut = new Date(updatedForm.dateOut);
        dateOut.setDate(dateOut.getDate() + days - 1);
        updatedForm.dateIn = dateOut.toISOString().split("T")[0];
      } else {
        updatedForm.dateIn = updatedForm.dateOut;
      }
    }

    // For Single Day OD and Hour-Based OD: Set Date In same as Date Out
    if ((tripType === 'single' || tripType === 'hour') && name === 'dateOut') {
      updatedForm.dateIn = value;
    }

    // For Hour-Based OD: Calculate Time In based on Estimated Time
    if (tripType === 'hour' && (name === 'estimatedTime' || name === 'timeOut') && updatedForm.estimatedTime && updatedForm.timeOut) {
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

  const handleTripTypeChange = (type) => {
    setTripType(type);
    const baseForm = {
      dateOut: getCurrentDate(),
      timeOut: type === 'single' ? '09:00' : getCurrentDate(),
      dateIn: getCurrentDate(),
      timeIn: type === 'single' ? '17:30' : '',
      numberOfDays: '',
      purpose: '',
      placeUnitVisit: '',
      estimatedTime: '',
    };
    setForm(baseForm);
  };

  const validateForm = () => {
    if (tripType === null) return 'Please select trip type';
    if (!form.dateOut) return 'Date Out is required';
    if (!form.timeOut) return 'Time Out is required';
    if (tripType === 'multiple' && !form.numberOfDays) return 'Number of Days is required';
    if (tripType === 'multiple' && form.dateOut && form.dateIn && new Date(form.dateOut) > new Date(form.dateIn)) {
      return 'Date Out must be before or equal to Date In';
    }
    if (tripType === 'hour' && !form.estimatedTime) {
      return 'Estimated Time is required for hour-based trips';
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
        timeIn: tripType === 'multiple' ? null : form.timeIn,
        numberOfDays: tripType === 'multiple' ? form.numberOfDays : null,
        purpose: form.purpose,
        placeUnitVisit: form.placeUnitVisit,
        estimatedTime: tripType === 'hour' ? form.estimatedTime : null,
        user: user.id,
        tripType, // Include tripType in the submission
      };
      await api.post('/od', odData);
      alert('OD request submitted successfully');
      setForm({
        dateOut: getCurrentDate(),
        timeOut: tripType === 'single' ? '09:00' : getCurrentDate(),
        dateIn: getCurrentDate(),
        timeIn: tripType === 'single' ? '17:30' : '',
        numberOfDays: '',
        purpose: '',
        placeUnitVisit: '',
        estimatedTime: '',
      });
      setTripType(null);
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
    <ContentLayout title="Apply for ON Duty(OD)">
      {tripType === null ? (
        <div className="flex items-center justify-center min-h-[500px] bg-white">
          <Card className="shadow-2xl border border-gray-100 max-w-2xl w-full rounded-3xl overflow-hidden bg-gradient-to-br from-gray-50 via-white to-gray-50 transition-transform duration-300 hover:scale-[1.02]">
            <CardContent className="p-10 text-center">
              <h2 className="text-3xl font-extrabold text-indigo-800 mb-4 tracking-tight">Select OD Type</h2>
              <p className="text-gray-700 mb-8 text-lg leading-relaxed">
                Choose the type of OD to proceed with your application.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center flex-wrap">
                <Button
                  onClick={() => handleTripTypeChange('hour')}
                  className="w-full sm:w-48 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-semibold py-3 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1 focus:outline-none focus:ring-4 focus:ring-indigo-300"
                >
                  🕒 Hour-Based OD
                </Button>
                <Button
                  onClick={() => handleTripTypeChange('single')}
                  className="w-full sm:w-48 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-semibold py-3 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1 focus:outline-none focus:ring-4 focus:ring-indigo-300"
                >
                  🗓️ Single Day OD
                </Button>
                <Button
                  onClick={() => handleTripTypeChange('multiple')}
                  className="w-full sm:w-48 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-semibold py-3 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1 focus:outline-none focus:ring-4 focus:ring-indigo-300"
                >
                  📆 Multiple Days OD
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto px-4">
          {/* Left Side: Important Notes */}
          <div className="w-full lg:w-1/4 bg-gray-50 p-4 rounded-lg shadow">
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
          <div className="flex-grow w-full lg:w-2/4">
            <Card className="shadow-lg border">
              <CardContent className="p-6">
                <h3 className="text-2xl font-semibold text-green-700 text-center mb-6">
                  {tripType === 'hour' ? 'Hour-Based OD Form' : tripType === 'single' ? 'Single Day OD Form' : 'Multiple Days OD Form'}
                </h3>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 gap-6">
                    {/* Date and Time Section */}
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
                          className="w-full"
                        />
                      </div>
                      {tripType === 'multiple' && (
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
                            required
                            className="w-full"
                          />
                        </div>
                      )}
                      {tripType === 'multiple' && (
                        <div>
                          <Label htmlFor="dateIn" className="text-blue-800">Date In</Label>
                          <Input
                            id="dateIn"
                            name="dateIn"
                            type="date"
                            value={form.dateIn}
                            onChange={handleChange}
                            min={form.dateOut || getCurrentDate()}
                            required
                            className="w-full"
                          />
                        </div>
                      )}
                      <div>
                        <Label htmlFor="timeOut" className="text-blue-800">Time Out</Label>
                        <Input
                          id="timeOut"
                          name="timeOut"
                          type="time"
                          value={form.timeOut}
                          onChange={handleChange}
                          required
                          className="w-full"
                        />
                      </div>
                      {tripType === 'hour' && (
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
                            required
                            className="w-full"
                          />
                        </div>
                      )}
                      {(tripType === 'hour' || tripType === 'single') && (
                        <div>
                          <Label htmlFor="timeIn" className="text-blue-800">Time In</Label>
                          <Input
                            id="timeIn"
                            name="timeIn"
                            type="time"
                            value={form.timeIn}
                            onChange={handleChange}
                            readOnly={tripType === 'hour' && form.estimatedTime !== ''}
                            className="w-full"
                          />
                        </div>
                      )}
                    </div>
                    {/* Purpose and Place Section */}
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="purpose" className="text-blue-800">Purpose</Label>
                        <Textarea
                          id="purpose"
                          name="purpose"
                          value={form.purpose}
                          onChange={handleChange}
                          rows={4}
                          placeholder="Enter purpose..."
                          required
                          className="w-full"
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
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between mt-6">
                    <Button
                      type="button"
                      onClick={() => setTripType(null)}
                      className="w-40 bg-gray-500 hover:bg-gray-600 text-white"
                    >
                      Back to OD Type
                    </Button>
                    <Button
                      type="submit"
                      disabled={submitting}
                      className="w-40 bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {submitting ? 'Submitting...' : 'Submit OD'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Right Side: Quote and Calendar */}
          <div className="w-full lg:w-1/4 space-y-6">
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
      )}
    </ContentLayout>
  );
}

export default ODForm;