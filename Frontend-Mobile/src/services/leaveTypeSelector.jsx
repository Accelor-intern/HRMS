import React, { useContext } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Menu } from 'react-native-paper';
import { LEAVE_TYPES, eligibleDepartments } from './constants';
import { AuthContext } from '../context/AuthContext';

const LeaveTypeSelector = React.memo(({ leaveType, setLeaveType, canApplyEmergencyLeave, leaveTypeVisible, setLeaveTypeVisible, userDepartment, error }) => {
  // Filter leave types based on conditions
  const { user } = useContext(AuthContext);
  const filteredLeaveTypes = (() => {
    let types = [...LEAVE_TYPES];
    
    // Remove Emergency leave if not eligible
    if (!canApplyEmergencyLeave) {
      types = types.filter(type => type !== 'Emergency');
    }

    // Show the the leave type according to gender
    if (user.gender === 'Female') {
      types = types.filter(type => type !== 'Paternity');
    } else if ( user.gender === 'Male') {
      types = types.filter(type => type !== 'Maternity');
    }
    
    // Remove Compensatory leave if user is in eligible department
    if (userDepartment && eligibleDepartments.includes(userDepartment)) {
      types = types.filter(type => type !== 'Compensatory');
    }
    
    return types;
  })();

  return (
    <View style={styles.formGroup}>
      <Text style={styles.label}>Leave Type</Text>
      <Menu
        visible={leaveTypeVisible}
        onDismiss={() => setLeaveTypeVisible(false)}
        contentStyle={{ backgroundColor: '#ffffff' }}
        style={{ marginTop: -80 }}
        anchor={
          <TouchableOpacity
            style={[styles.dropdownButton, error && styles.errorBorder]}
            onPress={() => setLeaveTypeVisible(true)}
          >
            <Text style={leaveType ? styles.dropdownButtonText : styles.dropdownButtonPlaceholder}>
              {leaveType || 'Select Leave Type'}
            </Text>
          </TouchableOpacity>
        }
      >
        {filteredLeaveTypes.map((type) => (
          <Menu.Item
            key={type}
            onPress={() => {
              setLeaveType(type);
              setLeaveTypeVisible(false);
            }}
            title={type}
            titleStyle={styles.titleStyle}
          />
        ))}
      </Menu>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
});

const styles = StyleSheet.create({
  formGroup: {
    marginBottom: 15,
  },
  label: {
    fontSize: 14,
    marginBottom: 5,
    color: '#555',
    fontWeight: '500',
  },
  dropdownButton: {
    borderWidth: 1,
    borderColor: '#9ca3af',
    borderRadius: 6,
    padding: 12,
    marginTop: 6,
    backgroundColor: 'white',
    justifyContent: 'center',
    height: 46,
  },
  errorBorder: {
    borderColor: 'red',
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
  errorText: {
    color: 'red',
    fontSize: 12,
    marginTop: 4,
  },
});

export default LeaveTypeSelector;