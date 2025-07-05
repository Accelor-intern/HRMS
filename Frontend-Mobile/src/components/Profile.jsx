// File: screens/ProfileScreen.jsx
import React, { useState, useEffect, useContext, useCallback } from 'react';
import { View, ActivityIndicator, Alert, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import BasicInfoSection from '../components/BasicInfoSection';
import EmploymentDetailsSection from './EmploymentDetailsSection';
import BankDetailsSection from '../components/BankDetailsSection';
import StatutoryDetailsSection from './StatutoryDetailsSection';
import DocumentUploadSection from '../components/DocumentUploadSection';
import { useImagePicker } from '../Hooks/ImagePicker';
import PropTypes from 'prop-types';

const Tab = createMaterialTopTabNavigator();

const ProfileScreen = ({ navigation }) => {
  const { user } = useContext(AuthContext);
  const [profile, setProfile] = useState(null);
  const [files, setFiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const [fileErrors, setFileErrors] = useState({});
  const [isLocked, setIsLocked] = useState(false);

  const { handleImagePick } = useImagePicker({ setProfile, setFiles });

  // Common props for all sections

  const fetchProfile = useCallback(async () => {
    if (!user?.id) {
      if (navigation && typeof navigation.navigate === 'function') {
        navigation.navigate('Login');
      } else {
        console.error('Navigation not available');
      }
      return;
    }

    try {
      const res = await api.get(`/employees/${user.id}`);
      setProfile({ ...res.data });
      setIsLocked(res.data.locked || false);
      console.log('Profile fetched successfully:', JSON.stringify(res.data, null, 2));
    } catch (err) {
      console.error('Failed to fetch profile:', err);
      Alert.alert('Error', 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [user?.id, navigation]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleChange = (field, value) => {
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      setProfile(prev => ({
        ...prev,
        [parent]: { ...prev[parent], [child]: value }
      }));
    } else {
      setProfile(prev => ({ ...prev, [field]: value }))
      console.log(`change ${field} to ${value}`);
    }
    setErrors(prev => ({ ...prev, [field]: null }));
  };

  const handleSubmit = async () => {
    if (isLocked) {
      Alert.alert('Locked', 'Profile is locked. Contact admin.');
      return;
    }

    const requiredFields = [
      'name', 'mobileNumber', 'dateOfBirth', 'fatherName', 'motherName',
      'permanentAddress', 'currentAddress', 'email', 'aadharNumber',
      'bloodGroup', 'gender', 'maritalStatus', 'emergencyContactName',
      'emergencyContactNumber', 'dateOfJoining', 'status'
    ];

    if (!profile) {
      setErrors({ form: 'Profile data is not available' });
      Alert.alert('Error', 'Profile data is not available');
      return;
    }

    const newErrors = {};
    requiredFields.forEach(field => {
      const value = profile[field];
      if (!value || (typeof value === 'string' && value.trim() === '')) {
        // Convert camelCase to space-separated words for better error messages
        const fieldName = field.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^./, str => str.toUpperCase());
        newErrors[field] = `${fieldName} is required`;
      }
    });

    // Conditional validations
    if (profile.maritalStatus === 'Married' && !profile.spouseName?.trim()) {
      newErrors.spouseName = 'Spouse name is required when married';
    }

    if (profile.status === 'Resigned' && !profile.dateOfResigning?.trim()) {
      newErrors.dateOfResigning = 'Date of resigning is required';
    }

    // PAN number validation (10 alphanumeric characters, uppercase)
    if (profile.panNumber) {
      const panNumber = profile.panNumber.trim().toUpperCase();
      if (!/^[A-Z0-9]{10}$/.test(panNumber)) {
      newErrors.panNumber = 'PAN Number must be 10 alphanumeric characters (e.g., ABCDE1234F)';
      }
    }

    if (profile.status === 'Working') {
      if (!profile.employeeType?.trim()) {
        newErrors.employeeType = 'Employee type is required';
      } else if (profile.employeeType === 'Probation') {
        if (!profile.probationPeriod) {
          newErrors.probationPeriod = 'Probation period is required';
        }
        if (!profile.confirmationDate) {
          newErrors.confirmationDate = 'Confirmation date is required';
        }
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      Alert.alert('Validation Error', 'Please fix the errors in the form.');
      return;
    }

    // Create a clean data object with only the fields we want to send
    const cleanData = {};

    // List of fields we want to include in the update
    const allowedFields = [
      'name', 'mobileNumber', 'email', 'dateOfBirth', 'fatherName', 'motherName',
      'spouseName', 'gender', 'maritalStatus', 'bloodGroup', 'aadharNumber',
      'panNumber','pfNumber','esicNumber', 'uanNumber', 'permanentAddress', 'currentAddress', 'emergencyContactName',
      'emergencyContactNumber', 'dateOfJoining', 'dateOfResigning', 'status',
      'employeeType', 'probationPeriod', 'confirmationDate', 'designation',
      'reportingManager', 'location', 'referredBy', 'basicInfoLocked',
      'documentsLocked', 'paymentLocked', 'statutoryLocked', 'positionLocked',
      'department'
    ];

    // Only include allowed fields and handle special cases
    allowedFields.forEach(field => {
      if (profile[field] === undefined || profile[field] === null || profile[field] === '') {
        return; // Skip undefined, null, or empty string values
      }

      // Handle date fields - ensure they're valid dates
      if ((field === 'dateOfBirth' || field === 'dateOfJoining' || field === 'dateOfResigning' || field === 'confirmationDate') && profile[field]) {
        const date = new Date(profile[field]);
        if (!isNaN(date.getTime())) {
          cleanData[field] = date.toISOString().split('T')[0]; // Format as YYYY-MM-DD
        }
        return;
      }
      
      // Handle department and reportingManager specially - extract just the ID if it's an object
      if (field === 'department' || field === 'reportingManager') {
        // Skip if reportingManager is an empty string
        if (field === 'reportingManager' && profile[field] === '') {
          return;
        }
        
        if (typeof profile[field] === 'object' && profile[field] !== null) {
          cleanData[field] = profile[field]._id || profile[field];
        } else if (typeof profile[field] === 'string' && profile[field].includes('_id')) {
          // If it's a string that looks like it might be JSON, try to parse it
          try {
            const parsed = JSON.parse(profile[field]);
            cleanData[field] = parsed._id || parsed;
          } catch (e) {
            // If parsing fails, use the value as is if it's not empty
            if (profile[field].trim() !== '') {
              cleanData[field] = profile[field];
            }
          }
        } else if (profile[field].trim() !== '') {
          cleanData[field] = profile[field];
        }
      } else {
        cleanData[field] = profile[field];
      }
    });

    // Create form data and append the clean data
    const formData = new FormData();

    // Append all clean data fields
    Object.entries(cleanData).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        // Handle nested objects (like department)
        if (typeof value === 'object' && value !== null && !(value instanceof File)) {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, value);
        }
      }
    });
    // Append each field individually for bankDetails
    if (profile.bankDetails) {
      Object.entries(profile.bankDetails).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(`bankDetails[${key}]`, value);
        }
      });
    }

    // Append each field individually for statutoryDetails
    if (profile.statutoryDetails) {
      Object.entries(profile.statutoryDetails).forEach(([key, value]) => {
        if (typeof value === 'object' && value !== null && !(value instanceof File)) {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, value);
        }
      });
    }

    // Append files if any
    Object.entries(files).forEach(([key, file]) => {
      if (file) {
        const fileInfo = {
          uri: file.uri,
          type: file.mimeType || 'image/jpeg',
          name: file.name || `file-${Date.now()}.jpg`
        };
        formData.append(key, fileInfo);
      }
    });

    try {
      console.log('Sending profile update request...');
      console.log('URL:', `/employees/${user.id}`);

      // Log form data for debugging
      const formDataObj = {};
      for (let [key, value] of formData._parts) {
        formDataObj[key] = value;
      }
      console.log('Form data:', JSON.stringify(formDataObj, null, 2));

      const config = {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Accept': 'application/json',
        },
        timeout: 30000, // 30 seconds timeout
      };

      const res = await api.put(`/employees/${user.id}`, formData, config);

      console.log('Update successful:', res.data);
      Alert.alert('Success', res.data.message || 'Profile updated successfully');
    } catch (err) {
      console.error('Profile update error:', {
        message: err.message,
        code: err.code,
        response: {
          status: err.response?.status,
          statusText: err.response?.statusText,
          data: err.response?.data
        },
        config: {
          url: err.config?.url,
          method: err.config?.method,
          headers: err.config?.headers
        }
      });

      let errorMessage = 'Failed to update profile';

      if (err.code === 'ECONNABORTED') {
        errorMessage = 'Request timed out. Please check your internet connection and try again.';
      } else if (err.message === 'Network Error') {
        errorMessage = 'Unable to connect to the server. Please check your internet connection.';
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.message) {
        errorMessage = err.message;
      }

      Alert.alert('Error', errorMessage);

      // If there are validation errors from the server, update the errors state
      if (err.response?.data?.errors) {
        setErrors(prev => ({
          ...prev,
          ...err.response.data.errors
        }));
      }
    }
  };

  if (loading) return <ActivityIndicator size="large" style={{ marginTop: 50 }} />;
  if (!profile) return null;

  // Common props for all sections

  const commonProps = {
    profile,
    errors,
    onChange: handleChange,
    isLocked,
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <Tab.Navigator
        screenOptions={{
          tabBarLabelStyle: { fontSize: 12 },
          tabBarItemStyle: { padding: 0, height: 50 },
          tabBarStyle: { backgroundColor: '#fff' },
          tabBarActiveTintColor: '#4CAF50',
          tabBarInactiveTintColor: '#666',
          tabBarIndicatorStyle: { backgroundColor: '#4CAF50' },
          swipeEnabled: true,
        }}
      >
        <Tab.Screen name="Basic Info">
          {() => (
            <BasicInfoSection
              {...commonProps}
              onImagePick={handleImagePick}
            />
          )}
        </Tab.Screen>

        <Tab.Screen name="Employment">
          {() => <EmploymentDetailsSection {...commonProps} />}
        </Tab.Screen>

        <Tab.Screen name="Bank">
          {() => <BankDetailsSection {...commonProps} />}
        </Tab.Screen>

        <Tab.Screen name="Statutory">
          {() => <StatutoryDetailsSection {...commonProps} />}
        </Tab.Screen>

        <Tab.Screen name="Documents">
          {() => (
            <DocumentUploadSection
              {...commonProps}
              files={files}
              setFiles={setFiles}
              fileErrors={fileErrors}
            />
          )}
        </Tab.Screen>
      </Tab.Navigator>

      {/* Save button fixed at the bottom */}
      <View style={styles.saveButtonContainer}>
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSubmit}
          disabled={isLocked}
        >
          <Text style={styles.saveButtonText}>
            {isLocked ? 'Profile is locked' : 'Save Profile'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

ProfileScreen.propTypes = {
  navigation: PropTypes.shape({
    navigate: PropTypes.func.isRequired,
  }).isRequired,
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  saveButtonContainer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  saveButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 6,
    padding: 14,
    alignItems: 'center',
  },
  saveButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default ProfileScreen;