import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { api } from '../../api/client';
import * as offlineStore from '../../storage/offlineStore';
import { useWorkspace } from '../../context/WorkspaceContext';

export default function EditBranchScreen({ navigation, route }) {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  const { queueAction, setWorkspaces, currentWorkspaceId } = useWorkspace();
  const branch = route?.params?.branch;
  const [name, setName] = useState(branch?.name || '');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!branch?.id || !name.trim()) {
      Alert.alert('Validation', 'Branch name is required');
      return;
    }

    setLoading(true);
    try {
      await api.put(`/workspaces/${currentWorkspaceId}/branches/${branch.id}`, { name: name.trim() });
      await offlineStore.executeSql(
        'UPDATE local_workspaces SET name = ?, updated_at_local = ? WHERE local_id = ? OR server_id = ?',
        [name.trim(), Date.now(), branch.local_id || branch.id, branch.id],
      );
      setWorkspaces((prev) => (prev || []).map((item) => (
        String(item.id) === String(branch.id) || String(item.local_id) === String(branch.local_id || branch.id)
          ? { ...item, name: name.trim() }
          : item
      )));
      navigation.goBack();
    } catch (err) {
      if (!err?.response && queueAction) {
        await offlineStore.executeSql(
          'UPDATE local_workspaces SET name = ?, sync_status = ?, updated_at_local = ? WHERE local_id = ? OR server_id = ?',
          [name.trim(), 'pending_update', Date.now(), branch.local_id || branch.id, branch.id],
        );
        setWorkspaces((prev) => (prev || []).map((item) => (
          String(item.id) === String(branch.id) || String(item.local_id) === String(branch.local_id || branch.id)
            ? { ...item, name: name.trim(), sync_status: 'pending_update' }
            : item
        )));
        await queueAction({
          method: 'put',
          path: `/workspaces/${currentWorkspaceId}/branches/${branch.id}`,
          body: { name: name.trim() },
        });
        Alert.alert('Offline', 'Branch update saved locally and will sync when online.');
        navigation.goBack();
      } else {
        Alert.alert('Error', err?.message || 'Unable to update branch');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, padding: 12 }]}>
      <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>Create / Edit Branch</Text>
      <TextInput value={name} onChangeText={setName} placeholder="Branch name" placeholderTextColor={theme.colors.textSecondary} style={[styles.input, { backgroundColor: theme.colors.card, color: theme.colors.textPrimary }]} />
      <TouchableOpacity style={[styles.button, { backgroundColor: theme.colors.primary, opacity: loading ? 0.7 : 1 }]} onPress={handleSave}>
        <Text style={{ color: '#fff' }}>{loading ? 'Saving…' : 'Save'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 }, input: { marginTop: 12, padding: 12, borderRadius: 10 }, button: { marginTop: 12, padding: 12, borderRadius: 10, alignItems: 'center' } });
