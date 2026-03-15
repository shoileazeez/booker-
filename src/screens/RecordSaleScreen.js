import React, { useState } from 'react';
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
import { Card, Title } from '../components/UI';
import { MaterialIcons } from '@expo/vector-icons';

export default function RecordSaleScreen({ navigation, route }) {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  const { currentWorkspaceId, queueAction } = useWorkspace();

  const cartItems = route?.params?.cart ?? [];
  const isCartMode = cartItems.length > 0;

  const cartTotal = cartItems.reduce((sum, item) => sum + item.quantity * (item.sellingPrice || 0), 0);

  // Manual mode fields
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');

  // Shared fields
  const [customer, setCustomer] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const postTransaction = async (payload) => {
    try {
      await api.post(`/workspaces/${currentWorkspaceId}/transactions`, payload);
    } catch (err) {
      if (queueAction) {
        await queueAction({
          method: 'post',
          path: `/workspaces/${currentWorkspaceId}/transactions`,
          body: payload,
        });
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
            customerName: customer || 'Walk-in',
            notes: notes || item.name,
          });
        }
        Alert.alert(
          'Sale recorded',
          `${cartItems.length} item(s) — ₦${cartTotal.toLocaleString()}\nCustomer: ${customer || 'Walk-in'}`,
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
      } else {
        if (!itemName || !quantity || !price) {
          Alert.alert('Validation Error', 'Please fill in all required fields');
          setLoading(false);
          return;
        }
        const total = parseFloat(price) * parseInt(quantity, 10);
        await postTransaction({
          type: 'sale',
          itemId: null,
          quantity: parseFloat(quantity),
          unitPrice: parseFloat(price),
          totalAmount: total,
          paymentMethod: 'cash',
          customerName: customer || 'Walk-in',
          notes: notes || itemName,
        });
        Alert.alert(
          'Sale recorded',
          `${quantity} × ${itemName} = ₦${total.toLocaleString()}\nCustomer: ${customer || 'Walk-in'}`,
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
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <Title>Record Sale</Title>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <MaterialIcons name="close" size={24} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Item Details Card */}
        {/* Cart Summary (cart mode) or Manual Single-Item Entry */}
        {isCartMode ? (
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
            <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 8 }}>Item Name *</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.colors.card,
                  color: theme.colors.textPrimary,
                  borderColor: theme.colors.border,
                },
              ]}
              placeholder="Enter item name"
              placeholderTextColor={theme.colors.textSecondary}
              value={itemName}
              onChangeText={setItemName}
            />

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
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 8 }}>Price per unit (₦) *</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.colors.card,
                      color: theme.colors.textPrimary,
                      borderColor: theme.colors.border,
                    },
                  ]}
                  placeholder="0.00"
                  placeholderTextColor={theme.colors.textSecondary}
                  keyboardType="decimal-pad"
                  value={price}
                  onChangeText={setPrice}
                />
              </View>
            </View>

            {quantity && price && (
              <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: theme.colors.textSecondary }}>Total:</Text>
                  <Text style={{ color: theme.colors.primary, fontWeight: '700', fontSize: 16 }}>
                    ₦{(parseFloat(price) * parseInt(quantity)).toLocaleString()}
                  </Text>
                </View>
              </View>
            )}
          </Card>
        )}

        {/* Customer & Notes Card */}
        <Card style={{ marginBottom: 16 }}>
          <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 8 }}>Customer (optional)</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.card,
                color: theme.colors.textPrimary,
                borderColor: theme.colors.border,
              },
            ]}
            placeholder="Customer name"
            placeholderTextColor={theme.colors.textSecondary}
            value={customer}
            onChangeText={setCustomer}
          />

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
