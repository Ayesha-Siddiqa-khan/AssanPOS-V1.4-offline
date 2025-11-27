import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type ScanMode = 'all' | 'barcode' | 'qr';

type ScanModeToggleProps = {
  value: ScanMode;
  onChange: (mode: ScanMode) => void;
  labels: {
    all: string;
    barcode: string;
    qr: string;
  };
  style?: ViewStyle;
};

const options: Array<{ value: ScanMode; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'all', icon: 'scan-outline' },
  { value: 'barcode', icon: 'barcode-outline' },
  { value: 'qr', icon: 'qr-code-outline' },
];

export function ScanModeToggle({ value, onChange, labels, style }: ScanModeToggleProps) {
  return (
    <View style={[styles.container, style]}>
      {options.map((option) => {
        const isActive = value === option.value;
        const label =
          option.value === 'all'
            ? labels.all
            : option.value === 'barcode'
              ? labels.barcode
              : labels.qr;
        return (
          <TouchableOpacity
            key={option.value}
            style={[styles.chip, isActive && styles.chipActive]}
            onPress={() => onChange(option.value)}
            activeOpacity={0.85}
          >
            <Ionicons
              name={option.icon}
              size={14}
              color={isActive ? '#1d4ed8' : '#6b7280'}
            />
            <Text style={[styles.label, isActive && styles.labelActive]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
  },
  chipActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eef2ff',
  },
  label: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '600',
  },
  labelActive: {
    color: '#1d4ed8',
  },
});
