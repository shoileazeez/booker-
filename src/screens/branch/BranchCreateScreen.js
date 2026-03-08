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
import { Card, Title } from '../../components/UI';
import { MaterialIcons } from '@expo/vector-icons';

export default function BranchCreateScreen({ navigation }) {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  const workspace = useWorkspace();

  const [branchName, setBranchName] = useState('');
  const [location, setLocation] = useState('');
  const [manager, setManager] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  const handleCreateBranch = () => {
    if (!branchName || !location) {
      Alert.alert('Validation Error', 'Please fill in branch name and location');
      return;
    }

    if (!workspace.isAdmin()) {
      Alert.alert('Permission Denied', 'Only workspace admins can create branches');
      return;
    }

    Alert.alert(
      'Branch Created',
      `${branchName} - ${location}`,
      [
        {
          text: 'OK',
          onPress: () => {
            navigation.goBack();
          },
        },
      ]
    );
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

        {/* Permission Check */}
        {!workspace.isAdmin() && (
          <Card style={{ backgroundColor: theme.colors.warning + '20', borderLeftWidth: 4, borderLeftColor: theme.colors.warning, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row' }}>
              <MaterialIcons name="lock" size={20} color={theme.colors.warning} style={{ marginRight: 8 }} />
              <Text style={{ color: theme.colors.warning, flex: 1 }}>
                Only workspace admins can create branches
              </Text>
            </View>
          </Card>
        )}

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
            editable={workspace.isAdmin()}
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
            editable={workspace.isAdmin()}
          />

          <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 8, marginTop: 12 }}>Branch Manager</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.card,
                color: theme.colors.textPrimary,
                borderColor: theme.colors.border,
              },
            ]}
            placeholder="Manager name"
            placeholderTextColor={theme.colors.textSecondary}
            value={manager}
            onChangeText={setManager}
            editable={workspace.isAdmin()}
          />
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
            editable={workspace.isAdmin()}
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
            editable={workspace.isAdmin()}
          />
        </Card>

        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            {
              backgroundColor: workspace.isAdmin() ? theme.colors.primary : theme.colors.border,
            },
          ]}
          onPress={handleCreateBranch}
          disabled={!workspace.isAdmin()}
        >
          <MaterialIcons name="add-location-alt" size={20} color={workspace.isAdmin() ? '#fff' : theme.colors.textSecondary} />
          <Text
            style={{
              color: workspace.isAdmin() ? '#fff' : theme.colors.textSecondary,
              fontWeight: '600',
              marginLeft: 8,
            }}
          >
            Create Branch
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
