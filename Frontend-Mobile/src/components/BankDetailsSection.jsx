import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Modal, TouchableWithoutFeedback } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

const BankDetailsSection = ({ profile, errors, onChange, isLocked }) => {
    const [showPaymentTypePicker, setShowPaymentTypePicker] = useState(false);

    const paymentTypeOptions = [
        { label: 'Select Payment Type', value: '' },
        { label: 'Bank Transfer', value: 'Bank Transfer' },
        { label: 'Cash', value: 'Cash' },
    ];

    const selectedPaymentType = paymentTypeOptions.find(opt => opt.value === profile.paymentType) || paymentTypeOptions[0];

    const handleBankDetailsChange = (field, value) => {
        onChange('bankDetails', {
            ...profile.bankDetails,
            [field]: value,
        });
    };

    return (
        <View style={styles.container}>
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Bank Details</Text>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Payment Type</Text>
                    <TouchableOpacity
                        style={[styles.dropdownContainer, errors.paymentType && styles.inputError]}
                        onPress={() => !isLocked && setShowPaymentTypePicker(true)}
                        disabled={isLocked}
                    >
                        <Text style={styles.dropdownText}>{selectedPaymentType.label}</Text>
                        <MaterialIcons name="arrow-drop-down" size={24} color="#666" />
                    </TouchableOpacity>
                    {errors.paymentType && <Text style={styles.errorText}>{errors.paymentType}</Text>}

                    <Modal
                        visible={showPaymentTypePicker}
                        transparent={true}
                        animationType="fade"
                        onRequestClose={() => setShowPaymentTypePicker(false)}
                    >
                        <TouchableWithoutFeedback onPress={() => setShowPaymentTypePicker(false)}>
                            <View style={styles.modalOverlay}>

                                <View style={styles.modalContent}>
                                    {paymentTypeOptions.map((option) => (
                                        <TouchableOpacity
                                            key={option.value}
                                            style={styles.option}
                                            onPress={() => {
                                                onChange('paymentType', option.value);
                                                setShowPaymentTypePicker(false);
                                            }}
                                        >
                                            <Text style={[
                                                styles.optionText,
                                                option.value === profile.paymentType && styles.selectedOption
                                            ]}>
                                                {option.label}
                                            </Text>
                                            {option.value === profile.paymentType && (
                                                <MaterialIcons name="check" size={20} color="#007AFF" />
                                            )}
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        </TouchableWithoutFeedback>
                    </Modal>
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Bank Name</Text>
                    <TextInput
                        style={[styles.input, errors.bankDetails?.bankName && styles.inputError]}
                        value={profile.bankDetails?.bankName || ''}
                        onChangeText={(text) => handleBankDetailsChange('bankName', text)}
                        placeholder="Enter bank name"
                        editable={!isLocked}
                    />
                    {errors.bankDetails?.bankName && <Text style={styles.errorText}>{errors.bankDetails.bankName}</Text>}
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Bank Branch</Text>
                    <TextInput
                        style={[styles.input, errors.bankDetails?.bankBranch && styles.inputError]}
                        value={profile.bankDetails?.bankBranch || ''}
                        onChangeText={(text) => handleBankDetailsChange('bankBranch', text)}
                        placeholder="Enter bank branch"
                        editable={!isLocked}
                    />
                    {errors.bankDetails?.bankBranch && <Text style={styles.errorText}>{errors.bankDetails.bankBranch}</Text>}
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Account Number</Text>
                    <TextInput
                        style={[styles.input, errors.bankDetails?.accountNumber && styles.inputError]}
                        value={profile.bankDetails?.accountNumber || ''}
                        onChangeText={(text) => handleBankDetailsChange('accountNumber', text)}
                        placeholder="Enter account number"
                        keyboardType="numeric"
                        editable={!isLocked}
                    />
                    {errors.bankDetails?.accountNumber && <Text style={styles.errorText}>{errors.bankDetails.accountNumber}</Text>}
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>IFSC Code</Text>
                    <TextInput
                        style={[styles.input, errors.bankDetails?.ifscCode && styles.inputError]}
                        value={profile.bankDetails?.ifscCode || ''}
                        onChangeText={(text) => handleBankDetailsChange('ifscCode', text)}
                        placeholder="Enter IFSC code"
                        editable={!isLocked}
                    />
                    {errors.bankDetails?.ifscCode && <Text style={styles.errorText}>{errors.bankDetails.ifscCode}</Text>}
                </View>
            </View>
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
    inputGroup: {
        marginBottom: 16,
    },
    label: {
        fontSize: 14,
        marginBottom: 6,
        color: '#444',
    },
    input: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 6,
        padding: 10,
        backgroundColor: '#f9f9f9',
    },
    inputError: {
        borderColor: 'red',
    },
    errorText: {
        color: 'red',
        fontSize: 12,
        marginTop: 4,
    },
    dropdownContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 5,
        padding: 12,
        marginBottom: 5,
        backgroundColor: '#fff',
    },
    dropdownText: {
        fontSize: 16,
        color: '#333',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: '#fff',
        marginHorizontal: 20,
        marginBottom: 20,
        borderRadius: 10,
        padding: 10,
        width: '90%',
        maxHeight: '70%',
    },
    option: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    optionText: {
        fontSize: 16,
        color: '#333',
    },
    selectedOption: {
        color: '#007AFF',
        fontWeight: '600',
    },
});

export default BankDetailsSection;