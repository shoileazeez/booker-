import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { api } from '../api/client';
import { upsertLocalCustomer, setIdMapping } from '../storage/offlineStore';
import { MaterialIcons } from '@expo/vector-icons';
import { useCustomerSelect } from '../context/CustomerSelectContext';

export default function AddCustomerScreen({ navigation, route }) {
  const { theme } = useTheme();
  const { currentWorkspaceId, activeBranchId, queueAction } = useWorkspace();
  const { setSelectedCustomer } = useCustomerSelect();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const selectAfterCreate = !!route?.params?.selectAfterCreate;

  const handleAdd = async () => {
    if (!name.trim()) {
      Alert.alert('Validation', 'Name is required');
      return;
    }
    setLoading(true);
    try {
      const payload = { name, email, phone, address };
      const result = await api.post(`/workspaces/${currentWorkspaceId}/branches/${activeBranchId}/customers`, payload);
      const createdCustomer = { ...payload, ...(result || {}), id: result?.id ?? null };
      const localId = result?.id ? `customer_${activeBranchId}_${result.id}` : `local_customer_${Date.now()}`;
      await upsertLocalCustomer({
        local_id: localId,
        server_id: result?.id ? String(result.id) : null,
        workspace_server_id: activeBranchId,
        data: { ...createdCustomer, id: createdCustomer.id ?? localId, local_id: localId },
        sync_status: 'synced',
      }, activeBranchId);
      if (result?.id) {
        await setIdMapping('customer', localId, String(result.id));
      }
      if (selectAfterCreate) {
        setSelectedCustomer(createdCustomer);
      }
      navigation.goBack();
    } catch (err) {
      if (!err?.response && queueAction) {
        const localId = `local_customer_${Date.now()}`;
        const localCustomer = { id: localId, name, email, phone, address };
        await upsertLocalCustomer({
          local_id: localId,
          server_id: null,
          workspace_server_id: activeBranchId,
          data: { ...localCustomer, local_id: localId },
          sync_status: 'pending_create',
        }, activeBranchId);
        await queueAction({
          method: 'post',
          path: `/workspaces/${currentWorkspaceId}/branches/${activeBranchId}/customers`,
          body: { name, email, phone, address },
        });
        if (selectAfterCreate) {
          setSelectedCustomer(localCustomer);
        }
        Alert.alert('Offline', 'Customer saved locally and will sync once online');
        navigation.goBack();
      } else {
        Alert.alert('Error', err.message || 'Failed to add customer');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, padding: 16 }}>
      <Text style={{ color: theme.colors.textPrimary, fontWeight: '700', fontSize: 20, marginBottom: 16 }}>Add Customer</Text>
      <TextInput style={[styles.input, { color: theme.colors.textPrimary, borderColor: theme.colors.border }]} placeholder="Name" value={name} onChangeText={setName} />
      <TextInput style={[styles.input, { color: theme.colors.textPrimary, borderColor: theme.colors.border }]} placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <TextInput style={[styles.input, { color: theme.colors.textPrimary, borderColor: theme.colors.border }]} placeholder="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <TextInput style={[styles.input, { color: theme.colors.textPrimary, borderColor: theme.colors.border }]} placeholder="Address" value={address} onChangeText={setAddress} />
      <TouchableOpacity style={[styles.button, { backgroundColor: theme.colors.primary }]} onPress={handleAdd} disabled={loading}>
        <MaterialIcons name="person-add" size={22} color="#fff" />
        <Text style={{ color: '#fff', marginLeft: 8, fontWeight: '600' }}>Add Customer</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 16 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 8, marginTop: 16 },
});
