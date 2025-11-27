import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import RNPickerSelect from 'react-native-picker-select';

interface SelectOption {
  label: string;
  value: string;
}

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  label,
  error,
  containerStyle,
}: SelectProps) {
  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.pickerContainer, error && styles.pickerError]}>
        <RNPickerSelect
          value={value}
          onValueChange={onValueChange}
          items={options}
          placeholder={placeholder ? { label: placeholder, value: '' } : undefined}
          style={pickerSelectStyles}
        />
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 6,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  pickerError: {
    borderColor: '#dc2626',
  },
  error: {
    fontSize: 12,
    color: '#dc2626',
    marginTop: 4,
  },
});

const pickerSelectStyles = StyleSheet.create({
  inputIOS: {
    fontSize: 16,
    paddingVertical: 0,
    paddingHorizontal: 0,
    color: '#111827',
  },
  inputAndroid: {
    fontSize: 16,
    paddingVertical: 0,
    paddingHorizontal: 0,
    color: '#111827',
  },
  placeholder: {
    color: '#9ca3af',
  },
});
