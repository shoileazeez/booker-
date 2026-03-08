import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { cacheTransactions, getCachedTransactions } from '../storage/offlineStore';
import { Card, Title, Subtle } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { MaterialIcons } from '@expo/vector-icons';

export default function DashboardScreen({ navigation }) {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  const { user } = useAuth();
  const workspace = useWorkspace();
  const { syncInfo } = workspace;

  const [recentSales, setRecentSales] = React.useState([]);
  const [recentExpenses, setRecentExpenses] = React.useState([]);
  const [loadingActivity, setLoadingActivity] = React.useState(false);
  const [activityError, setActivityError] = React.useState(null);

  React.useEffect(() => {
    const loadActivity = async () => {
      if (!workspace.currentWorkspaceId) {
        setRecentSales([]);
        setRecentExpenses([]);
        return;
      }

      setLoadingActivity(true);
      setActivityError(null);

      try {
        const [sales, expenses] = await Promise.all([
          api.get(`/workspaces/${workspace.currentWorkspaceId}/transactions`, { type: 'sale', take: 3 }),
          api.get(`/workspaces/${workspace.currentWorkspaceId}/transactions`, { type: 'expense', take: 3 }),
        ]);

        const salesList = Array.isArray(sales) ? sales : [];
        const expensesList = Array.isArray(expenses) ? expenses : [];

        setRecentSales(salesList);
        setRecentExpenses(expensesList);

        cacheTransactions(workspace.currentWorkspaceId, 'sale', salesList).catch(() => null);
        cacheTransactions(workspace.currentWorkspaceId, 'expense', expensesList).catch(() => null);
      } catch (err) {
        const cachedSales = await getCachedTransactions(workspace.currentWorkspaceId, 'sale');
        const cachedExpenses = await getCachedTransactions(workspace.currentWorkspaceId, 'expense');
        setRecentSales(cachedSales);
        setRecentExpenses(cachedExpenses);
        setActivityError('Offline mode: showing last known activity');
      } finally {
        se  <Subtle>
              {syncInfo?.lastSyncedAt
                ? `Last synced ${new Date(syncInfo.lastSyncedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : 'Not synced yet'}
            </Subtle>
          tLoadingActivity(false);
      }
    };

    loadActivity();
  }, [workspace.currentWorkspaceId]);
  const currentWorkspace = workspace.workspaces.find((w) => w.id === workspace.currentWorkspaceId);

  const handleAddItem = () => {
    navigation.navigate('AddItem');
  };

  const handleRecordSale = () => {
    navigation.navigate('RecordSale');
  };

  const handleRecordExpense = () => {
    navigation.navigate('RecordExpense');
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]} contentContainerStyle={{ padding: 16 }}>
      {/* Header with Workspace Switcher */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.textPrimary, fontSize: 18, fontWeight: '700' }}>Good morning</Text>
          <Subtle>{user ? `${user.name} • ${user.role}` : 'Guest'}</Subtle>
        </View>
        <TouchableOpacity 
          style={[styles.workspaceBadge, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
          onPress={() => navigation.navigate('Settings')}
      {activityError ? (
        <Subtle style={{ color: theme.colors.error }}>{activityError}</Subtle>
      ) : null}

      {loadingActivity ? (
        <Subtle style={{ marginTop: 8 }}>Loading recent activity…</Subtle>
      ) : (
        <>
          {recentSales.length === 0 && recentExpenses.length === 0 ? (
            <Subtle style={{ marginTop: 8 }}>No recent activity</Subtle>
          ) : (
            <>
              {recentSales.length > 0 && (
                <Card style={{ marginTop: 8 }}>
                  <Text style={{ color: theme.colors.textPrimary, fontWeight: '600' }}>Recent sales</Text>
                  {recentSales.map((tx) => (
                    <View key={tx.id} style={{ marginTop: 10 }}>
                      <Text style={{ color: theme.colors.textPrimary, fontWeight: '600' }}>
                        {tx.customerName || 'Walk-in'} • ₦{Number(tx.totalAmount).toLocaleString()}
                      </Text>
                      <Subtle>{new Date(tx.createdAt).toLocaleString()}</Subtle>
                    </View>
                  ))}
                </Card>
              )}

              {recentExpenses.length > 0 && (
                <Card style={{ marginTop: 8 }}>
                  <Text style={{ color: theme.colors.textPrimary, fontWeight: '600' }}>Recent expenses</Text>
                  {recentExpenses.map((tx) => (
                    <View key={tx.id} style={{ marginTop: 10 }}>
                      <Text style={{ color: theme.colors.textPrimary, fontWeight: '600' }}>
                        {tx.category || 'Expense'} • ₦{Number(tx.totalAmount).toLocaleString()}
                      </Text>
                      <Subtle>{new Date(tx.createdAt).toLocaleString()}</Subtle>
                    </View>
                  ))}
                </Card>
              )}
            </>
          )}
        </>
      )}chableOpacity>
      </View>

      {/* Inventory Stats Card */}
      <Card style={{ padding: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View>
            <Title>Total inventory value</Title>
            <Text style={{ color: theme.colors.textPrimary, fontSize: 20, fontWeight: '700', marginTop: 6 }}>$12,450</Text>
            <Subtle>Across {workspace.workspaces.length} workspace(s)</Subtle>
          </View>
          <View style={{ justifyContent: 'center' }}>
            <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>
              {currentWorkspace?.name ? currentWorkspace.name : 'Workspace'}
            </Text>
          </View>
        </View>
      </Card>

      {/* Quick Actions */}
      <View style={{ marginTop: 16 }}>
        <Text style={{ color: theme.colors.textSecondary, marginBottom: 8 }}>Quick actions</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <TouchableOpacity 
            style={[styles.action, { backgroundColor: theme.colors.card }]}
            onPress={handleAddItem}
          >
            <MaterialIcons name="add-circle-outline" size={20} color={theme.colors.primary} />
            <Text style={{ color: theme.colors.textPrimary, fontSize: 12, marginTop: 6 }}>Add item</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.action, { backgroundColor: theme.colors.card }]}
            onPress={handleRecordSale}
          >
            <MaterialIcons name="shopping-cart" size={20} color={theme.colors.success} />
            <Text style={{ color: theme.colors.textPrimary, fontSize: 12, marginTop: 6 }}>Record sale</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.action, { backgroundColor: theme.colors.card }]}
            onPress={handleRecordExpense}
          >
            <MaterialIcons name="money-off" size={20} color={theme.colors.warning} />
            <Text style={{ color: theme.colors.textPrimary, fontSize: 12, marginTop: 6 }}>Expense</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Recent Activity */}
      <Text style={{ color: theme.colors.textSecondary, marginTop: 14 }}>Recent activity</Text>
      <Card style={{ marginTop: 8 }}>
        <View>
          <Text style={{ color: theme.colors.textPrimary, fontWeight: '600' }}>Sale recorded</Text>
          <Subtle>John • Outlet • $120 • 2h ago</Subtle>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  workspaceBadge: { 
    padding: 8, 
    borderRadius: 8, 
    flexDirection: 'row', 
    alignItems: 'center',
    borderWidth: 1,
    maxWidth: 120
  },
  action: { 
    padding: 12, 
    borderRadius: 10, 
    flex: 1, 
    alignItems: 'center',
    justifyContent: 'center'
  }
});
