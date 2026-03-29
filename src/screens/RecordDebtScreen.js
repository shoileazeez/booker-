import React, { useCallback, useState } from 'react';
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
import { cacheCustomers, getCachedCustomers, setIdMapping, upsertLocalDebt, upsertLocalTransaction } from '../storage/offlineStore';
import { Card, Title, SkeletonBlock } from '../components/UI';
import { MaterialIcons } from '@expo/vector-icons';
import { useCustomerSelect } from '../context/CustomerSelectContext';
import { useFocusEffect } from '@react-navigation/native';

export default function RecordDebtScreen({ navigation }) {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  const { currentWorkspaceId, activeBranchId, queueAction } = useWorkspace();
  const { selectedCustomer } = useCustomerSelect();

  const [customers, setCustomers] = useState([]);
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [dueInDays, setDueInDays] = useState('7');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

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

  const handleSubmit = async () => {
    if (!currentWorkspaceId || !activeBranchId) {
      Alert.alert('Workspace required', 'Please select a workspace first');
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid amount');
      return;
    }
    const dueDate = dueInDays
      ? new Date(Date.now() + parseInt(dueInDays, 10) * 86400000).toISOString()
      : null;
    const nowIso = new Date().toISOString();
    const payload = {
      type: 'debt',
      quantity: 1,
      unitPrice: parseFloat(amount),
      totalAmount: parseFloat(amount),
      phone: phone || selectedCustomer?.phone || undefined,
      dueDate: dueDate || undefined,
      notes: notes || undefined,
      customerId: selectedCustomer?.id || undefined,
      customerName: customers.find((c) => c.id === selectedCustomer?.id)?.name || selectedCustomer?.name || undefined,
      status: 'pending',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    setLoading(true);
    const localId = `local_debt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    try {
      const result = await api.post(`/workspaces/${currentWorkspaceId}/branches/${activeBranchId}/transactions`, payload);
      await upsertLocalDebt({
        local_id: localId,
        server_id: result?.id ? String(result.id) : null,
        workspace_server_id: activeBranchId,
        data: { ...payload, ...(result || {}), id: result?.id ?? localId, local_id: localId },
        sync_status: 'synced',
      }, activeBranchId);
      await upsertLocalTransaction({
        local_id: localId,
        server_id: result?.id ? String(result.id) : null,
        workspace_server_id: activeBranchId,
        data: { ...payload, ...(result || {}), id: result?.id ?? localId, local_id: localId },
        sync_status: 'synced',
      }, activeBranchId);
      if (result?.id) {
        await setIdMapping('debt', localId, String(result.id));
      }
      Alert.alert('Success', 'Debt recorded', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      if (queueAction) {
        await queueAction({
          method: 'post',
          path: `/workspaces/${currentWorkspaceId}/branches/${activeBranchId}/transactions`,
          body: payload,
        });
        Alert.alert('Offline', 'Debt queued and will sync once online', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert('Error', err?.message || 'Unable to record debt');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
      return (
        <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <SkeletonBlock height={28} width="60%" style={{ marginBottom: 18, borderRadius: 8 }} />
          <SkeletonBlock height={90} style={{ marginBottom: 18, borderRadius: 16 }} />
          <SkeletonBlock height={90} style={{ marginBottom: 18, borderRadius: 16 }} />
          <SkeletonBlock height={90} style={{ marginBottom: 18, borderRadius: 16 }} />
        </View>
      );
    }

    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={[styles.container, { backgroundColor: theme.colors.background }]}
          contentContainerStyle={{ padding: 16 }}
          accessibilityLabel="Record debt screen"
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 20,
            }}
          >
            <Title accessibilityRole="header">Record Debt</Title>
            <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Close record debt screen" activeOpacity={0.7}>
              <MaterialIcons name="close" size={24} color={theme.colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <Card style={{ marginBottom: 16 }}>
            <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 8 }}>
              Customer / Debtor *
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <TouchableOpacity
                style={{ flex: 1, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 10, backgroundColor: theme.colors.card }}
                onPress={() => navigation.navigate('CustomerListScreen', { selectMode: true })}
                accessibilityLabel="Select customer"
                activeOpacity={0.7}
              >
                <Text style={{ color: selectedCustomer?.id ? theme.colors.textPrimary : theme.colors.textSecondary }}>
                  {selectedCustomer?.id ? (customers.find(c => c.id === selectedCustomer.id)?.name || selectedCustomer.name || 'Select customer') : 'Select customer'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => navigation.navigate('AddCustomerScreen', { selectAfterCreate: true })} style={{ marginLeft: 8 }} accessibilityLabel="Add customer" activeOpacity={0.7}>
                <MaterialIcons name="person-add" size={24} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>

            <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 8, marginTop: 12 }}>
              Phone (optional)
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
              placeholder="+2348012345678"
              placeholderTextColor={theme.colors.textSecondary}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              accessibilityLabel="Phone number"
            />

            <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 8, marginTop: 12 }}>
              Amount (₦) *
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
              placeholder="0.00"
              placeholderTextColor={theme.colors.textSecondary}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
              accessibilityLabel="Amount"
            />

            <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 8, marginTop: 12 }}>
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
              accessibilityLabel="Due in days"
            />

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
              placeholder="Any extra info"
              placeholderTextColor={theme.colors.textSecondary}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              accessibilityLabel="Notes"
            />
          </Card>

          <TouchableOpacity
            style={[
              styles.submitButton,
              { backgroundColor: theme.colors.primary, opacity: loading ? 0.7 : 1 },
            ]}
            onPress={handleSubmit}
            disabled={loading}
            accessibilityLabel="Save debt"
            activeOpacity={0.7}
          >
            <MaterialIcons name="check-circle" size={20} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '600', marginLeft: 8 }}>
              {loading ? 'Recording…' : 'Save Debt'}
            </Text>
          </TouchableOpacity>
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
    minHeight: 90,
    textAlignVertical: 'top',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    marginTop: 16,
  },
});

