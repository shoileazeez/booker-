import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Picker } from '@react-native-picker/picker';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { api } from '../../api/client';
import { AppButton, Card, EmptyState, SkeletonBlock, Subtle, Title } from '../../components/UI';

const PERMISSIONS = [
  { key: 'inventory.view', label: 'View inventory' },
  { key: 'inventory.manage', label: 'Manage inventory' },
  { key: 'sales.view', label: 'View sales' },
  { key: 'sales.create', label: 'Create sales' },
  { key: 'debts.view', label: 'View debts' },
  { key: 'debts.manage', label: 'Manage debts' },
  { key: 'customers.view', label: 'View customers' },
  { key: 'customers.manage', label: 'Manage customers' },
  { key: 'reports.view', label: 'View reports' },
];

export default function BranchDetailScreen({ navigation, route }) {
  const { theme } = useTheme();
  const { currentWorkspaceId, branches } = useWorkspace();
  const branchId = route?.params?.branchId;
  const [details, setDetails] = useState(null);
  const [workspaceOverview, setWorkspaceOverview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [memberModalVisible, setMemberModalVisible] = useState(false);
  const [savingMember, setSavingMember] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState('staff');
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const [editingMember, setEditingMember] = useState(null);
  const [memberMode, setMemberMode] = useState('existing');

  const loadData = useCallback(async (isRefresh = false) => {
    if (!currentWorkspaceId || !branchId) {
      setDetails(null);
      setWorkspaceOverview(null);
      return;
    }

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [branchData, overview] = await Promise.all([
        api.get(`/workspaces/${currentWorkspaceId}/branches/${branchId}/details`),
        api.get(`/workspaces/${currentWorkspaceId}/management/overview`),
      ]);
      setDetails(branchData || null);
      setWorkspaceOverview(overview || null);
    } catch (err) {
      Alert.alert('Branch details', err?.message || 'Unable to load branch details.');
      setDetails(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [branchId, currentWorkspaceId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const branch = details?.branch;
  const metrics = details?.metrics || {};
  const recentTransactions = Array.isArray(details?.recentTransactions)
    ? details.recentTransactions
    : [];
  const branchUsers = Array.isArray(branch?.users) ? branch.users : [];
  const workspaceMembers = Array.isArray(workspaceOverview?.members)
    ? workspaceOverview.members
    : [];

  const assignableMembers = useMemo(() => {
    const assignedIds = new Set(branchUsers.map((user) => user.id));
    return workspaceMembers.filter((member) => !assignedIds.has(member.id));
  }, [branchUsers, workspaceMembers]);

  const resetMemberModal = () => {
    setEditingMember(null);
    setSelectedUserId('');
    setInviteEmail('');
    setSelectedRole('staff');
    setSelectedPermissions([]);
    setMemberMode('existing');
  };

  const openAssignModal = () => {
    resetMemberModal();
    setMemberModalVisible(true);
  };

  const openEditModal = (member) => {
    setEditingMember(member);
    setSelectedUserId(member.id);
    setSelectedRole(member.role || 'staff');
    setSelectedPermissions(Array.isArray(member.permissions) ? member.permissions : []);
    setMemberModalVisible(true);
  };

  const togglePermission = (permissionKey) => {
    setSelectedPermissions((current) =>
      current.includes(permissionKey)
        ? current.filter((item) => item !== permissionKey)
        : [...current, permissionKey],
    );
  };

  const handleSaveMember = async () => {
    const userId = editingMember?.id || selectedUserId;
    const normalizedInviteEmail = inviteEmail.trim().toLowerCase();
    if (!editingMember && memberMode === 'invite' && !normalizedInviteEmail) {
      Alert.alert('Branch member', 'Enter an email address first.');
      return;
    }
    if (!editingMember && memberMode !== 'invite' && !userId) {
      Alert.alert('Branch member', 'Select a workspace user first.');
      return;
    }

    setSavingMember(true);
    try {
      const payload = {
        role: selectedRole,
        permissions: selectedPermissions,
      };
      if (editingMember) {
        await api.put(
          `/workspaces/${currentWorkspaceId}/branches/${branchId}/users/${userId}`,
          payload,
        );
      } else if (memberMode === 'invite') {
        await api.post(`/workspaces/${currentWorkspaceId}/team/invite`, {
          email: normalizedInviteEmail,
          role: selectedRole,
          branchId,
          branchRole: selectedRole,
          permissions: selectedPermissions,
        });
      } else {
        await api.post(
          `/workspaces/${currentWorkspaceId}/branches/${branchId}/users/${userId}`,
          payload,
        );
      }
      setMemberModalVisible(false);
      resetMemberModal();
      await loadData(true);
    } catch (err) {
      Alert.alert('Branch member', err?.message || 'Unable to save branch member.');
    } finally {
      setSavingMember(false);
    }
  };

  const handleRemoveMember = (member) => {
    Alert.alert(
      'Remove branch access',
      `Remove ${member.name} from this branch?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(
                `/workspaces/${currentWorkspaceId}/branches/${branchId}/users/${member.id}`,
              );
              await loadData(true);
            } catch (err) {
              Alert.alert('Branch member', err?.message || 'Unable to remove branch user.');
            }
          },
        },
      ],
    );
  };

  if (loading && !details) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background, padding: 16 }]}>
        <SkeletonBlock height={28} width="45%" style={{ marginBottom: 16 }} />
        <SkeletonBlock height={140} style={{ marginBottom: 12 }} />
        <SkeletonBlock height={160} style={{ marginBottom: 12 }} />
        <SkeletonBlock height={180} />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadData(true)}
          />
        }
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
            <MaterialIcons name="arrow-back" size={22} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Title>{branch?.name || 'Branch'}</Title>
            <Subtle>{branch?.location || branch?.address || 'Branch detail view'}</Subtle>
          </View>
        </View>

        {!branch ? (
          <EmptyState
            icon="store"
            title="Branch details unavailable"
            subtitle="Reconnect and try again to load branch analytics."
          />
        ) : (
          <>
            <Card style={{ marginBottom: 16 }}>
              <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Overview</Text>
              <Subtle>Status: {branch.status || 'active'}</Subtle>
              <Subtle>Manager: {branch.managerUser?.name || 'Not assigned'}</Subtle>
              <Subtle>Branch users: {branchUsers.length}</Subtle>
              <View style={styles.actionRow}>
                <AppButton
                  title="Assign Team"
                  icon="person-add"
                  onPress={openAssignModal}
                  style={{ flex: 1, marginRight: 8 }}
                />
                <AppButton
                  title="Audit Logs"
                  icon="history"
                  variant="secondary"
                  onPress={() =>
                    navigation.push('AuditLogs', {
                      branchId,
                      branchName: branch.name,
                    })
                  }
                  style={{ flex: 1, marginLeft: 8 }}
                />
              </View>
              <View style={[styles.actionRow, { marginTop: 10 }]}>
                <AppButton
                  title="Stock Transfer"
                  icon="swap-horiz"
                  onPress={() => {
                    if ((branches || []).length < 2) {
                      Alert.alert('Stock transfer', 'You need at least two accessible branches before transferring stock.');
                      return;
                    }
                    navigation.push('StockTransfer', {
                      sourceBranchId: branchId,
                      sourceBranchName: branch.name,
                    });
                  }}
                  style={{ flex: 1 }}
                />
              </View>
            </Card>

            <Card style={{ marginBottom: 16 }}>
              <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Analytics</Text>
              <View style={styles.metricRow}>
                <Text style={{ color: theme.colors.textPrimary }}>Inventory items</Text>
                <Text style={[styles.metricValue, { color: theme.colors.textPrimary }]}>{metrics.inventoryCount || 0}</Text>
              </View>
              <View style={styles.metricRow}>
                <Text style={{ color: theme.colors.textPrimary }}>Customers</Text>
                <Text style={[styles.metricValue, { color: theme.colors.textPrimary }]}>{metrics.customerCount || 0}</Text>
              </View>
              <View style={styles.metricRow}>
                <Text style={{ color: theme.colors.textPrimary }}>Sales</Text>
                <Text style={[styles.metricValue, { color: theme.colors.textPrimary }]}>
                  {metrics.salesCount || 0} | N{Number(metrics.salesAmount || 0).toLocaleString()}
                </Text>
              </View>
              <View style={styles.metricRow}>
                <Text style={{ color: theme.colors.textPrimary }}>Pending debt</Text>
                <Text style={[styles.metricValue, { color: theme.colors.textPrimary }]}>
                  N{Number(metrics.pendingDebtAmount || 0).toLocaleString()}
                </Text>
              </View>
            </Card>

            <Card style={{ marginBottom: 16 }}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary, marginBottom: 0 }]}>Branch Team</Text>
                <TouchableOpacity onPress={openAssignModal}>
                  <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Add user</Text>
                </TouchableOpacity>
              </View>
              {branchUsers.length > 0 ? branchUsers.map((member) => (
                <View key={member.id} style={[styles.memberRow, { borderColor: theme.colors.border }]}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={[styles.memberName, { color: theme.colors.textPrimary }]}>{member.name}</Text>
                    <Subtle>{member.email}</Subtle>
                    <Subtle>
                      {member.role} | {(member.permissions || []).join(', ') || 'default permissions'}
                    </Subtle>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity onPress={() => openEditModal(member)} style={styles.iconButton}>
                      <MaterialIcons name="tune" size={20} color={theme.colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleRemoveMember(member)} style={styles.iconButton}>
                      <MaterialIcons name="delete-outline" size={20} color={theme.colors.error} />
                    </TouchableOpacity>
                  </View>
                </View>
              )) : (
                <EmptyState
                  icon="group"
                  title="No branch users yet"
                  subtitle="Assign workspace team members to this branch."
                />
              )}
            </Card>

            <Card>
              <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Recent activity</Text>
              {recentTransactions.length > 0 ? recentTransactions.map((item) => (
                <View key={item.id} style={[styles.metricRow, { paddingVertical: 10 }]}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={{ color: theme.colors.textPrimary, fontWeight: '600' }}>
                      {item.type} | N{Number(item.totalAmount || 0).toLocaleString()}
                    </Text>
                    <Subtle>{new Date(item.createdAt).toLocaleString()}</Subtle>
                  </View>
                  <Text style={{ color: theme.colors.textSecondary }}>{item.status || 'pending'}</Text>
                </View>
              )) : (
                <EmptyState
                  icon="timeline"
                  title="No recent transactions"
                  subtitle="Branch transactions will appear here."
                />
              )}
            </Card>
          </>
        )}
      </ScrollView>

      <Modal
        visible={memberModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setMemberModalVisible(false);
          resetMemberModal();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>
                {editingMember ? 'Edit Branch Member' : 'Assign Branch Member'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setMemberModalVisible(false);
                  resetMemberModal();
                }}
              >
                <MaterialIcons name="close" size={22} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {!editingMember ? (
              <>
                <View style={styles.modeRow}>
                  <TouchableOpacity
                    onPress={() => setMemberMode('existing')}
                    style={[
                      styles.modeButton,
                      {
                        borderColor: memberMode === 'existing' ? theme.colors.primary : theme.colors.border,
                        backgroundColor: memberMode === 'existing' ? `${theme.colors.primary}10` : theme.colors.background,
                      },
                    ]}
                  >
                    <Text style={{ color: memberMode === 'existing' ? theme.colors.primary : theme.colors.textPrimary, fontWeight: '700' }}>
                      Existing member
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setMemberMode('invite')}
                    style={[
                      styles.modeButton,
                      {
                        borderColor: memberMode === 'invite' ? theme.colors.primary : theme.colors.border,
                        backgroundColor: memberMode === 'invite' ? `${theme.colors.primary}10` : theme.colors.background,
                      },
                    ]}
                  >
                    <Text style={{ color: memberMode === 'invite' ? theme.colors.primary : theme.colors.textPrimary, fontWeight: '700' }}>
                      Invite by email
                    </Text>
                  </TouchableOpacity>
                </View>

                {memberMode === 'invite' ? (
                  <TextInput
                    style={[
                      styles.emailInput,
                      {
                        color: theme.colors.textPrimary,
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.background,
                      },
                    ]}
                    placeholder="Email address"
                    placeholderTextColor={theme.colors.textSecondary}
                    value={inviteEmail}
                    onChangeText={setInviteEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                ) : (
                  <View style={[styles.pickerWrap, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
                    <Picker
                      selectedValue={selectedUserId}
                      onValueChange={setSelectedUserId}
                      style={{ color: theme.colors.textPrimary }}
                    >
                      <Picker.Item label="Select workspace member" value="" />
                      {assignableMembers.map((member) => (
                        <Picker.Item
                          key={member.id}
                          label={`${member.name} (${member.email})`}
                          value={member.id}
                        />
                      ))}
                    </Picker>
                  </View>
                )}

                {memberMode === 'invite' ? (
                  <Subtle>This can invite a new person or add an existing workspace member directly to this branch.</Subtle>
                ) : null}
              </>
            ) : null}

            <View style={[styles.pickerWrap, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
              <Picker
                selectedValue={selectedRole}
                onValueChange={setSelectedRole}
                style={{ color: theme.colors.textPrimary }}
              >
                <Picker.Item label="Staff" value="staff" />
                <Picker.Item label="Manager" value="manager" />
              </Picker>
            </View>

            <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary, marginTop: 6 }]}>Permissions</Text>
            <ScrollView style={{ maxHeight: 220 }}>
              {PERMISSIONS.map((permission) => {
                const enabled = selectedPermissions.includes(permission.key);
                return (
                  <TouchableOpacity
                    key={permission.key}
                    style={[styles.permissionRow, { borderColor: theme.colors.border }]}
                    onPress={() => togglePermission(permission.key)}
                  >
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={{ color: theme.colors.textPrimary, fontWeight: '600' }}>
                        {permission.label}
                      </Text>
                      <Subtle>{permission.key}</Subtle>
                    </View>
                    <MaterialIcons
                      name={enabled ? 'check-box' : 'check-box-outline-blank'}
                      size={22}
                      color={enabled ? theme.colors.primary : theme.colors.textSecondary}
                    />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={[styles.actionRow, { marginTop: 14 }]}>
              <AppButton
                title={savingMember ? 'Saving...' : 'Save'}
                icon="save"
                onPress={handleSaveMember}
                loading={savingMember}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  closeBtn: {
    marginRight: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  metricValue: {
    fontWeight: '700',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingVertical: 12,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  iconButton: {
    padding: 8,
    marginLeft: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    borderRadius: 18,
    padding: 18,
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  pickerWrap: {
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 10,
    overflow: 'hidden',
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
  },
});
