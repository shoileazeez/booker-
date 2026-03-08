import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Platform, StatusBar, KeyboardAvoidingView } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { api } from '../../api/client';

export default function EditItemScreen({ navigation, route }) {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  const { currentWorkspaceId, syncInfo } = useWorkspace();
  const item = route?.params?.item;

  const [name, setName] = useState(item?.name || '');
  const [sku, setSku] = useState(item?.sku || '');
  const [quantity, setQuantity] = useState(item?.quantity?.toString() || '1');
  const [costPrice, setCostPrice] = useState(item?.costPrice?.toString() || '0');
  const [sellingPrice, setSellingPrice] = useState(item?.sellingPrice?.toString() || '0');
  const [category, setCategory] = useState(item?.category || '');
  const [location, setLocation] = useState(item?.location || '');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (item) {
      setName(item.name || '');
      setSku(item.sku || '');
      setQuantity(item.quantity?.toString() || '1');
      setCostPrice(item.costPrice?.toString() || '0');
      setSellingPrice(item.sellingPrice?.toString() || '0');
      setCategory(item.category || '');
      setLocation(item.location || '');
    }
  }, [item]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Validation', 'Please provide an item name');
      return;
    }

    if (!currentWorkspaceId) {
      Alert.alert('Workspace required', 'Please select a workspace before saving');
      return;
    }

    const payload = {
      name: name.trim(),
      sku: sku.trim() || undefined,
      quantity: parseFloat(quantity) || 0,
      costPrice: parseFloat(costPrice) || 0,
      sellingPrice: parseFloat(sellingPrice) || 0,
      category: category.trim() || undefined,
      location: location.trim() || undefined,
    };

    setLoading(true);

    try {
      if (item && item.id) {
        await api.put(
          `/workspaces/${currentWorkspaceId}/inventory/${item.id}`,
          payload,
        );
      } else {
        await api.post(`/workspaces/${currentWorkspaceId}/inventory`, payload);
      }

      Platform.OS === 'web'
        ? window.alert('Item saved successfully')
        : Alert.alert('Success', 'Item saved successfully');

      navigation.goBack();
    } catch (err) {
      if (syncInfo?.queueAction) {
        const path = item?.id
          ? `/workspaces/${currentWorkspaceId}/inventory/${item.id}`
          : `/workspaces/${currentWorkspaceId}/inventory`;
        const method = item?.id ? 'put' : 'post';

        await syncInfo.queueAction({
          method,
          path,
          body: payload,
        });

        Platform.OS === 'web'
          ? window.alert('Item queued and will sync once online')
          : Alert.alert('Offline', 'Item queued and will sync once online');
        navigation.goBack();
      } else {
        Alert.alert('Error', err?.message || 'Unable to save item');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Edit Item</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>Update inventory item details</Text>
      </View>
      <View style={styles.form}>
        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Item Name</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.colors.card, borderColor: theme.colors.border, color: theme.colors.textPrimary }]}
          value={name}
          onChangeText={setName}
          placeholder="Enter item name"
          placeholderTextColor={theme.colors.textSecondary}
        />
        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>SKU</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.colors.card, borderColor: theme.colors.border, color: theme.colors.textPrimary }]}
          value={sku}
          onChangeText={setSku}
          placeholder="SKU"
          placeholderTextColor={theme.colors.textSecondary}
        />
        <View style={styles.row}>
          <View style={styles.half}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Quantity</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.colors.card, borderColor: theme.colors.border, color: theme.colors.textPrimary }]}
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.half}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Cost Price</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.colors.card, borderColor: theme.colors.border, color: theme.colors.textPrimary }]}
              value={costPrice}
              onChangeText={setCostPrice}
              keyboardType="decimal-pad"
            />
          </View>
        </View>
        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Selling Price</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.colors.card, borderColor: theme.colors.border, color: theme.colors.textPrimary }]}
          value={sellingPrice}
          onChangeText={setSellingPrice}
          keyboardType="decimal-pad"
        />
        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Category</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.colors.card, borderColor: theme.colors.border, color: theme.colors.textPrimary }]}
          value={category}
          onChangeText={setCategory}
          placeholder="e.g. Supplies"
          placeholderTextColor={theme.colors.textSecondary}
        />
        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Location</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.colors.card, borderColor: theme.colors.border, color: theme.colors.textPrimary }]}
          value={location}
          onChangeText={setLocation}
          placeholder="e.g. Warehouse"
          placeholderTextColor={theme.colors.textSecondary}
        />

        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.colors.primary, opacity: loading ? 0.7 : 1 }]}
          onPress={handleSave}
          disabled={loading}
        >
          <Text style={[styles.buttonText, { color: '#fff' }]}> {loading ? 'Saving…' : 'Save Item'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 16, marginBottom: 16 },
  form: { paddingHorizontal: 20 },
  label: { fontSize: 14, marginTop: 12, marginBottom: 6 },
  input: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, fontSize: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  half: { flex: 1, marginRight: 10 },
  button: { marginTop: 20, padding: 14, borderRadius: 12, alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '600' }
});
