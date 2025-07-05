import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import {uploadDocument} from '../Hooks/documentUploader';

const documentFields = [
  { title: '10th & 12th Marksheets', field: 'tenthTwelfthDocs' },
  { title: 'Graduation Certificate', field: 'graduationDocs' },
  { title: 'Post Graduation Certificate', field: 'postgraduationDocs' },
  { title: 'Experience Certificate', field: 'experienceCertificate' },
  { title: 'Salary Slips', field: 'salarySlips' },
  { title: 'PAN Card', field: 'panCard' },
  { title: 'Aadhar Card', field: 'aadharCard' },
  { title: 'Bank Passbook', field: 'bankPassbook' },
  { title: 'Medical Certificate', field: 'medicalCertificate' },
  { title: 'Background Verification Report', field: 'backgroundVerification' },
];

const DocumentUploadSection = ({ profile, files, setFiles, fileErrors, isLocked }) => {
  return (
    <View style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 80 }}
        scrollEnabled={true}
        bounces={true}
        showsVerticalScrollIndicator={true}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Document Uploads</Text>
          {documentFields.map((doc) => (
            <DocumentUploader
              key={doc.field}
              title={doc.title}
              field={doc.field}
              profile={profile}
              files={files}
              setFiles={setFiles}
              fileErrors={fileErrors}
              isLocked={isLocked}
            />
          ))}
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
});

export default DocumentUploadSection;