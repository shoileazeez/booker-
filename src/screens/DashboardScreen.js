import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { cacheTransactions, getCachedTransactions } from '../storage/offlineStore';
import { cacheInventory, getCachedInventory } from '../storage/offlineStore';
import { Card, Title, Subtle, SkeletonBlock, EmptyState, AppButton } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { MaterialIcons } from '@expo/vector-icons';
import UpgradeModal from '../components/UpgradeModal';

export default function DashboardScreen({ navigation }) {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  const { user } = useAuth();
  const [showRenewalModal, setShowRenewalModal] = useState(false);
  useEffect(() => {
    if (user?.upgradeRequired) {
      setShowRenewalModal(true);
    }
  }, [user]);
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
  const [pendingInviteCount, setPendingInviteCount] = React.useState(0);

  useFocusEffect(
    React.useCallback(() => {
      setRefreshTick((prev) => prev + 1);
    }, []),
  );

  React.useEffect(() => {
    const loadActivity = async () => {
      if (!workspace.activeBranchId) {
        setRecentSales([]);
        setRecentExpenses([]);
        return;
      }

      setLoadingActivity(true);
      setActivityError(null);

      try {
        const [sales, expenses] = await Promise.all([
          api.get(`/workspaces/${workspace.currentWorkspaceId}/branches/${workspace.activeBranchId}/transactions`, { type: 'sale', take: 3 }),
          api.get(`/workspaces/${workspace.currentWorkspaceId}/branches/${workspace.activeBranchId}/transactions`, { type: 'expense', take: 3 }),
        ]);

        const salesList = Array.isArray(sales) ? sales : [];
        const expensesList = Array.isArray(expenses) ? expenses : [];

        setRecentSales(salesList);
        setRecentExpenses(expensesList);

        cacheTransactions(workspace.activeBranchId, 'sale', salesList).catch(() => null);
        cacheTransactions(workspace.activeBranchId, 'expense', expensesList).catch(() => null);
      } catch (err) {
        const cachedSales = await getCachedTransactions(workspace.activeBranchId, 'sale');
        const cachedExpenses = await getCachedTransactions(workspace.activeBranchId, 'expense');
        setRecentSales(cachedSales);
        setRecentExpenses(cachedExpenses);
        setActivityError('Offline mode: showing last known activity');
      } finally {
        setLoadingActivity(false);
      }
    };

    loadActivity();
  }, [workspace.activeBranchId, refreshTick]);

  React.useEffect(() => {
    const loadInventory = async () => {
      if (!workspace.activeBranchId) {
        setInventoryItems([]);
        return;
      }

      try {
        const data = await api.get(`/workspaces/${workspace.currentWorkspaceId}/branches/${workspace.activeBranchId}/inventory`);
        const list = Array.isArray(data) ? data : [];
        setInventoryItems(list);
        cacheInventory(workspace.activeBranchId, list).catch(() => null);
      } catch (err) {
        const cached = await getCachedInventory(workspace.activeBranchId);
        setInventoryItems(Array.isArray(cached) ? cached : []);
      }
    };

    loadInventory();
  }, [workspace.activeBranchId, refreshTick]);

  React.useEffect(() => {
    const loadPendingInvites = async () => {
      try {
        const invites = await api.get('/workspaces/invites/pending');
        setPendingInviteCount(Array.isArray(invites) ? invites.length : 0);
      } catch (err) {
        setPendingInviteCount(0);
      }
    };

    loadPendingInvites();
  }, [refreshTick]);

  const currentWorkspace = workspace.workspaces.find((w) => w.id === workspace.currentWorkspaceId);
  const currentBranch = workspace.branches?.find((b) => b.id === workspace.currentBranchId);
  const currentWorkspaceRole = currentWorkspace?.role || user?.role || 'staff';
  const isOwnerView = currentWorkspaceRole === 'owner';
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening';
  const inventoryValue = inventoryItems.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const cost = Number(item.costPrice) || 0;
    return sum + qty * cost;
  }, 0);
  const formatActivityDate = (value) => {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return 'Unknown date';
    return date.toLocaleString();
  };

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
    <>
      {showRenewalModal && (
        <UpgradeModal
          visible={showRenewalModal}
          onClose={() => setShowRenewalModal(false)}
          onUpgrade={() => {
            setShowRenewalModal(false);
            navigation.navigate('Subscription');
          }}
          title="Renewal required"
          message="Your subscription has expired or requires renewal. Please upgrade your plan to continue."
          plan={user?.plan}
          limit={null}
          current={null}
        />
      )}
      <ScrollView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={{ alignItems: 'center', paddingHorizontal: compact ? 10 : 16, paddingVertical: 12 }}
      >
        <View style={[styles.contentWrap, { width: contentWidth }]}> 
          {/* Header row */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={{ color: theme.colors.textPrimary, fontSize: titleSize, fontWeight: '700' }}>{greeting}</Text>
              <Subtle>{user ? user.name : 'Guest'}{currentBranch?.name ? ` • ${currentBranch.name}` : ''}</Subtle>
            </View>
            <TouchableOpacity
              style={[styles.workspaceBadge, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
              onPress={() => navigation.navigate('Settings')}
              accessibilityLabel="Open settings"
              activeOpacity={0.7}
            >
              <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>
                {currentWorkspace?.name || 'Workspace'}
              </Text>
            </TouchableOpacity>
          </View>

          {pendingInviteCount > 0 ? (
            <Card style={[styles.inviteBanner, { borderColor: `${theme.colors.primary}35`, backgroundColor: theme.colors.card }]}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ color: theme.colors.textPrimary, fontWeight: '700', marginBottom: 4 }}>
                  You have {pendingInviteCount} pending workspace invite{pendingInviteCount === 1 ? '' : 's'}
                </Text>
                <Subtle>Review and accept them to join another workspace.</Subtle>
              </View>
              <TouchableOpacity
                onPress={() => navigation.navigate('JoinWorkspace')}
                style={[styles.inviteBannerButton, { backgroundColor: theme.colors.primary }]}
                activeOpacity={0.8}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Review</Text>
              </TouchableOpacity>
            </Card>
          ) : null}

          {/* Inventory Stats Card with Skeleton */}
          <Card style={[styles.heroCard, { padding: compact ? 12 : 14, borderColor: theme.colors.primary + '22' }]}> 
            {loadingActivity ? (
              <SkeletonBlock height={32} width="60%" style={{ marginBottom: 8 }} />
            ) : (
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
            )}
          </Card>

          {/* Quick Actions with feedback */}
          <View style={{ marginTop: 16 }}>
            <Text style={{ color: theme.colors.textSecondary, marginBottom: 8 }}>Quick actions</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
              <TouchableOpacity 
                style={[styles.action, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
                onPress={handleAddItem}
                activeOpacity={0.7}
                accessibilityLabel="Add inventory item"
              >
                <MaterialIcons name="add-circle-outline" size={20} color={theme.colors.primary} />
                <Text style={{ color: theme.colors.textPrimary, fontSize: compact ? 11 : 12, marginTop: 6 }}>Add item</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.action, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
                onPress={handleRecordSale}
                activeOpacity={0.7}
                accessibilityLabel="Record sale"
              >
                <MaterialIcons name="shopping-cart" size={20} color={theme.colors.success} />
                <Text style={{ color: theme.colors.textPrimary, fontSize: compact ? 11 : 12, marginTop: 6 }}>Record sale</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.action, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
                onPress={handleRecordExpense}
                activeOpacity={0.7}
                accessibilityLabel="Record expense"
              >
                <MaterialIcons name="money-off" size={20} color={theme.colors.warning} />
                <Text style={{ color: theme.colors.textPrimary, fontSize: compact ? 11 : 12, marginTop: 6 }}>Expense</Text>
              </TouchableOpacity>
            </View>
          </View>

          {isOwnerView ? (
            <Card style={{ marginTop: 16 }}>
              <Text style={{ color: theme.colors.textPrimary, fontWeight: '700', marginBottom: 6 }}>
                Owner Tools
              </Text>
              <Subtle>
                Workspace-wide controls for branch movement and audit visibility.
              </Subtle>
              <View style={{ flexDirection: compact ? 'column' : 'row', gap: 10, marginTop: 12 }}>
                <AppButton
                  title="Stock Transfers"
                  icon="swap-horiz"
                  onPress={() => navigation.navigate('StockTransfer')}
                  style={{ flex: 1 }}
                />
                <AppButton
                  title="Audit Logs"
                  icon="history"
                  variant="secondary"
                  onPress={() => navigation.navigate('AuditLogs')}
                  style={{ flex: 1 }}
                />
              </View>
            </Card>
          ) : null}

          {/* Recent Activity with Skeleton and Improved Empty State */}
          {activityError ? (
            <Subtle style={{ color: theme.colors.error, fontSize: subtitleSize, marginTop: 16 }}>{activityError}</Subtle>
          ) : null}

          {loadingActivity ? (
            <View style={{ marginTop: 16 }}>
              <SkeletonBlock height={20} width="40%" style={{ marginBottom: 8 }} />
              <SkeletonBlock height={48} />
              <SkeletonBlock height={48} style={{ marginTop: 8 }} />
            </View>
          ) : (
            <>
              {recentSales.length === 0 && recentExpenses.length === 0 ? (
                <EmptyState
                  icon="history"
                  title="No recent activity"
                  subtitle="Record your first sale or expense to see activity here!"
                  style={{ marginTop: 16 }}
                />
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
                          <Subtle>{formatActivityDate(tx.createdAt)}</Subtle>
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
                          <Subtle>{formatActivityDate(tx.createdAt)}</Subtle>
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
    </>
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
  inviteBanner: {
    marginBottom: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inviteBannerButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
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


