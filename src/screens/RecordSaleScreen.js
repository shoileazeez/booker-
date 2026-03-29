import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { api } from '../api/client';
import {
  cacheCustomers,
  cacheInventory,
  getCachedCustomers,
  getCachedInventory,
  getLocalIdByServerId,
  getServerId,
  setIdMapping,
  upsertLocalInventory,
  upsertLocalTransaction,
} from '../storage/offlineStore';
import { Card, Title, SkeletonBlock, EmptyState } from '../components/UI';
import { MaterialIcons } from '@expo/vector-icons';
import { useCustomerSelect } from '../context/CustomerSelectContext';
import { useFocusEffect } from '@react-navigation/native';

const PAYMENT_OPTIONS = [
  { id: 'sale', label: 'Cash sale', paymentMethod: 'cash' },
  { id: 'debt', label: 'Mark as debt', paymentMethod: 'credit' },
];

const formatMoney = (value) => `NGN ${Number(value || 0).toLocaleString()}`;

export default function RecordSaleScreen({ navigation, route }) {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  const { currentWorkspaceId, activeBranchId, queueAction } = useWorkspace();
  const { selectedCustomer, setSelectedCustomer } = useCustomerSelect();

  const cartItems = route?.params?.cart ?? [];
  const isCartMode = cartItems.length > 0;
  const cartTotal = cartItems.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.sellingPrice || 0),
    0,
  );

  const [inventoryItems, setInventoryItems] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [customers, setCustomers] = useState([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [saleMode, setSaleMode] = useState('sale');
  const [dueInDays, setDueInDays] = useState('7');
  const [itemQuery, setItemQuery] = useState('');

  const customerId = selectedCustomer ? selectedCustomer.id : '';

  const loadCustomers = useCallback(async () => {
    if (!currentWorkspaceId || !activeBranchId) {
      setCustomers([]);
      return;
    }
    try {
      const data = await api.get(`/workspaces/${currentWorkspaceId}/branches/${activeBranchId}/customers`);
      const list = Array.isArray(data) ? data : [];
      setCustomers(list);
      cacheCustomers(activeBranchId, list).catch(() => null);
    } catch {
      const cached = await getCachedCustomers(activeBranchId);
      setCustomers(Array.isArray(cached) ? cached : []);
    }
  }, [currentWorkspaceId]);

  useFocusEffect(
    useCallback(() => {
      loadCustomers();
    }, [loadCustomers]),
  );

  React.useEffect(() => {
    const loadInventory = async () => {
      if (!currentWorkspaceId || !activeBranchId) {
        setInventoryItems([]);
        return;
      }
      setInventoryLoading(true);
      try {
        const data = await api.get(`/workspaces/${currentWorkspaceId}/branches/${activeBranchId}/inventory`);
        const list = Array.isArray(data) ? data : [];
        setInventoryItems(list);
        cacheInventory(activeBranchId, list).catch(() => null);
      } catch {
        const cached = await getCachedInventory(activeBranchId);
        setInventoryItems(Array.isArray(cached) ? cached : []);
      } finally {
        setInventoryLoading(false);
      }
    };
    loadInventory();
  }, [currentWorkspaceId]);

  const selectedItem = useMemo(
    () => inventoryItems.find((item) => String(item.id) === String(selectedItemId)) || null,
    [inventoryItems, selectedItemId],
  );

  const filteredInventory = useMemo(() => {
    const query = itemQuery.trim().toLowerCase();
    if (!query) return inventoryItems;
    return inventoryItems.filter((item) => {
      const haystack = [
        item?.name,
        item?.sku,
        item?.category,
        item?.location,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [inventoryItems, itemQuery]);

  const selectedCustomerRecord = useMemo(
    () => customers.find((item) => String(item.id) === String(customerId)) || selectedCustomer || null,
    [customerId, customers, selectedCustomer],
  );

  const unitPrice = Number(selectedItem?.sellingPrice || 0);
  const quantityNumber = Number(quantity || 0);
  const dueDate =
    saleMode === 'debt' && dueInDays
      ? new Date(Date.now() + Number(dueInDays || 0) * 86400000).toISOString()
      : undefined;

  const applyLocalInventoryDelta = useCallback(
    async (itemId, soldQuantity) => {
      if (!currentWorkspaceId || !itemId || !soldQuantity) return;
      const amount = Number(soldQuantity || 0);
      if (!amount) return;

      setInventoryItems((prev) =>
        prev.map((item) => {
          if (String(item.id) !== String(itemId)) return item;
          const nextQuantity = Math.max(0, Number(item.quantity || 0) - amount);
          return {
            ...item,
            quantity: nextQuantity,
            status: nextQuantity > 0 ? item.status || 'available' : 'out_of_stock',
            updatedAt: new Date().toISOString(),
          };
        }),
      );

      const cached = await getCachedInventory(activeBranchId);
      const matched = cached.find((item) => String(item.id) === String(itemId));
      if (!matched) return;

      const nextQuantity = Math.max(0, Number(matched.quantity || 0) - amount);
      const updatedItem = {
        ...matched,
        quantity: nextQuantity,
        status: nextQuantity > 0 ? matched.status || 'available' : 'out_of_stock',
        updatedAt: new Date().toISOString(),
      };
      const localId =
        matched.local_id ||
        (String(itemId).startsWith('local_')
          ? String(itemId)
          : await getLocalIdByServerId('inventory', itemId, activeBranchId)) ||
        String(itemId);

      await upsertLocalInventory(
        {
          local_id: localId,
          server_id: String(itemId).startsWith('local_') ? null : String(itemId),
          workspace_server_id: activeBranchId,
          data: updatedItem,
          sync_status: matched.sync_status || 'synced',
          updated_at_local: Date.now(),
        },
        currentWorkspaceId,
      );
    },
    [currentWorkspaceId],
  );

  const resolvePayload = useCallback(
    async (payload) => {
      const nowIso = new Date().toISOString();
      const nextPayload = {
        ...payload,
        customerId: customerId || undefined,
        customerName:
          selectedCustomerRecord?.name || payload.customerName || undefined,
        phone: selectedCustomerRecord?.phone || payload.phone || undefined,
        createdAt: payload.createdAt || nowIso,
        updatedAt: nowIso,
      };

      if (nextPayload.itemId && String(nextPayload.itemId).startsWith('local_')) {
        const mappedItemId = await getServerId('inventory', String(nextPayload.itemId));
        if (mappedItemId) {
          nextPayload.itemId = mappedItemId;
        }
      }

      return nextPayload;
    },
    [customerId, selectedCustomerRecord],
  );

  const postTransaction = async (payload) => {
    const localId = `local_tx_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const preparedPayload = await resolvePayload(payload);
    const localData = { ...preparedPayload, id: localId, local_id: localId };

    const queueOffline = async () => {
      await queueAction({
        method: 'post',
        path: `/workspaces/${currentWorkspaceId}/branches/${activeBranchId}/transactions`,
        body: preparedPayload,
      });
    };

    try {
      const result = await api.post(
        `/workspaces/${currentWorkspaceId}/branches/${activeBranchId}/transactions`,
        preparedPayload,
      );
      await upsertLocalTransaction(
        {
          local_id: localId,
          server_id: result?.id ? String(result.id) : null,
          workspace_server_id: activeBranchId,
          data: {
            ...localData,
            ...(result || {}),
            id: result?.id ?? localId,
            local_id: localId,
          },
          sync_status: 'synced',
          updated_at_local: Date.now(),
        },
        currentWorkspaceId,
      );
      if (result?.id) {
        await setIdMapping('transaction', localId, String(result.id));
      }
    } catch (err) {
      if (!err?.response && queueAction) {
        await queueOffline();
      } else {
        throw err;
      }
    }
  };

  const buildTransactionPayload = (item, soldQuantity) => {
    const numericQuantity = Number(soldQuantity || 0);
    const itemPrice = Number(item?.sellingPrice || 0);
    const total = numericQuantity * itemPrice;
    return {
      type: saleMode === 'debt' ? 'debt' : 'sale',
      itemId: item?.id || null,
      quantity: numericQuantity,
      unitPrice: itemPrice,
      totalAmount: total,
      paymentMethod:
        PAYMENT_OPTIONS.find((option) => option.id === saleMode)?.paymentMethod ||
        'cash',
      customerId: customerId || undefined,
      customerName: selectedCustomerRecord?.name || undefined,
      phone: selectedCustomerRecord?.phone || undefined,
      dueDate,
      status: saleMode === 'debt' ? 'pending' : 'completed',
      notes: notes.trim() || item?.name || undefined,
    };
  };

  const handleSubmit = async () => {
    if (!currentWorkspaceId || !activeBranchId) {
      Alert.alert(
        'Workspace required',
        'Please select a workspace before recording a sale',
      );
      return;
    }

    setLoading(true);
    try {
      if (isCartMode) {
        for (const item of cartItems) {
          const availableStock = Number(item.quantityAvailable || item.availableQuantity || item.stock || item.currentStock || item.inStock || item.remainingStock || item.quantityOnHand || item.originalQuantity || item.quantity || 0);
          if (availableStock && Number(item.quantity || 0) > availableStock) {
            throw new Error(`Insufficient stock for ${item.name}. Available: ${availableStock}`);
          }
          await postTransaction(buildTransactionPayload(item, item.quantity));
          await applyLocalInventoryDelta(item.id, item.quantity);
        }

        Alert.alert(
          saleMode === 'debt' ? 'Debt sale recorded' : 'Sale recorded',
          `${cartItems.length} item(s) total ${formatMoney(cartTotal)}\nCustomer: ${selectedCustomerRecord?.name || 'Walk-in'}`,
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
        return;
      }

      if (!selectedItem || !quantity) {
        Alert.alert('Validation Error', 'Please select an item and quantity');
        return;
      }

      if (!quantityNumber || quantityNumber <= 0) {
        Alert.alert('Validation Error', 'Quantity must be greater than zero');
        return;
      }

      const availableStock = Number(selectedItem.quantity || 0);
      if (quantityNumber > availableStock) {
        Alert.alert(
          'Insufficient stock',
          `Only ${availableStock} unit(s) are currently available.`,
        );
        return;
      }

      await postTransaction(buildTransactionPayload(selectedItem, quantityNumber));
      await applyLocalInventoryDelta(selectedItem.id, quantityNumber);

      Alert.alert(
        saleMode === 'debt' ? 'Debt sale recorded' : 'Sale recorded',
        `${quantityNumber} x ${selectedItem.name} = ${formatMoney(
          unitPrice * quantityNumber,
        )}\nCustomer: ${selectedCustomerRecord?.name || 'Walk-in'}`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (err) {
      Alert.alert('Error', err?.message || 'Unable to record sale');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={{ padding: 16 }}
        keyboardShouldPersistTaps="handled"
        accessibilityLabel="Record Sale screen"
      >
        <View style={styles.header}>
          <Title accessibilityRole="header">Record Sale</Title>
          <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Close">
            <MaterialIcons
              name="close"
              size={24}
              color={theme.colors.textPrimary}
            />
          </TouchableOpacity>
        </View>

        <Card style={{ marginBottom: 16 }}>
          <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 10 }}>
            Sale Type
          </Text>
          <View style={styles.modeRow}>
            {PAYMENT_OPTIONS.map((option) => {
              const selected = saleMode === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  onPress={() => setSaleMode(option.id)}
                  style={[
                    styles.modeButton,
                    {
                      backgroundColor: selected
                        ? theme.colors.primary
                        : theme.colors.card,
                      borderColor: selected
                        ? theme.colors.primary
                        : theme.colors.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: selected ? '#fff' : theme.colors.textPrimary,
                      fontWeight: '600',
                    }}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {saleMode === 'debt' ? (
            <View style={{ marginTop: 12 }}>
              <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 8 }}>
                Due in (days)
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.colors.card,
                    color: theme.colors.textPrimary,
                    borderColor: theme.colors.border,
                  },
                ]}
                placeholder="7"
                placeholderTextColor={theme.colors.textSecondary}
                keyboardType="number-pad"
                value={dueInDays}
                onChangeText={setDueInDays}
              />
            </View>
          ) : null}
        </Card>

        {loading || inventoryLoading ? (
          <View style={{ marginBottom: 16 }}>
            <SkeletonBlock height={22} width="40%" style={{ marginBottom: 14, borderRadius: 8 }} />
            <SkeletonBlock height={70} style={{ marginBottom: 14, borderRadius: 12 }} />
            <SkeletonBlock height={70} style={{ marginBottom: 14, borderRadius: 12 }} />
            <SkeletonBlock height={70} style={{ borderRadius: 12 }} />
          </View>
        ) : isCartMode ? (
          <Card style={{ marginBottom: 16 }}>
            <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 12 }}>
              Items in this transaction
            </Text>
            {cartItems.map((item, index) => (
              <View
                key={item.id || index}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: 8,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: theme.colors.border,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.textPrimary, fontWeight: '600' }}>
                    {item.name}
                  </Text>
                  <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
                    {item.quantity} x {formatMoney(item.sellingPrice || 0)}
                  </Text>
                </View>
                <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>
                  {formatMoney(
                    Number(item.quantity || 0) * Number(item.sellingPrice || 0),
                  )}
                </Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={{ color: theme.colors.textSecondary, fontWeight: '600' }}>
                Total
              </Text>
              <Text style={{ color: theme.colors.primary, fontWeight: '700', fontSize: 18 }}>
                {formatMoney(cartTotal)}
              </Text>
            </View>
          </Card>
        ) : (
          <Card style={{ marginBottom: 16 }}>
            <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 8 }}>
              Find Goods
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.colors.card,
                  color: theme.colors.textPrimary,
                  borderColor: theme.colors.border,
                },
              ]}
              placeholder="Search by name, SKU, category or location"
              placeholderTextColor={theme.colors.textSecondary}
              value={itemQuery}
              onChangeText={setItemQuery}
            />

            <Text
              style={{
                color: theme.colors.textSecondary,
                fontSize: 12,
                marginTop: 12,
                marginBottom: 8,
              }}
            >
              Select Item *
            </Text>
            <View
              style={[
                styles.itemsWrap,
                { borderColor: theme.colors.border, backgroundColor: theme.colors.card },
              ]}
            >
              {filteredInventory.length === 0 ? (
                <EmptyState
                  icon="inventory"
                  title="No matching goods"
                  subtitle="Try another search or add inventory first."
                  style={{ marginVertical: 16 }}
                />
              ) : (
                filteredInventory.map((item) => {
                  const selected = String(selectedItemId) === String(item.id);
                  const availableStock = Number(item.quantity || 0);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        styles.itemOption,
                        {
                          borderColor: selected
                            ? theme.colors.primary
                            : theme.colors.border,
                          backgroundColor: selected
                            ? `${theme.colors.primary}15`
                            : 'transparent',
                        },
                      ]}
                      onPress={() => setSelectedItemId(String(item.id))}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>
                          {item.name}
                        </Text>
                        <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                          Stock: {availableStock} | Price: {formatMoney(item.sellingPrice || 0)}
                        </Text>
                        {(item.sku || item.category) ? (
                          <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                            {[item.sku, item.category].filter(Boolean).join(' | ')}
                          </Text>
                        ) : null}
                      </View>
                      {selected ? (
                        <MaterialIcons
                          name="check-circle"
                          size={18}
                          color={theme.colors.primary}
                        />
                      ) : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </View>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 8 }}>
                  Quantity *
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.colors.card,
                      color: theme.colors.textPrimary,
                      borderColor: theme.colors.border,
                    },
                  ]}
                  placeholder="0"
                  placeholderTextColor={theme.colors.textSecondary}
                  keyboardType="number-pad"
                  value={quantity}
                  onChangeText={setQuantity}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 8 }}>
                  Price per unit
                </Text>
                <View
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.colors.card,
                      borderColor: theme.colors.border,
                      justifyContent: 'center',
                    },
                  ]}
                >
                  <Text style={{ color: theme.colors.textPrimary, fontWeight: '600' }}>
                    {formatMoney(unitPrice)}
                  </Text>
                </View>
              </View>
            </View>

            {selectedItem ? (
              <View style={styles.totalRow}>
                <View>
                  <Text style={{ color: theme.colors.textSecondary }}>
                    Available stock
                  </Text>
                  <Text style={{ color: theme.colors.textPrimary, fontWeight: '700', marginTop: 4 }}>
                    {Number(selectedItem.quantity || 0)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: theme.colors.textSecondary }}>Total</Text>
                  <Text style={{ color: theme.colors.primary, fontWeight: '700', fontSize: 16, marginTop: 4 }}>
                    {formatMoney(unitPrice * (quantityNumber || 0))}
                  </Text>
                </View>
              </View>
            ) : null}
          </Card>
        )}

        <Card style={{ marginBottom: 16 }}>
          <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 8 }}>
            Customer
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <TouchableOpacity
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: 8,
                padding: 10,
                backgroundColor: theme.colors.card,
              }}
              onPress={() => navigation.navigate('CustomerListScreen', { selectMode: true })}
            >
              <Text
                style={{
                  color: customerId
                    ? theme.colors.textPrimary
                    : theme.colors.textSecondary,
                }}
              >
                {customerId
                  ? selectedCustomerRecord?.name || 'Select customer'
                  : 'Select customer'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate('AddCustomerScreen', { selectAfterCreate: true })}
              style={{ marginLeft: 8 }}
            >
              <MaterialIcons
                name="person-add"
                size={24}
                color={theme.colors.primary}
              />
            </TouchableOpacity>
            {customerId ? (
              <TouchableOpacity
                onPress={() => setSelectedCustomer?.(null)}
                style={{ marginLeft: 8 }}
              >
                <MaterialIcons name="clear" size={22} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 8, marginTop: 12 }}>
            Notes
          </Text>
          <TextInput
            style={[
              styles.input,
              styles.textArea,
              {
                backgroundColor: theme.colors.card,
                color: theme.colors.textPrimary,
                borderColor: theme.colors.border,
              },
            ]}
            placeholder="Add notes..."
            placeholderTextColor={theme.colors.textSecondary}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
          />
        </Card>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[
              styles.cancelButton,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.card,
              },
            ]}
            onPress={() => navigation.goBack()}
            disabled={loading}
          >
            <Text style={{ color: theme.colors.textSecondary, fontWeight: '600' }}>
              Cancel
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.submitButton,
              { backgroundColor: theme.colors.primary, opacity: loading ? 0.7 : 1 },
            ]}
            onPress={handleSubmit}
            disabled={loading}
          >
            <MaterialIcons name="check-circle" size={20} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '600', marginLeft: 8 }}>
              {loading
                ? 'Recording...'
                : isCartMode
                  ? `${saleMode === 'debt' ? 'Save Debt Sale' : 'Complete Sale'} (${cartItems.length})`
                  : saleMode === 'debt'
                    ? 'Save Debt Sale'
                    : 'Record Sale'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemsWrap: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    maxHeight: 220,
  },
  itemOption: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  totalRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  cancelButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButton: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
});

