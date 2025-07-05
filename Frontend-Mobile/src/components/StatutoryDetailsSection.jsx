import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';

const StatutoryDetailsSection = ({ profile, errors, onChange, isLocked }) => {

    return (
        <View style={styles.container}>
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Statutory Details</Text>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>PAN Number</Text>
                    <TextInput
                        style={[styles.input, errors.panNumber && styles.inputError]}
                        value={profile.panNumber || ''}
                        onChangeText={(text) => onChange('panNumber', text)}
                        placeholder="Enter PAN number"
                        editable={!isLocked}
                    />
                    {errors.panNumber && <Text style={styles.errorText}>{errors.panNumber}</Text>}
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>PF Number</Text>
                    <TextInput
                        style={[styles.input, errors.pfNumber && styles.inputError]}
                        value={profile.pfNumber || ''}
                        onChangeText={(text) => onChange('pfNumber', text)}
                        placeholder="Enter PF number"
                        editable={!isLocked}
                    />
                    {errors.pfNumber && <Text style={styles.errorText}>{errors.pfNumber}</Text>}
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>UAN Number</Text>
                    <TextInput
                        style={[styles.input, errors.uanNumber && styles.inputError]}
                        value={profile.uanNumber || ''}
                        onChangeText={(text) => onChange('uanNumber', text)}
                        placeholder="Enter UAN number"
                        editable={!isLocked}
                    />
                    {errors.uanNumber && <Text style={styles.errorText}>{errors.uanNumber}</Text>}
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>ESIC Number</Text>
                    <TextInput
                        style={[styles.input, errors.esicNumber && styles.inputError]}
                        value={profile.esicNumber || ''}
                        onChangeText={(text) => onChange('esicNumber', text)}
                        placeholder="Enter ESIC number"
                        editable={!isLocked}
                    />
                    {errors.esicNumber && <Text style={styles.errorText}>{errors.esicNumber}</Text>}
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
});

export default StatutoryDetailsSection;