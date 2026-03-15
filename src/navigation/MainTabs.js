import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DashboardScreen from '../screens/DashboardScreen';
import InventoryScreen from '../screens/InventoryScreen';
import AddItemScreen from '../screens/AddItemScreen';
import EditItemScreen from '../screens/inventory/EditItemScreen';
import SalesScreen from '../screens/SalesScreen';
import DebtScreen from '../screens/DebtScreen';
import SettingsScreen from '../screens/SettingsScreen';
import RecordSaleScreen from '../screens/RecordSaleScreen';
import RecordExpenseScreen from '../screens/RecordExpenseScreen';
import RecordDebtScreen from '../screens/RecordDebtScreen';
import BranchCreateScreen from '../screens/branch/BranchCreateScreen';
import BranchListScreen from '../screens/branch/BranchListScreen';
import WorkspaceSetupScreen from '../screens/workspace/WorkspaceSetupScreen';
import { useWorkspace } from '../context/WorkspaceContext';
import { useTheme } from '../theme/ThemeContext';
import { MaterialIcons } from '@expo/vector-icons';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabNavigator() {
  const { theme } = useTheme();

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginBottom: 2,
        },
        tabBarItemStyle: {
          borderRadius: 12,
          marginHorizontal: 2,
        },
        tabBarStyle: {
          height: 68,
          paddingBottom: 8,
          paddingTop: 6,
          paddingHorizontal: 8,
          borderTopWidth: 0,
          backgroundColor: theme.colors.card,
          shadowColor: '#0f172a',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
          elevation: 14,
        },
        tabBarIcon: ({ color, focused }) => {
          let name = 'dashboard';
          if (route.name === 'Home') name = 'dashboard';
          if (route.name === 'Sales') name = 'receipt-long';
          if (route.name === 'Debt') name = 'account-balance';
          if (route.name === 'Inventory') name = 'inventory';
          return <MaterialIcons name={name} size={focused ? 24 : 22} color={color} />;
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
      <View style={styles.fabContainer} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('AddItem')}
        >
          <MaterialIcons name="add-circle" size={56} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>
      {(pendingCount > 0 || syncing) && (
        <View style={styles.syncBadge}>
          <MaterialIcons name="sync" size={18} color={iconColor} />
          <Text style={styles.syncText}>{lastSyncedLabel}</Text>
          {pendingCount > 0 && (
            <View style={styles.syncCountContainer}>
              <Text style={styles.syncCountText}>{pendingCount}</Text>
            </View>
          )}
        </View>
      )}
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
      <Stack.Screen name="BranchList" component={BranchListScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="CreateWorkspace" component={WorkspaceSetupScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="EditItem" component={EditItemScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ presentation: 'modal' }} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabContainer: {
    flex: 1,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 72,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  fab: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  syncBadge: {
    position: 'absolute',
    bottom: 72,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
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
    marginLeft: 4,
  },
});
