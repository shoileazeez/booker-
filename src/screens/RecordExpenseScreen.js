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
import { setIdMapping, upsertLocalTransaction } from '../storage/offlineStore';
import { Card, Title, SkeletonBlock } from '../components/UI';
import { MaterialIcons } from '@expo/vector-icons';

const EXPENSE_CATEGORIES = [
  { id: 'rent', label: 'Rent', icon: 'home' },
  { id: 'utilities', label: 'Utilities', icon: 'electrical-services' },
  { id: 'salary', label: 'Salary', icon: 'person' },
  { id: 'supplies', label: 'Supplies', icon: 'shopping-cart' },
  { id: 'maintenance', label: 'Maintenance', icon: 'build' },
  { id: 'other', label: 'Other', icon: 'more-horiz' },
];

export default function RecordExpenseScreen({ navigation }) {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  const { currentWorkspaceId, activeBranchId, queueAction } = useWorkspace();

  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!category || !amount) {
      Alert.alert('Validation Error', 'Please fill in all required fields');
      return;
    }

    if (!currentWorkspaceId || !activeBranchId) {
      Alert.alert(
        'Workspace required',
        'Please select a workspace before recording an expense',
      );
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      Alert.alert('Validation Error', 'Enter a valid expense amount');
      return;
    }

    const selectedCategory = EXPENSE_CATEGORIES.find((c) => c.id === category);
    const nowIso = new Date().toISOString();
    const payload = {
      type: 'expense',
      quantity: 1,
      unitPrice: parsedAmount,
      totalAmount: parsedAmount,
      paymentMethod,
      category,
      notes: description || notes,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    setLoading(true);
    const localId = `local_tx_${Date.now()}_${Math.random()
      .toString(16)
      .slice(2)}`;
    try {
      const result = await api.post(
        `/workspaces/${currentWorkspaceId}/branches/${activeBranchId}/transactions`,
        payload,
      );
      await upsertLocalTransaction(
        {
          local_id: localId,
          server_id: result?.id ? String(result.id) : null,
          workspace_server_id: activeBranchId,
          data: {
            ...payload,
            ...(result || {}),
            id: result?.id ?? localId,
            local_id: localId,
          },
          sync_status: 'synced',
        },
        currentWorkspaceId,
      );
      if (result?.id) {
        await setIdMapping('transaction', localId, String(result.id));
      }

      Alert.alert(
        'Expense recorded',
        `${selectedCategory?.label || 'Expense'}: NGN ${parsedAmount.toLocaleString()}\nMethod: ${paymentMethod}`,
        [
          {
            text: 'OK',
            onPress: () => {
              navigation.goBack();
            },
          },
        ],
      );
    } catch (err) {
      if (queueAction && !err?.response) {
        await queueAction({
          method: 'post',
          path: `/workspaces/${currentWorkspaceId}/branches/${activeBranchId}/transactions`,
          body: payload,
        });
        Alert.alert('Offline', 'Expense queued and will sync once online.', [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]);
      } else {
        Alert.alert('Error', err?.message || 'Unable to record expense');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}
      >
        <SkeletonBlock
          height={28}
          width="60%"
          style={{ marginBottom: 18, borderRadius: 8 }}
        />
        <SkeletonBlock
          height={90}
          style={{ marginBottom: 18, borderRadius: 16 }}
        />
        <SkeletonBlock
          height={90}
          style={{ marginBottom: 18, borderRadius: 16 }}
        />
        <SkeletonBlock height={90} style={{ borderRadius: 16 }} />
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
        accessibilityLabel="Record expense screen"
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <Title accessibilityRole="header">Record Expense</Title>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            accessibilityLabel="Close record expense screen"
            activeOpacity={0.7}
          >
            <MaterialIcons
              name="close"
              size={24}
              color={theme.colors.textPrimary}
            />
          </TouchableOpacity>
        </View>

        <Card style={{ marginBottom: 16 }}>
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: 12,
              marginBottom: 12,
            }}
          >
            Category *
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {EXPENSE_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryButton,
                  {
                    backgroundColor:
                      category === cat.id
                        ? theme.colors.primary
                        : theme.colors.card,
                    borderColor: theme.colors.border,
                  },
                ]}
                onPress={() => setCategory(cat.id)}
                accessibilityLabel={`Select category ${cat.label}`}
                activeOpacity={0.7}
              >
                <MaterialIcons
                  name={cat.icon}
                  size={16}
                  color={
                    category === cat.id
                      ? '#fff'
                      : theme.colors.textPrimary
                  }
                />
                <Text
                  style={{
                    color:
                      category === cat.id
                        ? '#fff'
                        : theme.colors.textPrimary,
                    fontSize: 11,
                    marginTop: 4,
                    fontWeight: '500',
                  }}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        <Card style={{ marginBottom: 16 }}>
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: 12,
              marginBottom: 8,
            }}
          >
            Amount *
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
          />

          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: 12,
              marginBottom: 8,
              marginTop: 12,
            }}
          >
            Payment Method
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {['cash', 'card', 'bank'].map((method) => (
              <TouchableOpacity
                key={method}
                style={[
                  styles.methodButton,
                  {
                    backgroundColor:
                      paymentMethod === method
                        ? theme.colors.primary
                        : theme.colors.card,
                    borderColor: theme.colors.border,
                  },
                ]}
                onPress={() => setPaymentMethod(method)}
                accessibilityLabel={`Select payment method ${method}`}
                activeOpacity={0.7}
              >
                <Text
                  style={{
                    color:
                      paymentMethod === method
                        ? '#fff'
                        : theme.colors.textPrimary,
                    textTransform: 'capitalize',
                    fontWeight: '500',
                  }}
                >
                  {method}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        <Card style={{ marginBottom: 16 }}>
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: 12,
              marginBottom: 8,
            }}
          >
            Description
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
            placeholder="Brief description"
            placeholderTextColor={theme.colors.textSecondary}
            value={description}
            onChangeText={setDescription}
          />

          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: 12,
              marginBottom: 8,
              marginTop: 12,
            }}
          >
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
            placeholder="Additional notes..."
            placeholderTextColor={theme.colors.textSecondary}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
          />
        </Card>

        <TouchableOpacity
          style={[
            styles.submitButton,
            {
              backgroundColor: theme.colors.warning,
              opacity: loading ? 0.7 : 1,
            },
          ]}
          onPress={handleSubmit}
          disabled={loading}
          accessibilityLabel="Record expense"
          activeOpacity={0.7}
        >
          <MaterialIcons name="check-circle" size={20} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '600', marginLeft: 8 }}>
            {loading ? 'Recording...' : 'Record Expense'}
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
    height: 100,
    textAlignVertical: 'top',
  },
  categoryButton: {
    width: '31%',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
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
    marginTop: 8,
  },
});

