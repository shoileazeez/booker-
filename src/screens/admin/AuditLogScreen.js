import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { api } from '../../api/client';
import { Card, EmptyState, SkeletonBlock, Subtle, Title } from '../../components/UI';

export default function AuditLogScreen({ navigation, route }) {
  const { theme } = useTheme();
  const { currentWorkspaceId } = useWorkspace();
  const branchId = route?.params?.branchId;
  const branchName = route?.params?.branchName;
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadLogs = useCallback(async (isRefresh = false) => {
    if (!currentWorkspaceId) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await api.get(`/workspaces/${currentWorkspaceId}/audit-logs`, branchId ? { branchId } : undefined);
      setLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      setLogs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [branchId, currentWorkspaceId]);

  useFocusEffect(
    useCallback(() => {
      loadLogs();
    }, [loadLogs]),
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadLogs(true)} />}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 12 }}>
          <MaterialIcons name="arrow-back" size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Title>Audit Logs</Title>
          <Subtle>{branchName ? `${branchName} activity` : 'Workspace activity'}</Subtle>
        </View>
      </View>

      {loading && logs.length === 0 ? (
        <>
          <SkeletonBlock height={86} style={{ marginBottom: 12 }} />
          <SkeletonBlock height={86} style={{ marginBottom: 12 }} />
          <SkeletonBlock height={86} />
        </>
      ) : logs.length > 0 ? (
        logs.map((log, index) => (
          <Card key={log.id || `${log.action}-${index}`}>
            <Text style={{ color: theme.colors.textPrimary, fontWeight: '700', marginBottom: 4 }}>
              {log.action}
            </Text>
            <Subtle>{log.entity_type || log.entityType} {log.entity_id ? `• ${log.entity_id}` : ''}</Subtle>
            <Subtle>{new Date(log.created_at || log.createdAt || Date.now()).toLocaleString()}</Subtle>
            {log.metadata ? (
              <Text style={{ color: theme.colors.textSecondary, marginTop: 8, fontSize: 12 }}>
                {typeof log.metadata === 'string' ? log.metadata : JSON.stringify(log.metadata)}
              </Text>
            ) : null}
          </Card>
        ))
      ) : (
        <EmptyState
          icon="history"
          title="No audit logs yet"
          subtitle="Admin and branch actions will appear here."
        />
      )}
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
});
