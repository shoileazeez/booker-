import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Picker } from '@react-native-picker/picker';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { api } from '../../api/client';
import { AppButton, Card, EmptyState, SkeletonBlock, Subtle, Title } from '../../components/UI';

export default function StockTransferScreen({ navigation, route }) {
  const { theme } = useTheme();
  const { currentWorkspaceId, branches } = useWorkspace();
  const sourceBranchIdParam = route?.params?.sourceBranchId || '';
  const [transfers, setTransfers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [sourceBranchId, setSourceBranchId] = useState(sourceBranchIdParam);
  const [destinationBranchId, setDestinationBranchId] = useState('');
  const [sourceItemId, setSourceItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const destinationBranches = useMemo(
    () => (branches || []).filter((branch) => branch.id !== sourceBranchId),
    [branches, sourceBranchId],
  );

  const loadTransfers = useCallback(async (isRefresh = false) => {
    if (!currentWorkspaceId) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await api.get(`/workspaces/${currentWorkspaceId}/stock-transfers`);
      setTransfers(Array.isArray(data) ? data : []);
    } catch (err) {
      setTransfers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentWorkspaceId]);

  const loadSourceInventory = useCallback(async () => {
    if (!currentWorkspaceId || !sourceBranchId) {
      setInventory([]);
      return;
    }

    try {
      const data = await api.get(`/workspaces/${currentWorkspaceId}/branches/${sourceBranchId}/inventory`);
      setInventory(Array.isArray(data) ? data : []);
    } catch (err) {
      setInventory([]);
    }
  }, [currentWorkspaceId, sourceBranchId]);

  useEffect(() => {
    if (
      !destinationBranchId ||
      !destinationBranches.some((branch) => branch.id === destinationBranchId)
    ) {
      setDestinationBranchId(destinationBranches[0].id);
    }
  }, [destinationBranchId, destinationBranches]);

  useEffect(() => {
    setSourceItemId('');
    loadSourceInventory();
  }, [loadSourceInventory]);

  useFocusEffect(
    useCallback(() => {
      loadTransfers();
    }, [loadTransfers]),
  );

  const handleTransfer = async () => {
    if (!sourceBranchId || !destinationBranchId || !sourceItemId || !quantity) {
      Alert.alert('Stock transfer', 'Complete the source, destination, item, and quantity.');
      return;
    }

    setSaving(true);
    try {
      await api.post(`/workspaces/${currentWorkspaceId}/stock-transfers`, {
        sourceBranchId,
        destinationBranchId,
        sourceItemId,
        quantity: Number(quantity),
        reason,
        notes,
      });
      setQuantity('');
      setReason('');
      setNotes('');
      await Promise.all([loadTransfers(true), loadSourceInventory()]);
      Alert.alert('Stock transfer', 'Transfer completed successfully.');
    } catch (err) {
      Alert.alert('Stock transfer', err?.message || 'Unable to transfer stock.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadTransfers(true)} />}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 12 }}>
          <MaterialIcons name="arrow-back" size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Title>Stock Transfer</Title>
          <Subtle>Move stock between branches</Subtle>
        </View>
      </View>

      <Card style={{ marginBottom: 16 }}>
        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>New Transfer</Text>
        <View style={[styles.pickerWrap, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
          <Picker selectedValue={sourceBranchId} onValueChange={setSourceBranchId} style={{ color: theme.colors.textPrimary }}>
            <Picker.Item label="Select source branch" value="" />
            {(branches || []).map((branch) => (
              <Picker.Item key={branch.id} label={branch.name} value={branch.id} />
            ))}
          </Picker>
        </View>
        <View style={[styles.pickerWrap, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
          <Picker selectedValue={destinationBranchId} onValueChange={setDestinationBranchId} style={{ color: theme.colors.textPrimary }}>
            <Picker.Item label="Select destination branch" value="" />
            {destinationBranches.map((branch) => (
              <Picker.Item key={branch.id} label={branch.name} value={branch.id} />
            ))}
          </Picker>
        </View>
        <View style={[styles.pickerWrap, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
          <Picker selectedValue={sourceItemId} onValueChange={setSourceItemId} style={{ color: theme.colors.textPrimary }}>
            <Picker.Item label="Select inventory item" value="" />
            {inventory.map((item) => (
              <Picker.Item
                key={item.id}
                label={`${item.name} (${Number(item.quantity || 0).toLocaleString()})`}
                value={item.id}
              />
            ))}
          </Picker>
        </View>
        <TextInput
          style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.textPrimary, backgroundColor: theme.colors.background }]}
          placeholder="Quantity"
          placeholderTextColor={theme.colors.textSecondary}
          keyboardType="numeric"
          value={quantity}
          onChangeText={setQuantity}
        />
        <TextInput
          style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.textPrimary, backgroundColor: theme.colors.background }]}
          placeholder="Reason"
          placeholderTextColor={theme.colors.textSecondary}
          value={reason}
          onChangeText={setReason}
        />
        <TextInput
          style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.textPrimary, backgroundColor: theme.colors.background }]}
          placeholder="Notes"
          placeholderTextColor={theme.colors.textSecondary}
          value={notes}
          onChangeText={setNotes}
          multiline
        />
        <AppButton
          title={saving ? 'Transferring...' : 'Transfer Stock'}
          icon="swap-horiz"
          onPress={handleTransfer}
          loading={saving}
        />
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Recent Transfers</Text>
        {loading && transfers.length === 0 ? (
          <>
            <SkeletonBlock height={70} style={{ marginBottom: 10 }} />
            <SkeletonBlock height={70} style={{ marginBottom: 10 }} />
            <SkeletonBlock height={70} />
          </>
        ) : transfers.length > 0 ? (
          transfers.map((transfer) => (
            <View key={transfer.id} style={[styles.transferRow, { borderColor: theme.colors.border }]}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>
                  {transfer.sourceBranch?.name || 'Source'} → {transfer.destinationBranch?.name || 'Destination'}
                </Text>
                <Subtle>
                  {transfer.sourceItem?.name || 'Item'} | Qty {Number(transfer.quantity || 0).toLocaleString()}
                </Subtle>
                <Subtle>{new Date(transfer.createdAt).toLocaleString()}</Subtle>
              </View>
              <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>
                {transfer.status}
              </Text>
            </View>
          ))
        ) : (
          <EmptyState
            icon="swap-horizontal-circle"
            title="No stock transfers yet"
            subtitle="Owner transfers between branches will appear here."
          />
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  pickerWrap: {
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 10,
    overflow: 'hidden',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  transferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingVertical: 12,
  },
});
