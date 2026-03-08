import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Linking,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { api } from '../api/client';
import { cacheDebts, getCachedDebts } from '../storage/offlineStore';
import { Card, Subtle } from '../components/UI';
import { MaterialIcons } from '@expo/vector-icons';

const getDueInfo = (dueDate) => {
  if (!dueDate) return { label: 'No due date', overdue: false };
  const due = new Date(dueDate);
  const now = new Date();

  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) {
    return { label: `${Math.abs(diffDays)} day(s) overdue`, overdue: true };
  }
  return { label: `${diffDays} day(s) remaining`, overdue: false }s = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) {
    return { label: `${Math.abs(diffDays)} day(s) overdue`, overdue: true };
  }
  return { label: `${diffDays} day(s) remaining`, overdue: false };
};

export default function DebtScreen({ navigation }) {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  const { currentWorkspaceId } = useWorkspace();

  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadDebts = async () => {
      if (!currentWorkspaceId) {
        setDebts([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const data = await api.get(`/workspaces/${currentWorkspaceId}/transactions`, {
          type: 'debt',
        });
        const list = Array.isArray(data) ? data : [];
        setDebts(list);
        cacheDebts(currentWorkspaceId, list).catch(() => null);
      } catch (err) {
        const cached = await getCachedDebts(currentWorkspaceId);
        if (cached && cached.length) {
          setDebts(cached);
          setError('Offline mode: showing last known debt list');
        } else {
          setError(err?.message || 'Unable to load debts');
        }
      } finally {
        setLoading(false);
      }
    };

    loadDebts();
  }, [currentWorkspaceId]);

  const sendWhatsApp = (phone, name, amount) => {
    const message = `Hello ${name}, this is a reminder from your shop regarding your balance of ₦${amount.toFixed(
      2,
    )}. Please make payment when you can.`;
    const encoded = encodeURIComponent(message);
    const url = `https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encoded}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Unable to open WhatsApp', 'Please ensure WhatsApp is installed.');
    });
  };

  const markAsPaid = async (transactionId) => {
    try {
      await api.put(`/workspaces/${currentWorkspaceId}/transactions/${transactionId}/status`, {
        status: 'completed',
      });
      setDebts((prev) =>
        prev.map((d) => (d.id === transactionId ? { ...d, status: 'completed' } : d)),
      );
    } catch (err) {
      Alert.alert('Error', err?.message || 'Unable to update debt status');
    }
  };

  const pendingCount = useMemo(() => debts.filter((d) => d.status === 'pending').length, [debts]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}> 
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Who Owes Me</Text>
          <Subtle>
            {pendingCount} pending • Tap the button to send a reminder
          </Subtle>
          {error ? <Text style={[styles.errorText, { color: theme.colors.error }]}>{error}</Text> : null}
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('RecordDebt')}
          style={[styles.addButton, { backgroundColor: theme.colors.primary }]}
        >
          <MaterialIcons name="add" size={18} color="#fff" />
          <Text style={[styles.addButtonText, { color: '#fff' }]}>Add</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color={theme.colors.primary} />
      ) : (
        <FlatList
          data={debts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={
            <View dueInfo = getDueInfo(item.dueDate);
            const isPending = item.status === 'pending';
            return (
              <Card style={styles.card}>
                <View style={styles.row}>
                  <View style={styles.info}>
                    <Text style={{ color: theme.colors.textPrimary, fontWeight: '700', fontSize: 16 }}>
                      {item.customerName || 'Unknown'}
                    </Text>
                    <Subtle>{dueInfo.label}
                  <View style={styles.info}>
                    <Text style={{ color: theme.colors.textPrimary, fontWeight: '700', fontSize: 16 }}>
                      {item.customerName || 'Unknown'}
                    </Text>
                    <Subtle>{overdueDays} days ago</Subtle>
                    <Subtle>Status: {isPending ? 'Pending' : 'Paid'}</Subtle>
                  </View>
                  <View style={styles.amountContainer}>
                    <Text style={{ color: theme.colors.error, fontWeight: '700' }}>
                      ₦{parseFloat(item.totalAmount).toLocaleString()}
                    </Text>
                    <TouchableOpacity
                      onPress={() => sendWhatsApp(item.phone || '', item.customerName || 'Friend', parseFloat(item.totalAmount))}
                      style={[styles.whatsappButton, { backgroundColor: '#25D366' }]}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700' }}>WhatsApp</Text>
                    </TouchableOpacity>
                    {isPending ? (
                      <TouchableOpacity
                        onPress={() => markAsPaid(item.id)}
                        style={[styles.payButton, { backgroundColor: theme.colors.success }]}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700' }}>Mark Paid</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </Card>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  errorText: { marginTop: 8 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  addButtonText: { fontWeight: '700', marginLeft: 6 },
  card: { marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  info: { flex: 1 },
  amountContainer: { alignItems: 'flex-end' },
  whatsappButton: { marginTop: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  payButton: { marginTop: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
});
