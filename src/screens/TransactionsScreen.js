import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Card, Subtle, EmptyState, SkeletonBlock } from '../components/UI';
import { useTheme } from '../theme/ThemeContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { api } from '../api/client';
import { MaterialIcons } from '@expo/vector-icons';

export default function TransactionsScreen({ navigation }) {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  const { currentWorkspaceId } = useWorkspace();
  const { width } = useWindowDimensions();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const contentWidth = Math.min(width - 24, 860);

  useEffect(() => {
    const loadTransactions = async () => {
      if (!currentWorkspaceId) {
        setTransactions([]);
        return;
      }

      setLoading(true);
      try {
        const data = await api.get(`/workspaces/${currentWorkspaceId}/transactions`, { take: 50 });
        setTransactions(Array.isArray(data) ? data : []);
      } catch (err) {
        setTransactions([]);
      } finally {
        setLoading(false);
      }
    };

    loadTransactions();
  }, [currentWorkspaceId]);

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
        <View style={{ alignSelf: 'center', width: contentWidth, paddingHorizontal: 12, marginTop: 12 }}>
          <SkeletonBlock height={18} width="40%" />
          <SkeletonBlock height={64} />
          <SkeletonBlock height={64} />
          <SkeletonBlock height={64} />
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(t, index) => (t?.id != null ? String(t.id) : `tx-${index}`)}
          style={{ alignSelf: 'center', width: contentWidth }}
          contentContainerStyle={{ padding: 12, paddingBottom: 20 }}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ color: theme.colors.textPrimary, fontWeight: '700', textTransform: 'capitalize' }}>{item.type}</Text>
                  <Subtle>{item.customerName || item.category || 'N/A'} • {new Date(item.createdAt).toLocaleDateString()}</Subtle>
                </View>
                <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>{renderAmount(item)}</Text>
              </View>
            </Card>
          )}
          ListEmptyComponent={() => (
            <EmptyState
              icon="receipt-long"
              title="No transactions"
              subtitle="Sales, expenses and debts will appear here"
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
