import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Platform, Alert,TouchableOpacity } from 'react-native';
import DocumentUploader from './documentUploader';
import { useImagePicker } from './ImagePicker';
import { useFileHandler } from './useFileHandler';
import ImageViewing from 'react-native-image-viewing';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Alert from 'react-native/Libraries/Alert/Alert';

// Debug logger utility
const debugLog = (message, data = '') => {
  if (__DEV__) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [FileUploadAndView] ${message}`;
    if (data) {
      console.log(logMessage, data);
    } else {
      console.log(logMessage);
    }
  }
};

const FileUploadAndView = ({ form, updateFormField, submitting }) => {
  debugLog('Component rendered', { form, submitting });
  const [fileErrors, setFileErrors] = useState({});
  
  useEffect(() => {
    debugLog('Component mounted');
    return () => debugLog('Component unmounted');
  }, []);
  
  useEffect(() => {
    debugLog('File errors updated', fileErrors);
  }, [fileErrors]);
  const handleFileUpdate = (file) => {
    debugLog('Updating medical certificate', { file });
    updateFormField('medicalCertificate', file);
  };

  const handleDocumentPick = async () => {
      try {
        console.log('Starting document picker...');
        const result = await DocumentPicker.getDocumentAsync({
          type: ['application/pdf', 'image/*'],
          copyToCacheDirectory: true,
          multiple: false,
        });
  
        console.log('Document picker result:', result);
  
        if (result.canceled) {
          console.log('Document picker was cancelled');
          return;
        }
  
        if (!result.assets || result.assets.length === 0) {
          console.log('No files were selected');
          return;
        }
  
        const asset = result.assets[0];
        console.log('Selected asset:', asset);
  
        // Get file info
        const fileInfo = await FileSystem.getInfoAsync(asset.uri);
        console.log('File info:', fileInfo);
  
        if (!fileInfo.exists) {
          console.error('File does not exist:', asset.uri);
          Alert.alert('Error', 'The selected file could not be accessed.');
          return;
        }
  
        const file = {
          uri: asset.uri,
          name: asset.name || 'document.pdf',
          type: asset.mimeType || 'application/octet-stream',
          size: fileInfo.size,
          lastModified: fileInfo.modificationTime,
        };
  
        console.log('Processed file object:', file);
        updateFormField('medicalCertificate', file);
      } catch (error) {
        console.error('Document pick error:', error);
        Alert.alert('Error', `Failed to select document: ${error.message}`);
      }
    };

  const { handleImagePick } = useImagePicker({
    setFiles: handleFileUpdate,
  });

  const fileHandlerProps = useFileHandler({
    localFile: form.medicalCertificate,
  });
  
  const { 
    isLoading, 
    handleViewFile, 
    isImageViewerVisible, 
    setIsImageViewerVisible, 
    imageUri 
  } = fileHandlerProps;
  
  useEffect(() => {
    debugLog('File handler props updated', {
      isLoading,
      isImageViewerVisible,
      imageUri: imageUri ? 'Image URI set' : 'No image URI',
    });
  }, [isLoading, isImageViewerVisible, imageUri]);

  debugLog('Rendering component', { leaveType: form.leaveType });
  
  return (
    <View style={styles.container}>
      {form.leaveType === 'Medical' && (
        <>
          <TouchableOpacity
            style={[styles.uploadButton, submitting && styles.disabled]}
            onPress={handleDocumentPick}
            disabled={submitting}
          >
            <MaterialIcons name="upload-file" size={20} color="white" />
            <Text style={styles.buttonText}>Upload Medical Certificate</Text>
          </TouchableOpacity>
          <DocumentUploader
            title="Medical Certificate (Image or PDF)"
            field="medicalCertificate"
            files={{ medicalCertificate: form.medicalCertificate }}
            setFiles={handleDocumentPick}
            isLocked={submitting}
            handleImagePick={(...args) => {
              debugLog('handleImagePick called', { args });
              return handleImagePick(...args);
            }}
            handleViewFile={(...args) => {
              debugLog('handleViewFile called', { args });
              return handleViewFile(...args);
            }}
            isLoading={isLoading}
          />
          {imageUri && (
            <ImageViewing
              images={[imageUri]}
              imageIndex={0}
              visible={isImageViewerVisible}
              onRequestClose={() => {
                debugLog('ImageViewer close requested');
                setIsImageViewerVisible(false);
              }}
              animationType="fade"
              swipeToCloseEnabled={true}
              doubleTapToZoomEnabled={true}
            />
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007BFF',
    padding: 12,
    borderRadius: 5,
    marginBottom: 10,
  },
  buttonText: {
    color: 'white',
    marginLeft: 8,
    fontWeight: '600',
  },
  disabled: {
    backgroundColor: '#ccc',
  },
});

export default FileUploadAndView;