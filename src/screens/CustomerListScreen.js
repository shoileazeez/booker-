import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, Alert } from 'react-native';
import { SkeletonBlock, EmptyState } from '../components/UI';
import { useTheme } from '../theme/ThemeContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { api } from '../api/client';
import { cacheCustomers, getCachedCustomers } from '../storage/offlineStore';
import { MaterialIcons } from '@expo/vector-icons';
import { useCustomerSelect } from '../context/CustomerSelectContext';
import { useFocusEffect, useRoute } from '@react-navigation/native';


export default function CustomerListScreen({ navigation }) {
  const { theme } = useTheme();
  const { currentWorkspaceId, activeBranchId, queueAction } = useWorkspace();
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const { setSelectedCustomer } = useCustomerSelect();
  const route = useRoute();
  const selectMode = route.params?.selectMode;

  const loadCustomers = async () => {
    if (!currentWorkspaceId || !activeBranchId) return;
    setLoading(true);
    try {
      const data = await api.get(`/workspaces/${currentWorkspaceId}/branches/${activeBranchId}/customers`, search ? { search } : undefined);
      const list = Array.isArray(data) ? data : [];
      setCustomers(list);
      cacheCustomers(activeBranchId, list).catch(() => null);
    } catch (err) {
      const cached = await getCachedCustomers(activeBranchId, search);
      setCustomers(Array.isArray(cached) ? cached : []);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadCustomers();
    }, [currentWorkspaceId, activeBranchId, search]),
  );

  const handleDelete = async (id) => {
    if (!currentWorkspaceId || !activeBranchId) return;
    try {
      await api.delete(`/workspaces/${currentWorkspaceId}/branches/${activeBranchId}/customers/${id}`);
      loadCustomers();
    } catch (err) {
      if (!err?.response && queueAction) {
        await queueAction({
          method: 'delete',
          path: `/workspaces/${currentWorkspaceId}/branches/${activeBranchId}/customers/${id}`,
        });
        loadCustomers();
      } else {
        Alert.alert('Error', err.message || 'Failed to delete customer');
      }
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ flexDirection: 'row', padding: 12 }}>
        <TextInput
          style={[styles.input, { color: theme.colors.textPrimary, borderColor: theme.colors.border }]}
          placeholder="Search customers"
          value={search}
          onChangeText={setSearch}
          accessibilityLabel="Search customers"
        />
        <TouchableOpacity
          onPress={() => navigation.navigate('AddCustomerScreen', { selectAfterCreate: !!selectMode })}
          style={{ marginLeft: 8 }}
          accessibilityLabel="Add customer"
          activeOpacity={0.7}
        >
          <MaterialIcons name="person-add" size={28} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>
      {loading ? (
        <View style={{ padding: 16 }}>
          <SkeletonBlock height={28} width="60%" style={{ marginBottom: 18, borderRadius: 8 }} />
          <SkeletonBlock height={60} style={{ marginBottom: 18, borderRadius: 16 }} />
          <SkeletonBlock height={60} style={{ marginBottom: 18, borderRadius: 16 }} />
          <SkeletonBlock height={60} style={{ marginBottom: 18, borderRadius: 16 }} />
        </View>
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={[styles.row, { borderColor: theme.colors.border, marginBottom: 6, borderRadius: 10, backgroundColor: theme.colors.card }]}> 
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.textPrimary, fontWeight: '600', fontSize: 16 }}>{item.name}</Text>
                <Text style={{ color: theme.colors.textSecondary }}>{item.email || item.phone}</Text>
              </View>
              <TouchableOpacity
                  onPress={() => {
                     if (selectMode) {
                         setSelectedCustomer(item);
                         navigation.goBack();
                      } else {
                        navigation.navigate('EditCustomerScreen', { customer: item });
                      }
                   }}
                  accessibilityLabel={selectMode ? `Select ${item.name}` : `Edit ${item.name}`}
                  activeOpacity={0.7}
               >
                 <MaterialIcons name={selectMode ? 'check-circle' : 'edit'} size={22} color={theme.colors.primary} />
              </TouchableOpacity>
              
              <TouchableOpacity onPress={() => handleDelete(item.id)} style={{ marginLeft: 12 }} accessibilityLabel={`Delete ${item.name}`} activeOpacity={0.7}>
                <MaterialIcons name="delete" size={22} color={theme.colors.error} />
              </TouchableOpacity>
            </View>
          )}
          refreshing={loading}
          onRefresh={loadCustomers}
          ListEmptyComponent={
            <EmptyState
              icon="person"
              title="No customers found"
              subtitle="Add customers to your workspace."
              style={{ marginTop: 32 }}
              ctaLabel="Add Customer"
              onCtaPress={() => navigation.navigate('AddCustomerScreen', { selectAfterCreate: !!selectMode })}
              accessibilityLabel="No customers found. Add a customer."
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 8, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1 },
});

