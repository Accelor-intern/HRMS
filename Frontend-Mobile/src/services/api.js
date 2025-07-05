import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as WebBrowser from 'expo-web-browser';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

// Hardcode the API URL to ensure it's always correct
const API_URL = 'http://192.168.1.28:5001/api';

console.log('Using API URL:', API_URL);

// Create an axios instance with a base URL
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  timeout: 30000, // 30 seconds timeout
});

// Request interceptor for token handling
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    } catch (error) {
      console.error('Error retrieving token:', error);
      return config; // Continue request without token
    }
  },
  (error) => {
    console.error('Request failed:', error);
    Alert.alert('Error', 'Network request failed');
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const errorMessage = error.response?.data?.message
      ? error.response.data.message
      : error.message || 'An unknown error occurred';

    console.error('API Error:', {
      status: error.response?.status,
      message: errorMessage,
      data: error.response?.data,
    });

    if (error.response?.status === 401) {
      Alert.alert('Authentication Error', 'Please login again');
    } else {
      Alert.alert('Error', errorMessage);
    }

    return Promise.reject(error);
  }
);

// Helper function to get MIME type from file extension
const getMimeType = (uri) => {
  const extension = uri.split('.').pop().toLowerCase();
  const mimeTypes = {
    // Images
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    bmp: 'image/bmp',
    webp: 'image/webp',
    // Documents
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
  return mimeTypes[extension] || 'application/octet-stream';
};

/**
 * Opens a file using the device's default handler or returns URI for images
 * @param {string} uri - Local file URI to open
 * @param {string} [mimeType] - Optional MIME type of the file
 * @returns {Promise<{ isImage: boolean, uri?: string, success?: boolean }>} URI for images, success status for others
 */
/**
 * Opens a file using the device's default handler or returns URI for images
 * @param {string} fileUri - Local file URI to open
 * @param {string} [mimeType] - Optional MIME type of the file
 * @returns {Promise<{isImage: boolean, uri?: string, mimeType?: string, success?: boolean}>}
 */
export const openFile = async (fileUri, mimeType) => {
  try {
    // Verify file exists and get its info
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (!fileInfo.exists) {
      throw new Error('File does not exist or cannot be accessed');
    }

    // Check file size (prevent opening extremely large files)
    if (fileInfo.size > 25 * 1024 * 1024) { // 25MB limit for better compatibility
      throw new Error('File is too large to open');
    }

    // Determine MIME type
    const detectedMimeType = mimeType || getMimeType(fileUri);
    const isImage = detectedMimeType?.startsWith('image/');
    const isPdf = detectedMimeType === 'application/pdf';

    // Get content URI for Android
    const contentUri = await FileSystem.getContentUriAsync(fileUri);

    // Handle images - return URI for image viewer
    if (isImage) {
      console.log('Image detected, preparing for viewer:', fileUri);
      return { 
        isImage: true, 
        uri: Platform.OS === 'android' ? contentUri : fileUri, 
        mimeType: detectedMimeType 
      };
    }

    // Handle non-image files
    if (Platform.OS === 'android') {
      try {
        // First try with IntentLauncher for Android
        await IntentLauncher.startActivityAsync(
          'android.intent.action.VIEW',
          {
            data: contentUri,
            flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
            type: detectedMimeType,
          }
        );
        return { isImage: false, success: true };
      } catch (intentError) {
        console.log('Intent failed, trying fallback methods...');
        
        // For PDFs, try WebBrowser as fallback
        if (isPdf) {
          await WebBrowser.openBrowserAsync(contentUri);
          return { isImage: false, success: true };
        }
        
        // As a last resort, try sharing the file
        try {
          await Sharing.shareAsync(fileUri, {
            mimeType: detectedMimeType,
            dialogTitle: 'Open with',
            UTI: `com.adobe.${detectedMimeType.split('/')[1] || 'pdf'}`
          });
          return { isImage: false, success: true };
        } catch (shareError) {
          console.error('Sharing failed:', shareError);
          throw new Error('No app found to open this file type');
        }
      }
    } else {
      // iOS implementation
      if (isPdf) {
        await WebBrowser.openBrowserAsync(contentUri);
        return { isImage: false, success: true };
      }
      
      // For other file types on iOS, try sharing
      try {
        await Sharing.shareAsync(fileUri, {
          mimeType: detectedMimeType,
          dialogTitle: 'Open with',
          UTI: `com.adobe.${detectedMimeType.split('/')[1] || 'pdf'}`
        });
        return { isImage: false, success: true };
      } catch (shareError) {
        console.error('Sharing failed:', shareError);
        throw new Error('No app found to open this file type');
      }
    }
  } catch (error) {
    console.error('Error opening file:', error);
    
    // As a last resort, try opening in web browser
    try {
      console.log('Falling back to browser...');
      const contentUri = await FileSystem.getContentUriAsync(fileUri);
      await WebBrowser.openBrowserAsync(contentUri);
      return { isImage: false, success: true };
    } catch (webError) {
      console.error('Error opening in browser:', webError);
      throw new Error('Could not open the file. Make sure you have an app installed that can handle this file type.');
    }
  }
};

/**
 * Fetches a file and returns its local path
 * @param {string} fileId - ID of the file to fetch
 * @param {string} fileName - Name of the file (used for extension)
 * @returns {Promise<string>} Local file URI
 */
// In api.js, modify fetchFileAsBlob
export const fetchFileAsBlob = async (fileId, fileName = 'file') => {
  try {
    console.log('Fetching file with ID:', fileId);
    if (!fileId) {
      throw new Error('File ID is required');
    }

    const cacheDir = `${FileSystem.cacheDirectory}downloaded_files/`;
    await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
    
    const extension = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : 'pdf';
    const filePath = `${cacheDir}${fileId}.${extension}`;

    // Clean up old cache files (older than 24 hours)
    const cacheFiles = await FileSystem.readDirectoryAsync(cacheDir);
    for (const file of cacheFiles) {
      const fileInfo = await FileSystem.getInfoAsync(`${cacheDir}${file}`);
      if (fileInfo.exists && Date.now() - fileInfo.modificationTime * 1000 > 24 * 60 * 60 * 1000) {
        await FileSystem.deleteAsync(`${cacheDir}${file}`);
      }
    }

    // Check cache
    const fileInfo = await FileSystem.getInfoAsync(filePath);
    const isCacheValid =
      fileInfo.exists &&
      Date.now() - fileInfo.modificationTime * 1000 < 24 * 60 * 60 * 1000 &&
      fileInfo.size > 0;

    if (isCacheValid) {
      console.log('Using cached file:', filePath);
      return filePath;
    }

    const token = await AsyncStorage.getItem('token');
    if (!token) {
      throw new Error('No authentication token found');
    }

    console.log('Downloading file from:', `${API_URL}/employees/files/${fileId}`);
    const downloadRes = await FileSystem.downloadAsync(
      `${API_URL}/employees/files/${fileId}`,
      filePath,
      {
        headers: {
          Accept: 'application/octet-stream',
          'Cache-Control': 'no-cache',
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (downloadRes.status !== 200) {
      throw new Error(`Server returned status: ${downloadRes.status}`);
    }

    // Verify file was downloaded successfully
    const downloadedFileInfo = await FileSystem.getInfoAsync(filePath);
    if (!downloadedFileInfo.exists || downloadedFileInfo.size === 0) {
      throw new Error('Downloaded file is empty or invalid');
    }

    // Skip strict file validation and let the system handle the file type
    // This is more reliable as the file extension might not match the actual content type

    console.log('File downloaded successfully:', filePath, 'Size:', downloadedFileInfo.size, 'bytes');
    return filePath;
  } catch (error) {
    console.error(`Error in fetchFileAsBlob for file ${fileId}:`, error);
    throw new Error(error.message || 'Failed to load file');
  }
};

export default api;