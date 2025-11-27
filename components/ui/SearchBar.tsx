import React from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onScanPress?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  showScanner?: boolean;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
  autoFocus?: boolean;
}

/**
 * Reusable SearchBar component with optional barcode scanner button
 * 
 * @example
 * ```tsx
 * <SearchBar
 *   value={searchQuery}
 *   onChangeText={setSearchQuery}
 *   placeholder="Search products..."
 *   showScanner
 *   onScanPress={handleOpenScanner}
 * />
 * ```
 */
export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChangeText,
  placeholder = 'Search...',
  onScanPress,
  onFocus,
  onBlur,
  showScanner = false,
  containerStyle,
  inputStyle,
  autoFocus = false,
}) => {
  return (
    <View style={[styles.container, containerStyle]}>
      <Ionicons name="search" size={18} color="#9ca3af" style={styles.searchIcon} />
      
      <TextInput
        style={[styles.input, inputStyle]}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={onBlur}
        autoFocus={autoFocus}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
      />

      {value.length > 0 && (
        <TouchableOpacity
          style={styles.clearButton}
          onPress={() => onChangeText('')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close-circle" size={18} color="#9ca3af" />
        </TouchableOpacity>
      )}

      {showScanner && onScanPress && (
        <TouchableOpacity
          style={styles.scanButton}
          onPress={onScanPress}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="scan-outline" size={20} color="#2563eb" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    paddingVertical: 0,
  },
  clearButton: {
    padding: 4,
    marginLeft: 4,
  },
  scanButton: {
    padding: 6,
    marginLeft: 4,
    borderRadius: 8,
    backgroundColor: '#e0f2fe',
  },
});
