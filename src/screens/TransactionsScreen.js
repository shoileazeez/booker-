import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Card, Subtle, EmptyState, SkeletonBlock } from '../components/UI';
import { useTheme } from '../theme/ThemeContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { api } from '../api/client';
import { cacheTransactions, getCachedTransactions } from '../storage/offlineStore';
import { MaterialIcons } from '@expo/vector-icons';

export default function TransactionsScreen({ navigation }) {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  const { currentWorkspaceId, activeBranchId, repo } = useWorkspace();
  const { width } = useWindowDimensions();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const contentWidth = Math.min(width - 24, 860);

  useEffect(() => {
    const loadTransactions = async () => {
      if (!currentWorkspaceId || !activeBranchId) {
        setTransactions([]);
        return;
      }

      setLoading(true);
      try {
        const localRows = await repo.getTransactions();
        const localList = [];
        if (localRows?.rows?.length > 0) {
          for (let i = 0; i < localRows.rows.length; i += 1) {
            const row = localRows.rows.item(i);
            const data = row.data ? JSON.parse(row.data) : {};
            localList.push({
              ...data,
              id: data.id ?? row.server_id ?? row.local_id,
              local_id: row.local_id,
              sync_status: row.sync_status,
            });
          }
        }
        if (localList.length > 0) {
          setTransactions(localList);
        }

        const data = await api.get(`/workspaces/${currentWorkspaceId}/branches/${activeBranchId}/transactions`, { take: 50 });
        const list = Array.isArray(data) ? data : [];
        setTransactions(list);
        cacheTransactions(activeBranchId, null, list).catch(() => null);
      } catch (err) {
        const cached = await getCachedTransactions(activeBranchId);
        setTransactions(Array.isArray(cached) ? cached : []);
      } finally {
        setLoading(false);
      }
    };

    loadTransactions();
  }, [currentWorkspaceId, activeBranchId, repo]);

  const renderAmount = useMemo(() => {
    return (item) => `₦${Number(item.totalAmount || 0).toLocaleString()}`;
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.pageHeader, { width: contentWidth }]}> 
        <TouchableOpacity
          onPress={() => {
            if (navigation?.canGoBack && navigation.canGoBack()) {
              navigation.goBack();
            }
          }}
          style={[styles.backButton, { borderColor: theme.colors.border, opacity: navigation?.canGoBack && navigation.canGoBack() ? 1 : 0.35 }]}
          disabled={!(navigation?.canGoBack && navigation.canGoBack())}
        >
          <MaterialIcons name="arrow-back" size={20} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.pageTitle, { color: theme.colors.textPrimary }]}>Transactions</Text>
      </View>

      {loading ? (
        <View style={{ alignSelf: 'center', width: contentWidth, paddingHorizontal: 12, marginTop: 24 }}>
          <SkeletonBlock height={26} width="45%" style={{ marginBottom: 18, borderRadius: 8 }} />
          <SkeletonBlock height={80} style={{ marginBottom: 18, borderRadius: 16 }} />
          <SkeletonBlock height={80} style={{ marginBottom: 18, borderRadius: 16 }} />
          <SkeletonBlock height={80} style={{ marginBottom: 18, borderRadius: 16 }} />
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(t, index) => (t?.id != null ? String(t.id) : `tx-${index}`)}
          style={{ alignSelf: 'center', width: contentWidth }}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          renderItem={({ item }) => (
            <Card style={{ marginBottom: 16, borderRadius: 14, elevation: 2 }}
              accessible accessibilityLabel={`Transaction: ${item.type}, ${item.customerName || item.category || 'N/A'}, ${new Date(item.createdAt).toLocaleDateString()}, Amount: ${renderAmount(item)}`}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={{ color: theme.colors.textPrimary, fontWeight: '700', textTransform: 'capitalize', fontSize: 16 }}>{item.type}</Text>
                  <Subtle style={{ marginTop: 2 }}>{item.customerName || item.category || 'N/A'} • {new Date(item.createdAt).toLocaleDateString()}</Subtle>
                </View>
                <Text style={{ color: theme.colors.textPrimary, fontWeight: '700', fontSize: 16 }}>{renderAmount(item)}</Text>
              </View>
            </Card>
          )}
          ListEmptyComponent={() => (
            <EmptyState
              icon="receipt-long"
              title="No transactions"
              subtitle="Sales, expenses and debts will appear here"
              style={{ marginTop: 32 }}
              ctaLabel="Record a transaction"
              onCtaPress={() => navigation.navigate('RecordSaleScreen')}
              accessibilityLabel="No transactions. Record a transaction."
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    paddingHorizontal: 12,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
});

