import React, { useState, useContext, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Alert,
    Platform,
    RefreshControl,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Card, Modal, Portal, Button, Provider as PaperProvider } from 'react-native-paper';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';

function ODForm() {
    const { user } = useContext(AuthContext);
    const [form, setForm] = useState({
        dateOut: new Date(),
        timeOut: new Date(),
        dateIn: new Date(),
        timeIn: new Date(),
        purpose: '',
        placeUnitVisit: '',
    });
    const [showDatePicker, setShowDatePicker] = useState({
        dateOut: false,
        dateIn: false,
        timeOut: false,
        timeIn: false,
    });
    const [submitting, setSubmitting] = useState(false);
    const [odRecords, setOdRecords] = useState([]);
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const fetchOdRecords = async () => {
        if (!user) return false;
        
        try {
            const response = await api.get('/od', {
                params: { mine: true } // Ensure the API only returns records for the current user
            });
            
            let records = response.data.odRecords || [];
            
            // Client-side filtering as an extra precaution
            const userId = user._id || user.id;
            records = records.filter(record => {
                const recordUserId = record.employee?._id || record.employee?.id || record.employee;
                return recordUserId === userId;
            });
            
            setOdRecords(records);
            return true;
        } catch (error) {
            console.error('Error fetching OD records:', error);
            Alert.alert('Error', error.response?.data?.message || 'Failed to fetch OD records');
            setOdRecords([]);
            return false;
        } finally {
            setRefreshing(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchOdRecords();
    };

    useEffect(() => {
        if (user) {
            fetchOdRecords();
        }
    }, [user]);

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

    const handleChange = (name, value) => {
        setForm(prev => ({ ...prev, [name]: value }));
    };

    const showDatepicker = (field) => {
        setShowDatePicker(prev => ({ ...prev, [field]: true }));
    };

    const onDateChange = (event, selectedDate, field) => {
        const currentDate = selectedDate || form[field];
        
        if (Platform.OS === 'android') {
            setShowDatePicker(prev => ({
                ...prev,
                [field]: false
            }));
        }

        // Update the field that was changed
        handleChange(field, currentDate);

        // If dateOut is being updated and it's after the current dateIn, update dateIn to match
        if (field === 'dateOut' && form.dateIn && currentDate > form.dateIn) {
            handleChange('dateIn', currentDate);
        }
    };

    const validateForm = () => {
        if (!form.dateOut) return 'Date Out is required';
        if (!form.timeOut) return 'Time Out is required';
        if (!form.dateIn) return 'Date In is required';
        if (form.dateOut > form.dateIn) {
            return 'Date Out must be before or equal to Date In';
        }
        if (!form.purpose) return 'Purpose is required';
        if (!form.placeUnitVisit) return 'Place/Unit Visit is required';
        return null;
    };

    const handleSubmit = async () => {
        const validationError = validateForm();
        if (validationError) {
            Alert.alert('Validation Error', validationError);
            return;
        }
        setSubmitting(true);
        try {
            const formatDateForApi = (date) => {
                if (!date) return '';
                try {
                    return new Date(date).toISOString().split('T')[0];
                } catch (e) {
                    console.error('Error formatting date for API:', e);
                    return '';
                }
            };

            const formatTimeForApi = (date) => {
                if (!date) return '';
                try {
                    return new Date(date).toTimeString().substring(0, 5);
                } catch (e) {
                    console.error('Error formatting time for API:', e);
                    return '';
                }
            };

            const odData = {
                dateOut: formatDateForApi(form.dateOut),
                timeOut: formatTimeForApi(form.timeOut),
                dateIn: formatDateForApi(form.dateIn),
                timeIn: formatTimeForApi(form.timeIn),
                purpose: form.purpose,
                placeUnitVisit: form.placeUnitVisit,
                user: user.id,
            };

            await api.post('/od', odData);
            Alert.alert('Success', 'OD request submitted successfully');
            setForm({
                dateOut: new Date(),
                timeOut: new Date(),
                dateIn: new Date(),
                timeIn: new Date(),
                purpose: '',
                placeUnitVisit: '',
            });
            await fetchOdRecords();
        } catch (err) {
            console.error('OD submit error:', err.response?.data || err.message);
            const errorMessage = err.response?.data?.message || 'An error occurred while submitting the OD request';
            Alert.alert('Error', errorMessage);
        } finally {
            setSubmitting(false);
        }
    };

    const formatDate = (date) => {
        if (!date) return 'N/A';
        try {
            return new Date(date).toLocaleDateString();
        } catch (e) {
            console.error('Error formatting date:', e);
            return 'Invalid Date';
        }
    };

    const formatTime = (date) => {
        if (!date) return 'N/A';
        try {
            return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            console.error('Error formatting time:', e);
            return 'Invalid Time';
        }
    };

    return (
        <PaperProvider>
            <ScrollView 
                style={styles.container}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        colors={['#2563eb']}
                        tintColor="#2563eb"
                    />
                }
            >
                <Text style={styles.pageTitle}>Apply for OD</Text>
                <Card style={styles.card}>
                    <Card.Content>
                        {/* Form fields remain the same */}
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Date Out</Text>
                            <TouchableOpacity
                                style={styles.input}
                                onPress={() => showDatepicker('dateOut')}
                            >
                                <Text>{formatDate(form.dateOut)}</Text>
                            </TouchableOpacity>
                            {showDatePicker.dateOut && (
                                <View style={styles.datePickerContainer}>
                                    <DateTimePicker
                                        value={form.dateOut}
                                        mode="date"
                                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                        onChange={(event, date) => onDateChange(event, date, 'dateOut')}
                                        minimumDate={new Date()}
                                    />
                                    {Platform.OS === 'ios' && (
                                        <Button
                                            mode="contained"
                                            onPress={() => setShowDatePicker(prev => ({ ...prev, dateOut: false }))}
                                            style={styles.doneButton}
                                        >
                                            Done
                                        </Button>)}
                                </View>

                            )}
                        </View>


                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Time Out</Text>
                            <TouchableOpacity
                                style={styles.input}
                                onPress={() => showDatepicker('timeOut')}
                            >
                                <Text>{formatTime(form.timeOut)}</Text>
                            </TouchableOpacity>
                            {showDatePicker.timeOut && (
                                <View>
                                <DateTimePicker
                                    value={form.timeOut}
                                    mode="time"
                                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                    onChange={(event, time) => onDateChange(event, time, 'timeOut')}
                                />{Platform.OS === 'ios' && (
                                    <Button
                                        mode="contained"
                                        onPress={() => setShowDatePicker(prev => ({ ...prev, timeOut: false }))}
                                        style={styles.doneButton}
                                    >
                                        Done
                                    </Button>)}
                            </View>
                            )}
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Date In</Text>
                            <TouchableOpacity
                                style={styles.input}
                                onPress={() => showDatepicker('dateIn')}
                            >
                                <Text>{formatDate(form.dateIn)}</Text>
                            </TouchableOpacity>
                            {showDatePicker.dateIn && (
                                <View>
                                <DateTimePicker
                                    value={form.dateIn}
                                    mode="date"
                                    display={Platform.OS === 'ios' ? 'spinner' : 'default'} 
                                    minimumDate={form.dateOut ? new Date(form.dateOut) : new Date()}
                                    onChange={(event, date) => onDateChange(event, date, 'dateIn')}
                                />
                                {Platform.OS === 'ios' && (
                                    <Button
                                        mode="contained"
                                        onPress={() => setShowDatePicker(prev => ({ ...prev, dateIn: false }))}
                                        style={styles.doneButton}
                                    >
                                        Done
                                    </Button>)}
                                </View>
                            )}
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Time In</Text>
                            <TouchableOpacity
                                style={styles.input}
                                onPress={() => showDatepicker('timeIn')}
                            >
                                <Text>{formatTime(form.timeIn)}</Text>
                            </TouchableOpacity>
                            {showDatePicker.timeIn && (
                                <View>
                                <DateTimePicker
                                    value={form.timeIn}
                                    mode="time"
                                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                    onChange={(event, time) => onDateChange(event, time, 'timeIn')}
                                />
                                {Platform.OS === 'ios' && (
                                    <Button
                                        mode="contained"
                                        onPress={() => setShowDatePicker(prev => ({ ...prev, timeIn: false }))}
                                        style={styles.doneButton}
                                    >
                                        Done
                                    </Button>)}
                                </View>
                            )}
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Purpose</Text>
                            <TextInput
                                style={[styles.input, styles.textArea]}
                                multiline
                                numberOfLines={4}
                                value={form.purpose}
                                onChangeText={(text) => handleChange('purpose', text)}
                                placeholder="Enter purpose..."
                            />
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Place/Unit Visit</Text>
                            <TextInput
                                style={styles.input}
                                value={form.placeUnitVisit}
                                onChangeText={(text) => handleChange('placeUnitVisit', text)}
                                placeholder="Enter place/unit visit"
                            />
                        </View>

                        <View style={styles.noteContainer}>
                            <Text style={styles.noteTitle}>Important Notes:</Text>
                            <View style={styles.noteList}>
                                <Text style={styles.noteItem}>1. Person on OD should submit daily report to their immediate Head via email at contact@accelorindia.com.</Text>
                                <Text style={styles.noteItem}>2. Submit a report/PPT on returning back to immediate Head and O/o Admin.</Text>
                                <Text style={styles.noteItem}>3. Person on OD should submit their duly signed TA Bills to O/o Admin within two days of joining the office.</Text>
                            </View>
                        </View>

                        <TouchableOpacity
                            style={[styles.submitButton, submitting && styles.disabledButton]}
                            onPress={handleSubmit}
                            disabled={submitting}
                        >
                            <Text style={styles.submitButtonText}>
                                {submitting ? 'Submitting...' : 'Submit OD'}
                            </Text>
                        </TouchableOpacity>
                    </Card.Content>
                </Card>

                <View style={{ marginTop: 24, marginBottom: 40 }}>
                    <Text style={styles.sectionTitle}>Your OD Records</Text>

                    {Array.isArray(odRecords) && odRecords.length === 0 ? (
                        <Text style={styles.noRecords}>No OD records found</Text>
                    ) : (
                        <>
                            <View style={[styles.row, styles.tableHeader]}>
                                <Text style={[styles.cell, styles.headerCell, { flex: 2 }]}>From Date</Text>
                                <Text style={[styles.cell, styles.headerCell, { flex: 2 }]}>To Date</Text>
                                <Text style={[styles.cell, styles.headerCell, { flex: 2 }]}>Status</Text>
                                <Text style={[styles.cell, styles.headerCell, { flex: 1 }]}>Details</Text>
                            </View>

                            {Array.isArray(odRecords) ? (
                                odRecords.map((record) => {
                                    const dateOut = record.dateOut ? new Date(record.dateOut) : null;
                                    const dateIn = record.dateIn ? new Date(record.dateIn) : null;
                                    const status = getFinalStatus(record.status, user.loginType);
                                    return (
                                        <View key={record._id} style={styles.row}>
                                            <Text style={[styles.cell, { flex: 2 }]}>
                                                {dateOut && !isNaN(dateOut.getTime()) ? dateOut.toLocaleDateString() : 'N/A'}
                                            </Text>
                                            <Text style={[styles.cell, { flex: 2 }]}>
                                                {dateIn && !isNaN(dateIn.getTime()) ? dateIn.toLocaleDateString() : 'N/A'}
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
                                                        console.log('Viewing record:', JSON.stringify(record, null, 2));
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
                                <Text style={styles.noRecords}>Invalid OD records data</Text>
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

                        {selectedRecord && (
                            <ScrollView>
                                <Text style={styles.modalTitle}>OD Request Details</Text>

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
                                    <Text style={styles.detailLabel}>From Date:</Text>
                                    <Text style={styles.detailValue}>
                                        {selectedRecord.dateOut ? new Date(selectedRecord.dateOut).toLocaleDateString() : 'N/A'}
                                    </Text>
                                </View>

                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>To Date:</Text>
                                    <Text style={styles.detailValue}>
                                        {selectedRecord.dateIn ? new Date(selectedRecord.dateIn).toLocaleDateString() : 'N/A'}
                                    </Text>
                                </View>

                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Time In:</Text>
                                    <Text style={styles.detailValue}>
                                        {selectedRecord.timeIn || 'N/A'}
                                    </Text>
                                </View>

                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Time Out:</Text>
                                    <Text style={styles.detailValue}>
                                        {selectedRecord.timeOut || 'N/A'}
                                    </Text>
                                </View>

                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Purpose:</Text>
                                    <Text style={styles.detailValue}>
                                        {selectedRecord.purpose || 'N/A'}
                                    </Text>
                                </View>

                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Place/Unit Visit:</Text>
                                    <Text style={styles.detailValue}>
                                        {selectedRecord.placeUnitVisit || 'N/A'}
                                    </Text>
                                </View>

                                <View style={{ marginTop: 16 }}>
                                    <Text style={[styles.detailLabel, { marginBottom: 8 }]}>Approval Status:</Text>

                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>• HOD:</Text>
                                        <Text style={[
                                            styles.detailValue,
                                            {
                                                color: selectedRecord.status?.hod === 'Approved' ? '#10b981' :
                                                    selectedRecord.status?.hod === 'Rejected' ? '#ef4444' : '#64748b'
                                            }
                                        ]}>
                                            {selectedRecord.status?.hod || 'Pending'}
                                        </Text>
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
                                <View style={{ ...styles.detailRow, marginTop: 16 }}>
                                    <Text style = {styles.detailLabel}>Remarks:</Text>
                                    <Text style = {styles.detailValue}>
                                        {selectedRecord.remarks || 'N/A'}
                                    </Text>
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
    container: {
        flex: 1,
        padding: 16,
        backgroundColor: '#f5f5f5',
    },
    pageTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1e40af',
        marginBottom: 16,
        textAlign: 'center',
    },
    card: {
        marginBottom: 20,
        borderRadius: 8,
        elevation: 3,
        backgroundColor: '#fff',
    },
    formGroup: {
        marginBottom: 16,
    },
    label: {
        fontSize: 16,
        marginBottom: 8,
        fontWeight: '500',
        
    },
    input: {
        borderWidth: 1,
        borderColor: '#9ca3af',
        borderRadius: 4,
        padding: 12,
        fontSize: 16,
    },
    textArea: {
        height: 100,
        textAlignVertical: 'top',
    },
    noteContainer: {
        backgroundColor: '#f5f5f5',
        padding: 16,
        borderRadius: 4,
        marginBottom: 20,
    },
    noteTitle: {
        fontWeight: 'bold',
        marginBottom: 8,
    },
    noteList: {
        paddingLeft: 20,
    },
    noteItem: {
        marginBottom: 8,
        fontSize: 14,
        lineHeight: 20,
    },
    submitButton: {
        backgroundColor: '#2563eb',
        padding: 16,
        borderRadius: 4,
        alignItems: 'center',
        marginTop: 16,
    },
    disabledButton: {
        backgroundColor: '#93c5fd',
    },
    submitButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '500',
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

export default ODForm;