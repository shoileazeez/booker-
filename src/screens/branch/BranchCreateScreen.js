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
import { useTheme } from '../../theme/ThemeContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { api } from '../../api/client';
import { Card, Title } from '../../components/UI';
import { MaterialIcons } from '@expo/vector-icons';

export default function BranchCreateScreen({ navigation }) {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  const { currentWorkspaceId } = useWorkspace();

  const [branchName, setBranchName] = useState('');
  const [location, setLocation] = useState('');
  const [managerEmail, setManagerEmail] = useState('');
  const [selectedManager, setSelectedManager] = useState(null);
  const [managerSearchLoading, setManagerSearchLoading] = useState(false);
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFindManager = async () => {
    const email = managerEmail.trim().toLowerCase();
    if (!email) {
      Alert.alert('Validation Error', 'Enter manager email first');
      return;
    }

    if (!currentWorkspaceId) {
      Alert.alert('Workspace required', 'Please select a workspace before assigning manager');
      return;
    }

    setManagerSearchLoading(true);
    try {
      const user = await api.get(`/workspaces/${currentWorkspaceId}/users/search`, { email });
      setSelectedManager(user);
      Alert.alert('Manager Found', `${user.name} (${user.email})`);
    } catch (err) {
      setSelectedManager(null);
      Alert.alert('Not found', err?.message || 'No user found with this email');
    } finally {
      setManagerSearchLoading(false);
    }
  };

  const handleCreateBranch = async () => {
    if (!branchName || !location) {
      Alert.alert('Validation Error', 'Please fill in branch name and location');
      return;
    }

    if (!currentWorkspaceId) {
      Alert.alert('Workspace required', 'Please select a workspace before creating a branch');
      return;
    }

    setLoading(true);
    try {
      if (managerEmail.trim() && !selectedManager) {
        Alert.alert('Manager required', 'Please find and select a valid manager account before creating the branch');
        setLoading(false);
        return;
      }

      await api.post('/workspaces', {
        name: branchName.trim(),
        description: [location, phone, address].filter(Boolean).join(' | '),
        parentWorkspaceId: currentWorkspaceId,
        managerUserId: selectedManager?.id,
      });

      Alert.alert('Branch Created', `${branchName} - ${location}`, [
        {
          text: 'OK',
          onPress: () => {
            navigation.goBack();
          },
        },
      ]);
    } catch (err) {
      Alert.alert('Error', err?.message || 'Unable to create branch');
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
          <Title>Create Branch</Title>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <MaterialIcons name="close" size={24} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Branch Details Card */}
        <Card style={{ marginBottom: 16 }}>
          <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 8 }}>Branch Name *</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.card,
                color: theme.colors.textPrimary,
                borderColor: theme.colors.border,
              },
            ]}
            placeholder="e.g., Downtown Store"
            placeholderTextColor={theme.colors.textSecondary}
            value={branchName}
            onChangeText={setBranchName}
          />

          <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 8, marginTop: 12 }}>Location *</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.card,
                color: theme.colors.textPrimary,
                borderColor: theme.colors.border,
              },
            ]}
            placeholder="e.g., Main City"
            placeholderTextColor={theme.colors.textSecondary}
            value={location}
            onChangeText={setLocation}
          />

          <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 8, marginTop: 12 }}>Branch Manager Email</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.card,
                color: theme.colors.textPrimary,
                borderColor: theme.colors.border,
              },
            ]}
            placeholder="manager@email.com"
            placeholderTextColor={theme.colors.textSecondary}
            value={managerEmail}
            onChangeText={(value) => {
              setManagerEmail(value);
              setSelectedManager(null);
            }}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TouchableOpacity
            style={[styles.findManagerButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border, opacity: managerSearchLoading ? 0.7 : 1 }]}
            onPress={handleFindManager}
            disabled={managerSearchLoading}
          >
            <MaterialIcons name="person-search" size={18} color={theme.colors.primary} />
            <Text style={{ color: theme.colors.primary, marginLeft: 8, fontWeight: '600' }}>
              {managerSearchLoading ? 'Checking…' : 'Find Manager'}
            </Text>
          </TouchableOpacity>
          {selectedManager ? (
            <View style={[styles.managerCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}> 
              <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>{selectedManager.name}</Text>
              <Text style={{ color: theme.colors.textSecondary }}>{selectedManager.email}</Text>
            </View>
          ) : null}
          <Text style={{ color: theme.colors.textSecondary, fontSize: 11, marginTop: 6 }}>
            Manager should already have a BizRecord account and will sign in with their own email and password.
          </Text>
        </Card>

        {/* Contact Information Card */}
        <Card style={{ marginBottom: 16 }}>
          <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 8 }}>Phone Number</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.card,
                color: theme.colors.textPrimary,
                borderColor: theme.colors.border,
              },
            ]}
            placeholder="+1 (555) 000-0000"
            placeholderTextColor={theme.colors.textSecondary}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />

          <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 8, marginTop: 12 }}>Address</Text>
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
            placeholder="Full address"
            placeholderTextColor={theme.colors.textSecondary}
            value={address}
            onChangeText={setAddress}
            multiline
            numberOfLines={3}
          />
        </Card>

        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            {
              backgroundColor: theme.colors.primary,
              opacity: loading ? 0.7 : 1,
            },
          ]}
          onPress={handleCreateBranch}
          disabled={loading}
        >
          <MaterialIcons name="add-location-alt" size={20} color="#fff" />
          <Text
            style={{
              color: '#fff',
              fontWeight: '600',
              marginLeft: 8,
            }}
          >
            {loading ? 'Creating…' : 'Create Branch'}
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
  findManagerButton: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  managerCard: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
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
