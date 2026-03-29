import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { api } from '../api/client';
import {
  cacheDebts,
  upsertLocalDebt,
  upsertLocalTransaction,
} from '../storage/offlineStore';
import {
  Card,
  Subtle,
  EmptyState,
  SkeletonBlock,
  AppButton,
} from '../components/UI';
import { MaterialIcons } from '@expo/vector-icons';

const getDueInfo = (dueDate) => {
  if (!dueDate) return { label: 'No due date', overdue: false };
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) {
    return { label: 'Invalid due date', overdue: false };
  }
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) {
    return { label: `${Math.abs(diffDays)} day(s) overdue`, overdue: true };
  }
  return { label: `${diffDays} day(s) remaining`, overdue: false };
};

const dedupeDebts = (items = []) => {
  const map = new Map();
  items.forEach((item) => {
    const key = String(item?.id || item?.local_id || Math.random());
    map.set(key, item);
  });
  return Array.from(map.values()).sort((left, right) => {
    const leftDate = new Date(left?.createdAt || 0).getTime();
    const rightDate = new Date(right?.createdAt || 0).getTime();
    return rightDate - leftDate;
  });
};

export default function DebtScreen({ navigation }) {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  const { currentWorkspaceId, activeBranchId, repo } = useWorkspace();
  const { width } = useWindowDimensions();

  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const isCompact = width < 390;
  const contentWidth = Math.min(width - (isCompact ? 20 : 32), 820);
  const edgePadding = isCompact ? 12 : 16;

  useFocusEffect(
    React.useCallback(() => {
      setRefreshTick((prev) => prev + 1);
    }, []),
  );

  useEffect(() => {
    const loadDebts = async () => {
      if (!currentWorkspaceId || !activeBranchId) {
        setDebts([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [localDebtRows, localTransactionRows] = await Promise.all([
          repo.getDebts(),
          repo.getTransactions(),
        ]);

        const localList = [];

        if (localDebtRows?.rows?.length > 0) {
          for (let i = 0; i < localDebtRows.rows.length; i += 1) {
            const row = localDebtRows.rows.item(i);
            const data = row.data ? JSON.parse(row.data) : {};
            if (String(data.type || '').toLowerCase() === 'debt') {
              localList.push({
                ...data,
                id: data.id ?? row.server_id ?? row.local_id,
                local_id: row.local_id,
                sync_status: row.sync_status,
              });
            }
          }
        }

        if (localTransactionRows?.rows?.length > 0) {
          for (let i = 0; i < localTransactionRows.rows.length; i += 1) {
            const row = localTransactionRows.rows.item(i);
            const data = row.data ? JSON.parse(row.data) : {};
            if (String(data.type || '').toLowerCase() === 'debt') {
              localList.push({
                ...data,
                id: data.id ?? row.server_id ?? row.local_id,
                local_id: row.local_id,
                sync_status: row.sync_status,
              });
            }
          }
        }

        setDebts(dedupeDebts(localList));

        try {
          const data = await api.get(
            `/workspaces/${currentWorkspaceId}/branches/${activeBranchId}/transactions`,
            { type: 'debt' },
          );
          const list = Array.isArray(data) ? data : [];
          setDebts(dedupeDebts(list));
          cacheDebts(activeBranchId, list).catch(() => null);
        } catch {
          // Stay on local debt snapshot when offline.
        }
      } catch {
        setError('Unable to load debts');
      } finally {
        setLoading(false);
      }
    };

    loadDebts();
  }, [currentWorkspaceId, refreshTick, repo]);

  const normalizeWhatsAppNumber = (phone) => {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.startsWith('00')) return digits.slice(2);
    if (
      digits.startsWith('234') &&
      digits.length >= 13 &&
      digits.length <= 15
    )
      return digits;
    if (digits.length === 11 && digits.startsWith('0'))
      return `234${digits.slice(1)}`;
    if (digits.length === 10) return `234${digits}`;
    if (digits.length >= 8 && digits.length <= 15) return digits;
    return null;
  };

  const renderSyncBadge = (item) => {
    if (
      item.sync_status === 'pending_create' ||
      item.sync_status === 'pending_update'
    ) {
      return (
        <Text style={{ color: '#FFA500', fontSize: 11, marginTop: 6 }}>
          Not synced
        </Text>
      );
    }
    if (item.sync_status === 'failed') {
      return <Text style={{ color: '#E53935', fontSize: 11, marginTop: 6 }}>Sync failed</Text>;
    }
    return null;
  };

  const sendWhatsApp = (phone, name, amount) => {
    const normalizedPhone = normalizeWhatsAppNumber(phone);
    if (!normalizedPhone) {
      Alert.alert(
        'Invalid phone number',
        'Use a valid customer number with country code or a local mobile number.',
      );
      return;
    }
    const message = `Hello ${name}, this is a reminder from your shop regarding your balance of NGN ${amount.toFixed(2)}. Please make payment when you can.`;
    const encoded = encodeURIComponent(message);
    const url = `https://wa.me/${normalizedPhone}?text=${encoded}`;
    Linking.openURL(url).catch(() => {
      Alert.alert(
        'Unable to open WhatsApp',
        'Please ensure WhatsApp is installed.',
      );
    });
  };

  const markAsPaid = async (transactionId) => {
    const existingDebt = debts.find(
      (item) => String(item.id) === String(transactionId),
    );
    try {
      await api.put(
        `/workspaces/${currentWorkspaceId}/branches/${activeBranchId}/transactions/${transactionId}/status`,
        {
          status: 'completed',
        },
      );
      if (existingDebt) {
        const localData = {
          ...existingDebt,
          status: 'completed',
          id: existingDebt.id,
          local_id: existingDebt.local_id || existingDebt.id,
        };
        await Promise.all([
          upsertLocalDebt(
            {
              local_id: existingDebt.local_id || existingDebt.id,
              server_id: String(existingDebt.id).startsWith('local_')
                ? null
                : String(existingDebt.id),
              workspace_server_id: activeBranchId,
              data: localData,
              sync_status:
                existingDebt.sync_status === 'pending_create'
                  ? existingDebt.sync_status
                  : 'synced',
            },
            currentWorkspaceId,
          ),
          upsertLocalTransaction(
            {
              local_id: existingDebt.local_id || existingDebt.id,
              server_id: String(existingDebt.id).startsWith('local_')
                ? null
                : String(existingDebt.id),
              workspace_server_id: activeBranchId,
              data: localData,
              sync_status:
                existingDebt.sync_status === 'pending_create'
                  ? existingDebt.sync_status
                  : 'synced',
            },
            currentWorkspaceId,
          ),
        ]);
      }
      setDebts((prev) =>
        prev.map((item) =>
          String(item.id) === String(transactionId)
            ? { ...item, status: 'completed' }
            : item,
        ),
      );
    } catch (err) {
      Alert.alert('Error', err?.message || 'Unable to update debt status');
    }
  };

  const pendingCount = useMemo(
    () => debts.filter((item) => item.status === 'pending').length,
    [debts],
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View
        style={[
          styles.header,
          { alignSelf: 'center', width: contentWidth, paddingHorizontal: edgePadding },
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
              }
            }}
            style={[
              styles.backButton,
              {
                borderColor: theme.colors.border,
                opacity: navigation.canGoBack() ? 1 : 0.35,
              },
            ]}
            disabled={!navigation.canGoBack()}
          >
            <MaterialIcons
              name="arrow-back"
              size={20}
              color={theme.colors.textPrimary}
            />
          </TouchableOpacity>
          <View>
            <Text
              style={{
                color: theme.colors.textPrimary,
                fontWeight: '700',
                fontSize: isCompact ? 20 : 22,
              }}
            >
              Who Owes Me
            </Text>
            <Subtle>{pendingCount} pending | Tap the button to send a reminder</Subtle>
            {error ? (
              <Text style={[styles.errorText, { color: theme.colors.error }]}>
                {error}
              </Text>
            ) : null}
          </View>
        </View>
        <AppButton
          title="Add"
          icon="add"
          variant="primary"
          onPress={() => navigation.navigate('RecordDebt')}
          style={styles.addButton}
        />
      </View>

      {loading ? (
        <View
          style={{
            alignSelf: 'center',
            width: contentWidth,
            paddingHorizontal: edgePadding,
            marginTop: 24,
          }}
        >
          <SkeletonBlock
            height={28}
            width="50%"
            style={{ marginBottom: 18, borderRadius: 8 }}
          />
          <SkeletonBlock
            height={90}
            style={{ marginBottom: 18, borderRadius: 16 }}
          />
          <SkeletonBlock
            height={90}
            style={{ marginBottom: 18, borderRadius: 16 }}
          />
          <SkeletonBlock height={90} style={{ borderRadius: 16 }} />
        </View>
      ) : (
        <FlatList
          data={debts}
          keyExtractor={(item, index) =>
            item?.id ? String(item.id) : `debt-${index}`
          }
          contentContainerStyle={{
            paddingHorizontal: edgePadding,
            paddingBottom: 32,
          }}
          style={{ alignSelf: 'center', width: contentWidth }}
          ListEmptyComponent={() => (
            <EmptyState
              icon="account-balance-wallet"
              title="No debts yet"
              subtitle="Record debt entries to track who owes your business"
              style={{ marginTop: 32 }}
              ctaLabel="Record a debt"
              onCtaPress={() => navigation.navigate('RecordDebt')}
            />
          )}
          renderItem={({ item }) => {
            const dueInfo = getDueInfo(item.dueDate);
            const isPending = item.status === 'pending';
            const amount = Number(item.totalAmount || 0);

            return (
              <Card
                style={[
                  styles.card,
                  {
                    borderColor: theme.colors.border,
                    marginBottom: 18,
                    borderRadius: 14,
                    elevation: 2,
                  },
                ]}
              >
                <View style={styles.row}>
                  <View style={styles.info}>
                    <Text
                      style={{
                        color: theme.colors.textPrimary,
                        fontWeight: '700',
                        fontSize: isCompact ? 16 : 18,
                      }}
                    >
                      {item.customerName || 'Unknown'}
                    </Text>
                    <Subtle style={{ marginTop: 4 }}>{dueInfo.label}</Subtle>
                    <Subtle style={{ marginTop: 2 }}>
                      Status: {isPending ? 'Pending' : 'Paid'}
                    </Subtle>
                    {item.phone ? (
                      <Subtle style={{ marginTop: 2 }}>Phone: {item.phone}</Subtle>
                    ) : null}
                    {item.notes ? (
                      <Subtle style={{ marginTop: 2 }}>Note: {item.notes}</Subtle>
                    ) : null}
                    {item.itemName || item.item?.name ? (
                      <Subtle style={{ marginTop: 2 }}>
                        Goods: {item.itemName || item.item?.name}
                      </Subtle>
                    ) : null}
                    {renderSyncBadge(item)}
                  </View>
                  <View style={styles.amountContainer}>
                    <Text
                      style={{
                        color: theme.colors.error,
                        fontWeight: '700',
                        fontSize: 17,
                      }}
                    >
                      NGN {amount.toLocaleString()}
                    </Text>
                    <AppButton
                      title="WhatsApp"
                      icon="chat"
                      variant="primary"
                      onPress={() =>
                        sendWhatsApp(
                          item.phone || '',
                          item.customerName || 'Friend',
                          amount,
                        )
                      }
                      style={[
                        styles.whatsappButton,
                        {
                          backgroundColor: '#25D366',
                          borderColor: '#25D366',
                          marginTop: 8,
                        },
                      ]}
                      disabled={!normalizeWhatsAppNumber(item.phone)}
                    />
                    {isPending ? (
                      <AppButton
                        title="Mark Paid"
                        variant="primary"
                        onPress={() => markAsPaid(item.id)}
                        style={[
                          styles.payButton,
                          {
                            backgroundColor: theme.colors.success,
                            borderColor: theme.colors.success,
                            marginTop: 8,
                          },
                        ]}
                      />
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
    paddingTop: 10,
    paddingBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  addButton: {
    minWidth: 82,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  info: {
    flex: 1,
    paddingRight: 12,
  },
  amountContainer: {
    alignItems: 'flex-end',
    minWidth: 118,
  },
  whatsappButton: {
    minWidth: 108,
  },
  payButton: {
    minWidth: 108,
  },
});

