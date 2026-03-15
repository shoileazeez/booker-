import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Card, Subtle, EmptyState, SkeletonBlock } from '../components/UI';
import { useWorkspace } from '../context/WorkspaceContext';
import { api } from '../api/client';
import { MaterialIcons } from '@expo/vector-icons';

export default function ReportsScreen({ navigation }) {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  const { currentWorkspaceId } = useWorkspace();
  const { width } = useWindowDimensions();
  const [range, setRange] = useState('Daily');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const contentWidth = Math.min(width - 24, 860);

  const dateRange = useMemo(() => {
    const endDate = new Date();
    const startDate = new Date();
    if (range === 'Daily') startDate.setDate(endDate.getDate() - 1);
    if (range === 'Weekly') startDate.setDate(endDate.getDate() - 7);
    if (range === 'Monthly') startDate.setMonth(endDate.getMonth() - 1);
    return { startDate, endDate };
  }, [range]);

  useEffect(() => {
    const loadSummary = async () => {
      if (!currentWorkspaceId) {
        setSummary(null);
        return;
      }

      setLoading(true);
      try {
        const data = await api.get(`/workspaces/${currentWorkspaceId}/transactions/summary`, {
          startDate: dateRange.startDate.toISOString(),
          endDate: dateRange.endDate.toISOString(),
        });
        setSummary(data || null);
      } catch (err) {
        setSummary(null);
      } finally {
        setLoading(false);
      }
    };

    loadSummary();
  }, [currentWorkspaceId, dateRange]);

  const formatCurrency = (value) => `₦${Number(value || 0).toLocaleString()}`;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}> 
      <View style={[styles.headerWrap, { width: contentWidth }]}> 
        <View style={styles.headerRow}>
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
          <Text style={{ color: theme.colors.textPrimary, fontWeight: '700', fontSize: 20 }}>Reports</Text>
        </View>
        <Subtle>Select range</Subtle>
        <View style={{ flexDirection: 'row', marginTop: 8 }}>
          {['Daily', 'Weekly', 'Monthly'].map((r) => (
            <TouchableOpacity key={r} onPress={() => setRange(r)} style={[styles.range, { backgroundColor: range === r ? theme.colors.primary : theme.colors.card }]}>
              <Text style={{ color: range === r ? '#fff' : theme.colors.textPrimary }}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={{ width: contentWidth, marginTop: 12 }}>
          <SkeletonBlock height={20} width="35%" />
          <SkeletonBlock height={88} />
          <SkeletonBlock height={88} />
          <SkeletonBlock height={88} />
        </View>
      ) : (
        summary ? (
        <>
          <Card style={{ marginVertical: 8, width: contentWidth }}>
            <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>Sales</Text>
            <Text style={{ color: theme.colors.success, fontSize: 22, fontWeight: '700', marginTop: 4 }}>
              {formatCurrency(summary?.totalSales)}
            </Text>
          </Card>

          <Card style={{ marginVertical: 8, width: contentWidth }}>
            <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>Expenses</Text>
            <Text style={{ color: theme.colors.warning, fontSize: 22, fontWeight: '700', marginTop: 4 }}>
              {formatCurrency(summary?.totalExpenses)}
            </Text>
          </Card>

          <Card style={{ marginVertical: 8, width: contentWidth }}>
            <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>Profit</Text>
            <Text style={{ color: theme.colors.primary, fontSize: 22, fontWeight: '700', marginTop: 4 }}>
              {formatCurrency(summary?.profit)}
            </Text>
            <Subtle style={{ marginTop: 6 }}>Transactions: {summary?.transactionCount || 0}</Subtle>
          </Card>
        </>
        ) : (
          <EmptyState icon="analytics" title="No report data" subtitle="Record transactions to view summary reports" style={{ width: contentWidth }} />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  headerWrap: { padding: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  range: { padding: 10, borderRadius: 8, marginRight: 8 },
});
