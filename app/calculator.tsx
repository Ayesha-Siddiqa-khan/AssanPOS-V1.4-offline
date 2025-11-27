import React, { useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';

type Operator = '+' | '-' | 'x' | '/' | null;

export default function CalculatorScreen() {
  const [display, setDisplay] = useState('0');
  const [previousValue, setPreviousValue] = useState<string | null>(null);
  const [operator, setOperator] = useState<Operator>(null);
  const [overwrite, setOverwrite] = useState(false);

  const buttonRows = useMemo(
    () => [
      ['C', 'DEL', '%', '/'],
      ['7', '8', '9', 'x'],
      ['4', '5', '6', '-'],
      ['1', '2', '3', '+'],
      ['0', '.', '='],
    ],
    []
  );

  const handleNumberPress = (value: string) => {
    setDisplay((current) => {
      if (current === '0' || overwrite) {
        setOverwrite(false);
        return value === '.' ? '0.' : value;
      }
      if (value === '.' && current.includes('.')) {
        return current;
      }
      return `${current}${value}`;
    });
  };

  const handleClear = () => {
    setDisplay('0');
    setPreviousValue(null);
    setOperator(null);
    setOverwrite(false);
  };

  const handleDelete = () => {
    setDisplay((current) => {
      if (overwrite || current.length === 1) {
        setOverwrite(false);
        return '0';
      }
      return current.slice(0, -1);
    });
  };

  const performCalculation = (nextOperator: Operator | '=') => {
    if (operator && previousValue !== null) {
      const currentValue = parseFloat(display);
      const prev = parseFloat(previousValue);
      let result = prev;

      switch (operator) {
        case '+':
          result = prev + currentValue;
          break;
        case '-':
          result = prev - currentValue;
          break;
        case 'x':
          result = prev * currentValue;
          break;
        case '/':
          result = currentValue === 0 ? 0 : prev / currentValue;
          break;
        default:
          break;
      }

      const formatted = Number.isFinite(result) ? result.toString() : '0';
      setDisplay(formatted);
      setPreviousValue(nextOperator === '=' ? null : formatted);
      setOperator(nextOperator === '=' ? null : (nextOperator as Operator));
      setOverwrite(true);
    } else {
      setPreviousValue(display);
      setOperator(nextOperator === '=' ? null : (nextOperator as Operator));
      setOverwrite(true);
    }
  };

  const handlePercent = () => {
    const currentValue = parseFloat(display);
    if (!Number.isNaN(currentValue)) {
      setDisplay((currentValue / 100).toString());
      setOverwrite(true);
    }
  };

  const handleButtonPress = (value: string) => {
    if (!Number.isNaN(Number(value)) || value === '.') {
      handleNumberPress(value);
      return;
    }

    switch (value) {
      case 'C':
        handleClear();
        break;
      case 'DEL':
        handleDelete();
        break;
      case '%':
        handlePercent();
        break;
      case '+':
      case '-':
      case 'x':
      case '/':
        performCalculation(value as Operator);
        break;
      case '=':
        performCalculation('=');
        break;
      default:
        break;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.displayCard}>
          <Text style={styles.displayTitle}>Calculator</Text>
          <Text style={styles.displayValue} numberOfLines={1}>
            {display}
          </Text>
        </View>
        <View style={styles.buttonsContainer}>
          {buttonRows.map((row) => (
            <View key={row.join('-')} style={styles.row}>
              {row.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[
                    styles.button,
                    item === 'C' || item === 'DEL' || item === '%' ? styles.buttonAlert : undefined,
                    item === '=' || item === '+' ? styles.buttonPrimary : undefined,
                    item === '0' ? styles.buttonZero : undefined,
                  ]}
                  onPress={() => handleButtonPress(item)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.buttonLabel,
                      item === 'C' || item === 'DEL' || item === '%' ? styles.buttonAlertLabel : undefined,
                      item === '=' || item === '+' ? styles.buttonPrimaryLabel : undefined,
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  screen: {
    flex: 1,
    padding: 16,
  },
  displayCard: {
    height: 120,
    borderRadius: 20,
    backgroundColor: '#2563eb',
    padding: 20,
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  displayTitle: {
    color: '#dbeafe',
    fontSize: 14,
    fontWeight: '500',
  },
  displayValue: {
    color: '#ffffff',
    fontSize: 48,
    fontWeight: '700',
    textAlign: 'right',
  },
  buttonsContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  buttonZero: {
    flex: 2,
  },
  buttonLabel: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0f172a',
  },
  buttonAlert: {
    backgroundColor: '#fee2e2',
  },
  buttonAlertLabel: {
    color: '#dc2626',
  },
  buttonPrimary: {
    backgroundColor: '#2563eb',
  },
  buttonPrimaryLabel: {
    color: '#ffffff',
  },
});

