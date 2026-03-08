import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator, useNavigation } from '@react-navigation/native-stack';
import DashboardScreen from '../screens/DashboardScreen';
import InventoryScreen from '../screens/InventoryScreen';
import AddItemScreen from '../screens/AddItemScreen';
import EditItemScreen from '../screens/inventory/EditItemScreen';
import SalesScreen from '../screens/SalesScreen';
import DebtScreen from '../screens/DebtScreen';
import RecordSaleScreen from '../screens/RecordSaleScreen';
import RecordExpenseScreen from '../screens/RecordExpenseScreen';
import RecordDebtScreen from '../screens/RecordDebtScreen';
import BranchCreateScreen from '../screens/branch/BranchCreateScreen';
import { useWorkspace } from '../context/WorkspaceContext';
import { useTheme } from '../theme/ThemeContext';
import { MaterialIcons } from '@expo/vector-icons';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => {
          let name = 'dashboard';
          if (route.name === 'Home') name = 'dashboard';
          if (route.name === 'Sales') name = 'receipt-long';
          if (route.name === 'Debt') name = 'account-balance';
          if (route.name === 'Inventory') name = 'inventory';
          return <MaterialIcons name={name} size={size} color={color} />;
        }
      })}
    >
      <Tab.Screen 
        name="Home" 
        component={DashboardScreen}
        options={{ title: 'Home' }}
      />
      <Tab.Screen 
        name="Sales" 
        component={SalesScreen}
        options={{ title: 'Sales' }}
      />
      <Tab.Screen 
        name="Debt" 
        component={DebtScreen}
        options={{ title: 'Debt' }}
      />
      <Tab.Screen 
        name="Inventory" 
        component={InventoryScreen}
        options={{ title: 'Inventory' }}
      />
    </Tab.Navigator>
  );
}

function TabWithFab() {
  const navigation = useNavigation();
  const { syncInfo } = useWorkspace();
  const { theme } = useTheme();

  const syncing = syncInfo?.isSyncing;
  const pendingCount = syncInfo?.pendingCount ?? 0;
  const iconColor = syncing ? theme.colors.primary : pendingCount > 0 ? theme.colors.warning : theme.colors.success;

  const lastSyncedLabel = syncInfo?.lastSyncedAt
    ? `Last sync: ${new Date(syncInfo.lastSyncedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : 'Not synced yet';

  return (
    <View style={styles.tabContainer}>
      <TabNavigator />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('RecordSale')}
      >
        <MaterialIcons name="add-circle" size={56} color={theme.colors.primary} />
      </TouchableOpacity>
      <View style={styles.syncBadge}>
        <MaterialIcons name="sync" size={18} color={iconColor} />
        <Text style={styles.syncText}>{lastSyncedLabel}</Text>
        {pendingCount > 0 && (
          <View style={styles.syncCountContainer}>
            <Text style={styles.syncCountText}>{pendingCount}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function MainTabs() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={TabWithFab} />
      <Stack.Screen name="AddItem" component={AddItemScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="RecordSale" component={RecordSaleScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="RecordExpense" component={RecordExpenseScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="RecordDebt" component={RecordDebtScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="CreateBranch" component={BranchCreateScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="EditItem" component={EditItemScreen} options={{ presentation: 'modal' }} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabContainer: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  syncBadge: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 16,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncCountContainer: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncCountText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  syncText: {
    fontSize: 10,
    color: '#475569',
    marginTop: 4,
  },
});
