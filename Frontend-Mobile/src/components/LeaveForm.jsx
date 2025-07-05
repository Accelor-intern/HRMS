import React, { useState, useContext, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  StyleSheet,
  Modal,
} from 'react-native';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import { Card, Button, Provider as PaperProvider, Menu } from 'react-native-paper';
import DateTimePicker from '@react-native-community/datetimepicker';
import { validateLeaveForm } from '../services/validateForm';
import LeaveTypeSelector from '../services/leaveTypeSelector';
import LeaveRecordsTable from '../services/leaveRecordsTable';
import { SESSIONS, RESTRICTED_HOLIDAYS } from '../services/constants';
import {useDocumentPicker} from '../Hooks/documentUploader.jsx';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import ImageViewer from 'react-native-image-viewing';
import { useFileHandler } from '../Hooks/useFileHandler';

const initialState = {
  leaveType: '',
  dates: {
    from: '',
    to: '',
    fromDuration: 'full',
    fromSession: '',
    toDuration: 'full',
    toSession: '',
  },
  reason: '',
  chargeTo: '',
  emergencyContact: '',
  compensatoryEntry: '',
  restrictedHoliday: '',
  projectDetails: '',
  medicalCertificate: null,
  supportingDocuments: null,
  designation: '',
  submitCount: 0,
};

const LeaveForm = ({ navigation }) => {
  const { user } = useContext(AuthContext);
  const [form, setForm] = useState({ ...initialState, designation: user?.loginType || '' });
  const [leaveTypeVisible, setLeaveTypeVisible] = useState(false);
  const [restrictedHolidayVisible, setRestrictedHolidayVisible] = useState(false);
  const [sessionVisible, setSessionVisible] = useState(false);
  const [compensatoryVisible, setCompensatoryVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [compensatoryBalance, setCompensatoryBalance] = useState(0);
  const [compensatoryEntries, setCompensatoryEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [canApplyEmergencyLeave, setCanApplyEmergencyLeave] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState({ fromDate: false, toDate: false });
  const [leaveRecords, setLeaveRecords] = useState([]);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [employeeError, setEmployeeError] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);

  const { medicalCertificate, supportingDocuments, pickDocument, removeDocument } = useDocumentPicker();

  const {
    isLoading: medicalFileLoading,
    handleViewFile: handleViewMedicalFile,
    isImageViewerVisible: isMedicalImageViewerVisible,
    setIsImageViewerVisible: setIsMedicalImageViewerVisible,
    imageUri: medicalImageUri,
  } = useFileHandler({ localFile: medicalCertificate });

  const {
    isLoading: supportingFileLoading,
    handleViewFile: handleViewSupportingFile,
    isImageViewerVisible: isSupportingImageViewerVisible,
    setIsImageViewerVisible: setIsSupportingImageViewerVisible,
    imageUri: supportingImageUri,
  } = useFileHandler({ localFile: supportingDocuments });

  useEffect(() => {
    setForm(prev => ({ ...prev, medicalCertificate, supportingDocuments }));
  }, [medicalCertificate, supportingDocuments]);

  const updateFormField = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const updateFullDayField = (payload) => {
    setForm(prev => ({
      ...prev,
      dates: {
        ...prev.dates,
        ...payload,
      },
    }));
  };

  const resetForm = (designation) => {
    setForm({
      leaveType: '',
      dates: {
        from: '',
        to: '',
        fromDuration: 'full',
        fromSession: '',
        toDuration: 'full',
        toSession: '',
      },
      reason: '',
      chargeTo: '',
      emergencyContact: '',
      compensatoryEntry: '',
      restrictedHoliday: '',
      projectDetails: '',
      medicalCertificate: null,
      supportingDocuments: null,
      designation,
      submitCount: 0,
    });
  };

  const handleEmployeeSelect = (employee) => {
    console.log('Selected employee:', employee);
    setEmployeeSearch('');
    setShowEmployeeDropdown(false);
    const employeeId = employee?._id || employee?.id || '';
    console.log('Storing employee ID:', employeeId);
    updateFormField('chargeTo', employeeId);
  };

  const fetchLeaveRecords = useCallback(async () => {
    console.log('fetchLeaveRecords called');
    try {
      const response = await api.get('/leaves', {
        params: { limit: 20, page: 1, sort: 'createdAt:-1', mine: true },
      });
      console.log('Leave records response:', response.data);
      const records = Array.isArray(response.data.leaves) ? response.data.leaves : [];
      console.log('Setting leave records:', JSON.stringify(records.length, null, 2));
      setLeaveRecords(records);
      return records;
    } catch (error) {
      console.error('Error fetching leave records:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      Alert.alert('Error', error.response?.data?.message || 'Failed to fetch leave records');
      setLeaveRecords([]);
      throw error;
    } finally {
      setRefreshing(false);
    }
  }, []);

  const fetchEmployeeData = useCallback(async () => {
    console.log('fetchEmployeeData called');
    try {
      const res = await api.get('/dashboard/employee-info');
      console.log('Employee data response:', res.data);
      const { compensatoryLeaves = 0, compensatoryAvailable = [], canApplyEmergencyLeave = false } = res.data;
      console.log('Setting employee data:', {
        compensatoryLeaves,
        compensatoryAvailableCount: compensatoryAvailable.length,
        canApplyEmergencyLeave,
      });
      setCompensatoryBalance(compensatoryLeaves);
      setCompensatoryEntries(compensatoryAvailable);
      setCanApplyEmergencyLeave(canApplyEmergencyLeave);
      console.log('Emergency permission:', canApplyEmergencyLeave);
      return res.data;
    } catch (err) {
      console.error('Error fetching employee data:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
      });
      if (err.response?.status === 401) {
        const errorMsg = 'Your session has expired. Please log in again.';
        console.log(errorMsg);
        Alert.alert('Session Expired', errorMsg, [
          { text: 'OK', onPress: () => navigation.navigate('Login') },
        ]);
      } else {
        const errorMsg = err.response?.data?.message || 'Failed to fetch employee data';
        console.error(errorMsg);
        Alert.alert('Error', errorMsg);
      }
      throw err;
    }
  }, [navigation]);

  const handleRefresh = useCallback(async () => {
    console.log('handleRefresh called');
    setRefreshing(true);
    setIsLoading(true);
    try {
      console.log('Refreshing data...');
      await Promise.all([fetchEmployeeData(), fetchLeaveRecords()]);
      console.log('Refresh completed successfully');
    } catch (error) {
      console.error('Error during refresh:', error);
    } finally {
      console.log('Refreshing done, updating UI state');
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [fetchEmployeeData, fetchLeaveRecords]);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      if (user === null) {
        navigation.navigate('Login');
        return;
      }
      const userId = user?._id || user?.id;
      if (!userId) {
        return;
      }
      setIsLoading(true);
      try {
        await Promise.all([
          fetchEmployeeData().catch(e => {
            console.error('Error in fetchEmployeeData:', e);
            return null;
          }),
          fetchLeaveRecords().catch(e => {
            console.error('Error in fetchLeaveRecords:', e);
            return null;
          }),
        ]);
      } catch (error) {
        console.error('Error in Promise.all:', error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    loadData();
    return () => {
      isMounted = false;
    };
  }, [user, navigation, fetchEmployeeData, fetchLeaveRecords]);

  useEffect(() => {
    const fetchDepartmentEmployees = async () => {
      const userId = user?._id || user?.id;
      if (!userId) return;
      setLoadingEmployees(true);
      setEmployeeError('');
      try {
        const params = new URLSearchParams();
        if (form.dates.from) {
          params.append('startDate', form.dates.from);
          params.append('endDate', form.dates.to || form.dates.from);
        } else {
          setEmployees([]);
          return;
        }

        if (form.dates.fromDuration) {
          params.append('fromDuration', form.dates.fromDuration);
          if (form.dates.fromDuration === 'half' && form.dates.fromSession) {
            params.append('fromSession', form.dates.fromSession);
          }
        }

        if (form.dates.to && form.dates.toDuration) {
          params.append('toDuration', form.dates.toDuration);
          if (form.dates.toDuration === 'half' && form.dates.toSession) {
            params.append('toSession', form.dates.toSession);
          }
        }
        const res = await api.get(`/employees/department?${params.toString()}`);
        const filteredEmployees = Array.isArray(res.data)
          ? res.data.filter(emp => (emp._id || emp.id) !== userId)
          : [];

        setEmployees(filteredEmployees);

        if (form.chargeTo && !filteredEmployees.some(emp => (emp._id || emp.id) === form.chargeTo)) {
          setForm(prev => ({ ...prev, chargeTo: '' }));
          Alert.alert('Info', 'Selected employee is no longer available for the chosen dates.');
        }
      } catch (err) {
        console.error('Error fetching department employees:', {
          message: err.message,
          response: err.response?.data,
          status: err.response?.status,
        });
        setEmployeeError('Failed to load employees. Please try again.');
      } finally {
        setLoadingEmployees(false);
      }
    };
    fetchDepartmentEmployees();
  }, [form.dates.from, form.dates.to, form.dates.fromDuration, form.dates.fromSession, form.dates.toDuration, form.dates.toSession, form.chargeTo, user]);

  useEffect(() => {
    setForm(prev => ({
      ...initialState,
      leaveType: prev.leaveType, // Keep the current leaveType
      submitCount: 0
    }));
  }, [form.leaveType]);
 
  const handleChange = (key, value) => {
    if (key === 'leaveType') {
      updateFormField('leaveType', value);
      if (value === 'Medical') {
        updateFormField('duration', 'full');
        updateFullDayField({
          fromDuration: 'full',
          fromSession: '',
          to: '',
          toDuration: 'full',
          toSession: ''
        });
      }
    } else if (key.includes('dates.')) {
      const field = key.split('.')[1];
      const updates = { [field]: value };

      if (field === 'fromDuration' && value === 'half' || (field === 'fromSession' && value === 'forenoon')) {
        updates.to = '';
        updates.toDuration = 'full';
        updates.toSession = '';
      }

      updateFullDayField(updates);

      if (field === 'from' && (!form.dates.to || new Date(form.dates.to) < new Date(value))) {
        updateFullDayField({ to: value });
      }
      if (field === 'fromDuration' && value === 'full') {
        updateFullDayField({ fromSession: '' });
      }
    } else {
      updateFormField(key, value);
    }
  };

  const onDateChange = (event, selectedDate, field) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(prev => ({ ...prev, [field]: false }));
    }
    if (event.type === 'dismissed' || !selectedDate || isNaN(selectedDate.getTime())) {
      return;
    }
    
    const formattedDate = selectedDate.toISOString().split('T')[0];
    const updates = { [field === 'fromDate' ? 'from' : 'to']: formattedDate };
    
    if (field === 'fromDate' && form.dates.to && new Date(formattedDate) > new Date(form.dates.to)) {
      updates.to = '';
      updates.toDuration = 'full';
      updates.toSession = '';
    }
    
    updateFullDayField(updates);
  };

  const showDatepicker = (field) => {
    setShowDatePicker(prev => ({ ...prev, [field]: true }));
  };

  const calculateLeaveDays = useCallback(() => {
    if (!form.dates.from) return 0;

    if (!form.dates.to || form.dates.from === form.dates.to) {
      if (form.dates.fromDuration === 'half') {
        return 0.5;
      }
      return 1;
    }

    const from = new Date(form.dates.from);
    const to = new Date(form.dates.to);

    if (isNaN(from.getTime()) || isNaN(to.getTime()) || to < from) {
      return 0;
    }

    const timeDiff = to - from;
    const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24)) + 1;

    let totalDays = daysDiff;
    if (form.dates.fromDuration === 'half') totalDays -= 0.5;
    if (form.dates.toDuration === 'half') totalDays -= 0.5;

    return Math.max(0, totalDays);
  }, [form.dates.from, form.dates.to, form.dates.fromDuration, form.dates.toDuration]);

  const formatDateForBackend = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('Form state before submission:', {
      leaveType: form.leaveType,
      chargeTo: form.chargeTo,
      reason: form.reason,
      dates: form.dates,
      medicalCertificate: form.medicalCertificate,
      emergencyContact: form.emergencyContact,
      supportingDocuments: form.supportingDocuments,
    });

    if (!form.chargeTo) {
      Alert.alert('Error', 'Please select an employee to charge');
      return;
    }

    if (!form.emergencyContact) {
      Alert.alert('Error', 'Emergency Contact is required');
      return;
    }

    const leaveDays = calculateLeaveDays();

    const validationError = validateLeaveForm(
      {
        ...form,
        dates: {
          from: form.dates.from,
          to: form.dates.to,
          fromDuration: form.dates.fromDuration,
          toDuration: form.dates.toDuration,
          fromSession: form.dates.fromSession,
          toSession: form.dates.toSession,
        }
      },
      user,
      leaveDays,
      compensatoryEntries,
      canApplyEmergencyLeave
    );

    console.log('Validation error:', validationError);
    if (validationError) {
      Alert.alert('Error', validationError);
      return;
    }

    setSubmitting(true);
    try {
      const leaveData = new FormData();

      leaveData.append('leaveType', form.leaveType);
      leaveData.append('chargeGivenTo', form.chargeTo);
      leaveData.append('reason', form.reason);
      leaveData.append('emergencyContact', form.emergencyContact);

      leaveData.append('dates[from]', form.dates.from);
      leaveData.append('dates[fromDuration]', form.dates.fromDuration);
      if (form.dates.fromDuration === 'half') {
        leaveData.append('dates[fromSession]', form.dates.fromSession || 'forenoon');
      }

      if (form.dates.to) {
        leaveData.append('dates[to]', form.dates.to);
        leaveData.append('dates[toDuration]', form.dates.toDuration || 'full');
        if (form.dates.toDuration === 'half') {
          leaveData.append('dates[toSession]', form.dates.toSession || 'forenoon');
        }
      }

      if (form.leaveType === 'Compensatory' && form.compensatoryEntry) {
        leaveData.append('compensatoryEntryId', form.compensatoryEntry);
      }

      if (form.leaveType === 'Restricted Holidays' && form.restrictedHoliday) {
        leaveData.append('restrictedHoliday', form.restrictedHoliday);
      }

      if (form.projectDetails) {
        leaveData.append('projectDetails', form.projectDetails);
      }

      // Only append medical certificate if it exists and has a URI
      if (form.medicalCertificate?.uri) {
        leaveData.append('medicalCertificate', {
          uri: form.medicalCertificate.uri,
          name: form.medicalCertificate.name || 'medical_certificate.pdf',
          type: form.medicalCertificate.mimeType || 'application/pdf',
        });
      }

      // Only append supporting document if it exists and has a URI
      if (form.supportingDocuments?.uri) {
        leaveData.append('supportingDocuments', {
          uri: form.supportingDocuments.uri,
          name: form.supportingDocuments.name || 'supporting_document.pdf',
          type: form.supportingDocuments.mimeType || 'application/pdf',
        });
      }

      console.log('Submitting leave data:', {
        ...Object.fromEntries(leaveData),
        dates: form.dates
      });

      const response = await api.post('/leaves', leaveData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      console.log('Leave submission response:', response.data);

      Alert.alert('Success', 'Leave submitted successfully');
      await fetchLeaveRecords();
      resetForm(user?.designation || '');
    } catch (err) {
      console.error('Leave submit error:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
      });
      const errorMessage = err.response?.data?.message || 'An error occurred while submitting the leave';
      Alert.alert('Error', errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#666" />
      </View>
    );
  }

  return (
    <PaperProvider>
      <ScrollView
        style={styles.container}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#2563eb']} tintColor="#2563eb" />
        }
      >
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.title}>Apply for Leave</Text>

            <View>
              <View>
                <LeaveTypeSelector
                  leaveType={form.leaveType}
                  userDepartment={user?.department?.name}
                  setLeaveType={(value) => {
                    console.log('Setting leave type to:', value);
                    const leaveTypeValue = typeof value === 'string' ? value : value?.name || JSON.stringify(value);
                    console.log('Storing leave type as:', leaveTypeValue);
                    updateFormField('leaveType', leaveTypeValue);
                  }}
                  canApplyEmergencyLeave={canApplyEmergencyLeave}
                  leaveTypeVisible={leaveTypeVisible}
                  setLeaveTypeVisible={setLeaveTypeVisible}
                />
                {!form.leaveType && form.submitCount > 0 && (
                  <Text style={styles.errorText}>Leave Type is required</Text>
                )}
              </View>
            </View>

            {form.leaveType === 'Compensatory' && (
              <View style={styles.compensatorySection}>
                <View style={styles.formGroup}>
                  <Text style={styles.labelText}>Compensatory Leave Balance</Text>
                  <Text style={styles.balanceText}>{compensatoryBalance} hours</Text>
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.labelText}>Compensatory Leave Entry</Text>
                  <Menu
                    visible={compensatoryVisible}
                    onDismiss={() => setCompensatoryVisible(false)}
                    anchor={
                      <TouchableOpacity
                        style={[styles.dropdownButton, !compensatoryEntries.length && styles.disabledButton]}
                        onPress={() => compensatoryEntries.length > 0 && setCompensatoryVisible(true)}
                        disabled={!compensatoryEntries.length}
                      >
                        <Text style={form.compensatoryEntry ? styles.dropdownButtonText : styles.dropdownButtonPlaceholder}>
                          {compensatoryEntries.length === 0
                            ? 'No available entries'
                            : form.compensatoryEntry
                              ? compensatoryEntries.find(e => e._id === form.compensatoryEntry)?.date
                                ? `${new Date(compensatoryEntries.find(e => e._id === form.compensatoryEntry).date).toLocaleDateString()} - ${compensatoryEntries.find(e => e._id === form.compensatoryEntry).hours} hours`
                                : 'Select compensatory entry'
                              : 'Select compensatory entry'}
                        </Text>
                      </TouchableOpacity>
                    }
                  >
                    {compensatoryEntries
                      .filter(entry => entry.status === 'Available')
                      .map(entry => (
                        <Menu.Item
                          key={entry._id}
                          onPress={() => {
                            handleChange('compensatoryEntry', entry._id);
                            setCompensatoryVisible(false);
                          }}
                          title={`${new Date(entry.date).toLocaleDateString()} - ${entry.hours} hours`}
                          titleStyle={styles.titleStyle}
                        />
                      ))}
                  </Menu>
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.labelText}>Project Details</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={form.projectDetails}
                    onChangeText={(text) => handleChange('projectDetails', text)}
                    multiline
                    numberOfLines={4}
                    placeholder="Enter project details"
                  />
                </View>
              </View>
            )}

            {form.leaveType === 'Restricted Holidays' && (
              <View style={styles.formGroup}>
                <Text style={styles.labelText}>Restricted Holiday</Text>
                <Menu
                  visible={restrictedHolidayVisible}
                  onDismiss={() => setRestrictedHolidayVisible(false)}
                  contentStyle={{ backgroundColor: '#ffffff' }}
                  style={{ marginTop: -80 }}
                  anchor={
                    <TouchableOpacity style={styles.dropdownButton} onPress={() => setRestrictedHolidayVisible(true)}>
                      <Text style={form.restrictedHoliday ? styles.dropdownText : styles.dropdownPlaceholder}>
                        {form.restrictedHoliday || 'Select Holiday'}
                      </Text>
                    </TouchableOpacity>
                  }
                >
                  {RESTRICTED_HOLIDAYS.map((holiday) => (
                    <Menu.Item
                      key={holiday}
                      onPress={() => {
                        handleChange('restrictedHoliday', holiday);
                        setRestrictedHolidayVisible(false);
                      }}
                      title={holiday}
                      titleStyle={styles.titleStyle}
                    />
                  ))}
                </Menu>
              </View>
            )}

            <View style={styles.fullWidth}>
              <View style={styles.rowContainer}>
                <View style={[styles.formGroup, (form.dates.fromDuration === 'full' || form.dates.fromSession === 'afternoon') ? styles.halfWidth : styles.fullWidth]}>
                  <Text style={styles.labelText}>From Date</Text>
                  <TouchableOpacity
                    style={[styles.input, { justifyContent: 'center' }]}
                    onPress={() => showDatepicker('fromDate')}
                  >
                    <Text style={form.dates.from ? styles.dropdownText : styles.dropdownDay}>
                      {form.dates.from || 'Select date'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {(form.dates.fromDuration === 'full' || form.dates.fromSession === 'afternoon') && (
                  <View style={[styles.formGroup, styles.halfWidth, { marginLeft: '2%' }]}>
                    <Text style={styles.labelText}>To Date</Text>
                    <TouchableOpacity
                      style={[styles.input, { justifyContent: 'center', opacity: !form.dates.from ? 0.6 : 1 }]}
                      onPress={() => form.dates.from && showDatepicker('toDate')}
                      disabled={!form.dates.from}
                    >
                      <Text style={form.dates.to ? styles.dropdownText : styles.dropdownDay}>
                        {form.dates.to || 'Select date'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {showDatePicker.fromDate && (
                <View style={[styles.datePickerContainer, { marginTop: 10 }]}>
                  <DateTimePicker
                    value={form.dates.from ? new Date(form.dates.from) : new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, date) => onDateChange(event, date, 'fromDate')}
                    minimumDate={
                      form.leaveType === 'Medical'
                        ? new Date(new Date().setDate(new Date().getDate() - 7))
                        : form.leaveType === 'Emergency'
                          ? new Date()
                          : new Date()
                    }
                    maximumDate={
                      form.leaveType === 'Medical' || form.leaveType === 'Emergency'
                        ? new Date()
                        : null
                    }
                  />
                  {Platform.OS === 'ios' && (
                    <Button
                      mode="contained"
                      onPress={() => setShowDatePicker(prev => ({ ...prev, fromDate: false }))}
                      style={styles.dateButton}
                    >
                      Done
                    </Button>
                  )}
                </View>
              )}

              {showDatePicker.toDate && (
                <View style={[styles.datePickerContainer, { marginTop: 10 }]}>
                  <DateTimePicker
                    value={form.dates.to ? new Date(form.dates.to) : new Date(form.dates.from)}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, date) => onDateChange(event, date, 'toDate')}
                    minimumDate={new Date(form.dates.from)}
                    maximumDate={
                      form.leaveType === 'Medical'
                        ? new Date(new Date().setDate(new Date().getDate() + 6))
                        : form.leaveType === 'Emergency'
                          ? new Date()
                          : null
                    }
                  />
                  {Platform.OS === 'ios' && (
                    <Button
                      mode="contained"
                      onPress={() => setShowDatePicker(prev => ({ ...prev, toDate: false }))}
                      style={styles.dateButton}
                    >
                      Done
                    </Button>
                  )}
                </View>
              )}

              <View style={[styles.rowContainer, !form.dates.to && styles.fullWidth, { marginTop: 10 }]}>
                <View style={[styles.formGroup, form.dates.to ? styles.halfWidth : styles.fullWidth]}>
                  <Text style={styles.labelText}>From Duration</Text>
                  <View style={styles.durationContainer}>
                    <TouchableOpacity
                      style={[styles.durationButton, form.dates.fromDuration === 'full' && styles.activeDuration]}
                      onPress={() => handleChange('dates.fromDuration', 'full')}
                    >
                      <Text style={form.dates.fromDuration === 'full' ? styles.activeText : styles.inactiveText}>
                        Full Day
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.durationButton,
                        form.dates.fromDuration === 'half' && styles.activeDuration,
                        form.leaveType === 'Medical' && { opacity: 0.6 },
                      ]}
                      onPress={() => form.leaveType !== 'Medical' && handleChange('dates.fromDuration', 'half')}
                      disabled={form.leaveType === 'Medical'}
                    >
                      <Text style={form.dates.fromDuration === 'half' ? styles.activeText : styles.inactiveText}>
                        Half Day
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {form.dates.to && (
                  <View style={[styles.formGroup, styles.halfWidth, { marginLeft: '4%' }]}>
                    <Text style={styles.labelText}>To Duration</Text>
                    <View style={styles.durationContainer}>
                      <TouchableOpacity
                        style={[styles.durationButton, form.dates.toDuration === 'full' && styles.activeDuration]}
                        onPress={() => handleChange('dates.toDuration', 'full')}
                      >
                        <Text style={form.dates.toDuration === 'full' ? styles.activeText : styles.inactiveText}>
                          Full Day
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.durationButton,
                          form.dates.toDuration === 'half' && styles.activeDuration,
                          form.leaveType === 'Medical' && { opacity: 0.6 },
                        ]}
                        onPress={() => {
                          if (form.leaveType !== 'Medical') {
                            handleChange('dates.toDuration', 'half');
                            handleChange('dates.toSession', 'forenoon');
                          }
                        }}
                        disabled={form.leaveType === 'Medical'}
                      >
                        <Text style={form.dates.toDuration === 'half' ? styles.activeText : styles.inactiveText}>
                          Half Day
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            </View>

            {(form.dates.fromDuration === 'half' || form.dates.toDuration === 'half') && (
              <View style={styles.rowContainer}>
                {form.dates.fromDuration === 'half' && (
                  <View style={[styles.formGroup, form.dates.toDuration === 'half' ? styles.halfWidth : styles.fullWidth]}>
                    <Text style={styles.labelText}>From Session</Text>
                    <Menu
                      visible={sessionVisible}
                      onDismiss={() => setSessionVisible(false)}
                      contentStyle={{ backgroundColor: '#ffffff' }}
                      style={{ marginTop: -80 }}
                      anchor={
                        <TouchableOpacity style={styles.dropdownButton} onPress={() => setSessionVisible(true)}>
                          <Text style={form.dates.fromSession ? styles.dropdownText : styles.dropdownPlaceholder}>
                            {form.dates.fromSession ? form.dates.fromSession.charAt(0).toUpperCase() + form.dates.fromSession.slice(1) : 'Select Session'}
                          </Text>
                        </TouchableOpacity>
                      }
                    >
                      {SESSIONS.map((session) => (
                        <Menu.Item
                          key={session}
                          onPress={() => {
                            handleChange('dates.fromSession', session);
                            if (session === 'forenoon' && form.dates.to) {
                              handleChange('dates.to', '');
                            }
                            setSessionVisible(false);
                          }}
                          title={session.charAt(0).toUpperCase() + session.slice(1)}
                          titleStyle={styles.titleStyle}
                        />
                      ))}
                    </Menu>
                  </View>
                )}

                {form.dates.toDuration === 'half' && (
                  <View style={[styles.formGroup, form.dates.fromDuration === 'half' ? styles.halfWidth : styles.fullWidth,
                  form.dates.fromDuration === 'half' && { marginLeft: '2%' }]}>
                    <Text style={styles.labelText}>To Session</Text>
                    <View style={[styles.dropdownButton, { justifyContent: 'center' }]}>
                      <Text style={styles.dropdownText}>Forenoon</Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            <View style={[styles.formGroup, { marginTop: 10 }]}>
              <Text style={styles.labelText}>Leave Days</Text>
              <Text style={styles.daysText}>{calculateLeaveDays()} days</Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.labelText}>Reason for Leave</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={form.reason}
                onChangeText={(text) => handleChange('reason', text)}
                placeholder="Enter reason for leave"
                multiline
                numberOfLines={3}
                maxLength={500}
                error={form.submitCount > 0 && !form.reason.trim()}
              />
              {form.submitCount > 0 && !form.reason.trim() && (
                <Text style={styles.errorText}>Reason is required</Text>
              )}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.labelText}>Charge Given To *</Text>
              {loadingEmployees ? (
                <ActivityIndicator size="small" color="#666" />
              ) : employeeError ? (
                <Text style={styles.errorText}>{employeeError}</Text>
              ) : employees.length === 0 ? (
                <Text style={[styles.input, { color: '#666' }]}>
                  {form.dates.from ? 'No employees available for the selected dates' : 'Select dates first'}
                </Text>
              ) : Platform.OS === 'ios' ? (
                <Menu
                  visible={showEmployeeDropdown}
                  onDismiss={() => setShowEmployeeDropdown(false)}
                  contentStyle={{ backgroundColor: '#ffffff', maxHeight: 300 }}
                  style={{ marginTop: 170 }}
                  anchor={
                    <TouchableOpacity
                      style={[styles.input, styles.dropdownButton]}
                      onPress={() => setShowEmployeeDropdown(true)}
                    >
                      <Text style={form.chargeTo ? styles.dropdownText : styles.dropdownPlaceholder}>
                        {form.chargeTo
                          ? employees.find(e => (e._id || e.id) === form.chargeTo)?.name || 'Select an employee'
                          : 'Select an employee'}
                      </Text>
                    </TouchableOpacity>
                  }
                >
                  <ScrollView>
                    {employees.map(emp => {
                      const empId = emp._id || emp.id;
                      return (
                        <Menu.Item
                          key={empId}
                          onPress={() => {
                            console.log('Selected employee ID:', empId);
                            handleEmployeeSelect({ _id: empId, name: emp.name });
                          }}
                          title={`${emp.name}`}
                          titleStyle={styles.titleStyle}
                        />
                      );
                    })}
                  </ScrollView>
                </Menu>
              ) : (
                <View>
                  <TouchableOpacity
                    style={[styles.input, styles.dropdownButton]}
                    onPress={() => setShowEmployeeDropdown(!showEmployeeDropdown)}
                  >
                    <Text style={form.chargeTo ? styles.dropdownText : { color: '#666' }}>
                      {form.chargeTo
                        ? employees.find(e => (e._id || e.id) === form.chargeTo)?.name || 'Select an employee'
                        : 'Select an employee'}
                    </Text>
                  </TouchableOpacity>
                  <Modal
                    visible={showEmployeeDropdown}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={() => setShowEmployeeDropdown(false)}
                  >
                    <TouchableOpacity
                      style={styles.modalOverlay}
                      activeOpacity={1}
                      onPress={() => setShowEmployeeDropdown(false)}
                    >
                      <View style={styles.dropdownContainer}>
                        <ScrollView style={styles.dropdownList}>
                          {employees.map(emp => {
                            const empId = emp._id || emp.id;
                            return (
                              <TouchableOpacity
                                key={empId}
                                style={styles.dropdownItem}
                                onPress={() => {
                                  console.log('Selected employee ID:', empId);
                                  handleEmployeeSelect({ _id: empId, name: emp.name });
                                }}
                              >
                                <Text style={styles.dropdownItemText}>
                                  {emp.name}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>
                    </TouchableOpacity>
                  </Modal>
                </View>
              )}
              {!form.chargeTo && form.submitCount > 0 && (
                <Text style={styles.errorText}>Please select an employee to charge</Text>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.labelText}>Emergency Address & Contact</Text>
              <TextInput
                style={styles.input}
                value={form.emergencyContact}
                onChangeText={(text) => handleChange('emergencyContact', text)}
                placeholder="Enter contact Address, Number"
                keyboardType="default"
              />
            </View>

            {/* Medical Certificate Section */}
            {form.leaveType.toLowerCase() === 'medical' && (
              <View style={styles.formGroup}>
                <Text style={styles.labelText}>Medical Certificate</Text>
                <TouchableOpacity
                  style={[styles.documentButton, styles.uploadBoxContainer]}
                  onPress={() => pickDocument('medical')}
                >
                  <View style={styles.uploadBoxContent}>
                    <MaterialIcons name="file-upload" size={40} color="#2e7d32" />
                    <Text style={styles.uploadBoxText}>
                      {form.medicalCertificate ? 'Replace Medical Certificate' : 'Upload Medical Certificate'}
                    </Text>
                  </View>
                </TouchableOpacity>
                {form.medicalCertificate && (
                  <View style={[styles.documentItem, styles.uploadedDocument]}>
                    <MaterialIcons name="description" size={24} color="#2e7d32" style={styles.documentIcon} />
                    <Text style={styles.documentText} numberOfLines={1} ellipsizeMode="middle">
                      {form.medicalCertificate.name}
                    </Text>
                    <TouchableOpacity
                      onPress={handleViewMedicalFile}
                      style={styles.previewButton}
                      disabled={medicalFileLoading}
                    >
                      {medicalFileLoading ? (
                        <ActivityIndicator size="small" color="#2e7d32" />
                      ) : (
                        <MaterialIcons name="visibility" size={24} color="#2e7d32" />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeDocument(0, 'medical')} style={styles.deleteButton}>
                      <MaterialIcons name="delete" size={24} color="#ff4444" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* Supporting Documents Section */}
            {(form.leaveType.toLowerCase() === 'maternity' || form.leaveType.toLowerCase() === 'paternity') && (
              <View style={styles.formGroup}>
                <Text style={styles.labelText}>Supporting Documents</Text>
                <TouchableOpacity
                  style={[styles.documentButton, styles.uploadBoxContainer]}
                  onPress={() => pickDocument('supporting')}
                >
                  <View style={styles.uploadBoxContent}>
                    <MaterialIcons name="file-upload" size={40} color="#2e7d32" />
                    <Text style={styles.uploadBoxText}>Upload Supporting Documents</Text>
                  </View>
                </TouchableOpacity>
                {form.supportingDocuments && (
                  <View style={[styles.documentItem, styles.uploadedDocument]}>
                    <MaterialIcons name="description" size={24} color="#2e7d32" style={styles.documentIcon} />
                    <Text style={styles.documentText} numberOfLines={1} ellipsizeMode="middle">
                      {form.supportingDocuments.name}
                    </Text>
                    <TouchableOpacity
                      onPress={handleViewSupportingFile}
                      style={styles.previewButton}
                      disabled={supportingFileLoading}
                    >
                      {supportingFileLoading ? (
                        <ActivityIndicator size="small" color="#2e7d32" />
                      ) : (
                        <MaterialIcons name="visibility" size={24} color="#2e7d32" />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeDocument(0, 'supporting')} style={styles.deleteButton}>
                      <MaterialIcons name="delete" size={24} color="#ff4444" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* Image Viewer for Medical Certificate */}
            <ImageViewer
              images={medicalImageUri ? [medicalImageUri] : []}
              imageIndex={0}
              visible={isMedicalImageViewerVisible}
              onRequestClose={() => setIsMedicalImageViewerVisible(false)}
            />

            {/* Image Viewer for Supporting Documents */}
            <ImageViewer
              images={supportingImageUri ? [supportingImageUri] : []}
              imageIndex={0}
              visible={isSupportingImageViewerVisible}
              onRequestClose={() => setIsSupportingImageViewerVisible(false)}
            />

            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>Submit Leave</Text>
              )}
            </TouchableOpacity>
          </Card.Content>
        </Card>

        <LeaveRecordsTable
          leaveRecords={leaveRecords}
          selectedRecord={selectedRecord}
          setSelectedRecord={setSelectedRecord}
          modalVisible={modalVisible}
          setModalVisible={setModalVisible}
        />
      </ScrollView>
    </PaperProvider>
  );
};

const styles = StyleSheet.create({
  fullWidth: {
    width: '100%',
  },
  rowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  halfWidth: {
    width: '49%',
  },
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 15,
  },
  card: {
    marginBottom: 20,
    borderRadius: 10,
    elevation: 3,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#333',
  },
  formGroup: {
    marginBottom: 15,
  },
  labelText: {
    fontSize: 14,
    marginBottom: 5,
    color: '#555',
    fontWeight: '500',
  },
  previewButton: {
    padding: 4,
    marginLeft: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#9ca3af',
    borderRadius: 5,
    padding: 12,
    fontSize: 16,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  datePickerContainer: {
    marginTop: 10,
    marginBottom: 15,
    backgroundColor: '#ffffff',
    borderRadius: 5,
    padding: 10,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  dateButton: {
    marginTop: 10,
    backgroundColor: '#2563eb',
  },
  durationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
    alignItems: 'center',
  },
  durationButton: {
    padding: 10,
    borderWidth: 1,
    borderColor: '#9ca3af',
    borderRadius: 15,
    alignItems: 'center',
    marginHorizontal: 2,
    flex: 1,
    margin: 2,
  },
  activeDuration: {
    backgroundColor: '#1e88e5',
    borderColor: '#1976d2',
  },
  activeText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  inactiveText: {
    color: '#666',
  },
  compensatorySection: {
    marginVertical: 10,
    padding: 10,
    backgroundColor: '#f8f9fa',
    borderRadius: 5,
  },
  balanceText: {
    fontSize: 16,
    color: '#1976d2',
    fontWeight: 'bold',
  },
  daysText: {
    fontSize: 16,
    color: '#28a745',
    fontWeight: 'bold',
  },
  documentText: {
    flex: 1,
    fontSize: 14,
    color: '#555',
    marginHorizontal: 8,
  },
  documentButton: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
  uploadBoxContainer: {
    backgroundColor: '#f8f9fa',
  },
  uploadBoxContent: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  uploadBoxText: {
    marginTop: 8,
    color: '#2e7d32',
    textAlign: 'center',
    fontWeight: '500',
  },
  documentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    width: '100%',
  },
  uploadedDocument: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f8e9',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#2e7d32',
    flex: 1,
  },
  documentIcon: {
    marginRight: 12,
  },
  deleteButton: {
    marginLeft: 'auto',
    padding: 4,
  },
  submitButton: {
    backgroundColor: '#1e88e5',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    marginTop: 20,
  },
  submitButtonDisabled: {
    backgroundColor: '#90caf9',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputContainer: {
    marginBottom: 15,
  },
  errorText: {
    color: 'red',
    fontSize: 12,
    marginTop: 4,
  },
  dropdownButton: {
    borderWidth: 1,
    borderColor: '#9ca3af',
    borderRadius: 6,
    padding: 12,
    backgroundColor: 'white',
    justifyContent: 'center',
    height: 46,
    marginTop: 0,
  },
  disabledButton: {
    backgroundColor: '#f3f4f6',
  },
  dropdownText: {
    color: '#1f2937',
    fontSize: 16,
  },
  dropdownPlaceholder: {
    color: '#9ca3af',
    fontSize: 16,
  },
  dropdownButtonText: {
    color: '#1f2937',
    fontSize: 16,
  },
  dropdownButtonPlaceholder: {
    color: '#9ca3af',
    fontSize: 16,
  },
  titleStyle: {
    fontSize: 16,
    color: '#1f2937',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  dropdownContainer: {
    backgroundColor: 'white',
    borderRadius: 5,
    maxHeight: 300,
  },
  dropdownList: {
    padding: 10,
  },
  dropdownItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  dropdownItemText: {
    fontSize: 16,
  },
});

export default LeaveForm;