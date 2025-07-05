
import React, { useState, useContext, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Alert,
    ActivityIndicator,
    Platform,
    RefreshControl,
} from 'react-native';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import { Modal, Portal, Button, Provider as PaperProvider } from 'react-native-paper';
import { useFileHandler } from '../Hooks/useFileHandler';
import ImageViewing from 'react-native-image-viewing';


const LeaveRequests = ({ navigation }) => {
    const { user } = useContext(AuthContext);
    const [isLoading, setIsLoading] = useState(true);
    const [leaveRequests, setLeaveRequests] = useState([]);
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [isApproving, setIsApproving] = useState(false);
    const [remarks, setRemarks] = useState('');
    const [showRemarksInput, setShowRemarksInput] = useState(false);
    const [actionType, setActionType] = useState(''); // 'approve' or 'reject'
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

    const fetchLeaveRequests = async (pageNum = 1, reset = false) => {
        if (!user) return;

        try {
            const response = await api.get('/leaves', {
                params: {
                    limit: 30, // Increased limit to ensure we get all department records
                    page: pageNum,
                    sort: 'createdAt: -1',
                    department: user.department?._id || user.department,
                    excludeSelf: true // Ensure the API excludes the current user's records
                }
            });

            // Client-side filtering as an extra precaution
            const userId = user._id || user.id;
            const filteredLeaves = (response.data.leaves || []).filter(record => {
                const recordUserId = record.employee?._id || record.employee?.id || record.employee;
                return recordUserId !== userId; // Exclude HOD's own records
            });

            if (reset) {
                setLeaveRequests(filteredLeaves);
            } else {
                setLeaveRequests(prev => [...prev, ...filteredLeaves]);
            }

            // Update total pages based on filtered count
            setTotalPages(Math.ceil(response.data.total / response.data.limit));
        } catch (error) {
            console.error('Error fetching leave requests:', error);
            Alert.alert('Error', error.response?.data?.message || 'Failed to fetch leave requests');
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        if (user) {
            fetchLeaveRequests(1, true);
        }
    }, [user]);

    const getFinalStatus = (status) => {
        if (!status) return 'Pending';
        if (status.hod === 'Rejected' || status.ceo === 'Rejected') return 'Rejected';
        if (status.ceo === 'Approved') return 'Approved';
        if (status.hod === 'Approved') return 'Approved by HOD';
        return 'Pending';
    };

    const getStatusColor = (status) => {
        if (status === 'Rejected') return '#ef4444';
        if (status === 'Approved') return '#10b981';
        if (status.includes('Approved by')) return '#3b82f6';
        return '#f59e0b';
    };

    const handleRefresh = () => {
        setRefreshing(true);
        setPage(1);
        fetchLeaveRequests(1, true);
    };

    const handleApproveLeave = async (leaveId, status) => {
        // If no remarks input is shown, show it first
        if (!showRemarksInput) {
            setActionType(status === 'Approved' ? 'approve' : 'reject');
            setShowRemarksInput(true);
            return;
        }

        // If we're already showing remarks and user clicks approve/reject again
        try {
            setIsApproving(true);
            await api.put(`/leaves/${leaveId}/approve`, {
                status,
                remarks: remarks || (status === 'Approved' ? 'Approved by HOD' : 'Rejected by HOD')
            });

            // Create the updated status object
            const updatedStatus = {
                ...selectedRecord.status, // Preserve existing status
                hod: status,
                updatedAt: new Date().toISOString(),
                remarks: remarks || (status === 'Approved' ? 'Approved by HOD' : 'Rejected by HOD')
            };

            // Update the leaveRequests array
            setLeaveRequests(prevRequests =>
                prevRequests.map(req =>
                    req._id === leaveId
                        ? {
                            ...req,
                            status: {
                                ...req.status,
                                hod: status,
                                updatedAt: new Date().toISOString(),
                                remarks: remarks || (status === 'Approved' ? 'Approved by HOD' : 'Rejected by HOD')
                            }
                        }
                        : req
                )
            );

            // If modal is open for this leave, update the selected record
            if (selectedRecord && selectedRecord._id === leaveId) {
                setSelectedRecord(prev => ({
                    ...prev,
                    status: updatedStatus,
                    remarks: updatedStatus.remarks
                }));
            }

            // Reset remarks and hide input after submission
            setRemarks('');
            setShowRemarksInput(false);
            setActionType('');

            Alert.alert('Success', `Leave request ${status} successfully`);
        } catch (error) {
            console.error('Error approving leave:', error);
            Alert.alert('Error', 'Failed to approve leave request');
        } finally {
            setIsApproving(false);
        }
    };

    if (isLoading && page === 1) {
        return (
            <View style={styles.loader}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    return (
        <PaperProvider>
            <ScrollView
                style={styles.container}
                keyboardShouldPersistTaps="handled"
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        colors={['#2563eb']}
                        tintColor="#2563eb"
                    />
                }
            >

                <View style={{ marginTop: -20, marginBottom: 40 }}>
                    <Text style={styles.sectionTitle}>Department Leave Requests</Text>

                    {Array.isArray(leaveRequests) && leaveRequests.length === 0 ? (
                        <Text style={styles.noRecords}>No Leave requests found</Text>
                    ) : (
                        <>
                            <View style={[styles.row, styles.tableHeader]}>
                                <Text style={[styles.cell, styles.headerCell, { flex: 2 }]}>Duration</Text>
                                <Text style={[styles.cell, styles.headerCell, { flex: 2 }]}>Leave Type</Text>
                                <Text style={[styles.cell, styles.headerCell, { flex: 2 }]}>Status</Text>
                                <Text style={[styles.cell, styles.headerCell, { flex: 1 }]}>Details</Text>
                            </View>
                            {Array.isArray(leaveRequests) ? (
                                [...leaveRequests].map((leaveRequest) => {
                                    const fromDate = leaveRequest.dates?.from ? new Date(leaveRequest.dates.from) : null;
                                    const toDate = leaveRequest.dates?.to ? new Date(leaveRequest.dates.to) : null;
                                    const isHalfDay = leaveRequest.dates?.fromDuration !== 'full' || leaveRequest.dates?.toDuration !== 'full';
                                    const leaveType = leaveRequest.leaveType;
                                    const status = getFinalStatus(leaveRequest.status);
                                    return (
                                        <View key={leaveRequest._id} style={styles.row}>
                                            <Text style={[styles.cell, { flex: 2 }]}>
                                                {fromDate && !isNaN(fromDate.getTime()) && toDate && !isNaN(toDate.getTime()) && fromDate.toDateString() === toDate.toDateString()
                                                    ? fromDate.toLocaleDateString()
                                                    : fromDate && !isNaN(fromDate.getTime()) && toDate && !isNaN(toDate.getTime())
                                                        ? `${fromDate.toLocaleDateString()} - ${toDate.toLocaleDateString()}`
                                                        : 'N/A'}
                                                {isHalfDay && (
                                                    <Text style={{ fontSize: 12, color: '#666' }}>
                                                        {leaveRequest.dates.fromSession ? ` (${leaveRequest.dates.fromSession})` : ''}
                                                    </Text>
                                                )}
                                            </Text>
                                            <Text style={[styles.cell, { flex: 2 }]}>
                                                {typeof leaveType === 'object' ? leaveType.name : leaveType}
                                            </Text>
                                            <View style={[styles.cell, { flex: 2 }]}>
                                                <Text
                                                    style={[
                                                        styles.statusBadge,
                                                        {
                                                            backgroundColor: getStatusColor(status) + '20',
                                                            color: getStatusColor(status),
                                                        }
                                                    ]}
                                                >
                                                    {status}
                                                </Text>
                                            </View>
                                            <View style={[styles.cell, { flex: 1 }]}>
                                                <TouchableOpacity
                                                    style={styles.actionButton}
                                                    onPress={() => {
                                                        setSelectedRecord(leaveRequest);
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
                                <Text style={styles.noRecords}>Invalid Leave requests data</Text>
                            )}
                        </>
                    )}
                </View>

                <Portal>
                    <Modal
                        visible={modalVisible}
                        onDismiss={() => setModalVisible(false)}
                        contentContainerStyle={styles.modalContainer}
                    >
                        {console.log('selectedRecord', selectedRecord)}
                        {selectedRecord && (
                            <ScrollView>
                                <Text style={styles.modalTitle}>Leave Request Details</Text>

                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Employee:</Text>
                                    <Text style={styles.detailValue}>
                                        {selectedRecord.employee?.name || selectedRecord.name || 'N/A'}
                                    </Text>
                                </View>

                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Department:</Text>
                                    <Text style={styles.detailValue}>
                                        {selectedRecord.department?.name || 'N/A'}
                                    </Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Designation:</Text>
                                    <Text style={styles.detailValue}>
                                        {selectedRecord.designation || 'N/A'}
                                    </Text>
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
                                    <Text style={styles.detailValue}>
                                        {selectedRecord.leaveType ?
                                            (typeof selectedRecord.leaveType === 'object' ? selectedRecord.leaveType.name : selectedRecord.leaveType) :
                                            'N/A'}
                                    </Text>
                                </View>

                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Reason:</Text>
                                    <Text style={styles.detailValue}>
                                        {selectedRecord.reason || 'N/A'}
                                    </Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Charge Given To:</Text>
                                    <Text style={styles.detailValue}>
                                        {selectedRecord.chargeGivenTo ?
                                            (typeof selectedRecord.chargeGivenTo === 'object' ? selectedRecord.chargeGivenTo.name : selectedRecord.chargeGivenTo) :
                                            'N/A'}
                                    </Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Emergency Contact:</Text>
                                    <Text style={styles.detailValue}>
                                        {selectedRecord.emergencyContact || 'N/A'}
                                    </Text>
                                </View>

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
                                        {selectedRecord.status?.hod === 'Approved' || selectedRecord.status?.hod === 'Rejected' ? (
                                            <Text style={[
                                                styles.detailValue,
                                                {
                                                    color: selectedRecord.status?.hod === 'Approved' ? '#10b981' : '#ef4444'
                                                }
                                            ]}>
                                                {selectedRecord.status?.hod}
                                            </Text>
                                        ) : (
                                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                <TouchableOpacity
                                                    style={[styles.approveButton, isApproving && styles.disabledButton]}
                                                    onPress={() => handleApproveLeave(selectedRecord._id, 'Approved')}
                                                    disabled={isApproving}
                                                >
                                                    <Text style={styles.approveButtonText}>
                                                        {isApproving ? 'Approving...' : 'Approve'}
                                                    </Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={[styles.rejectButton, isApproving && styles.disabledButton]}
                                                    onPress={() => handleApproveLeave(selectedRecord._id, 'Rejected', remarks)}
                                                    disabled={isApproving}
                                                >
                                                    <Text style={styles.rejectButtonText}>Reject</Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </View>

                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>• CEO:</Text>
                                        <Text style={[
                                            styles.detailValue,
                                            {
                                                color: selectedRecord.status?.ceo === 'Approved' ? '#10b981' :
                                                    selectedRecord.status?.ceo === 'Rejected' ? '#ef4444' : '#64748b'
                                            }
                                        ]}>
                                            {selectedRecord.status?.ceo || 'Pending'}
                                        </Text>
                                    </View>
                                </View>
                                <View style={{ marginTop: 16 }}>
                                    <Text style={[styles.detailLabel, { marginBottom: 8 }]}>Remarks:</Text>
                                    {showRemarksInput && actionType ? (
                                        <View>
                                            <TextInput
                                                style={[styles.input, styles.textArea, { marginBottom: 10 }]}
                                                value={remarks}
                                                onChangeText={setRemarks}
                                                placeholder={`Enter remarks for ${actionType === 'approve' ? 'approval' : 'rejection'}`}
                                                multiline
                                                numberOfLines={3}
                                            />
                                            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                                                <TouchableOpacity
                                                    style={[styles.button, { marginRight: 10 }]}
                                                    onPress={() => {
                                                        setShowRemarksInput(false);
                                                        setRemarks('');
                                                        setActionType('');
                                                    }}
                                                >
                                                    <Text style={styles.buttonText}>Cancel</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={[styles.button, styles.primaryButton]}
                                                    onPress={() => handleApproveLeave(selectedRecord._id, actionType === 'approve' ? 'Approved' : 'Rejected')}
                                                    disabled={isApproving}
                                                >
                                                    <Text style={[styles.buttonText, { color: 'white' }]}>
                                                        {isApproving ? 'Submitting...' : 'Submit'}
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    ) : (
                                        <Text style={styles.detailValue}>
                                            {selectedRecord.remarks || 'No remarks provided'}
                                        </Text>
                                    )}
                                </View>
                                <Button
                                    mode="contained"
                                    onPress={() => setModalVisible(false)}
                                    style={{ marginTop: 24, backgroundColor: '#2563eb' }}
                                >
                                    Close
                                </Button>
                            </ScrollView>
                        )}
                    </Modal>
                </Portal>
            </ScrollView>
        </PaperProvider>
    );
}

const styles = StyleSheet.create({
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
    dropdownButtonText: {
        color: '#1f2937',
        fontSize: 16,
    },
    dropdownButtonPlaceholder: {
        color: '#9ca3af',
        fontSize: 16,
    },
    dropdownItemText: {
        fontSize: 16,
        color: '#1f2937',
    },
    disabledButton: {
        backgroundColor: '#f3f4f6',
    },
    pickerContainer: {
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 5,
        marginBottom: 15,
        backgroundColor: '#fff',
    },
    picker: {
        width: '100%',
        height: Platform.OS === 'ios' ? 150 : 50,
    },
    pickerItem: {
        fontSize: 16,
        color: '#000',
    },
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
        padding: 15,
    },
    card: {
        marginBottom: 20,
        borderRadius: 10,
        elevation: 3,
        backgroundColor: '#fff',
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 20,
        textAlign: 'center',
        color: '#333',
    },
    formGroup: {
        marginBottom: 15,
    },
    label: {
        fontSize: 14,
        marginBottom: 5,
        color: '#555',
        fontWeight: '500',
    },
    actionButtonText: {
        color: '#2563eb',
        fontWeight: '500',
    },
    approveButton: {
        backgroundColor: '#10b981',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 4,
        marginRight: 8,
    },
    rejectButton: {
        backgroundColor: '#ef4444',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 4,
    },
    approveButtonText: {
        color: 'white',
        fontWeight: '500',
    },
    rejectButtonText: {
        color: 'white',
        fontWeight: '500',
    },
    button: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: '#d1d5db',
        backgroundColor: '#f9fafb',
    },
    buttonText: {
        color: '#4b5563',
        fontWeight: '500',
    },
    primaryButton: {
        backgroundColor: '#2563eb',
        borderColor: '#2563eb',
    },
    textArea: {
        minHeight: 80,
        textAlignVertical: 'top',
        padding: 10,
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 4,
        backgroundColor: '#fff',
    },
    input: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#9ca3af',
        borderRadius: 5,
        padding: 12,
        fontSize: 16,
    },
    textArea: {
        minHeight: 100,
        textAlignVertical: 'top',
    },
    datePickerContainer: {
        marginTop: 10,
        marginBottom: 15,
        backgroundColor: '#ffffff',
        borderRadius: 5,
        padding: 10,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
            },
            android: {
                elevation: 2,
            },
        }),
    },
    doneButton: {
        marginTop: 10,
        backgroundColor: '#2563eb',
    },
    durationContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 5,
    },
    durationButton: {
        flex: 1,
        padding: 12,
        borderWidth: 1,
        borderColor: '#9ca3af',
        borderRadius: 5,
        alignItems: 'center',
        marginHorizontal: 5,
    },
    activeDuration: {
        backgroundColor: '#1e88e5',
        borderColor: '#1976d2',
    },
    activeText: {
        color: '#fff',
        fontWeight: 'bold',
    },
    inactiveText: {
        color: '#666',
    },
    halfDayContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    fullDayContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    compensatorySection: {
        marginVertical: 10,
        padding: 10,
        backgroundColor: '#f8f9fa',
        borderRadius: 5,
    },
    balanceText: {
        fontSize: 16,
        color: '#1976d2',
        fontWeight: 'bold',
    },
    daysText: {
        fontSize: 16,
        color: '#28a745',
        fontWeight: 'bold',
    },
    submitButton: {
        backgroundColor: '#1e88e5',
        padding: 15,
        borderRadius: 5,
        alignItems: 'center',
        marginTop: 20,
    },
    submitButtonDisabled: {
        backgroundColor: '#90caf9',
    },
    submitButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    loader: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
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
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        alignSelf: 'flex-start',
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
        color: '#1e40af',
        textAlign: 'center',
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
});

export default LeaveRequests;
