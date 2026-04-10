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

const isPendingSyncStatus = (status) => {
  const value = String(status || '').toLowerCase();
  return value === 'pending_create' || value === 'pending_update' || value === 'failed' || value === 'conflict';
};

const mergeByIdentity = (primary = [], secondary = []) => {
  const map = new Map();
  [...(Array.isArray(primary) ? primary : []), ...(Array.isArray(secondary) ? secondary : [])].forEach((item) => {
    const key = String(item?.id ?? item?.server_id ?? item?.local_id ?? '');
    if (!key || key === 'undefined' || key === 'null') return;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
      return;
    }

    const existingPending = isPendingSyncStatus(existing?.sync_status);
    const incomingPending = isPendingSyncStatus(item?.sync_status);
    if (incomingPending && !existingPending) {
      map.set(key, item);
      return;
    }
    if (existingPending && !incomingPending) {
      return;
    }

    const existingTime = new Date(existing?.updatedAt || existing?.updated_at || existing?.createdAt || 0).getTime();
    const incomingTime = new Date(item?.updatedAt || item?.updated_at || item?.createdAt || 0).getTime();
    if (incomingTime >= existingTime) {
      map.set(key, item);
    }
  });
  return Array.from(map.values());
};

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
  const [localCart, setLocalCart] = useState(cartItems || []);
  const isLocalCart = localCart && localCart.length > 0;
  const cartTotal = cartItems.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.sellingPrice || 0),
    0,
  );

  const [inventoryItems, setInventoryItems] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [customers, setCustomers] = useState([]);
  const [notes, setNotes] = useState('');
  const [discountAmount, setDiscountAmount] = useState('0');
  const [loading, setLoading] = useState(false);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [saleMode, setSaleMode] = useState('sale');
  const [dueInDays, setDueInDays] = useState('7');
  const [itemQuery, setItemQuery] = useState('');
  const customerPath = activeBranchId
    ? `/workspaces/${currentWorkspaceId}/branches/${activeBranchId}/customers`
    : `/workspaces/${currentWorkspaceId}/customers`;
  const inventoryPath = activeBranchId
    ? `/workspaces/${currentWorkspaceId}/branches/${activeBranchId}/inventory`
    : `/workspaces/${currentWorkspaceId}/inventory`;
  const transactionPath = activeBranchId
    ? `/workspaces/${currentWorkspaceId}/branches/${activeBranchId}/transactions`
    : `/workspaces/${currentWorkspaceId}/transactions`;
  const scopeId = activeBranchId || currentWorkspaceId;

  const customerId = selectedCustomer ? selectedCustomer.id : '';

  const loadCustomers = useCallback(async () => {
    if (!currentWorkspaceId) {
      setCustomers([]);
      return;
    }
    try {
      const cachedCustomers = await getCachedCustomers(scopeId);
      const data = await api.get(customerPath);
      const list = Array.isArray(data) ? data : [];
      setCustomers(mergeByIdentity(list, cachedCustomers));
      cacheCustomers(scopeId, list).catch(() => null);
    } catch {
      const cached = await getCachedCustomers(scopeId);
      setCustomers(Array.isArray(cached) ? cached : []);
    }
  }, [currentWorkspaceId, customerPath, scopeId]);

  useFocusEffect(
    useCallback(() => {
      loadCustomers();
    }, [loadCustomers]),
  );

  React.useEffect(() => {
    const loadInventory = async () => {
      if (!currentWorkspaceId) {
        setInventoryItems([]);
        return;
      }
      setInventoryLoading(true);
      try {
        const cached = await getCachedInventory(scopeId);
        const data = await api.get(inventoryPath);
        const list = Array.isArray(data) ? data : [];
        setInventoryItems(mergeByIdentity(list, cached));
        cacheInventory(scopeId, list).catch(() => null);
      } catch {
        const cached = await getCachedInventory(scopeId);
        setInventoryItems(Array.isArray(cached) ? cached : []);
      } finally {
        setInventoryLoading(false);
      }
    };
    loadInventory();
  }, [currentWorkspaceId, inventoryPath, scopeId]);

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
  const discountNumber = Number(discountAmount || 0);
  const grossTotal = unitPrice * quantityNumber;
  const netTotal = Math.max(0, grossTotal - Math.max(0, discountNumber));
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

      const cached = await getCachedInventory(scopeId);
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
          : await getLocalIdByServerId('inventory', itemId, scopeId)) ||
        String(itemId);

      await upsertLocalInventory(
        {
          local_id: localId,
          server_id: String(itemId).startsWith('local_') ? null : String(itemId),
          workspace_server_id: scopeId,
          data: updatedItem,
          sync_status: matched.sync_status || 'synced',
          updated_at_local: Date.now(),
        },
        scopeId,
      );
    },
    [currentWorkspaceId, scopeId],
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
        path: transactionPath,
        body: preparedPayload,
      });
    };

    try {
      const result = await api.post(
        transactionPath,
        preparedPayload,
      );
      await upsertLocalTransaction(
        {
          local_id: localId,
          server_id: result?.id ? String(result.id) : null,
          workspace_server_id: scopeId,
          data: {
            ...localData,
            ...(result || {}),
            id: result?.id ?? localId,
            local_id: localId,
          },
          sync_status: 'synced',
          updated_at_local: Date.now(),
        },
        scopeId,
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

  const buildTransactionPayload = (item, soldQuantity, negotiatedDiscount = 0) => {
    const numericQuantity = Number(soldQuantity || 0);
    const itemPrice = Number(item?.sellingPrice || 0);
    const gross = numericQuantity * itemPrice;
    const normalizedDiscount = Math.max(0, Number(negotiatedDiscount || 0));
    const total = Math.max(0, gross - normalizedDiscount);
    return {
      type: saleMode === 'debt' ? 'debt' : 'sale',
      itemId: item?.id || null,
      quantity: numericQuantity,
      // send the original selling price as unitPrice (avoid pre-adjusting it),
      // backend will compute totals using this and discountAmount.
      unitPrice: itemPrice,
      totalAmount: total,
      discountAmount: normalizedDiscount,
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

  const buildMultiItemPayload = (items) => {
    const lineItems = items.map((it) => ({
      itemId: it.id,
      quantity: it.quantity,
      unitPrice: Number(it.sellingPrice || it.unitPrice || 0),
      discountAmount: Number(it.discountAmount || 0) || 0,
    }));
    const totalAmount = lineItems.reduce((s, li) => s + (li.quantity * li.unitPrice - (li.discountAmount || 0)), 0);
    return {
      type: saleMode === 'debt' ? 'debt' : 'sale',
      lineItems,
      totalAmount,
      paymentMethod: PAYMENT_OPTIONS.find((option) => option.id === saleMode)?.paymentMethod || 'cash',
      customerId: customerId || undefined,
      customerName: selectedCustomerRecord?.name || undefined,
      customerEmail: selectedCustomerRecord?.email || undefined,
      phone: selectedCustomerRecord?.phone || undefined,
      dueDate,
      status: saleMode === 'debt' ? 'pending' : 'completed',
      notes: notes.trim() || undefined,
    };
  };

  const handleSubmit = async () => {
    if (!currentWorkspaceId) {
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
          await postTransaction(buildTransactionPayload(item, item.quantity, 0));
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

      if (discountNumber < 0) {
        Alert.alert('Validation Error', 'Discount cannot be negative');
        return;
      }

      if (discountNumber > grossTotal) {
        Alert.alert(
          'Validation Error',
          `Discount cannot exceed gross amount (${formatMoney(grossTotal)}).`,
        );
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

      if (isLocalCart) {
        // submit local cart as single transaction
        const payload = buildMultiItemPayload(localCart);
        await postTransaction(payload);
        for (const it of localCart) {
          await applyLocalInventoryDelta(it.id, it.quantity);
        }
      } else {
        await postTransaction(
          buildTransactionPayload(selectedItem, quantityNumber, discountNumber),
        );
        await applyLocalInventoryDelta(selectedItem.id, quantityNumber);
      }

      const successMsg = isLocalCart
        ? `${localCart.length} item(s) total ${formatMoney(localCart.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.sellingPrice || 0), 0))}\nCustomer: ${selectedCustomerRecord?.name || 'Walk-in'}`
        : `${quantityNumber} x ${selectedItem.name}\nGross: ${formatMoney(grossTotal)}\nDiscount: ${formatMoney(discountNumber)}\nFinal: ${formatMoney(netTotal)}\nCustomer: ${selectedCustomerRecord?.name || 'Walk-in'}`;

      // clear local cart after successful submission
      if (isLocalCart) setLocalCart([]);

      Alert.alert(
        saleMode === 'debt' ? 'Debt sale recorded' : 'Sale recorded',
        successMsg,
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
                  {formatMoney(Number(item.quantity || 0) * Number(item.sellingPrice || 0))}
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

            <View style={{ marginTop: 12 }}>
              <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 8 }}>
                Discount amount (NGN)
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
                value={discountAmount}
                onChangeText={setDiscountAmount}
              />
              <TouchableOpacity
                onPress={addToLocalCart}
                style={{ marginTop: 10, alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 12, backgroundColor: theme.colors.primary, borderRadius: 8 }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Add to cart</Text>
              </TouchableOpacity>
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
                  <Text style={{ color: theme.colors.textSecondary }}>Gross</Text>
                  <Text style={{ color: theme.colors.textPrimary, fontWeight: '700', fontSize: 14, marginTop: 4 }}>
                    {formatMoney(grossTotal)}
                  </Text>
                  <Text style={{ color: theme.colors.textSecondary, marginTop: 6 }}>Discount</Text>
                  <Text style={{ color: theme.colors.warning, fontWeight: '700', fontSize: 14, marginTop: 4 }}>
                    {formatMoney(discountNumber)}
                  </Text>
                  <Text style={{ color: theme.colors.textSecondary, marginTop: 6 }}>Final total</Text>
                  <Text style={{ color: theme.colors.primary, fontWeight: '700', fontSize: 16, marginTop: 4 }}>
                    {formatMoney(netTotal)}
                  </Text>
                </View>
              </View>
            ) : null}
            {isLocalCart ? (
              <Card style={{ marginTop: 12 }}>
                <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 8 }}>Current cart</Text>
                {localCart.map((ci, idx) => (
                  <View key={`${ci.id}-${idx}`} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: theme.colors.border }}>
                    <View>
                      <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>{ci.name}</Text>
                      <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>{ci.quantity} x {formatMoney(ci.sellingPrice || 0)}</Text>
                    </View>
                    <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>{formatMoney(Number(ci.quantity || 0) * Number(ci.sellingPrice || 0))}</Text>
                  </View>
                ))}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                  <Text style={{ color: theme.colors.textSecondary, fontWeight: '700' }}>Cart Total</Text>
                  <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>{formatMoney(localCart.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.sellingPrice || 0), 0))}</Text>
                </View>
                <View style={{ flexDirection: 'row', marginTop: 10 }}>
                  <TouchableOpacity onPress={() => setLocalCart([])} style={{ padding: 10, backgroundColor: theme.colors.card, borderRadius: 8, marginRight: 8 }}>
                    <Text style={{ color: theme.colors.textSecondary }}>Clear cart</Text>
                  </TouchableOpacity>
                </View>
              </Card>
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

