import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Alert } from 'react-native';

const useDocumentPicker = () => {
  const [medicalCertificate, setMedicalCertificate] = useState(null);
  const [supportingDocuments, setSupportingDocuments] = useState(null);

  const pickDocument = async (type = 'medical') => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/jpg', 'application/pdf'],
        copyToCacheDirectory: true,
        multiple: false, // Always pick single file
      });
      if (result.canceled) return;
      const file = result.assets[0];
      
      const fileInfo = await FileSystem.getInfoAsync(file.uri);
      if (fileInfo.size > 5 * 1024 * 1024) {
        Alert.alert('Error', 'File size exceeds 5MB limit');
        return;
      }
      
      if (type === 'medical') {
        setMedicalCertificate(file);
      } else if (type === 'supporting') {
        setSupportingDocuments(file);
      }
    } catch (err) {
      console.error('Error picking document:', err);
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const removeDocument = (index, type = 'supporting') => {
    if (type === 'medical') {
      setMedicalCertificate(null);
    } else if (type === 'supporting') {
      setSupportingDocuments(null);
    }
  };

  return { medicalCertificate, supportingDocuments, pickDocument, removeDocument };
};

const uploadDocument = () => {
  const [documents, setDocuments] = useState({});

  const pickDocument = async (field) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/jpg', 'application/pdf'],
        copyToCacheDirectory: true,
        multiple: false, // Always pick single file
      });
      if (result.canceled) return;
      const file = result.assets[0];

      const fileInfo = await FileSystem.getInfoAsync(file.uri);
      if (fileInfo.size > 5 * 1024 * 1024) {
        Alert.alert('Error', 'File size exceeds 5MB limit');
        return;
      }

      // Update the documents state with the new file for the specified field
      setDocuments((prev) => ({
        ...prev,
        [field]: file,
      }));
    } catch (err) {
      console.error(`Error picking document for ${field}:`, err);
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const removeDocument = (field) => {
    // Remove the file for the specified field
    setDocuments((prev) => {
      const newDocs = { ...prev };
      delete newDocs[field];
      return newDocs;
    });
  };

  return { documents, pickDocument, removeDocument };
}

export  {useDocumentPicker, uploadDocument};