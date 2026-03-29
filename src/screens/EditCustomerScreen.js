import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SkeletonBlock } from '../components/UI';
import { useTheme } from '../theme/ThemeContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { api } from '../api/client';
import { upsertLocalCustomer } from '../storage/offlineStore';
import { MaterialIcons } from '@expo/vector-icons';

export default function EditCustomerScreen({ route, navigation }) {
  const { theme } = useTheme();
  const { currentWorkspaceId, activeBranchId, queueAction } = useWorkspace();
  const customer = route?.params?.customer;
  const [name, setName] = useState(customer?.name || '');
  const [email, setEmail] = useState(customer?.email || '');
  const [phone, setPhone] = useState(customer?.phone || '');
  const [address, setAddress] = useState(customer?.address || '');
  const [loading, setLoading] = useState(false);

  const handleUpdate = async () => {
    if (!name.trim()) {
      Alert.alert('Validation', 'Name is required');
      return;
    }
    setLoading(true);
    try {
      const payload = { name, email, phone, address };
      const localId = customer.local_id || customer.id;
      await api.put(`/workspaces/${currentWorkspaceId}/branches/${activeBranchId}/customers/${customer.id}`, payload);
      await upsertLocalCustomer({
        local_id: localId,
        server_id: String(customer.id),
        workspace_server_id: activeBranchId,
        data: { ...customer, ...payload, id: customer.id, local_id: localId },
        sync_status: 'synced',
      }, activeBranchId);
      navigation.goBack();
    } catch (err) {
      if (!err?.response && queueAction) {
        await upsertLocalCustomer({
          local_id: customer.local_id || customer.id,
          server_id: String(customer.id).startsWith('local_') ? null : String(customer.id),
          workspace_server_id: activeBranchId,
          data: { ...customer, name, email, phone, address, id: customer.id, local_id: customer.local_id || customer.id },
          sync_status: 'pending_update',
        }, activeBranchId);
        await queueAction({
          method: 'put',
          path: `/workspaces/${currentWorkspaceId}/branches/${activeBranchId}/customers/${customer.id}`,
          body: { name, email, phone, address },
        });
        Alert.alert('Offline', 'Customer update saved locally and will sync once online');
        navigation.goBack();
      } else {
        Alert.alert('Error', err.message || 'Failed to update customer');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <SkeletonBlock height={28} width="60%" style={{ marginBottom: 18, borderRadius: 8 }} />
        <SkeletonBlock height={50} style={{ marginBottom: 18, borderRadius: 12 }} />
        <SkeletonBlock height={50} style={{ marginBottom: 18, borderRadius: 12 }} />
        <SkeletonBlock height={50} style={{ marginBottom: 18, borderRadius: 12 }} />
        <SkeletonBlock height={50} style={{ marginBottom: 18, borderRadius: 12 }} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, padding: 16 }}>
      <Text style={{ color: theme.colors.textPrimary, fontWeight: '700', fontSize: 20, marginBottom: 16 }} accessibilityRole="header">Edit Customer</Text>
      <TextInput style={[styles.input, { color: theme.colors.textPrimary, borderColor: theme.colors.border }]} placeholder="Name" value={name} onChangeText={setName} accessibilityLabel="Customer name" />
      <TextInput style={[styles.input, { color: theme.colors.textPrimary, borderColor: theme.colors.border }]} placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" accessibilityLabel="Customer email" />
      <TextInput style={[styles.input, { color: theme.colors.textPrimary, borderColor: theme.colors.border }]} placeholder="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" accessibilityLabel="Customer phone" />
      <TextInput style={[styles.input, { color: theme.colors.textPrimary, borderColor: theme.colors.border }]} placeholder="Address" value={address} onChangeText={setAddress} accessibilityLabel="Customer address" />
      <TouchableOpacity style={[styles.button, { backgroundColor: theme.colors.primary }]} onPress={handleUpdate} disabled={loading} accessibilityLabel="Update customer" activeOpacity={0.7}>
        <MaterialIcons name="save" size={22} color="#fff" />
        <Text style={{ color: '#fff', marginLeft: 8, fontWeight: '600' }}>Update Customer</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 16 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 8, marginTop: 16 },
});

