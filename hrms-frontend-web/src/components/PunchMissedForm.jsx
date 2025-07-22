import React, { useState, useContext, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import ContentLayout from './ContentLayout';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '../components/ui/select';

function PunchMissedForm() {
  const { user } = useContext(AuthContext);
  const [formData, setFormData] = useState({
    punchMissedDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }), // YYYY-MM-DD in IST
    when: 'Time IN',
    yourInput: '',
    reason: '',
  });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);
  const [canSubmit, setCanSubmit] = useState(false);

  // Calculate min and max dates for the current month only
  const today = new Date();
  const maxDate = today.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // Today in YYYY-MM-DD
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const minDate = firstDayOfMonth.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // First day of current month

  useEffect(() => {
    const checkSubmissionLimit = async () => {
      try {
        const res = await api.get('/punch-missed/check-limit');
        setCanSubmit(res.data.canSubmit);
        if (!res.data.canSubmit) {
          setError('You have already submitted a Punch Missed Form this month.');
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to check submission limit');
      }
    };
    if (user) {
      checkSubmissionLimit();
    }
  }, [user]);

  const handleChange = (name, value) => {
    setFormData({ ...formData, [name]: value });
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) {
      setError('Submission limit reached for this month.');
      return;
    }
    const punchMissedDateIST = new Date(formData.punchMissedDate);
    if (isNaN(punchMissedDateIST)) {
      setError('Invalid Punch Missed Date format.');
      return;
    }
    const todayIST = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    if (punchMissedDateIST > new Date(todayIST)) {
      setError('Punch Missed Date cannot be in the future.');
      return;
    }
    if (!/^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/i.test(formData.yourInput)) {
      setError('Your Input must be in valid time format (e.g., 09:30 AM).');
      return;
    }
    if (!formData.reason.trim()) {
      setError('Reason is required.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/punch-missed', formData);
      setSuccess('Punch Missed Form submitted successfully.');
      setFormData({
        punchMissedDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
        when: 'Time IN',
        yourInput: '',
        reason: '',
      });
      setCanSubmit(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit form');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ContentLayout title="Punch Missed Form">
      <Card className="w-full max-w-4xl mx-auto shadow-xl border border-gray-200 rounded-xl">
        <CardContent className="p-8">
          <div className="mb-6 bg-gray-100 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-blue-800">Submission Guidelines</h3>
            <ul className="list-disc list-inside text-sm text-gray-700 mt-2">
              <li>You can submit only one Punch Missed Form per month.</li>
              <li>Submissions are allowed for the current month only.</li>
              <li>Future dates are disabled until they become current.</li>
              <li>Ensure timely submission with accurate time information (e.g., 09:30 AM).</li>
              <li>Ensure regular punching to prevent discrepancies and correction submissions.</li>
            </ul>
          </div>
          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg flex items-center">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}
          {success && (
            <div className="mb-6 p-4 bg-green-50 text-green-700 rounded-lg flex items-center">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {success}
            </div>
          )}
          <motion.form
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="punchMissedDate" className="text-sm font-medium text-gray-700">Punch Missed Date</Label>
              <Input
                id="punchMissedDate"
                name="punchMissedDate"
                type="date"
                value={formData.punchMissedDate}
                onChange={(e) => handleChange('punchMissedDate', e.target.value)}
                className="mt-1 border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md shadow-sm"
                disabled={loading || !canSubmit}
                min={minDate}
                max={maxDate}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="when" className="text-sm font-medium text-gray-700">Choose Punch Type</Label>
              <Select
                onValueChange={(value) => handleChange('when', value)}
                value={formData.when}
                disabled={loading || !canSubmit}
              >
                <SelectTrigger
                  id="when"
                  className="mt-1 border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md shadow-sm"
                >
                  <SelectValue placeholder="Select Time" />
                </SelectTrigger>
                <SelectContent className="z-50 bg-white shadow-lg rounded-md">
                  <SelectItem value="Time IN">Time IN</SelectItem>
                  <SelectItem value="Time OUT">Time OUT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="yourInput" className="text-sm font-medium text-gray-700">Your Input (e.g., 09:30 AM)</Label>
              <Input
                id="yourInput"
                name="yourInput"
                value={formData.yourInput}
                onChange={(e) => handleChange('yourInput', e.target.value)}
                placeholder="Enter time (e.g., 09:30 AM)"
                className="mt-1 border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md shadow-sm"
                disabled={loading || !canSubmit}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="reason" className="text-sm font-medium text-gray-700">Reason</Label>
              <Input
                id="reason"
                name="reason"
                value={formData.reason}
                onChange={(e) => handleChange('reason', e.target.value)}
                placeholder="Enter reason for missing punch"
                className="mt-1 border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md shadow-sm"
                disabled={loading || !canSubmit}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="adminInput" className="text-sm font-medium text-gray-700">Admin Input</Label>
              <Input
                id="adminInput"
                name="adminInput"
                value=""
                readOnly
                className="mt-1 border-gray-300 bg-gray-100 cursor-not-allowed rounded-md shadow-sm"
                placeholder="To be filled by Admin"
              />
            </div>
            <div className="flex gap-4 items-end">
              <Button
                type="submit"
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                disabled={loading || !canSubmit}
              >
                {loading ? 'Submitting...' : 'Submit'}
              </Button>
            </div>
          </motion.form>
        </CardContent>
      </Card>
    </ContentLayout>
  );
}

export default PunchMissedForm;