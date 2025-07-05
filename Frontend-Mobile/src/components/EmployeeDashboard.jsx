import React, { useContext, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Button,
  Image,
  Alert,
  Modal,
  TextInput,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { AuthContext } from '../context/AuthContext.jsx';
import { BarChart } from 'react-native-chart-kit';
import AttendanceChart from './AttendanceChart';
import { formatForDisplay, formatForBackend, parseDateFromBackend, getCurrentISTDate, toIST } from '../utils/dateUtils';
import io from 'socket.io-client';
import api, { fetchFileAsBlob } from '../services/api.js';
import * as FileSystem from 'expo-file-system';

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

function EmployeeDashboard() {
  const { user } = useContext(AuthContext);
  const [userName, setUserName] = useState('');
  const [designation, setDesignation] = useState('');
  const [claimingId, setClaimingId] = useState(null);
  const [data, setData] = useState({
    attendanceData: [],
    leaveDaysTaken: { monthly: 0, yearly: 0 },
    paidLeavesRemaining: 0,
    unpaidLeavesTaken: 0,
    overtimeHours: 0,
    restrictedHolidays: 0,
    medicalLeaves: 0,
    unclaimedOTRecords: [],
  });

  const [attendanceView, setAttendanceView] = useState('monthly');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [socket, setSocket] = useState(null);
  const [isEligible, setIsEligible] = useState(false);
  const [profileUri, setProfileUri] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [currentRecord, setCurrentRecord] = useState(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isCompensatorySelected, setIsCompensatorySelected] = useState(false);
  const [projectDetails, setProjectDetails] = useState({
    projectName: 'Regular Work',
    description: 'Overtime claim'
  });

  const openClaimModal = (record) => {
    setCurrentRecord(record);
    setIsModalVisible(true);
  };

  const formatNumber = (value) => {
    const num = Number(value);
    return isNaN(num) ? 0 : num;
  };

  const calculateLeaveStats = useCallback(() => {
    const stats = {
      paid: formatNumber(data.paidLeavesRemaining),
      unpaid: formatNumber(data.unpaidLeavesTaken),
      medical: formatNumber(data.medicalLeaves),
      restricted: formatNumber(data.restrictedHolidays)
    };
    return stats;
  }, [data]);

  const handleViewToggle = useCallback((view) => {
    setAttendanceView(view);
  }, []);

  const fetchData = useCallback(async () => {
    if (!user?.employeeId) return;
    try {
      setLoading(true);
      setError(null);
      setUserName(user.name);
      setDesignation(user.designation);

      const employeeRes = await api.get('/dashboard/employee-info');
      const { paidLeaves, employeeType, restrictedHolidays, medicalLeaves } = employeeRes.data;

      const eligibleDepartments = ['Production', 'Testing', 'AMETL', 'Admin'];
      const isDeptEligible = user.department.name && eligibleDepartments.includes(user.department.name);
      setIsEligible(isDeptEligible);

      // Get current IST date for reference
      const today = getCurrentISTDate();
      let fromDate, toDate;

      if (attendanceView === 'monthly') {
        // Monthly view shows full month
        // If current month, limit to today
        if (today.month() === getCurrentISTDate().month()) {
          fromDate = toIST(new Date(today.year(), today.month(), 1));
          toDate = today.clone().endOf('day');
        } else {
          // For previous months, show full month
          fromDate = toIST(new Date(today.year(), today.month(), 1));
          toDate = toIST(new Date(today.year(), today.month() + 1, 0));
        }
      } else {
        // Yearly view
        // If current year, limit to today
        if (today.year() === getCurrentISTDate().year()) {
          fromDate = toIST(new Date(today.year(), 0, 1));
          toDate = today.clone().endOf('day');
        } else {
          // For previous years, show full year
          fromDate = toIST(new Date(today.year(), 0, 1));
          toDate = toIST(new Date(today.year(), 11, 31));
        }
      }

      // Format dates as IST YYYY-MM-DD for backend
      const fromDateStr = formatForBackend(fromDate);
      const toDateStr = formatForBackend(toDate);

      // Fetch attendance data with current view
      const attendanceRecords = await api.get(`/dashboard/employee-stats?attendanceView=${attendanceView}&fromDate=${fromDateStr}&toDate=${toDateStr}`);
      
      // Fetch yearly leave data
      const yearlyFromDate = toIST(new Date(today.year(), 0, 1));
      const yearlyToDate = toIST(new Date(today.year(), 11, 31)).endOf('day');
      const yearlyFromDateStr = formatForBackend(yearlyFromDate);
      const yearlyToDateStr = formatForBackend(yearlyToDate);
      const leaveData = await api.get(`/dashboard/employee-stats?attendanceView=yearly&fromDate=${yearlyFromDateStr}&toDate=${yearlyToDateStr}`);

      // Update state with fetched data
      const newData = {
        attendanceData: attendanceRecords.data.attendanceData || [],
        leaveDaysTaken: leaveData.data.yearly,
        paidLeavesRemaining: employeeType === 'Confirmed' ? paidLeaves : 0,
        unpaidLeavesTaken: leaveData.data.unpaidLeavesTaken || 0,
        restrictedHolidays: restrictedHolidays || 0,
        medicalLeaves: medicalLeaves || 0,
        unclaimedOTRecords: isDeptEligible ? (leaveData.data.unclaimedOTRecords || []) : [],
      };

      setData(newData);
    } catch (err) {
      setError(err.message || 'Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  }, [attendanceView, user]);

  const handleClaimOT_Compensatory = async () => {
    if (!currentRecord) return;
    try {
      setClaimingId(currentRecord._id);
      const formattedDate = formatForBackend(currentRecord.date); // Ensure IST format
      if (!isCompensatorySelected) {
        await api.post('/ot', {
          date: formattedDate,
          hours: parseFloat(currentRecord.hours),
          projectName: projectDetails.projectName,
          description: projectDetails.description,
          claimType: 'overtime'
        });
      } else {
        await api.post('/ot/compensatory', {
          date: formattedDate,
          hours: parseFloat(currentRecord.hours),
          projectName: projectDetails.projectName,
          description: projectDetails.description,
          claimType: 'compensatory'
        });
      }

      // Refresh dashboard data
      await fetchData();
      setIsModalVisible(false);
      Alert.alert('Success', 'OT claim submitted successfully!');
    } catch (error) {
      console.error('Error claiming OT:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to submit OT claim');
    } finally {
      setClaimingId(null);
    }
  };

  useEffect(() => {
    const loadProfilePicture = async () => {
      if (!user?.profilePicture) return;
      setProfileLoading(true);
      try {
        const cacheDir = `${FileSystem.cacheDirectory}downloaded_files/`;
        const extension = 'jpg';
        const filePath = `${cacheDir}${user.profilePicture}.${extension}`;
        const fileInfo = await FileSystem.getInfoAsync(filePath);

        const isCacheValid = fileInfo.exists && Date.now() - fileInfo.modificationTime * 1000 < 24 * 60 * 60 * 1000 && fileInfo.size > 0;

        if (isCacheValid) {
          console.log('Using cached profile picture');
          setProfileUri(filePath);
        } else {
          console.log('Downloading new profile picture');
          const path = await fetchFileAsBlob(user.profilePicture, `profile.${extension}`);
          setProfileUri(path);
        }
      } catch (err) {
        console.error('Failed to load profile picture:', err.message);
      } finally {
        setProfileLoading(false);
      }
    };

    loadProfilePicture();
  }, [user?.profilePicture]);

  useEffect(() => {
    if (!user?.employeeId) return;
    fetchData();

    const socketInstance = io(process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.34:5001/api', {
      query: { employeeId: user.employeeId },
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });

    socketInstance.on('dashboard-update', fetchData);
    setSocket(socketInstance);
    return () => socketInstance.disconnect();
  }, [user?.employeeId, fetchData]);

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#6b21a8" />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <Button title="Try Again" onPress={fetchData} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        scrollEnabled={true}
        bounces={true}
        showsVerticalScrollIndicator={true}>
        <View style={styles.profileSection}>
          <View style={styles.profileContainer}>
            {user?.profilePicture ? (
              profileLoading ? (
                <ActivityIndicator size="small" color="#0000ff" />
              ) : profileUri ? (
                <Image source={{ uri: profileUri }} style={styles.profileImage} />
              ) : (
                <MaterialIcons name="person" size={50} color="#666666" style={styles.defaultIcon} />
              )
            ) : (
              <MaterialIcons name="person" size={50} color="#666666" style={styles.defaultIcon} />
            )}
            <View style={styles.nameContainer}>
              <Text style={styles.name}>{userName || user?.name}</Text>
              <Text style={styles.designation}>{designation || user?.designation}</Text>
            </View>
          </View>
        </View>

        <View style={styles.chartContainer}>
          <View style={styles.chartHeader}>
            <Text style={styles.sectionTitle}>Attendance Overview</Text>
            <View style={styles.viewToggleContainer}>
              {['monthly', 'yearly'].map(view => (
                <TouchableOpacity
                  key={view}
                  style={[styles.viewToggle, attendanceView === view && styles.viewToggleActive]}
                  onPress={() => handleViewToggle(view)}
                >
                  <Text style={[styles.viewToggleText, attendanceView === view && styles.viewToggleTextActive]}>
                    {view.charAt(0).toUpperCase() + view.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {Array.isArray(data.attendanceData) && data.attendanceData.length > 0 ? (
            <AttendanceChart attendanceData={data.attendanceData} />
          ) : (
            <View style={styles.noDataContainer}>
              <Text style={styles.noDataText}>No attendance data available</Text>
              <Button title="Refresh" onPress={fetchData} />
            </View>
          )}
          {(() => {
            const stats = calculateLeaveStats();
            return (
              <BarChart
                data={{
                  labels: ["Paid Remaining", "Unpaid Taken", "Medical Remaining", "Restricted Remaining"],
                  datasets: [{
                    data: [
                      stats.paid,
                      stats.unpaid,
                      stats.medical,
                      stats.restricted
                    ]
                  }]
                }}
                width={Dimensions.get("window").width - 40}
                height={400}
                chartConfig={{
                  backgroundColor: "#4c8c4a",
                  backgroundGradientFrom: "#81c784",
                  backgroundGradientTo: "#a5d6a7",
                  color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                  labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                  style: {
                    borderRadius: 16,
                  },
                  barPercentage: 0.7,
                  propsForBackgroundLines: {
                    stroke: "#e0e0e0"
                  },
                  fillShadowGradient: "#2e7d32",
                  fillShadowGradientOpacity: 1,
                  propsForHorizontalLabels: {
                    rotation: 0
                  },
                  propsForVerticalLabels: {
                    dx: -20,
                    dy: 0,
                    rotation: -45,
                    anchor: 'end'
                  }
                }}
                withHorizontalLabels={true}
                withVerticalLabels={true}
                segments={4}
                style={{
                  padding: 10,
                  marginVertical: 8,
                  borderRadius: 16,
                  alignSelf: 'center'
                }}
                fromZero={true}
                showBarTops={true}
                verticalLabelRotation={0}
              />
            );
          })()}
        </View>

        {isEligible && (
          <View style={styles.otContainer}>
            <Text style={styles.sectionTitle}>Pending OT/Compensatory Claims</Text>
            {data.unclaimedOTRecords && (() => {
              const claimableRecords = data.unclaimedOTRecords
                .filter(record => {
                  const hoursNum = parseFloat(record.hours) || 0;
                  const hasValidHours = hoursNum >= 1;

                  // Parse record.date as IST
                  const recordDate = parseDateFromBackend(record.date);
                  if (!recordDate) return false;

                  // Calculate deadline in IST
                  const deadline = record.claimDeadline
                    ? parseDateFromBackend(record.claimDeadline)
                    : recordDate.clone().add(1, 'day').endOf('day');

                  const currentTime = getCurrentISTDate();
                  const isBeforeDeadline = deadline >= currentTime;

                  return hasValidHours && isBeforeDeadline;
                })
                .sort((a, b) => parseDateFromBackend(b.date) - parseDateFromBackend(a.date)); // Sort by most recent

              return claimableRecords.length > 0 ? (
                claimableRecords.map((record, index) => (
                  <View key={`unclaimed-${index}`} style={styles.otRecord}>
                    <View style={styles.otRecordLeft}>
                      <Text style={styles.otRecordDate}>
                        {record.date ? formatForDisplay(record.date) : 'N/A'}
                      </Text>
                      <Text style={styles.otRecordDeadline}>
                        Claim by: {record.claimDeadline
                          ? formatForDisplay(record.claimDeadline)
                          : formatForDisplay(parseDateFromBackend(record.date).add(1, 'day').endOf('day'))}
                      </Text>
                    </View>
                    <View style={styles.otRecordRight}>
                      <Text style={styles.otRecordHours}>{record.hours} hrs</Text>
                      <TouchableOpacity
                        style={[
                          styles.claimButton,
                          (claimingId === record._id || (record.claimDeadline && parseDateFromBackend(record.claimDeadline) < getCurrentISTDate())) &&
                          styles.claimButtonDisabled
                        ]}
                        onPress={() => openClaimModal(record)}
                        disabled={claimingId === record._id || (record.claimDeadline && parseDateFromBackend(record.claimDeadline) < getCurrentISTDate())}
                      >
                        {claimingId === record._id ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <Text style={styles.claimButtonText}>
                            {record.claimDeadline && parseDateFromBackend(record.claimDeadline) < getCurrentISTDate() ? 'Expired' : 'Claim'}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.noRecordsText}>No pending OT claims found</Text>
              );
            })()}
          </View>
        )}
      </ScrollView>
      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setIsModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setIsModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => { }}>
              <View style={styles.modalContent}>
                <ScrollView
                  style={{ maxHeight: '100%' }}
                  contentContainerStyle={{ paddingBottom: 20 }}
                  keyboardShouldPersistTaps="handled"
                  bounces={true}
                  showsVerticalScrollIndicator={true}
                >
                  <Text style={styles.modalTitle}>OverTime/Compensatory</Text>

                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Project Name</Text>
                    <TextInput
                      style={styles.input}
                      value={projectDetails.projectName}
                      onChangeText={(text) =>
                        setProjectDetails((prev) => ({ ...prev, projectName: text }))
                      }
                      placeholder="Enter Project Name"
                    />
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Description</Text>
                    <TextInput
                      style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                      value={projectDetails.description}
                      onChangeText={(text) =>
                        setProjectDetails((prev) => ({ ...prev, description: text }))
                      }
                      placeholder="Enter Description"
                      multiline
                      numberOfLines={4}
                    />
                  </View>

                  {currentRecord?.hours >= 5.0 ? (
                    <View style={styles.formGroup}>
                      <TouchableOpacity
                        style={[
                          styles.compensatoryButton,
                          isCompensatorySelected && styles.compensatoryButtonSelected
                        ]}
                        onPress={() => setIsCompensatorySelected(!isCompensatorySelected)}
                      >
                        <MaterialIcons
                          name={isCompensatorySelected ? "check-box" : "check-box-outline-blank"}
                          size={24}
                          color={isCompensatorySelected ? "#1976d2" : "#666"}
                        />
                        <Text style={styles.compensatoryButtonText}>Claim Compensatory</Text>
                      </TouchableOpacity>

                      {isCompensatorySelected && (
                        <Text style={styles.label}>
                          Compensatory Leave Available: {currentRecord?.hours >= 8.0 ? 'Full Day' : "Half Day"}
                        </Text>
                      )}
                    </View>
                  ) : null}

                  <TouchableOpacity
                    style={[styles.button, styles.submitButton]}
                    onPress={() => {
                      handleClaimOT_Compensatory();
                      setIsModalVisible(false);
                    }}
                    disabled={
                      claimingId !== null || !projectDetails.projectName.trim()
                    }
                  >
                    {claimingId ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      (isCompensatorySelected
                        ? <Text style={styles.buttonText}>Submit Compensatory</Text>
                        : <Text style={styles.buttonText}>Submit OT</Text>
                      )
                    )}
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  noDataContainer: {
    alignItems: 'center',
    padding: 20,
  },
  noDataText: {
    textAlign: 'center',
    color: '#6b21a8',
    marginTop: 20,
    fontSize: 16,
  },
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 16,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: 10,
    padding: 0,
  },
  profileContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  profileImage: {
    width: 60,
    height: 70,
    borderRadius: 50,
    marginBottom: 20,
    marginRight: 20,
    marginLeft: 10,
    marginTop: 20,
    flex: 1,
  },
  defaultIcon: {
    width: 50,
    height: 50,
    borderRadius: 50,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
  },
  nameContainer: {
    alignItems: 'flex-start',
    flexDirection: 'column',
    justifyContent: 'center',
    flex: 2,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: '90%',
    maxHeight: SCREEN_HEIGHT * 0.9,
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  formGroup: {
    marginBottom: 15,
  },
  label: {
    marginBottom: 5,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    padding: 10,
    fontSize: 16,
  },
  button: {
    flex: 1,
    padding: 12,
    borderRadius: 5,
    alignItems: 'center',
    marginTop: 10,
  },
  submitButton: {
    backgroundColor: '#1a73e8',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  compensatoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 4,
    backgroundColor: '#f0f0f0',
    marginBottom: 10,
  },
  compensatoryButtonSelected: {
    backgroundColor: '#e3f2fd',
  },
  compensatoryButtonText: {
    marginLeft: 8,
    fontSize: 14,
  },
  name: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1e293b',
  },
  designation: {
    fontSize: 14,
    color: '#64748b',
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  viewToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 2,
  },
  viewToggle: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  viewToggleActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  viewToggleText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '500',
  },
  viewToggleTextActive: {
    color: '#6b21a8',
  },
  chartContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 16,
    marginRight: 16,
  },
  otContainer: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  otRecord: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    marginBottom: 8,
  },
  otRecordLeft: {
    flex: 1,
    marginRight: 10,
  },
  otRecordRight: {
    alignItems: 'flex-end',
  },
  otRecordDate: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1f2937',
    marginBottom: 2,
  },
  otRecordDeadline: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 2,
  },
  otRecordHours: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 3,
  },
  claimButton: {
    backgroundColor: '#6b21a8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    marginTop: 4,
  },
  claimButtonText: {
    color: '#ffffff',
    fontWeight: '500',
    textAlign: 'center',
  },
  claimButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  noRecordsText: {
    color: '#6b7280',
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 8,
  },
  otRecord: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0'
  },
  otRecordDate: {
    color: '#475569'
  },
  otRecordHours: {
    color: '#1e293b',
    fontWeight: '600'
  },
  loadingText: {
    marginTop: 8,
    color: '#475569'
  },
  errorContainer: {
    padding: 16,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    marginBottom: 16
  },
  errorText: {
    color: '#dc2626',
    textAlign: 'center'
  },
});

export default EmployeeDashboard;