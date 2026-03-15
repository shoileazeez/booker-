import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { cacheTransactions, getCachedTransactions } from '../storage/offlineStore';
import { cacheInventory, getCachedInventory } from '../storage/offlineStore';
import { Card, Title, Subtle } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { MaterialIcons } from '@expo/vector-icons';

export default function DashboardScreen({ navigation }) {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  const { user } = useAuth();
  const workspace = useWorkspace();
  const { width } = useWindowDimensions();
  const compact = width < 390;
  const contentWidth = Math.min(width - (compact ? 20 : 32), 860);
  const titleSize = compact ? 16 : 18;
  const subtitleSize = compact ? 11 : 13;

  const [recentSales, setRecentSales] = React.useState([]);
  const [recentExpenses, setRecentExpenses] = React.useState([]);
  const [loadingActivity, setLoadingActivity] = React.useState(false);
  const [activityError, setActivityError] = React.useState(null);
  const [inventoryItems, setInventoryItems] = React.useState([]);
  const [refreshTick, setRefreshTick] = React.useState(0);

  useFocusEffect(
    React.useCallback(() => {
      setRefreshTick((prev) => prev + 1);
    }, []),
  );

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
        setLoadingActivity(false);
      }
    };

    loadActivity();
  }, [workspace.currentWorkspaceId, refreshTick]);

  React.useEffect(() => {
    const loadInventory = async () => {
      if (!workspace.currentWorkspaceId) {
        setInventoryItems([]);
        return;
      }

      try {
        const data = await api.get(`/workspaces/${workspace.currentWorkspaceId}/inventory`);
        const list = Array.isArray(data) ? data : [];
        setInventoryItems(list);
        cacheInventory(workspace.currentWorkspaceId, list).catch(() => null);
      } catch (err) {
        const cached = await getCachedInventory(workspace.currentWorkspaceId);
        setInventoryItems(Array.isArray(cached) ? cached : []);
      }
    };

    loadInventory();
  }, [workspace.currentWorkspaceId, refreshTick]);

  const currentWorkspace = workspace.workspaces.find((w) => w.id === workspace.currentWorkspaceId);
  const inventoryValue = inventoryItems.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const cost = Number(item.costPrice) || 0;
    return sum + qty * cost;
  }, 0);

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
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{ alignItems: 'center', paddingHorizontal: compact ? 10 : 16, paddingVertical: 12 }}
    >
      <View style={[styles.contentWrap, { width: contentWidth }]}> 
      {/* Header row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={{ color: theme.colors.textPrimary, fontSize: titleSize, fontWeight: '700' }}>Good morning</Text>
          <Subtle>{user ? user.name : 'Guest'}</Subtle>
        </View>
        <TouchableOpacity
          style={[styles.workspaceBadge, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
          onPress={() => navigation.navigate('Settings')}
        >
          <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>
            {currentWorkspace?.name || 'Workspace'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Inventory Stats Card */}
      <Card style={[styles.heroCard, { padding: compact ? 12 : 14, borderColor: theme.colors.primary + '22' }]}>
        <View style={{ flexDirection: compact ? 'column' : 'row', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Title>Total inventory value</Title>
            <Text style={{ color: theme.colors.textPrimary, fontSize: compact ? 18 : 20, fontWeight: '700', marginTop: 6 }}>
              ₦{inventoryValue.toLocaleString()}
            </Text>
            <Subtle>{inventoryItems.length} item(s) in stock</Subtle>
          </View>
          <View style={{ justifyContent: 'center', marginTop: compact ? 8 : 0 }}>
            <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>
              {currentWorkspace?.name ? currentWorkspace.name : 'Workspace'}
            </Text>
          </View>
        </View>
      </Card>

      {/* Quick Actions */}
      <View style={{ marginTop: 16 }}>
        <Text style={{ color: theme.colors.textSecondary, marginBottom: 8 }}>Quick actions</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
          <TouchableOpacity 
            style={[styles.action, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
            onPress={handleAddItem}
          >
            <MaterialIcons name="add-circle-outline" size={20} color={theme.colors.primary} />
            <Text style={{ color: theme.colors.textPrimary, fontSize: compact ? 11 : 12, marginTop: 6 }}>Add item</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.action, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
            onPress={handleRecordSale}
          >
            <MaterialIcons name="shopping-cart" size={20} color={theme.colors.success} />
            <Text style={{ color: theme.colors.textPrimary, fontSize: compact ? 11 : 12, marginTop: 6 }}>Record sale</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.action, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
            onPress={handleRecordExpense}
          >
            <MaterialIcons name="money-off" size={20} color={theme.colors.warning} />
            <Text style={{ color: theme.colors.textPrimary, fontSize: compact ? 11 : 12, marginTop: 6 }}>Expense</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Recent Activity */}
      {activityError ? (
        <Subtle style={{ color: theme.colors.error, fontSize: subtitleSize, marginTop: 16 }}>{activityError}</Subtle>
      ) : null}

      {loadingActivity ? (
        <Subtle style={{ marginTop: 16, fontSize: subtitleSize }}>Loading recent activity…</Subtle>
      ) : (
        <>
          {recentSales.length === 0 && recentExpenses.length === 0 ? (
            <Subtle style={{ marginTop: 16, fontSize: subtitleSize }}>No recent activity</Subtle>
          ) : (
            <>
              {recentSales.length > 0 && (
                <Card style={{ marginTop: 16 }}>
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
      )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  contentWrap: { maxWidth: 860 },
  heroCard: {
    borderWidth: 1,
    borderRadius: 14,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  workspaceBadge: { 
    flexShrink: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8, 
    alignItems: 'flex-start',
    borderWidth: 1
  },
  action: { 
    minWidth: '31.5%',
    padding: 12, 
    borderRadius: 10, 
    flexGrow: 1,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  }
});
