import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle, StyleProp } from 'react-native';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'secondary';
  style?: StyleProp<ViewStyle>;
}

export function Badge({ children, variant = 'default', style }: BadgeProps) {
  const getVariantStyles = () => {
    const variants: Record<string, { container: ViewStyle; text: TextStyle }> = {
      default: {
        container: { backgroundColor: '#2563eb' },
        text: { color: '#ffffff' },
      },
      success: {
        container: { backgroundColor: '#22c55e' },
        text: { color: '#ffffff' },
      },
      warning: {
        container: { backgroundColor: '#fbbf24' },
        text: { color: '#ffffff' },
      },
      danger: {
        container: { backgroundColor: '#ef4444' },
        text: { color: '#ffffff' },
      },
      secondary: {
        container: { backgroundColor: '#f3f4f6' },
        text: { color: '#374151' },
      },
    };
    return variants[variant];
  };

  const variantStyles = getVariantStyles();

  return (
    <View style={[styles.badge, variantStyles.container, style]}>
      <Text style={[styles.text, variantStyles.text]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
