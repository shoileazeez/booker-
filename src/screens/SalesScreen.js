import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { api } from '../api/client';
import { cacheTransactions, getCachedTransactions } from '../storage/offlineStore';
import { Card, Subtle, EmptyState, SkeletonBlock, AppButton } from '../components/UI';
import { MaterialIcons } from '@expo/vector-icons';

export default function SalesScreen({ navigation }) {
  const { theme } = useTheme();
  const workspace = useWorkspace();
  const { width } = useWindowDimensions();

  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const contentWidth = Math.min(width - 24, 860);
  const listPadding = width < 390 ? 12 : 16;

  const loadSales = useCallback(async () => {
    if (!workspace.currentWorkspaceId) {
      setSales([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await api.get(`/workspaces/${workspace.currentWorkspaceId}/transactions`, {
        type: 'sale',
        take: 50,
      });
      const list = Array.isArray(data) ? data : [];
      setSales(list);
      cacheTransactions(workspace.currentWorkspaceId, 'sale', list).catch(() => null);
    } catch (err) {
      const cached = await getCachedTransactions(workspace.currentWorkspaceId, 'sale');
      setSales(Array.isArray(cached) ? cached : []);
      setError('Offline mode: showing last known sales');
    } finally {
      setLoading(false);
    }
  }, [workspace.currentWorkspaceId]);

  useFocusEffect(
    useCallback(() => {
      loadSales();
    }, [loadSales]),
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}> 
      <View style={[styles.pageHeader, { alignSelf: 'center', width: contentWidth, paddingHorizontal: listPadding }]}> 
        <TouchableOpacity
          onPress={() => {
            if (navigation.canGoBack()) navigation.goBack();
          }}
          style={[styles.backButton, { borderColor: theme.colors.border, opacity: navigation.canGoBack() ? 1 : 0.35 }]}
          disabled={!navigation.canGoBack()}
        >
          <MaterialIcons name="arrow-back" size={20} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.pageTitle, { color: theme.colors.textPrimary }]}>Sales</Text>
          <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
            Sold goods history for this workspace
          </Text>
        </View>
        <AppButton title="Record" icon="add" variant="primary" onPress={() => navigation.navigate('RecordSale')} />
      </View>

      {error ? (
        <View style={{ alignSelf: 'center', width: contentWidth, paddingHorizontal: listPadding }}>
          <Subtle>{error}</Subtle>
        </View>
      ) : null}

      {loading ? (
        <View style={{ alignSelf: 'center', width: contentWidth, paddingHorizontal: listPadding, marginTop: 12 }}>
          <SkeletonBlock height={20} width="40%" />
          <SkeletonBlock height={72} />
          <SkeletonBlock height={72} />
          <SkeletonBlock height={72} />
        </View>
      ) : (
        <FlatList
          data={sales}
          keyExtractor={(item, index) => (item?.id ? String(item.id) : `sale-${index}`)}
          contentContainerStyle={{ paddingHorizontal: listPadding, paddingBottom: 20 }}
          style={{ alignSelf: 'center', width: contentWidth }}
          ListEmptyComponent={
            <EmptyState
              icon="receipt-long"
              title="No sales yet"
              subtitle="Record a sale to start tracking sold goods"
            />
          }
          renderItem={({ item }) => (
            <Card style={styles.itemCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>
                    {item.customerName || 'Walk-in customer'}
                  </Text>
                  <Subtle>{new Date(item.createdAt).toLocaleString()}</Subtle>
                  <Subtle>Qty: {Number(item.quantity || 0)} • Unit: ₦{Number(item.unitPrice || 0).toLocaleString()}</Subtle>
                </View>
                <Text style={{ color: theme.colors.success, fontWeight: '700' }}>
                  ₦{Number(item.totalAmount || 0).toLocaleString()}
                </Text>
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
    gap: 10,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  itemCard: {
    marginBottom: 10,
  },
});
