import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Modal,
    TouchableWithoutFeedback,
    Switch,
    Alert,
    ActivityIndicator
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import api from '../services/api';
import { formatForDisplay, formatForBackend, parseDateFromBackend, getCurrentISTDate } from '../utils/dateUtils';

const EmploymentDetailsSection = ({ profile, errors, onChange, isLocked, user, employeeId }) => {
    const [isPickerVisible, setPickerVisible] = useState(false);
    const [isReportingManagerPickerVisible, setReportingManagerPickerVisible] = useState(false);
    const [isDepartmentPickerVisible, setDepartmentPickerVisible] = useState(false);
    const [isEmergencyLeaveAllowed, setIsEmergencyLeaveAllowed] = useState(profile.emergencyLeaveAllowed || false);
    const [isLoading, setIsLoading] = useState(false);
    const [isFetchingPermission, setIsFetchingPermission] = useState(false);
    const [showDateOfResigningPicker, setShowDateOfResigningPicker] = useState(false);
    const [showConfirmationDatePicker, setShowConfirmationDatePicker] = useState(false);

    // Fetch emergency leave permission when component mounts for HOD
    useEffect(() => {
        if (user?.loginType === 'HOD' && employeeId) {
            const fetchEmergencyLeavePermission = async () => {
                setIsFetchingPermission(true);
                try {
                    const response = await api.get(`/employees/${employeeId}/emergency-leave-permission-existing`);
                    const { canApplyEmergencyLeave } = response.data;
                    console.log('Fetched emergency leave permission:', canApplyEmergencyLeave);
                    setIsEmergencyLeaveAllowed(canApplyEmergencyLeave || false);
                } catch (error) {
                    console.error('Error fetching emergency leave permission');
                    Alert.alert('Error', 'Failed to fetch emergency leave permission');
                    setIsEmergencyLeaveAllowed(false);
                } finally {
                    setIsFetchingPermission(false);
                }
            };
            fetchEmergencyLeavePermission();
        }
    }, [user?.loginType, employeeId]);

    const handleToggleEmergencyLeave = async (value) => {
        if (!employeeId) {
            Alert.alert('Error', 'Employee ID is required');
            return;
        }
        try {
            setIsLoading(true);
            await api.patch(`/employees/${employeeId}/emergency-leave-permission`, {
                emergencyLeaveAllowed: value
            });
            console.log('Emergency leave permission updated successfully to', value);
            setIsEmergencyLeaveAllowed(value);
            Alert.alert('Success', `Emergency leave permission ${value ? 'enabled' : 'disabled'}`);
        } catch (error) {
            console.error('Error updating emergency leave permission:', error);
            Alert.alert('Error', 'Failed to update emergency leave permission');
            setIsEmergencyLeaveAllowed(!value);
        } finally {
            setIsLoading(false);
        }
    };

    const employeeTypes = [
        { label: 'Select', value: '' },
        { label: 'Intern', value: 'Intern' },
        { label: 'Probation', value: 'Probation' },
        { label: 'Confirmed', value: 'Confirmed' },
        { label: 'Contractual', value: 'Contractual' },
    ];

    const reportingManagers = [
        { label: 'Select', value: '' },
        { label: 'John Doe', value: 'John Doe' },
        { label: 'Jane Smith', value: 'Jane Smith' },
        { label: 'Alice Johnson', value: 'Alice Johnson' },
        { label: 'Bob Wilson', value: 'Bob Wilson' },
    ];

    const [departments, setDepartments] = useState(() => {
        if (isLocked && profile.department) {
            return [
                { label: profile.department.name || 'Department', value: profile.department._id || null }
            ];
        }
        return [
            { label: 'Loading departments...', value: null }
        ];
    });
    const [isLoadingDepartments, setIsLoadingDepartments] = useState(!isLocked);

    useEffect(() => {
        if (isLocked) return;
        let isMounted = true;

        const fetchDepartments = async () => {
            try {
                const response = await api.get('/departments');
                if (!isMounted) return;

                const formattedDepartments = response.data.map(dept => ({
                    label: dept.name,
                    value: dept._id
                }));

                const currentDept = profile.department?._id ? 
                    { label: profile.department.name, value: profile.department._id } : 
                    null;

                const allDepartments = [
                    { label: 'Select Department', value: null },
                    ...formattedDepartments
                ];

                if (currentDept && !formattedDepartments.some(d => d.value === currentDept.value)) {
                    allDepartments.push(currentDept);
                }

                setDepartments(allDepartments);
            } catch (error) {
                console.error('Error fetching departments:', error);
                setDepartments([
                    { label: profile.department?.name || 'Department', value: profile.department?._id || null },
                    { label: 'Failed to load departments', value: 'error' }
                ]);
            } finally {
                if (isMounted) {
                    setIsLoadingDepartments(false);
                }
            }
        };

        fetchDepartments();
        return () => {
            isMounted = false;
        };
    }, [isLocked, profile.department]);

    const handleField = (label, name, keyboardType = 'default', placeholder = '') => (
        <View style={styles.inputGroup}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
                style={[styles.input, errors[name] && styles.inputError]}
                value={profile[name] || ''}
                onChangeText={(text) => onChange(name, text)}
                editable={!isLocked && label !== 'Reporting Manager'}
                keyboardType={keyboardType}
                placeholder={placeholder || `Enter ${label.toLowerCase()}`}
            />
            {errors[name] && <Text style={styles.errorText}>{errors[name]}</Text>}
        </View>
    );

    const getNestedValue = (obj, path) => {
        return path.split('.').reduce((o, p) => o && o[p], obj);
    };

    const isOptionSelected = (optionValue, fieldPath) => {
        if (fieldPath.includes('.')) {
            return optionValue === getNestedValue(profile, fieldPath);
        }
        return optionValue === profile[fieldPath];
    };

    const getDisplayText = (fieldPath, options, label) => {
        const selectedOption = options.find(opt => {
            if (fieldPath.includes('.')) {
                return opt.value === getNestedValue(profile, fieldPath);
            }
            return opt.value === profile[fieldPath];
        });
        return selectedOption?.label || `Select ${label.toLowerCase()}`;
    };

    const renderDropdown = (label, field, options, showPicker, setShowPicker) => (
        <View style={styles.inputGroup}>
            <Text style={styles.label}>{label}</Text>
            <TouchableOpacity
                style={[styles.dropdownContainer, errors[field] && styles.inputError]}
                onPress={() => !isLocked && setShowPicker(true)}
                disabled={isLocked}
            >
                <Text style={styles.dropdownText}>
                    {getDisplayText(field, options, label)}
                </Text>
                <MaterialIcons name="arrow-drop-down" size={24} color="#666" />
            </TouchableOpacity>
            {errors[field] && <Text style={styles.errorText}>{errors[field]}</Text>}
            <Modal
                visible={showPicker}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setShowPicker(false)}
            >
                <View style={styles.modalOverlay}>
                    <TouchableWithoutFeedback onPress={() => setShowPicker(false)}>
                        <View style={StyleSheet.absoluteFill} />
                    </TouchableWithoutFeedback>
                    <View style={styles.modalContent}>
                        <ScrollView>
                            {options.map((option) => (
                                <TouchableOpacity
                                    key={option.value}
                                    style={styles.option}
                                    onPress={() => {
                                        onChange(field, option.value);
                                        setShowPicker(false);
                                    }}
                                >
                                    <Text style={[
                                        styles.optionText,
                                        isOptionSelected(option.value, field) && styles.selectedOption
                                    ]}>
                                        {option.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );

    const renderDateField = (label, field, showPicker, setShowPicker) => (
        <View style={styles.inputGroup}>
            <Text style={styles.label}>{label}</Text>
            <TouchableOpacity
                style={[styles.input, styles.dateInput, errors[field] && styles.inputError]}
                onPress={() => !isLocked && setShowPicker(true)}
                disabled={isLocked}
            >
                <Text style={{ color: profile[field] ? '#000' : '#aaa' }}>
                    {profile[field] ? formatForDisplay(profile[field]) : `Select ${label.toLowerCase()}`}
                </Text>
                <MaterialIcons name="calendar-today" size={24} color="#666" />
            </TouchableOpacity>
            {showPicker && (
                <DateTimePicker
                    value={profile[field] ? parseDateFromBackend(profile[field]).toDate() : getCurrentISTDate().toDate()}
                    mode="date"
                    display="calendar"
                    onChange={(event, selectedDate) => {
                        console.log(`DateTimePicker event for ${field}:`, { eventType: event.type, selectedDate });
                        setShowPicker(false);
                        if (event.type === 'set' && selectedDate) {
                            const formattedDate = formatForBackend(selectedDate);
                            console.log(`Updating ${field} to: ${formattedDate}`);
                            onChange(field, formattedDate);
                        }
                    }}
                    onError={(error) => {
                        console.error(`DateTimePicker error for ${field}:`, error);
                        setShowPicker(false);
                    }}
                />
            )}
            {errors[field] && <Text style={styles.errorText}>{errors[field]}</Text>}
        </View>
    );

    return (
        <View style={styles.container}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ flexGrow: 1 }}
                scrollEnabled={true}
                bounces={true}
                showsVerticalScrollIndicator={true}
            >
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Employment Details</Text>

                    {handleField('Reporting Manager', 'reportingManager.name')}
                    {handleField('Designation', 'Designation')}
                    {renderDropdown('Department', 'department', departments, isDepartmentPickerVisible, setDepartmentPickerVisible)}
                    {renderDropdown('Employee Type', 'employeeType', employeeTypes, isPickerVisible, setPickerVisible)}

                    {user?.loginType === 'HOD' && (
                        <View style={styles.toggleContainer}>
                            <Text style={styles.toggleLabel}>Emergency Leave Permission</Text>
                            {isFetchingPermission ? (
                                <ActivityIndicator size="small" color="#666" />
                            ) : (
                                <Switch
                                    trackColor={{ false: '#767577', true: '#6b21a8' }}
                                    thumbColor={isEmergencyLeaveAllowed ? '#f5dd4b' : '#f4f3f4'}
                                    ios_backgroundColor="#3e3e3e"
                                    onValueChange={handleToggleEmergencyLeave}
                                    value={isEmergencyLeaveAllowed}
                                    disabled={isLoading}
                                />
                            )}
                        </View>
                    )}

                    {profile.employeeType === 'Probation' && (
                        <>
                            {handleField('Probation Period (Months)', 'probationPeriod', 'numeric')}
                            {renderDateField('Confirmation Date', 'confirmationDate', showConfirmationDatePicker, setShowConfirmationDatePicker)}
                        </>
                    )}

                    {profile.employeeType === 'Resigned' && (
                        renderDateField('Date of Resigning', 'dateOfResigning', showDateOfResigningPicker, setShowDateOfResigningPicker)
                    )}
                </View>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        width: '100%',
        backgroundColor: '#fff',
    },
    section: {
        padding: 16,
        backgroundColor: '#fff',
        borderRadius: 8,
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 16,
        color: '#333',
    },
    inputGroup: {
        marginBottom: 16,
    },
    label: {
        fontSize: 14,
        marginBottom: 6,
        color: '#444',
    },
    input: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 6,
        padding: 10,
        backgroundColor: '#f9f9f9',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    dropdownContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 6,
        padding: 10,
        backgroundColor: '#f9f9f9',
    },
    dropdownText: {
        fontSize: 16,
        color: '#333',
        flex: 1,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        maxHeight: '100%',
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#ccc',
        padding: 8,
        maxHeight: '70%',
        width: '90%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
    option: {
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    optionText: {
        fontSize: 16,
        color: '#333',
    },
    selectedOption: {
        color: '#007AFF',
        fontWeight: '600',
    },
    toggleContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: '#eee',
        marginTop: 16,
        paddingHorizontal: 12,
        backgroundColor: '#f9f9f9',
        borderRadius: 8,
    },
    toggleLabel: {
        fontSize: 16,
        color: '#333',
        fontWeight: '500',
    },
    inputError: {
        borderColor: 'red',
    },
    errorText: {
        color: 'red',
        fontSize: 12,
        marginTop: 4,
    },
    dateInput: {
        justifyContent: 'center',
        height: 50,
    },
});

export default EmploymentDetailsSection;