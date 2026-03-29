import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DashboardScreen from '../screens/DashboardScreen';
import InventoryScreen from '../screens/InventoryScreen';
import AddItemScreen from '../screens/AddItemScreen';
import EditItemScreen from '../screens/inventory/EditItemScreen';
import SalesScreen from '../screens/SalesScreen';
import DebtScreen from '../screens/DebtScreen';
import ReportsScreen from '../screens/ReportsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import RecordSaleScreen from '../screens/RecordSaleScreen';
import RecordExpenseScreen from '../screens/RecordExpenseScreen';
import RecordDebtScreen from '../screens/RecordDebtScreen';
import BranchCreateScreen from '../screens/branch/BranchCreateScreen';
import BranchListScreen from '../screens/branch/BranchListScreen';
import BranchDetailScreen from '../screens/branch/BranchDetailScreen';
import AuditLogScreen from '../screens/admin/AuditLogScreen';
import StockTransferScreen from '../screens/admin/StockTransferScreen';
import WorkspaceSetupScreen from '../screens/workspace/WorkspaceSetupScreen';
import WorkspaceInvitesScreen from '../screens/workspace/WorkspaceInvitesScreen';
import SubscriptionScreen from '../screens/billing/SubscriptionScreen';
import TeamManagementScreen from '../screens/TeamManagementScreen';
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
          if (route.name === 'Analytics') name = 'analytics';
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
        name="Analytics"
        component={ReportsScreen}
        options={{ title: 'Analytics' }}
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
  const { theme } = useTheme();

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
      <Stack.Screen name="BranchDetail" component={BranchDetailScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="AuditLogs" component={AuditLogScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="StockTransfer" component={StockTransferScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="TeamManagement" component={TeamManagementScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="CreateWorkspace" component={WorkspaceSetupScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="JoinWorkspace" component={WorkspaceInvitesScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="EditItem" component={EditItemScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="CustomerListScreen" component={require('../screens/CustomerListScreen').default} options={{ presentation: 'modal', title: 'Customers' }} />
      <Stack.Screen name="AddCustomerScreen" component={require('../screens/AddCustomerScreen').default} options={{ presentation: 'modal', title: 'Add Customer' }} />
      <Stack.Screen name="EditCustomerScreen" component={require('../screens/EditCustomerScreen').default} options={{ presentation: 'modal', title: 'Edit Customer' }} />
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
});
