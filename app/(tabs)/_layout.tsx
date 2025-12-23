import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const bottomInset = Math.max(insets.bottom, 12);
  
  // All authenticated users have access to all features
  // You can add role-based permissions later if needed
  const canManageCustomers = true;
  const canProcessSales = true;
  const canManageInventory = true;
  const canViewReports = true;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#6b7280',
        headerShown: false,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#e5e7eb',
          backgroundColor: '#ffffff',
          paddingTop: 4,
          paddingBottom: bottomInset,
          height: 68 + bottomInset,
        },
        tabBarItemStyle: {
          flex: 1,
        },
        headerStyle: {
          backgroundColor: '#2563eb',
        },
        headerTintColor: '#ffffff',
        headerTitleStyle: {
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerShown: true,
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      {canManageCustomers && (
        <Tabs.Screen
          name="customers"
          options={{
            title: 'Customers',
            headerShown: false,
            tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />,
          }}
        />
      )}
      {canProcessSales && (
        <Tabs.Screen
          name="sales"
          options={{
            title: 'Sales',
            headerShown: false,
            tabBarIcon: ({ color, size }) => <Ionicons name="cart" size={size} color={color} />,
          }}
        />
      )}
      {canManageInventory && (
        <Tabs.Screen
          name="inventory"
          options={{
            title: 'Inventory',
            headerShown: false,
            tabBarIcon: ({ color, size }) => <Ionicons name="cube" size={size} color={color} />,
          }}
        />
      )}
      {canViewReports && (
        <Tabs.Screen
          name="reports"
          options={{
            title: 'Reports',
            headerShown: false,
            tabBarIcon: ({ color, size}) => (
              <Ionicons name="stats-chart" size={size} color={color} />
            ),
          }}
        />
      )}
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          headerShown: false,
          href: null,
        }}
      />
    </Tabs>
  );
}
