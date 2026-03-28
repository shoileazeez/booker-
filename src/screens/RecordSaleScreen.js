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
  getServerId,
  getCachedCustomers,
  getCachedInventory,
  setIdMapping,
  upsertLocalTransaction,
  addSyncOutboxAction,
} from '../storage/offlineStore';
import { Card, Title, SkeletonBlock, EmptyState } from '../components/UI';
import { MaterialIcons } from '@expo/vector-icons';
import { useCustomerSelect } from '../context/CustomerSelectContext';
import { useFocusEffect } from '@react-navigation/native';


export default function RecordSaleScreen({ navigation, route }) {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  const { currentWorkspaceId, queueAction } = useWorkspace();

  const cartItems = route?.params?.cart ?? [];
  const isCartMode = cartItems.length > 0;

  const cartTotal = cartItems.reduce((sum, item) => sum + item.quantity * (item.sellingPrice || 0), 0);

  // Single sale mode fields
  const [inventoryItems, setInventoryItems] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [quantity, setQuantity] = useState('');

  // Shared fields
  const { selectedCustomer, setSelectedCustomer } = useCustomerSelect();
  const customerId = selectedCustomer ? selectedCustomer.id : '';
  const [customers, setCustomers] = useState([]);
  const loadCustomers = useCallback(async () => {
    if (!currentWorkspaceId) {
      setCustomers([]);
      return;
    }
    try {
      const data = await api.get(`/workspaces/${currentWorkspaceId}/customers`);
      const list = Array.isArray(data) ? data : [];
      setCustomers(list);
      cacheCustomers(currentWorkspaceId, list).catch(() => null);
    } catch {
      const cached = await getCachedCustomers(currentWorkspaceId);
      setCustomers(Array.isArray(cached) ? cached : []);
    }
  }, [currentWorkspaceId]);

  useFocusEffect(
    useCallback(() => {
      loadCustomers();
    }, [loadCustomers]),
  );
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [inventoryLoading, setInventoryLoading] = useState(false);

  const selectedItem = useMemo(
    () => inventoryItems.find((item) => item.id === selectedItemId) || null,
    [inventoryItems, selectedItemId],
  );
  const unitPrice = Number(selectedItem?.sellingPrice || 0);

  const resolveSalePayload = useCallback(async (payload) => {
    const selectedCustomerRecord = customers.find((c) => c.id === customerId) || selectedCustomer || null;
    const nextPayload = {
      ...payload,
      customerId: customerId || undefined,
      customerName: selectedCustomerRecord?.name || payload.customerName || undefined,
      phone: selectedCustomerRecord?.phone || payload.phone || undefined,
    };

    if (nextPayload.itemId && String(nextPayload.itemId).startsWith('local_')) {
      const mappedItemId = await getServerId('inventory', String(nextPayload.itemId));
      if (mappedItemId) {
        nextPayload.itemId = mappedItemId;
      }
    }

    return nextPayload;
  }, [customerId, customers, selectedCustomer]);

  React.useEffect(() => {
    const loadInventory = async () => {
      if (!currentWorkspaceId) {
        setInventoryItems([]);
        return;
      }
      setInventoryLoading(true);
      try {
        const data = await api.get(`/workspaces/${currentWorkspaceId}/inventory`);
        const list = Array.isArray(data) ? data : [];
        setInventoryItems(list);
        cacheInventory(currentWorkspaceId, list).catch(() => null);
      } catch {
        const cached = await getCachedInventory(currentWorkspaceId);
        setInventoryItems(Array.isArray(cached) ? cached : []);
      } finally {
        setInventoryLoading(false);
      }
    };
    loadInventory();
  }, [currentWorkspaceId]);

  const postTransaction = async (payload) => {
    const localId = `local_tx_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const preparedPayload = await resolveSalePayload(payload);
    const queueOfflineTransaction = async () => {
      await upsertLocalTransaction({
        local_id: localId,
        server_id: null,
        workspace_server_id: currentWorkspaceId,
        data: { ...preparedPayload, local_id: localId },
        sync_status: 'pending_create',
      }, currentWorkspaceId);
      await addSyncOutboxAction({
        action_id: localId,
        action_type: 'create_transaction',
        entity_type: 'transaction',
        entity_local_id: localId,
        workspace_ref: currentWorkspaceId,
        payload: preparedPayload,
        depends_on_action_id: String(preparedPayload?.itemId || '').startsWith('local_')
          ? preparedPayload.itemId
          : null,
      });
    };

    if (String(preparedPayload?.itemId || '').startsWith('local_')) {
      await queueOfflineTransaction();
      return;
    }

    try {
      const result = await api.post(`/workspaces/${currentWorkspaceId}/transactions`, preparedPayload);
      // Upsert into local SQLite so SalesScreen reflects the new transaction immediately
      upsertLocalTransaction({
        local_id: localId,
        server_id: result?.id ? String(result.id) : null,
        workspace_server_id: currentWorkspaceId,
        data: { ...preparedPayload, ...(result || {}), id: result?.id ?? localId, local_id: localId },
        sync_status: 'synced',
      }, currentWorkspaceId).catch(() => null);
      if (result?.id) {
        setIdMapping('transaction', localId, String(result.id)).catch(() => null);
      }
    } catch (err) {
      const isOffline = !err?.response;
      if (isOffline) {
        await queueOfflineTransaction();
      } else {
        throw err;
      }
    }
  };

  const handleSubmit = async () => {
    if (!currentWorkspaceId) {
      Alert.alert('Workspace required', 'Please select a workspace before recording a sale');
      return;
    }

    setLoading(true);
    try {
      if (isCartMode) {
        for (const item of cartItems) {
          const total = item.quantity * (item.sellingPrice || 0);
          await postTransaction({
            type: 'sale',
            itemId: item.id || null,
            quantity: item.quantity,
            unitPrice: item.sellingPrice || 0,
            totalAmount: total,
            paymentMethod: 'cash',
            customerId: customerId || undefined,
            notes: notes || item.name,
          });
        }
        const customerName = customers.find(c => c.id === customerId)?.name || 'Walk-in';
        Alert.alert(
          'Sale recorded',
          `${cartItems.length} item(s) — ₦${cartTotal.toLocaleString()}\nCustomer: ${customerName}`,
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
      } else {
        if (!selectedItem || !quantity) {
          Alert.alert('Validation Error', 'Please select item and quantity');
          setLoading(false);
          return;
        }

        const qtyNum = parseFloat(quantity);
        if (!qtyNum || qtyNum <= 0) {
          Alert.alert('Validation Error', 'Quantity must be greater than zero');
          setLoading(false);
          return;
        }

        const total = unitPrice * qtyNum;
        await postTransaction({
          type: 'sale',
          itemId: selectedItem.id,
          quantity: qtyNum,
          unitPrice,
          totalAmount: total,
          paymentMethod: 'cash',
          customerId: customerId || undefined,
          notes: notes || selectedItem.name,
        });
        const customerName = customers.find(c => c.id === customerId)?.name || 'Walk-in';
        Alert.alert(
          'Sale recorded',
          `${qtyNum} × ${selectedItem.name} = ₦${total.toLocaleString()}\nCustomer: ${customerName}`,
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
      }
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
        accessibilityLabel="Record Sale screen"
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <Title accessibilityRole="header">Record Sale</Title>
          <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Close">
            <MaterialIcons name="close" size={24} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Item Details Card */}
        {/* Cart Summary (cart mode) or Manual Single-Item Entry */}
        {loading || inventoryLoading ? (
          <View style={{ marginBottom: 16 }}>
            <SkeletonBlock height={22} width="40%" style={{ marginBottom: 14, borderRadius: 8 }} />
            <SkeletonBlock height={70} style={{ marginBottom: 14, borderRadius: 12 }} />
            <SkeletonBlock height={70} style={{ marginBottom: 14, borderRadius: 12 }} />
            <SkeletonBlock height={70} style={{ marginBottom: 14, borderRadius: 12 }} />
          </View>
        ) : isCartMode ? (
          <Card style={{ marginBottom: 16 }}>
            <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 12 }}>Items in this sale</Text>
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
                  <Text style={{ color: theme.colors.textPrimary, fontWeight: '600' }}>{item.name}</Text>
                  <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
                    {item.quantity} × ₦{(item.sellingPrice || 0).toLocaleString()}
                  </Text>
                </View>
                <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>
                  ₦{(item.quantity * (item.sellingPrice || 0)).toLocaleString()}
                </Text>
              </View>
            ))}
            <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.border, flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: theme.colors.textSecondary, fontWeight: '600' }}>Total</Text>
              <Text style={{ color: theme.colors.primary, fontWeight: '700', fontSize: 18 }}>₦{cartTotal.toLocaleString()}</Text>
            </View>
          </Card>
        ) : (
          <Card style={{ marginBottom: 16 }}>
            <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 8 }}>Select Item *</Text>
            <View style={[styles.itemsWrap, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}> 
              {inventoryItems.length === 0 ? (
                <EmptyState
                  icon="inventory"
                  title="No inventory items"
                  subtitle="Add inventory items to record sales."
                  style={{ marginVertical: 16 }}
                  ctaLabel="Add Item"
                  onCtaPress={() => navigation.navigate('AddItemScreen')}
                  accessibilityLabel="No inventory items. Add inventory to record sales."
                />
              ) : (
                inventoryItems.map((item) => {
                  const selected = selectedItemId === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        styles.itemOption,
                        {
                          borderColor: selected ? theme.colors.primary : theme.colors.border,
                          backgroundColor: selected ? `${theme.colors.primary}15` : 'transparent',
                        },
                      ]}
                      onPress={() => setSelectedItemId(item.id)}
                      accessibilityLabel={`Select item ${item.name}`}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>{item.name}</Text>
                        <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
                          Stock: {Number(item.quantity || 0)} • Price: ₦{Number(item.sellingPrice || 0).toLocaleString()}
                        </Text>
                      </View>
                      {selected ? <MaterialIcons name="check-circle" size={18} color={theme.colors.primary} /> : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </View>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 8 }}>Quantity *</Text>
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
                  accessibilityLabel="Quantity"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 8 }}>Price per unit (₦)</Text>
                <View
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.colors.card,
                      borderColor: theme.colors.border,
                      justifyContent: 'center',
                    },
                  ]}
                  accessible accessibilityLabel="Unit price"
                >
                  <Text style={{ color: theme.colors.textPrimary, fontWeight: '600' }}>
                    ₦{unitPrice.toLocaleString()}
                  </Text>
                </View>
              </View>
            </View>

            {quantity && selectedItem && (
              <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: theme.colors.textSecondary }}>Total:</Text>
                  <Text style={{ color: theme.colors.primary, fontWeight: '700', fontSize: 16 }}>
                    ₦{(unitPrice * (parseFloat(quantity) || 0)).toLocaleString()}
                  </Text>
                </View>
              </View>
            )}
          </Card>
        )}

        {/* Customer & Notes Card */}
        <Card style={{ marginBottom: 16 }}>
          <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 8 }}>Customer</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <TouchableOpacity
              style={{ flex: 1, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 10, backgroundColor: theme.colors.card }}
              onPress={() => navigation.navigate('CustomerListScreen', { selectMode: true })}
            >
              <Text style={{ color: customerId ? theme.colors.textPrimary : theme.colors.textSecondary }}>
                {customerId ? (customers.find(c => c.id === customerId)?.name || 'Select customer') : 'Select customer'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('AddCustomerScreen', { selectAfterCreate: true })} style={{ marginLeft: 8 }}>
              <MaterialIcons name="person-add" size={24} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>

          <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 8, marginTop: 12 }}>Notes</Text>
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
            style={[styles.cancelButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
            onPress={() => navigation.goBack()}
            disabled={loading}
          >
            <Text style={{ color: theme.colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.submitButton, { backgroundColor: theme.colors.primary, opacity: loading ? 0.7 : 1 }]}
            onPress={handleSubmit}
            disabled={loading}
          >
            <MaterialIcons name="check-circle" size={20} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '600', marginLeft: 8 }}>
              {loading ? 'Recording…' : isCartMode ? `Complete Sale (${cartItems.length} item${cartItems.length !== 1 ? 's' : ''})` : 'Record Sale'}
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
  itemsWrap: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    maxHeight: 210,
  },
  itemOption: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
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
    marginTop: 0,
    flex: 1,
  },
});
