import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { MaterialIcons } from '@expo/vector-icons';

export default function WorkspaceSettingsScreen({ navigation }) {
  const { theme } = useTheme();
  const workspace = useWorkspace();

  const currentId = workspace.currentWorkspaceId;

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]} contentContainerStyle={{ padding: 16 }}>
      <View style={{ marginBottom: 12 }}>
        <Text style={{ color: theme.colors.textPrimary, fontSize: 18, fontWeight: '700' }}>Workspaces</Text>
        <Text style={{ color: theme.colors.textSecondary, marginTop: 6 }}>Select the active workspace for this device.</Text>
      </View>

      {workspace.workspaces.map((ws) => {
        const isCurrent = ws.id === currentId;
        return (
          <TouchableOpacity
            key={ws.id}
            style={[styles.item, { borderColor: isCurrent ? theme.colors.primary : theme.colors.border, backgroundColor: isCurrent ? `${theme.colors.primary}12` : 'transparent' }]}
            onPress={() => {
              workspace.setCurrentWorkspaceId(ws.id);
              navigation.goBack();
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>{ws.name}</Text>
              <Text style={{ color: theme.colors.textSecondary }}>{ws.role || 'member'}</Text>
            </View>
            <MaterialIcons name={isCurrent ? 'check-circle' : 'chevron-right'} size={20} color={theme.colors.primary} />
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  item: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center' },
});
