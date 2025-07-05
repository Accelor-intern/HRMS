import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Platform,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Button, Card } from 'react-native-paper';
import { Button as RNButton } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import {
  formatForDisplay,
  formatTimeForDisplay,
  getCurrentISTDate,
  formatForBackend,
  parseDateFromBackend,
} from '../utils/dateUtils';

function Attendance() {
    const { user } = useContext(AuthContext);
    const [attendance, setAttendance] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [departmentName, setDepartmentName] = useState('');
    
    // Log when departmentName changes
    useEffect(() => {
        if (departmentName) {
            console.log('Department name updated:', departmentName);
        }
    }, [departmentName]);
    
    const [filters, setFilters] = useState({
        employeeId: '',
        departmentId: user?.department?._id || '',
        fromDate: formatForBackend(getCurrentISTDate()), // Initialize as IST
        toDate: formatForBackend(getCurrentISTDate()), // Initialize as IST
        status: 'all',
    });
    const [employeeNameFilter, setEmployeeNameFilter] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const [showDatePicker, setShowDatePicker] = useState({ from: false, to: false });

    if (__DEV__) {
        console.log('user', user);
    }

    const fetchDepartments = useCallback(async () => {
        try {
            const res = await api.get('/departments');
            const departments = res.data || [];
            setDepartmentName(res.data.departmentName);
            setDepartments([{ _id: user?.department?._id, name: res.data.departmentName }]);

            // Get the first department's name if available
            const firstDept = departments[0];
            
            console.log('Departments:', departments);
            console.log('First department:', firstDept?.name || 'No department name');
            
            if (firstDept?.name) {
                console.log('Setting department name to:', firstDept.name);
                setDepartmentName(firstDept.name);
            }

            return departments;
        } catch (err) {
            if (err.response?.status === 403) {
                if (__DEV__) {
                    console.log('User does not have permission to view departments');
                }
                setDepartments([]);
                return [];
            } else {
                console.error('Error fetching departments:', err);
                setError('Failed to load departments');
                return [];
            }
        }
    }, []);

    const fetchAttendance = useCallback(async () => {
        setLoading(true);
        try {
            // Build the base params
            const params = {
                fromDate: filters.fromDate || '',
                toDate: filters.toDate || '',
                // Always include departmentId for HODs
                ...(user?.loginType === 'HOD' && { departmentId: user?.department?._id || filters.departmentId }),
                // Only include status in params if it's not 'all' and not empty
                ...(filters.status && filters.status !== 'all' && { status: filters.status }),
            };

            // Add employee name filter if provided
            if (employeeNameFilter) {
                params.employeeName = employeeNameFilter.trim();
            }

            console.log('Fetching attendance with filters:', JSON.stringify(params, null, 2));

            if (user?.loginType !== 'HOD' && user?.employeeId) {
                params.employeeId = user.employeeId;
            } else if (user?.loginType !== 'HOD') {
                setError('User ID not available');
                setLoading(false);
                return;
            }
            if (__DEV__) {
                console.log('Fetching attendance with params:', params);
            }
            const response = await api.get('/attendance', { params });
            if (__DEV__) {
                console.log('Attendance API response:', response.data);
            }
            if (!response.data || !Array.isArray(response.data.attendance)) {
                setError('Invalid attendance data received');
                setAttendance([]);
                return;
            }
            setAttendance(response.data.attendance);
            setError(null);
        } catch (err) {
            console.error('Error fetching attendance:', err);
            setError(err.response?.status === 403
                ? 'You do not have permission to view attendance records'
                : 'Failed to load attendance data');
        } finally {
            setLoading(false);
        }
    }, [user, filters, employeeNameFilter]);

    // Separate useEffect for initial setup
    useEffect(() => {
        const setupUserData = async () => {
            if (user?.loginType !== 'HOD' && user?.employeeId) {
                setFilters(prev => ({ ...prev, employeeId: user.employeeId }));
            }
            if (user?.loginType === 'HOD') {
                if (user?.department?._id) {
                    setFilters(prev => ({
                        ...prev,
                        departmentId: user.department._id
                    }));
                    // Also set the department name if available
                    if (user.department.name) {
                        setDepartmentName(user.department.name);
                    }
                }
                if (user?.department) {
                    const deptData = { _id: user.department._id, name: user.department.name };
                    setDepartments([deptData]);
                    setFilters(prev => ({ ...prev, departmentId: user.department._id }));
                    setDepartmentName(user.department.name);
                } else {
                    const depts = await fetchDepartments();
                    if (depts.length > 0 && !departmentName) {
                        setDepartmentName(depts[0]?.name || '');
                    }
                }
            }
        };

        setupUserData();
    }, [user?.loginType, user?.employeeId, user?.department?._id]);

    // Initial data load
    useEffect(() => {
        if (user) {
            fetchAttendance();
        }
    }, [user]);

    const handleDateChange = useCallback((event, selectedDate, field) => {
        if (Platform.OS === 'android') {
            setShowDatePicker({ from: false, to: false });
            if (event.type === 'dismissed' || !selectedDate || isNaN(selectedDate)) {
                return;
            }
            const formattedDate = formatForBackend(selectedDate); // Format as IST YYYY-MM-DD
            const update = { [field]: formattedDate };
            if (field === 'fromDate' && !filters.toDate) {
                update.toDate = formattedDate;
            }
            setFilters(prev => ({ ...prev, ...update }));
            return;
        }
        if (!selectedDate || isNaN(selectedDate)) return;
        const formattedDate = formatForBackend(selectedDate); // Format as IST YYYY-MM-DD
        const update = { [field]: formattedDate };
        if (field === 'fromDate' && !filters.toDate) {
            update.toDate = formattedDate;
        }
        setFilters(prev => ({ ...prev, ...update }));
    }, [filters]);

    const handleChange = useCallback((name, value) => {
        setFilters(prev => ({ ...prev, [name]: value }));
    }, []);

    const handleFilter = useCallback(async () => {
        try {
            console.log('Applying filters:', filters);
            // Update toDate if only fromDate is provided
            let updatedFilters = { ...filters };
            if (filters.fromDate && !filters.toDate) {
                console.log('Setting toDate same as fromDate');
                updatedFilters.toDate = filters.fromDate;
                setFilters(prev => ({ ...prev, toDate: filters.fromDate }));
            }
            
            setCurrentPage(1); // Reset to first page when filters change
            setLoading(true);
            
            // Prepare params with current filters
            const params = {
                fromDate: updatedFilters.fromDate || '',
                toDate: updatedFilters.toDate || '',
                ...(updatedFilters.status && updatedFilters.status !== 'all' && { status: updatedFilters.status }),
                ...(employeeNameFilter && { employeeName: employeeNameFilter.trim() }),
                ...(updatedFilters.departmentId && { departmentId: updatedFilters.departmentId })
            };

            console.log('Fetching attendance with params:', params);
            const response = await api.get('/attendance', { params });
            
            if (!response.data || !Array.isArray(response.data.attendance)) {
                throw new Error('Invalid attendance data received');
            }
            
            setAttendance(response.data.attendance);
            setError(null);
        } catch (err) {
            console.error('Error applying filters:', err);
            if (err.response?.status === 403) {
                setAttendance([]);
                setError('No matching employees found in your department');
            } else {
                setError(err.response?.data?.message || 'Failed to apply filters');
            }
        } finally {
            setLoading(false);
        }
    }, [filters, employeeNameFilter]);

    const handlePreviousPage = useCallback(() => {
        console.log('Previous button pressed', { currentPage });
        if (currentPage > 1) {
            console.log('Updating to page:', currentPage - 1);
            setCurrentPage(prevPage => {
                console.log('Setting page to:', Math.max(1, prevPage - 1));
                return prevPage - 1;
            });
        } else {
            console.log('Cannot go to previous page - already on first page');
        }
    }, [currentPage]);

    const handleNextPage = useCallback(() => {
        console.log('Next button pressed', { currentPage, totalPages, attendanceLength: attendance.length });
        if (currentPage < totalPages) {
            console.log('Updating to page:', currentPage + 1);
            setCurrentPage(prevPage => {
                console.log('Setting page to:', prevPage + 1);
                return prevPage + 1;
            });
        }
    }, [currentPage, totalPages, attendance.length]);

    const renderItem = useCallback(({ item }) => (
        <Card style={styles.card}>
            <Card.Content>
                <Text style={styles.cardTitle}>{item.name || 'Unknown'}</Text>
                <Text>Employee ID: {item.employeeId || 'N/A'}</Text>
                <Text>Date: {item.logDate ? formatForDisplay(item.logDate) : 'N/A'}</Text>
                <Text>Time In: {item.timeIn ? formatTimeForDisplay(parseDateFromBackend(item.logDate).set({
                    hour: parseInt(item.timeIn.split(':')[0]),
                    minute: parseInt(item.timeIn.split(':')[1]),
                    second: parseInt(item.timeIn.split(':')[2] || 0),
                })) : '-'}</Text>
                <Text>Time Out: {item.timeOut ? formatTimeForDisplay(parseDateFromBackend(item.logDate).set({
                    hour: parseInt(item.timeOut.split(':')[0]),
                    minute: parseInt(item.timeOut.split(':')[1]),
                    second: parseInt(item.timeOut.split(':')[2] || 0),
                })) : '-'}</Text>
                <Text>Status: {item.status || 'N/A'}{item.halfDay ? ` (${item.halfDay})` : ''}</Text>
            </Card.Content>
        </Card>
    ), []);

    const hodDepartmentName = user?.loginType === 'HOD'
        ? departmentName || 'N/A'
        : 'N/A';

    const totalPages = Math.max(1, Math.ceil(attendance.length / itemsPerPage));
    console.log('Pagination state:', { currentPage, totalPages, itemsPerPage, attendanceLength: attendance.length });
    const paginatedAttendance = attendance.length > 0
        ? attendance.slice(
            (currentPage - 1) * itemsPerPage,
            currentPage * itemsPerPage
        )
        : [];

    // Reset to first page if current page is out of bounds
    useEffect(() => {
        if (currentPage > 1 && attendance.length > 0 && currentPage > totalPages) {
            setCurrentPage(1);
        }
    }, [attendance, currentPage, totalPages]);

    return (
        <View style={styles.container}>
            <FlatList
                data={paginatedAttendance}
                renderItem={renderItem}
                keyExtractor={(item, index) => item._id ? item._id : `${
                    item.employeeId}-${formatForBackend(item.logDate)}-${index}`}
                contentContainerStyle={styles.list}
                ListHeaderComponent={
                    <View style={styles.filterContainer}>
                        {user?.loginType === 'HOD' && (
                            <View style={styles.employeeFilterContainer}>
                                <Text style={styles.filterLabel}>Employee Name:</Text>
                                <TextInput
                                    style={styles.employeeInput}
                                    placeholder="Search by employee name"
                                    value={employeeNameFilter}
                                    onChangeText={setEmployeeNameFilter}
                                    onSubmitEditing={fetchAttendance}
                                    keyboardType="default"
                                    autoCapitalize="words"
                                    accessibilityLabel="Employee Name Filter"
                                />
                            </View>
                        )}
                        {user?.loginType === 'HOD' && (
                            <View style={styles.filterRow2}>
                                <Text style={[styles.filterLabel, { paddingTop: 10 }]}>Department:</Text>
                                <Text style={styles.departmentText}>{hodDepartmentName}</Text>
                            </View>
                        )}
                        
                        <View style={styles.statusFilterContainer}>
                            <Text style={styles.filterLabel}>Status:</Text>
                            <View style={styles.pickerContainer}>
                                <Picker
                                    selectedValue={filters.status || 'all'}
                                    onValueChange={(value) => {
                                        console.log('Status changed to:', value);
                                        handleChange('status', value);
                                    }}
                                    style={styles.picker}
                                    accessibilityLabel="Status Filter"
                                >
                                    <Picker.Item label="All Statuses" value="all" />
                                    <Picker.Item label="Present" value="Present" />
                                    <Picker.Item label="Absent" value="Absent" />
                                    <Picker.Item label="Half Day" value="Half Day" />
                                </Picker>
                            </View>
                        </View>
                        <View style={styles.dateInputsContainer}>
                            <TouchableOpacity
                                style={styles.dateInput}
                                onPress={() => setShowDatePicker({ from: true, to: false })}
                                accessibilityLabel="Select From Date"
                            >
                                <Text>From: {filters.fromDate}</Text>
                            </TouchableOpacity>
                            {showDatePicker.from && (
                                <View>
                                    <DateTimePicker
                                        value={parseDateFromBackend(filters.fromDate) || getCurrentISTDate().toDate()}
                                        mode="date"
                                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                        onChange={(event, date) => handleDateChange(event, date, 'fromDate')}
                                    />
                                    {Platform.OS === 'ios' && (
                                        <Button
                                            mode="contained"
                                            onPress={() => setShowDatePicker(prev => ({ ...prev, from: false }))}
                                            style={styles.doneButton}
                                            accessibilityLabel="Done Selecting From Date"
                                        >
                                            Done
                                        </Button>
                                    )}
                                </View>
                            )}
                            <TouchableOpacity
                                style={styles.dateInput}
                                onPress={() => setShowDatePicker({ from: false, to: true })}
                                accessibilityLabel="Select To Date"
                            >
                                <Text>To: {filters.toDate}</Text>
                            </TouchableOpacity>
                            {showDatePicker.to && (
                                <View>
                                    <DateTimePicker
                                        value={parseDateFromBackend(filters.toDate) || getCurrentISTDate().toDate()}
                                        mode="date"
                                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                        onChange={(event, date) => handleDateChange(event, date, 'toDate')}
                                    />
                                    {Platform.OS === 'ios' && (
                                        <Button
                                            mode="contained"
                                            onPress={() => setShowDatePicker(prev => ({ ...prev, to: false }))}
                                            style={styles.doneButton}
                                            accessibilityLabel="Done Selecting To Date"
                                        >
                                            Done
                                        </Button>
                                    )}
                                </View>
                            )}
                        </View>
                        <Button
                            mode="contained"
                            onPress={handleFilter}
                            style={styles.filterButton}
                            accessibilityLabel="Apply Filters"
                        >
                            Apply Filters
                        </Button>
                    </View>
                }
                ListFooterComponent={
                    <View style={styles.pagination}>
                        <View style={styles.individual}>
                            <RNButton
                                title="Previous"
                                onPress={handlePreviousPage}
                                disabled={currentPage === 1}
                                accessibilityLabel="Previous Page"
                                color="#007AFF"
                            />
                        </View>
                        <View style={styles.pageText}>
                            <Text>Page {currentPage} of {totalPages || 1}</Text>
                        </View>
                        <View style={styles.individual}>
                            <RNButton
                                title="Next"
                                onPress={handleNextPage}
                                disabled={currentPage >= totalPages || attendance.length === 0}
                                accessibilityLabel="Next Page"
                                color="#007AFF"
                            />
                        </View>
                    </View>
                }
                ListEmptyComponent={
                    loading ? (
                        <ActivityIndicator size="large" style={styles.loader} />
                    ) : error ? (
                        <Text style={styles.error}>{error}</Text>
                    ) : (
                        <Text style={styles.noData}>No attendance records found.</Text>
                    )
                }
                style={{ flex: 1 }}
                scrollEnabled={true}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    list: {
        flexGrow: 1,
        padding: 16,
    },
    filterContainer: {
        backgroundColor: 'white',
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
        elevation: 2,
    },
    pickerContainer: {
        borderColor: '#ddd',
        borderWidth: 1,
        borderRadius: 4,
        marginBottom: 12,
        backgroundColor: 'white',
        flex: 1,
    },
    picker: {
        height: 50,
    },
    dateInputsContainer: {
        marginBottom: 12,
    },
    dateInput: {
        backgroundColor: 'white',
        padding: 12,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: '#ddd',
        marginBottom: 8,
    },
    filterRow2: {
        flexDirection: 'row',
        marginTop: -5,
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    employeeFilterContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    statusFilterContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    filterLabel: {
        marginRight: 8,
        minWidth: 100,
        fontWeight: 'bold',
        paddingLeft: 10,
    },
    departmentText: {
        flex: 1,
        padding: 10,
        backgroundColor: 'white',
        borderRadius: 4,
    },
    employeeInput: {
        flex: 1,
        backgroundColor: 'white',
        padding: 8,
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 4,
        marginRight: 8,
    },
    filterButton: {
        marginTop: 8,
    },
    card: {
        backgroundColor: 'white',
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
        elevation: 2,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    pagination: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginVertical: 16,
        padding: 16,
        backgroundColor: 'white',
        borderRadius: 8,
    },
    individual: {
        flex: 1,
        marginHorizontal: 8,
    },
    pageText: {
        flex: 1,
        marginLeft: 10,
    },
    loader: {
        marginVertical: 20,
    },
    error: {
        color: '#d32f2f',
        textAlign: 'center',
        marginVertical: 20,
        padding: 16,
    },
    noData: {
        textAlign: 'center',
        marginVertical: 20,
        color: '#333',
        padding: 16,
    },
});

export default Attendance;