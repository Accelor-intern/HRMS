import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Modal, TouchableWithoutFeedback, ActivityIndicator, Image } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system';
import { fetchFileAsBlob } from '../services/api';
import { formatForDisplay, formatForBackend, parseDateFromBackend, getCurrentISTDate } from '../utils/dateUtils';

const BasicInfoSection = ({ profile, errors, onChange, onImagePick, isLocked }) => {
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showDateOfJoiningPicker, setShowDateOfJoiningPicker] = useState(false);
    const [showGenderPicker, setShowGenderPicker] = useState(false);
    const [showBloodGroupPicker, setShowBloodGroupPicker] = useState(false);
    const [showMaritalStatusPicker, setShowMaritalStatusPicker] = useState(false);
    const [showStatusPicker, setShowStatusPicker] = useState(false);
    const [profileUri, setProfileUri] = useState(null);
    const [profileLoading, setProfileLoading] = useState(false);

    const genderOptions = [
        { label: 'Select Gender', value: '' },
        { label: 'Male', value: 'Male' },
        { label: 'Female', value: 'Female' },
        { label: 'Other', value: 'Other' },
    ];
    const bloodGroups = [
        { label: 'Select Blood Group', value: '' },
        { label: 'A+', value: 'A+' },
        { label: 'A-', value: 'A-' },
        { label: 'B+', value: 'B+' },
        { label: 'B-', value: 'B-' },
        { label: 'AB+', value: 'AB+' },
        { label: 'AB-', value: 'AB-' },
        { label: 'O+', value: 'O+' },
        { label: 'O-', value: 'O-' },
    ];
    const maritalStatusOptions = [
        { label: 'Select', value: '' },
        { label: 'Single', value: 'Single' },
        { label: 'Married', value: 'Married' },
    ];
    const statusOptions = [
        { label: 'Select Status', value: '' },
        { label: 'Working', value: 'Working' },
        { label: 'Resigned', value: 'Resigned' },
    ];

    const fields = [
        { label: 'Full Name', name: 'name', keyboardType: 'default' },
        { label: 'Email', name: 'email', keyboardType: 'email-address' },
        { label: 'Mobile Number', name: 'mobileNumber', keyboardType: 'phone-pad' },
        { label: "Father's Name", name: 'fatherName', keyboardType: 'default' },
        { label: "Mother's Name", name: 'motherName', keyboardType: 'default' },
        { label: 'Permanent Address', name: 'permanentAddress', keyboardType: 'default' },
        { label: 'Current Address', name: 'currentAddress', keyboardType: 'default' },
        { label: 'Aadhar Number', name: 'aadharNumber', keyboardType: 'numeric' },
        { label: 'Emergency Contact Name', name: 'emergencyContactName', keyboardType: 'default' },
        { label: 'Emergency Contact Number', name: 'emergencyContactNumber', keyboardType: 'phone-pad' },
        { label: 'Employee ID', name: 'employeeId', keyboardType: 'default' },
        { label: 'User ID', name: 'userId', keyboardType: 'default' },
    ];

    useEffect(() => {
        const loadProfilePicture = async () => {
            if (!profile?.profilePicture) return;
            setProfileLoading(true);
            try {
                const cacheDir = `${FileSystem.cacheDirectory}downloaded_files/`;
                const extension = 'jpg';
                const filePath = `${cacheDir}${profile.profilePicture}.${extension}`;
                const fileInfo = await FileSystem.getInfoAsync(filePath);

                const isCacheValid = fileInfo.exists &&
                    Date.now() - fileInfo.modificationTime * 1000 < 24 * 60 * 60 * 1000 &&
                    fileInfo.size > 0;

                if (isCacheValid) {
                    console.log('Using cached profile picture');
                    setProfileUri(filePath);
                } else {
                    console.log('Downloading new profile picture');
                    const path = await fetchFileAsBlob(profile.profilePicture, `profile.${extension}`);
                    setProfileUri(path);
                }
            } catch (err) {
                console.error('Failed to load profile picture:', err.message);
            } finally {
                setProfileLoading(false);
            }
        };
        loadProfilePicture();
    }, [profile?.profilePicture]);

    const renderDropdown = (label, field, options, showPicker, setShowPicker) => (
        <View style={styles.inputGroup}>
            <Text style={styles.label}>{label}</Text>
            <TouchableOpacity
                style={[styles.dropdownContainer, errors[field] && styles.inputError]}
                onPress={() => !isLocked && setShowPicker(true)}
                disabled={isLocked}
            >
                <Text style={styles.dropdownText}>
                    {options.find(opt => opt.value === profile[field])?.label || `Select ${label.toLowerCase()}`}
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
                <TouchableWithoutFeedback onPress={() => setShowPicker(false)}>
                    <View style={styles.modalOverlay}>
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
                                            option.value === profile[field] && styles.selectedOption
                                        ]}>
                                            {option.label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
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
                    <Text style={styles.sectionTitle}>Basic Information</Text>

                    {profile?.profilePicture ? (
                        <View style={styles.profileContainer}>
                            {profileLoading ? (
                                <ActivityIndicator size="small" color="#0000ff" />
                            ) : profileUri ? (
                                <Image source={{ uri: profileUri }} style={styles.profileImage} onError={(e) => console.log('Error loading image:', e.nativeEvent.error)} />
                            ) : (
                                <MaterialIcons name="person" size={50} color="#666666" style={styles.defaultIcon} />
                            )}
                        </View>
                    ) : (
                        <View style={styles.profileContainer}>
                            <MaterialIcons name="person" size="50" color="#666666" style={styles.defaultIcon} />
                        </View>
                    )}

                    {fields.map((field) => (
                        <View key={field.name} style={styles.inputGroup}>
                            <Text style={styles.label}>{field.label}</Text>
                            <TextInput
                                style={[styles.input, errors[field.name] && styles.inputError]}
                                value={profile[field.name] || ''}
                                onChangeText={(text) => onChange(field.name, text)}
                                keyboardType={field.keyboardType}
                                editable={!isLocked}
                                placeholder={`Enter ${field.label.toLowerCase()}`}
                            />
                            {errors[field.name] && <Text style={styles.errorText}>{errors[field.name]}</Text>}
                        </View>
                    ))}

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Date of Birth</Text>
                        <TouchableOpacity
                            onPress={() => !isLocked && setShowDatePicker(true)}
                            style={[styles.input, styles.dateInput, errors.dateOfBirth && styles.inputError]}
                        >
                            <Text style={{ color: profile.dateOfBirth ? '#000' : '#aaa' }}>
                                {profile.dateOfBirth ? formatForDisplay(profile.dateOfBirth) : 'Select date of birth'}
                            </Text>
                        </TouchableOpacity>
                        {showDatePicker && (
                            <DateTimePicker
                                value={profile.dateOfBirth ? parseDateFromBackend(profile.dateOfBirth).toDate() : getCurrentISTDate().toDate()}
                                mode="date"
                                display="default"
                                onChange={(event, selectedDate) => {
                                    setShowDatePicker(false);
                                    if (event.type !== 'dismissed' && selectedDate) {
                                        onChange('dateOfBirth', formatForBackend(selectedDate));
                                    }
                                }}
                            />
                        )}
                        {errors.dateOfBirth && <Text style={styles.errorText}>{errors.dateOfBirth}</Text>}
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Date of Joining</Text>
                        <TouchableOpacity
                            onPress={() => !isLocked && setShowDateOfJoiningPicker(true)}
                            style={[styles.input, styles.dateInput, errors.dateOfJoining && styles.inputError]}
                        >
                            <Text style={{ color: profile.dateOfJoining ? '#000' : '#aaa' }}>
                                {profile.dateOfJoining ? formatForDisplay(profile.dateOfJoining) : 'Select date of joining'}
                            </Text>
                        </TouchableOpacity>
                        {showDateOfJoiningPicker && (
                            <DateTimePicker
                                value={profile.dateOfJoining ? parseDateFromBackend(profile.dateOfJoining).toDate() : getCurrentISTDate().toDate()}
                                mode="date"
                                display="default"
                                onChange={(event, selectedDate) => {
                                    setShowDateOfJoiningPicker(false);
                                    if (event.type !== 'dismissed' && selectedDate) {
                                        onChange('dateOfJoining', formatForBackend(selectedDate));
                                    }
                                }}
                            />
                        )}
                        {errors.dateOfJoining && <Text style={styles.errorText}>{errors.dateOfJoining}</Text>}
                    </View>

                    {renderDropdown('Gender', 'gender', genderOptions, showGenderPicker, setShowGenderPicker)}
                    {renderDropdown('Blood Group', 'bloodGroup', bloodGroups, showBloodGroupPicker, setShowBloodGroupPicker)}
                    {renderDropdown('Marital Status', 'maritalStatus', maritalStatusOptions, showMaritalStatusPicker, setShowMaritalStatusPicker)}
                    {renderDropdown('Status', 'status', statusOptions, showStatusPicker, setShowStatusPicker)}
                </View>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    profileContainer: {
        alignItems: 'center',
        marginBottom: -20,
        marginTop: -10,
    },
    profileImage: {
        width: 80,
        height: 80,
        borderRadius: 60,
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

export default BasicInfoSection;