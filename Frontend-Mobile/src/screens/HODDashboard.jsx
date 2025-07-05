import React, { useContext, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { createDrawerNavigator, DrawerContentScrollView, DrawerItemList, DrawerItem } from '@react-navigation/drawer';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
// Notification functionality commented out
import NotificationBell from '../components/Notification.jsx';
import Profile from '../components/Profile.jsx';
import LeaveForm from '../components/LeaveForm.jsx';
import ODForm from '../components/ODForm.jsx';
import Attendance from '../components/Attendance.jsx';
import LeaveRequests from '../components/LeaveRequests.jsx';
import ODRequests from '../components/ODRequests.jsx';
import EmployeeDashboard from '../components/EmployeeDashboard.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import EmployeeList from '../components/EmployeeList.jsx';
import HODEmployeeProfile from '../components/HODEmployeeProfile.jsx';
import OTRequest from '../components/OTRequest.jsx';
import { eligibleDepartments } from '../services/constants';
// import Reports from '../components/Reports';

const Drawer = createDrawerNavigator();
const Stack = createStackNavigator();

const HODDashboard = () => {
  const navigation = useNavigation();
  const { user, logout } = useContext(AuthContext);
  const [hasAccess, setHasAccess] = React.useState(false);

  useEffect(() => {
    if (user) {
      const isHOD = user.loginType === 'HOD';
      const isEligibleDepartment = eligibleDepartments.some(
        dept => dept === user.department.name || dept === user.department
      );
      const accessGranted = isHOD && isEligibleDepartment;
      setHasAccess(accessGranted);
      
      // Debug logs
      console.log('user:', user);
      console.log('User department:', user.department);
      console.log('Is HOD/Admin:', isHOD);
      console.log('Is eligible department:', isEligibleDepartment);
      console.log('Access granted:', accessGranted);
    }
  }, [user, navigation]);
  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
      Alert.alert('Error', 'Failed to logout');
    }
  }

  const isOTEligible = user && eligibleDepartments.some(
    dept => dept === user.department.name || dept === user.department
  );

  const MainDrawer = () => (
    <Drawer.Navigator
      drawerContent={(props) => (
        <View style={{ flex: 1 }}>
          <DrawerContentScrollView {...props}>
            <DrawerItemList {...props} />
          </DrawerContentScrollView>
          <View style={styles.bottomDrawerSection}>
            <DrawerItem
              icon={({ color }) => (
                <Ionicons name="log-out-outline" size={22} color={color} />
              )}
              label="Logout"
              onPress={handleLogout}
              labelStyle={styles.logoutLabel}
            />
          </View>
        </View>
      )}
      screenOptions={({ navigation }) => ({
        headerStyle: {
          backgroundColor: '#fff',
          elevation: 0,
          shadowOpacity: 0,
        },
        headerTintColor: '#6b21a8',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        drawerStyle: {
          backgroundColor: '#fff',
          width: 280,
        },
        drawerActiveTintColor: '#6b21a8',
        drawerInactiveTintColor: '#64748b',
        headerLeft: () => (
          <TouchableOpacity
            onPress={() => navigation.openDrawer()}
            style={styles.hamburgerButton}
          >
            <Ionicons name="menu" size={24} color="white" />
          </TouchableOpacity>
        ),
      })}
    >
      <Drawer.Screen
        name="My Dashboard"
        component={EmployeeDashboard}
        options={{
          // title: 'Employee Portal',
          headerTitle: 'Employee Dashboard',
          headerStyle: { backgroundColor: '#6b21a8' },
          headerTintColor: '#fff',
          headerShown: true,
          // Notification functionality commented out
          headerRight: () => <NotificationBell />,
          drawerIcon: ({ color }) => (
            <Ionicons name="speedometer" size={20} color={color} />
          )
        }}
      />

      <Drawer.Screen
        name="My Profile"
        component={Profile}
        options={{
          headerTitle: 'My Profile',
          headerStyle: { backgroundColor: '#6b21a8' },
          headerTintColor: '#fff',
          // Notification functionality commented out
          headerRight: () => <NotificationBell />,
          drawerIcon: ({ color }) => (
            <Ionicons name="person" size={20} color={color} />
          )
        }}
      />
      <Drawer.Screen
        name="Leaves"
        component={LeaveForm}
        options={{
          headerTitle: 'Leaves',
          headerStyle: { backgroundColor: '#6b21a8' },
          headerTintColor: '#fff',
          // Notification functionality commented out
          headerRight: () => <NotificationBell />,
          drawerIcon: ({ color }) => (
            <Ionicons name="calendar" size={20} color={color} />
          )
        }}
      />
      <Drawer.Screen
        name="OD"
        component={ODForm}
        options={{
          headerTitle: 'OD',
          headerStyle: { backgroundColor: '#6b21a8' },
          headerTintColor: '#fff',
          // Notification functionality commented out
          headerRight: () => <NotificationBell />,
          drawerIcon: ({ color }) => (
            <Ionicons name="document" size={20} color={color} />
          )
        }}
      />
      <Drawer.Screen
        name="Attendance"
        component={Attendance}
        options={{
          headerTitle: 'Attendance',
          headerStyle: { backgroundColor: '#6b21a8' },
          headerTintColor: '#fff',
          // Notification functionality commented out
          headerRight: () => <NotificationBell />,
          drawerIcon: ({ color }) => (
            <Ionicons name="time" size={20} color={color} />
          )
        }}
      />

      <Drawer.Screen
        name="Leave Requests"
        component={LeaveRequests}
        options={{
          headerTitle: 'Leave Requests',
          headerStyle: { backgroundColor: '#6b21a8' },
          headerTintColor: '#fff',
          // Notification functionality commented out
          headerRight: () => <NotificationBell />,
          drawerIcon: ({ color }) => (
            <Ionicons name="document-text" size={20} color={color} />
          )
        }}
      />
      
      <Drawer.Screen
        name="OD Requests"
        component={ODRequests}
        options={{
          headerTitle: 'OD Requests',
          headerStyle: { backgroundColor: '#6b21a8' },
          headerTintColor: '#fff',
          // Notification functionality commented out
          headerRight: () => <NotificationBell />,
          drawerIcon: ({ color }) => (
            <Ionicons name="document-text" size={20} color={color} />
          )
        }}
      />

      {isOTEligible && (
      <Drawer.Screen
        name="OT Requests"
        component={OTRequest}
        options={{
          // title: 'Employee Portal',
          headerTitle: 'OT Requests',
          headerStyle: { backgroundColor: '#6b21a8' },
          headerTintColor: '#fff',
          // Notification functionality commented out
          headerRight: () => <NotificationBell />,
          drawerIcon: ({ color }) => (
            <Ionicons name="document-text" size={20} color={color} />
          )
        }}
      />)}

      <Drawer.Screen
        name="Employee List"
        component={EmployeeList}
        options={{
          headerTitle: 'Employee List',
          headerStyle: { backgroundColor: '#6b21a8' },
          headerTintColor: '#fff',
          // Notification functionality commented out
          headerRight: () => <NotificationBell />,
          drawerIcon: ({ color }) => (
            <Ionicons name="list" size={20} color={color} />
          )
        }}
      />

    </Drawer.Navigator>
  );

  return (
    <Stack.Navigator screenOptions={{
      headerShown: false
    }}>
      <Stack.Screen name="HODDrawer" component={MainDrawer} />
      <Stack.Screen
        name="HODEmployeeProfile"
        component={HODEmployeeProfile}
        options={{
          headerShown: true,
          title: 'Employee Profile',
          headerBackTitle: 'Back'
        }}
      />
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
  hamburgerButton: {
    marginLeft: 15,
    padding: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#fff',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#6b21a8',
    marginLeft: 15,
  },
});

export default HODDashboard;