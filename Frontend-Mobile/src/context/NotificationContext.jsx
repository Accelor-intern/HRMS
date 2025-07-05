import React, { createContext, useContext, useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import api from '../services/api';
const EXPO_PUBLIC_API_URL = 'http://192.168.1.28:5001/api';

const NotificationContext = createContext();

const NotificationProvider = ({ children }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [socket, setSocket] = useState(null);

  // Fetch initial notifications
  const fetchNotifications = async () => {
    try {
      const response = await api.get('/notifications').catch(error => {
        if (error.response?.status === 500) {
          console.error('Server error while fetching notifications:', error.response?.data);
          // You might want to show a user-friendly message or retry logic here
        }
        throw error;
      });
      
      if (response?.data) {
        const unread = response.data.filter(n => !n.read).length;
        setNotifications(response.data || []);
        setUnreadCount(unread);
      }
    } catch (error) {
      console.error('Error in fetchNotifications:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
    }
  };
  // Mark notification as read
  const markAsRead = async (notificationId) => {
    if (!notificationId) {
      console.warn('markAsRead called with invalid notificationId');
      return;
    }
    
    try {
      await api.put(`/notifications/${notificationId}/read`).catch(error => {
        if (error.response?.status === 500) {
          console.error('Server error while marking notification as read:', error.response?.data);
        }
        throw error;
      });
      
      setNotifications(prev =>
        prev.map(n =>
          n._id === notificationId ? { ...n, read: true } : n
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error in markAsRead:', {
        message: error.message,
        notificationId,
        status: error.response?.status
      });
    }
  };

  // Mark all notifications as read
  const markAllAsRead = async () => {
    try {
      const unreadNotifications = notifications.filter(n => n?._id && !n.read);
      
      if (unreadNotifications.length === 0) {
        console.log('No unread notifications to mark as read');
        return;
      }
  
      console.log(`Marking ${unreadNotifications.length} notifications as read`);
      
      for (const notification of unreadNotifications) {
        if (!notification?._id) {
          console.warn('Skipping notification with invalid ID:', notification);
          continue;
        }
        
        try {
          console.log('Marking notification as read:', notification._id);
          await markAsRead(notification._id);
        } catch (error) {
          console.error(`Error marking notification ${notification._id} as read:`, error);
          // Continue with next notification even if one fails
        }
      }
    } catch (error) {
      console.error('Unexpected error in markAllAsRead:', error);
    }
  };

  // Setup WebSocket connection
  useEffect(() => {
    if (!user?.id) return;
    console.log('User ID:', user.id);
    console.log('expo url:', EXPO_PUBLIC_API_URL);
    
    // For production, use the same URL but with wss:// and add /socket.io path
    const baseUrl = EXPO_PUBLIC_API_URL.replace('/api', '');
    const socketUrl = baseUrl.replace('https://', 'wss://').replace('http://', 'ws://');
    console.log('Connecting to WebSocket at:', socketUrl);
    
    const socketInstance = io(socketUrl, {
      path: '/socket.io',
      query: { employeeId: user.employeeId },
      transports: ['polling', 'websocket'], // Try polling first, then upgrade to websocket
      secure: true,
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000, // Increase timeout to 10 seconds
      forceNew: true, // Force new connection
      timeout: 20000,
      autoConnect: true
    });

    const handleNewNotification = (notification) => {
      console.log('New notification received:', notification);
      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
    };

    const handleConnect = () => {
      console.log('Socket connected with ID:', socketInstance.id);
      if (socketInstance && user?.employeeId) {
        console.log('Joining room for employee:', user.employeeId);
        socketInstance.emit('join', user.employeeId);
      } else {
        console.log('Cannot join room - missing socket instance or employeeId');
      }
      fetchNotifications();
    };

    const handleDisconnect = () => {
      console.log('Socket disconnected');
    };

    const handleError = (error) => {
      console.error('Socket.IO error:', error);
    };

    const handleConnectError = (error) => {
      console.error('Socket.IO Connection Error:', {
        message: error.message,
        description: error.description,
        context: error.context,
        error: error // Include full error object for debugging
      });
      
      // Try to reconnect after a delay if connection fails
      if (socketInstance) {
        setTimeout(() => {
          socketInstance.connect();
        }, 5000);
      }
    };

    socketInstance.on('notification', handleNewNotification);
    socketInstance.on('connect', handleConnect);
    socketInstance.on('disconnect', handleDisconnect);
    socketInstance.io.on('error', handleError);
    socketInstance.on('connect_error', handleConnectError);

    setSocket(socketInstance);

    return () => {
      socketInstance.off('notification', handleNewNotification);
      socketInstance.off('connect', handleConnect);
      socketInstance.off('disconnect', handleDisconnect);
      socketInstance.io.off('error', handleError);
      socketInstance.off('connect_error', handleConnectError);
      socketInstance.disconnect();
    };
  }, [user?.id]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        fetchNotifications
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export { NotificationProvider, useNotifications };