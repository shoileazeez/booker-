import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { api } from '../api/client';
import { Card, AppButton, SkeletonBlock, EmptyState, Subtle, Title } from '../components/UI';

const ROLE_OPTIONS = ['staff', 'manager'];

export default function TeamManagementScreen({ navigation }) {
  const { theme } = useTheme();
  const { currentWorkspaceId, workspaces } = useWorkspace();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('staff');
  const [submittingInvite, setSubmittingInvite] = useState(false);

  const currentWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === currentWorkspaceId) || null,
    [workspaces, currentWorkspaceId],
  );
  const currentWorkspaceRole = currentWorkspace?.role || 'staff';
  const assignableRoles = useMemo(
    () => (currentWorkspaceRole === 'owner' ? ROLE_OPTIONS : ['staff']),
    [currentWorkspaceRole],
  );

  const loadOverview = useCallback(async (showRefresh = false) => {
    if (!currentWorkspaceId) {
      setOverview(null);
      return;
    }

    if (showRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const data = await api.get(`/workspaces/${currentWorkspaceId}/management/overview`);
      setOverview(data);
    } catch (err) {
      Alert.alert('Team management', err?.message || 'Unable to load workspace team data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentWorkspaceId]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (!assignableRoles.includes(inviteRole)) {
      setInviteRole(assignableRoles[0] || 'staff');
    }
  }, [assignableRoles, inviteRole]);

  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      Alert.alert('Validation', 'Enter a team member email.');
      return;
    }

    setSubmittingInvite(true);
    try {
      try {
        const foundUser = await api.get(`/workspaces/${currentWorkspaceId}/users/search`, { email });
        if (foundUser?.alreadyMember) {
          Alert.alert('Already added', `${email} already belongs to this workspace.`);
          return;
        }
      } catch (err) {
        // Best-effort lookup only.
      }

      const inviteResult = await api.post(`/workspaces/${currentWorkspaceId}/team/invite`, {
        email,
        role: inviteRole,
      });

      setInviteEmail('');
      setInviteRole('staff');
      await loadOverview(true);

      if (inviteResult?.delivery === 'manual_code_required' && inviteResult?.inviteCode) {
        Alert.alert(
          'Invite created',
          `Email delivery is not configured yet.\n\nInvite code for ${email}: ${inviteResult.inviteCode}`,
        );
        return;
      }

      Alert.alert('Invite sent', `Invitation sent to ${email}. They must accept it with their code.`);
    } catch (err) {
      Alert.alert('Invite failed', err?.message || 'Unable to send invitation.');
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleRoleChange = async (member, role) => {
    try {
      await api.put(`/workspaces/${currentWorkspaceId}/users/${member.id}/role`, { role });
      await loadOverview(true);
    } catch (err) {
      Alert.alert('Role update failed', err?.message || 'Unable to update member role.');
    }
  };

  const handleRevoke = async (member) => {
    Alert.alert(
      'Revoke access',
      `Remove ${member.name} from this workspace?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/workspaces/${currentWorkspaceId}/users/${member.id}`);
              await loadOverview(true);
            } catch (err) {
              Alert.alert('Revoke failed', err?.message || 'Unable to revoke access.');
            }
          },
        },
      ],
    );
  };

  const stats = useMemo(() => overview?.totals || {
    branchCount: 0,
    staffCount: 0,
    inventoryCount: 0,
    salesAmount: 0,
    salesCount: 0,
    pendingDebtAmount: 0,
  }, [overview]);

  if (loading && !overview) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background, padding: 16 }]}>
        <SkeletonBlock height={26} width="45%" style={{ marginBottom: 18 }} />
        <SkeletonBlock height={120} style={{ marginBottom: 14 }} />
        <SkeletonBlock height={120} style={{ marginBottom: 14 }} />
        <SkeletonBlock height={120} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadOverview(true)} />}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Title>Team Management</Title>
          <Subtle>{overview?.workspace?.name || 'Workspace'} access, branches and staff performance</Subtle>
        </View>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="close" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <Card style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Workspace Snapshot</Text>
        <View style={styles.statGrid}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: theme.colors.textPrimary }]}>{stats.branchCount}</Text>
            <Subtle>Branches</Subtle>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: theme.colors.textPrimary }]}>{stats.staffCount}</Text>
            <Subtle>Team members</Subtle>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: theme.colors.textPrimary }]}>{stats.inventoryCount}</Text>
            <Subtle>Inventory items</Subtle>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: theme.colors.textPrimary }]}>N{Number(stats.salesAmount || 0).toLocaleString()}</Text>
            <Subtle>Total sales</Subtle>
          </View>
        </View>
      </Card>

      <Card style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Invite Team Member</Text>
        <TextInput
          style={[styles.input, { color: theme.colors.textPrimary, borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}
          placeholder="Email address"
          placeholderTextColor={theme.colors.textSecondary}
          value={inviteEmail}
          onChangeText={setInviteEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <View style={[styles.pickerWrap, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
          <Picker selectedValue={inviteRole} onValueChange={setInviteRole} style={{ color: theme.colors.textPrimary }}>
            <Picker.Item label="Staff" value="staff" />
            {currentWorkspaceRole === 'owner' ? <Picker.Item label="Manager" value="manager" /> : null}
          </Picker>
        </View>
        <AppButton
          title={submittingInvite ? 'Sending...' : 'Send Invite'}
          icon="send"
          onPress={handleInvite}
          loading={submittingInvite}
        />
        <Subtle>
          {currentWorkspaceRole === 'owner'
            ? 'Owners can invite staff and managers.'
            : 'Managers can invite staff only.'}
        </Subtle>
      </Card>

      <Card style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Team Members</Text>
        {overview?.members?.length ? overview.members.map((member) => (
          <View key={member.id} style={[styles.memberRow, { borderColor: theme.colors.border }]}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.memberName, { color: theme.colors.textPrimary }]}>{member.name}</Text>
              <Subtle>{member.email}</Subtle>
              <Subtle>
                Sales: {member.salesCount} • N{Number(member.salesAmount || 0).toLocaleString()}
              </Subtle>
            </View>
            <View style={{ width: 122 }}>
              <View style={[styles.pickerWrap, { borderColor: theme.colors.border, backgroundColor: theme.colors.background, marginBottom: 8 }]}>
                <Picker
                  selectedValue={member.role}
                  onValueChange={(value) => handleRoleChange(member, value)}
                  enabled={member.role !== 'owner'}
                  style={{ color: theme.colors.textPrimary }}
                >
                  {member.role === 'owner' ? <Picker.Item label="Owner" value="owner" /> : null}
                  {ROLE_OPTIONS.map((role) => (
                    <Picker.Item key={role} label={role[0].toUpperCase() + role.slice(1)} value={role} />
                  ))}
                </Picker>
              </View>
              <TouchableOpacity
                style={[styles.revokeButton, { borderColor: theme.colors.error, opacity: member.role === 'owner' ? 0.45 : 1 }]}
                onPress={() => handleRevoke(member)}
                disabled={member.role === 'owner'}
              >
                <Text style={{ color: theme.colors.error, fontWeight: '700', fontSize: 12 }}>Revoke</Text>
              </TouchableOpacity>
            </View>
          </View>
        )) : (
          <EmptyState icon="group" title="No team members yet" subtitle="Invite staff and managers to this workspace." />
        )}
      </Card>

      <Card style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Pending Invites</Text>
        {overview?.pendingInvites?.length ? overview.pendingInvites.map((invite) => (
          <View key={invite.id} style={[styles.simpleRow, { borderColor: theme.colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.textPrimary, fontWeight: '600' }}>{invite.email}</Text>
              <Subtle>{invite.role} • {new Date(invite.createdAt).toLocaleDateString()}</Subtle>
            </View>
            <Text style={{ color: theme.colors.warning || theme.colors.textSecondary, fontWeight: '700' }}>
              {invite.status}
            </Text>
          </View>
        )) : (
          <EmptyState icon="mail-outline" title="No pending invites" subtitle="New invitations will appear here until accepted." />
        )}
      </Card>

      <Card style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Branches</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => navigation.push('AuditLogs')} style={{ marginRight: 14 }}>
              <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Audit logs</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.push('BranchList')}>
              <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Open all</Text>
            </TouchableOpacity>
          </View>
        </View>
        {overview?.branches?.length ? overview.branches.map((branch) => (
          <TouchableOpacity
            key={branch.id}
            style={[styles.simpleRow, { borderColor: theme.colors.border }]}
            onPress={() => navigation.push('BranchDetail', { branchId: branch.id })}
            activeOpacity={0.8}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>{branch.name}</Text>
              <Subtle>
                Staff: {branch.staffCount} • Inventory: {branch.inventoryCount}
              </Subtle>
              <Subtle>
                Sales: {branch.salesCount} • N{Number(branch.salesAmount || 0).toLocaleString()}
              </Subtle>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>
                N{Number(branch.pendingDebtAmount || 0).toLocaleString()}
              </Text>
              <Subtle>Pending debt</Subtle>
            </View>
          </TouchableOpacity>
        )) : (
          <EmptyState icon="account-tree" title="No branches yet" subtitle="Create branches to split teams and track performance." />
        )}
      </Card>

      <Card style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Staff Sales Performance</Text>
        {overview?.staffPerformance?.length ? overview.staffPerformance.map((item, index) => (
          <View key={`${item.userId}-${item.branchId}-${index}`} style={[styles.simpleRow, { borderColor: theme.colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.textPrimary, fontWeight: '600' }}>{item.name}</Text>
              <Subtle>{item.branchName}</Subtle>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>
                N{Number(item.salesAmount || 0).toLocaleString()}
              </Text>
              <Subtle>{item.salesCount} sale(s)</Subtle>
            </View>
          </View>
        )) : (
          <EmptyState icon="analytics" title="No staff sales yet" subtitle="Sales recorded by staff will appear here." />
        )}
      </Card>
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
  section: {
    marginBottom: 16,
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
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statItem: {
    width: '47%',
    paddingVertical: 10,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  input: {
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
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  revokeButton: {
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  simpleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
  },
});
