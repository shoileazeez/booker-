import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Subtle, EmptyState, SkeletonBlock } from '../../components/UI';
import { useTheme } from '../../theme/ThemeContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { MaterialIcons } from '@expo/vector-icons';
import { api } from '../../api/client';

const buildLocalTotals = (branches = []) => ({
  branchCount: branches.length,
  staffCount: branches.reduce((sum, item) => sum + Number(item.staffCount || 0), 0),
  salesAmount: branches.reduce((sum, item) => sum + Number(item.salesAmount || 0), 0),
});

export default function BranchListScreen({ navigation }) {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  const { currentWorkspaceId, branches: availableBranches } = useWorkspace();
  const [branchRows, setBranchRows] = useState([]);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(false);
  const [offlineNotice, setOfflineNotice] = useState('');

  const formatBranchDate = (dateValue) => {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return 'Unknown date';
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const localBranches = availableBranches || [];

      if (!currentWorkspaceId) {
        setBranchRows([]);
        setTotals(null);
        setOfflineNotice('');
        return () => {
          active = false;
        };
      }

      if (localBranches.length > 0) {
        setBranchRows(localBranches);
        setTotals(buildLocalTotals(localBranches));
      }

      const loadBranches = async () => {
        setLoading(true);
        try {
          const data = await api.get(
            `/workspaces/${currentWorkspaceId}/management/overview`,
          );
          if (!active) return;
          setBranchRows(Array.isArray(data?.branches) ? data.branches : []);
          setTotals(data?.totals || null);
          setOfflineNotice('');
        } catch (err) {
          if (!active) return;
          setBranchRows(localBranches);
          setTotals(buildLocalTotals(localBranches));
          setOfflineNotice(
            localBranches.length > 0
              ? 'Offline mode: showing cached branch list.'
              : 'Offline mode: branch details are limited until you reconnect.',
          );
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      };

      loadBranches();
      return () => {
        active = false;
      };
    }, [availableBranches, currentWorkspaceId]),
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.colors.card,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.closeBtn}
        >
          <MaterialIcons
            name="close"
            size={22}
            color={theme.colors.textSecondary}
          />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
          Branch Management
        </Text>
        <TouchableOpacity
          onPress={() => navigation.push('CreateBranch')}
          style={[styles.addBtn, { backgroundColor: theme.colors.primary }]}
        >
          <MaterialIcons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {totals ? (
        <View
          style={[
            styles.summaryStrip,
            {
              backgroundColor: theme.colors.card,
              borderBottomColor: theme.colors.border,
            },
          ]}
        >
          <Text style={{ color: theme.colors.textSecondary }}>
            Branches: {totals.branchCount} | Staff: {totals.staffCount} | Sales:
            {' '}N{Number(totals.salesAmount || 0).toLocaleString()}
          </Text>
        </View>
      ) : null}

      {offlineNotice ? (
        <View
          style={[
            styles.summaryStrip,
            {
              backgroundColor: theme.colors.card,
              borderBottomColor: theme.colors.border,
            },
          ]}
        >
          <Text style={{ color: theme.colors.textSecondary }}>
            {offlineNotice}
          </Text>
        </View>
      ) : null}

      {loading ? (
        <View style={{ padding: 12 }}>
          <SkeletonBlock height={18} width="40%" />
          <SkeletonBlock height={66} />
          <SkeletonBlock height={66} />
          <SkeletonBlock height={66} />
        </View>
      ) : (
        <FlatList
          data={branchRows}
          keyExtractor={(item, index) =>
            item?.id ? String(item.id) : `branch-${index}`
          }
          contentContainerStyle={{ padding: 12 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.push('BranchDetail', { branchId: item.id })}
            >
            <Card>
              <View>
                <Text
                  style={{
                    color: theme.colors.textPrimary,
                    fontWeight: '700',
                    fontSize: 16,
                  }}
                >
                  {item.name}
                </Text>
                <Subtle>
                  {`${item.status || 'active'} | ${formatBranchDate(
                    item.createdAt,
                  )}`}
                </Subtle>
                <Text
                  style={{
                    color: theme.colors.textSecondary,
                    marginTop: 6,
                    fontSize: 12,
                  }}
                >
                  {item.managerUser?.name
                    ? `Manager: ${item.managerUser.name} (${item.managerUser.email})`
                    : 'Manager: Not assigned'}
                </Text>
                <Text
                  style={{
                    color: theme.colors.textSecondary,
                    marginTop: 6,
                    fontSize: 12,
                  }}
                >
                  Staff: {item.staffCount || 0} | Inventory:{' '}
                  {item.inventoryCount || 0}
                </Text>
                <Text
                  style={{
                    color: theme.colors.textSecondary,
                    marginTop: 2,
                    fontSize: 12,
                  }}
                >
                  Sales: {item.salesCount || 0} | N
                  {Number(item.salesAmount || 0).toLocaleString()} | Pending
                  debt: N
                  {Number(item.pendingDebtAmount || 0).toLocaleString()}
                </Text>
                <View style={styles.badgeRow}>
                  <View style={[styles.badge, { backgroundColor: `${theme.colors.primary}16` }]}>
                    <Text style={[styles.badgeText, { color: theme.colors.primary }]}>Branch scoped</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: `${theme.colors.warning}16` }]}>
                    <Text style={[styles.badgeText, { color: theme.colors.warning }]}>Permissions editable</Text>
                  </View>
                </View>
              </View>
            </Card>
            </TouchableOpacity>
          )}
          ListEmptyComponent={() => (
            <EmptyState
              icon="account-tree"
              title="No branches yet"
              subtitle="Create a branch to manage stores under this workspace"
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  closeBtn: { padding: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: '700', marginLeft: 10 },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryStrip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 8,
    marginBottom: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
