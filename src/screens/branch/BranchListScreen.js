import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { Card, Subtle, EmptyState, SkeletonBlock } from '../../components/UI';
import { useTheme } from '../../theme/ThemeContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { MaterialIcons } from '@expo/vector-icons';
import { api } from '../../api/client';

export default function BranchListScreen({ navigation }) {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  const { currentWorkspaceId } = useWorkspace();
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);

  const formatBranchDate = (dateValue) => {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return 'Unknown date';
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  useEffect(() => {
    const loadBranches = async () => {
      if (!currentWorkspaceId) {
        setBranches([]);
        return;
      }

      setLoading(true);
      try {
        const data = await api.get(`/workspaces/${currentWorkspaceId}/branches`);
        setBranches(Array.isArray(data) ? data : []);
      } catch (err) {
        setBranches([]);
      } finally {
        setLoading(false);
      }
    };

    loadBranches();
  }, [currentWorkspaceId]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { backgroundColor: theme.colors.card, borderBottomColor: theme.colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <MaterialIcons name="close" size={22} color={theme.colors.textSecondary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Branch Manager</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('CreateBranch')}
          style={[styles.addBtn, { backgroundColor: theme.colors.primary }]}
        >
          <MaterialIcons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
      {loading ? (
        <View style={{ padding: 12 }}>
          <SkeletonBlock height={18} width="40%" />
          <SkeletonBlock height={66} />
          <SkeletonBlock height={66} />
          <SkeletonBlock height={66} />
        </View>
      ) : (
        <FlatList
          data={branches}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{ padding: 12 }}
          renderItem={({ item }) => (
            <Card>
              <View>
                <Text style={{ color: theme.colors.textPrimary, fontWeight: '700', fontSize: 16 }}>{item.name}</Text>
                <Subtle>{`${item.status || 'active'} • ${formatBranchDate(item.createdAt)}`}</Subtle>
                <Text style={{ color: theme.colors.textSecondary, marginTop: 6, fontSize: 12 }}>
                  {item.managerUser?.name
                    ? `Manager: ${item.managerUser.name} (${item.managerUser.email})`
                    : 'Manager: Not assigned'}
                </Text>
              </View>
            </Card>
          )}
          ListEmptyComponent={() => (
            <EmptyState
              icon="account-tree"
              title="No branches yet"
              subtitle="Create a branch to manage stores under this workspace"
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  closeBtn: { padding: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: '700', marginLeft: 10 },
  addBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
