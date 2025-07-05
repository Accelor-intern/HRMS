import React, { useContext, useCallback, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Portal, Modal, Button } from 'react-native-paper';
import { AuthContext } from '../context/AuthContext';
import { useFileHandler } from '../Hooks/useFileHandler';
import ImageViewing from 'react-native-image-viewing';

const getFinalStatus = (status, loginType) => {
  if (!status) return 'Pending';
  if (status.hod === 'Rejected' || status.ceo === 'Rejected') return 'Rejected';
  if (status.ceo === 'Approved') return 'Approved';
  if (status.hod === 'Approved') return loginType === 'HOD' ? 'Pending' : 'Approved by HOD';
  return 'Pending';
};

const getStatusColor = (status) => {
  if (status === 'Rejected') return '#ef4444';
  if (status === 'Approved') return '#10b981';
  if (status.includes('Approved by')) return '#3b82f6';
  return '#f59e0b';
};

const LeaveRecordsTable = React.memo(({ leaveRecords, selectedRecord, setSelectedRecord, modalVisible, setModalVisible }) => {
  const { user } = useContext(AuthContext);
  const [currentFile, setCurrentFile] = useState(null);
  
  const { 
    handleViewFile, 
    error: fileError, 
    isImageViewerVisible, 
    setIsImageViewerVisible, 
    imageUri,
    isLoading: isFileLoading
  } = useFileHandler({
    fileId: currentFile?._id,
    fileName: currentFile?.filename,
    localFile: null
  });

  // Trigger file viewing when currentFile changes
  useEffect(() => {
    if (currentFile) {
      handleViewFile();
    }
  }, [currentFile, handleViewFile]);

  const onViewFile = useCallback((type) => {
    if (type === 'medical' && selectedRecord?.medicalCertificate?._id) {
      setCurrentFile(selectedRecord.medicalCertificate);
    }
    if (type === 'supporting' && selectedRecord?.supportingDocuments?._id) {
      setCurrentFile(selectedRecord.supportingDocuments);
    }
  }, [selectedRecord]);
  
  const userRecords = React.useMemo(() => {
    if (!user) return [];
    const userId = user._id || user.id;
    return leaveRecords.filter(record => {
      const recordUserId = record.employee?._id || record.employee?.id || record.employee;
      return recordUserId === userId;
    });
  }, [leaveRecords, user]);
  
  if (!user) return null;
  return (
    <View style={{ marginTop: 24, marginBottom: 40 }}>
      <Text style={styles.sectionTitle}>Your Leave Records</Text>

      {Array.isArray(userRecords) && userRecords.length === 0 ? (
        <Text style={styles.noRecords}>No Leave records found</Text>
      ) : (
        <>
          <View style={[styles.row, styles.tableHeader]}>
            <Text style={[styles.cell, styles.headerCell, { flex: 2 }]}>Duration</Text>
            <Text style={[styles.cell, styles.headerCell, { flex: 2 }]}>Leave Type</Text>
            <Text style={[styles.cell, styles.headerCell, { flex: 2 }]}>Status</Text>
            <Text style={[styles.cell, styles.headerCell, { flex: 1 }]}>Details</Text>
          </View>
          {Array.isArray(userRecords) ? (
            [...userRecords].map((record) => {
              const fromDate = record.dates?.from ? new Date(record.dates.from) : null;
              const toDate = record.dates?.to ? new Date(record.dates.to) : null;
              const isHalfDay = record.dates?.fromDuration !== 'full';
              const leaveType = record.leaveType || 'N/A';
              const status = getFinalStatus(record.status, user.loginType);
              return (
                <View key={record._id} style={styles.row}>
                  <Text style={[styles.cell, { flex: 2 }]}>
                    {isHalfDay ? (
                      fromDate && !isNaN(fromDate.getTime())
                        ? `${fromDate.toLocaleDateString()} (${record.dates?.fromSession || 'N/A'})`
                        : 'N/A'
                    ) : (
                      fromDate && !isNaN(fromDate.getTime()) && toDate && !isNaN(toDate.getTime())
                        ? fromDate.toDateString() === toDate.toDateString()
                          ? fromDate.toLocaleDateString()
                          : `${fromDate.toLocaleDateString()} - ${toDate.toLocaleDateString()}`
                        : 'N/A'
                    )}
                  </Text>
                  <Text style={[styles.cell, { flex: 2 }]}>{leaveType}</Text>
                  <View style={[styles.cell, { flex: 2 }]}>
                    <Text
                      style={[styles.statusBadge, { backgroundColor: getStatusColor(status) + '20', color: getStatusColor(status) }]}
                    >
                      {status}
                    </Text>
                  </View>
                  <View style={[styles.cell, { flex: 1 }]}>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => {
                        setSelectedRecord(record);
                        setModalVisible(true);
                      }}
                    >
                      <Text style={styles.actionButtonText}>View</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={styles.noRecords}>Invalid Leave records data</Text>
          )}
        </>
      )}

      <Portal>
        <Modal visible={modalVisible} onDismiss={() => setModalVisible(false)} contentContainerStyle={styles.modalContainer}>
          {selectedRecord && (
            <View>
              <Text style={styles.modalTitle}>Leave Request Details</Text>
              {fileError && (
                <Text style={[styles.detailValue, { color: '#ef4444', marginBottom: 12 }]}>
                  {fileError}
                </Text>
              )}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Employee:</Text>
                <Text style={styles.detailValue}>{selectedRecord.employee?.name || selectedRecord.name || 'N/A'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Department:</Text>
                <Text style={styles.detailValue}>
                  {selectedRecord.department
                    ? typeof selectedRecord.department === 'object'
                      ? selectedRecord.department.name
                      : selectedRecord.department
                    : 'N/A'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Designation:</Text>
                <Text style={styles.detailValue}>{selectedRecord.designation || 'N/A'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>From Date:</Text>
                <Text style={styles.detailValue}>
                  {selectedRecord.dates?.from ? new Date(selectedRecord.dates.from).toLocaleDateString() : 'N/A'}
                  {selectedRecord.dates?.fromDuration !== 'full' && (
                    <Text> ({selectedRecord.dates.fromSession || 'N/A'})</Text>
                  )}
                </Text>
              </View>
              {selectedRecord.dates?.to && selectedRecord.dates.to !== selectedRecord.dates.from && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>To Date:</Text>
                  <Text style={styles.detailValue}>
                    {new Date(selectedRecord.dates.to).toLocaleDateString()}
                    {selectedRecord.dates?.toDuration !== 'full' && (
                      <Text> ({selectedRecord.dates.toSession || 'N/A'})</Text>
                    )}
                  </Text>
                </View>
              )}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Leave Type:</Text>
                <Text style={styles.detailValue}>{selectedRecord.leaveType || 'N/A'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Reason:</Text>
                <Text style={styles.detailValue}>{selectedRecord.reason || 'N/A'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Charge Given To:</Text>
                <Text style={styles.detailValue}>
                  {selectedRecord.chargeGivenTo
                    ? typeof selectedRecord.chargeGivenTo === 'object'
                      ? selectedRecord.chargeGivenTo.name
                      : selectedRecord.chargeGivenTo
                    : 'N/A'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Emergency Contact:</Text>
                <Text style={styles.detailValue}>{selectedRecord.emergencyContact || 'N/A'}</Text>
              </View>
              {selectedRecord.compensatoryEntry && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Compensatory Entry:</Text>
                  <Text style={styles.detailValue}>
                    {selectedRecord.compensatoryEntry.date
                      ? `${new Date(selectedRecord.compensatoryEntry.date).toLocaleDateString()} (${selectedRecord.compensatoryEntry.hours} hours)`
                      : 'N/A'}
                  </Text>
                </View>
              )}
              {selectedRecord.restrictedHoliday && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Restricted Holiday:</Text>
                  <Text style={styles.detailValue}>{selectedRecord.restrictedHoliday || 'N/A'}</Text>
                </View>
              )}
              {selectedRecord.projectDetails && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Project Details:</Text>
                  <Text style={styles.detailValue}>{selectedRecord.projectDetails || 'N/A'}</Text>
                </View>
              )}
              {selectedRecord.medicalCertificate && (
                <View style={styles.actions}>
                  <Button 
                    mode="contained" 
                    onPress={() => onViewFile('medical')} 
                    style={styles.actionButton}
                    disabled={isFileLoading}
                  >
                    {isFileLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      'View Certificate'
                    )}
                  </Button>
                  {fileError && (
                    <Text style={styles.errorText}>
                      {fileError}
                    </Text>
                  )}
                </View>
              )}
              {selectedRecord.supportingDocuments && (
                <View style={styles.actions}>
                  <Button 
                    mode="contained" 
                    onPress={() => onViewFile('supporting')} 
                    style={styles.actionButton}
                    disabled={isFileLoading}
                  >
                    {isFileLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      'View Certificate'
                    )}
                  </Button>
                  {fileError && (
                    <Text style={styles.errorText}>
                      {fileError}
                    </Text>
                  )}
                </View>
              )}
              <View style={{ marginTop: 16 }}>
                <Text style={[styles.detailLabel, { marginBottom: 8 }]}>Approval Status:</Text>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>• HOD:</Text>
                  <Text
                    style={[
                      styles.detailValue,
                      {
                        color:
                          selectedRecord.status?.hod === 'Approved'
                            ? '#10b981'
                            : selectedRecord.status?.hod === 'Rejected'
                            ? '#ef4444'
                            : '#64748b',
                      },
                    ]}
                  >
                    {selectedRecord.status?.hod || 'Pending'}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>• CEO:</Text>
                  <Text
                    style={[
                      styles.detailValue,
                      {
                        color:
                          selectedRecord.status?.ceo === 'Approved'
                            ? '#10b981'
                            : selectedRecord.status?.ceo === 'Rejected'
                            ? '#ef4444'
                            : '#64748b',
                      },
                    ]}
                  >
                    {selectedRecord.status?.ceo || 'Pending'}
                  </Text>
                </View>
              </View>
              <View style={{ ...styles.detailRow, marginTop: 16 }}>
                <Text style={styles.detailLabel}>Remarks:</Text>
                <Text style={styles.detailValue}>{selectedRecord.remarks || selectedRecord.status?.remarks || 'N/A'}</Text>
              </View>
              <Button
                mode="contained"
                onPress={() => setModalVisible(false)}
                style={{ marginTop: 24, backgroundColor: '#2563eb' }}
              >
                Close
              </Button>
            </View>
          )}
          <ImageViewing
            images={imageUri ? [imageUri] : []}
            imageIndex={0}
            visible={isImageViewerVisible}
            onRequestClose={() => setIsImageViewerVisible(false)}
            animationType="fade"
            swipeToCloseEnabled={true}
            doubleTapToZoomEnabled={true}
          />
        </Modal>
      </Portal>
    </View>
  );
});

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 24,
    marginBottom: 16,
    color: '#1e40af',
  },
  tableHeader: {
    backgroundColor: '#f1f5f9',
    flexDirection: 'row',
    padding: 12,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  headerCell: {
    fontWeight: 'bold',
    color: '#334155',
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    alignItems: 'center',
  },
  cell: {
    paddingHorizontal: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '500',
  },
  actionButton: {
    padding: 6,
    borderRadius: 4,
    backgroundColor: '#3b82f6',
    alignSelf: 'flex-start',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
  },
  modalContainer: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 20,
    maxHeight: '80%',
    justifyContent: 'center',
    flex: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#1f2937',
    textAlign: 'center',
    backgroundColor: '#e2e8f0',
    padding: 8,
    borderRadius: 8,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  detailLabel: {
    width: 140,
    fontWeight: '600',
    color: '#475569',
    fontSize: 14,
  },
  detailValue: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
  },
  noRecords: {
    textAlign: 'center',
    color: '#64748b',
    marginTop: 16,
    fontStyle: 'italic',
  },
  errorText: {
    color: '#ef4444',
    marginTop: 8,
    fontSize: 12,
  },
});

export default LeaveRecordsTable;