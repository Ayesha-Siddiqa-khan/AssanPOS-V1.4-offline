import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
  StyleProp,
} from 'react-native';

type TouchableOpacityRef = React.ElementRef<typeof TouchableOpacity>;

interface ButtonProps {
  onPress?: () => void;
  children: React.ReactNode;
  variant?: 'default' | 'destructive' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export const Button = React.forwardRef<TouchableOpacityRef, ButtonProps>(({
  onPress,
  children,
  variant = 'default',
  size = 'default',
  disabled = false,
  loading = false,
  className,
  style,
  textStyle,
}, ref) => {
  const getButtonStyle = (): StyleProp<ViewStyle> => {
    const base: ViewStyle = {
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
    };

    const sizeStyles: ViewStyle = {
      default: { paddingHorizontal: 16, paddingVertical: 12 },
      sm: { paddingHorizontal: 12, paddingVertical: 8 },
      lg: { paddingHorizontal: 20, paddingVertical: 16 },
    }[size];

    const variantStyles: ViewStyle = {
      default: { backgroundColor: '#2563eb' },
      destructive: { backgroundColor: '#dc2626' },
      outline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#d1d5db' },
      ghost: { backgroundColor: 'transparent' },
      secondary: { backgroundColor: '#f3f4f6' },
    }[variant];

    const disabledStyle: ViewStyle = disabled || loading ? { opacity: 0.5 } : {};

    return [base, sizeStyles, variantStyles, disabledStyle, style];
  };

  const getTextStyle = (): StyleProp<TextStyle> => {
    const base: TextStyle = {
      fontWeight: '600',
    };

    const sizeStyles: TextStyle = {
      default: { fontSize: 16 },
      sm: { fontSize: 14 },
      lg: { fontSize: 18 },
    }[size];

    const variantStyles: TextStyle = {
      default: { color: '#ffffff' },
      destructive: { color: '#ffffff' },
      outline: { color: '#374151' },
      ghost: { color: '#374151' },
      secondary: { color: '#374151' },
    }[variant];

    return [base, sizeStyles, variantStyles, textStyle];
  };

  const textStyles = getTextStyle();
  const loaderColor =
    variant === 'outline' || variant === 'ghost' || variant === 'secondary'
      ? '#2563eb'
      : '#ffffff';

  const normalizedChildren = React.Children.toArray(children).map((child, index) => {
    if (typeof child === 'string' || typeof child === 'number') {
      return (
        <Text key={`btn-text-${index}`} style={textStyles}>
          {child}
        </Text>
      );
    }
    return child;
  });

  return (
    <TouchableOpacity
      ref={ref}
      onPress={onPress}
      disabled={disabled || loading}
      style={getButtonStyle()}
      activeOpacity={0.7}
    >
      {loading && <ActivityIndicator size="small" color={loaderColor} style={{ marginRight: 8 }} />}
      {normalizedChildren}
    </TouchableOpacity>
  );
});

Button.displayName = 'Button';
