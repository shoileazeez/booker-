import React, { useEffect, useState } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useTheme } from '../../theme/ThemeContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { api } from '../../api/client';
import * as offlineStore from '../../storage/offlineStore';
import { Card, Title, AppButton, EmptyState, Subtle } from '../../components/UI';
import UpgradeModal from '../../components/UpgradeModal';
import { MaterialIcons } from '@expo/vector-icons';

const sortMembers = (members = []) =>
  [...members].sort((left, right) => {
    if (left.role === right.role) {
      return String(left.name || left.email || '').localeCompare(
        String(right.name || right.email || ''),
      );
    }
    if (left.role === 'manager') return -1;
    if (right.role === 'manager') return 1;
    return 0;
  });

export default function BranchCreateScreen({ navigation }) {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  const { currentWorkspaceId, setWorkspaces } = useWorkspace();

  const [branchName, setBranchName] = useState('');
  const [location, setLocation] = useState('');
  const [managerQuery, setManagerQuery] = useState('');
  const [selectedManager, setSelectedManager] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('staff');
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradePayload, setUpgradePayload] = useState(null);

  useEffect(() => {
    let active = true;

    const loadTeamMembers = async () => {
      if (!currentWorkspaceId) {
        if (active) {
          setTeamMembers([]);
          setSelectedManager(null);
          setTeamError('');
        }
        return;
      }

      setTeamLoading(true);
      setTeamError('');
      try {
        const data = await api.get(`/workspaces/${currentWorkspaceId}/management/overview`);
        if (!active) return;
        const members = sortMembers(Array.isArray(data?.members) ? data.members : []);
        setTeamMembers(members);
        setSelectedManager((current) => {
          if (!current?.id) return null;
          return members.find((member) => member.id === current.id) || null;
        });
      } catch (err) {
        if (!active) return;
        setTeamMembers([]);
        setSelectedManager(null);
        setTeamError(err?.message || 'Unable to load team members right now.');
      } finally {
        if (active) {
          setTeamLoading(false);
        }
      }
    };

    loadTeamMembers();
    return () => {
      active = false;
    };
  }, [currentWorkspaceId]);

  const getErrorMessage = (err, fallback) => {
    const raw = err?.message ?? fallback;
    if (Array.isArray(raw)) return raw.join(', ');
    if (typeof raw === 'string') return raw;
    return fallback;
  };

  const filteredMembers = sortMembers(
    teamMembers.filter((member) => {
      const query = managerQuery.trim().toLowerCase();
      if (!query) return true;
      return (
        String(member?.name || '').toLowerCase().includes(query) ||
        String(member?.email || '').toLowerCase().includes(query)
      );
    }),
  );

  const managerCount = teamMembers.filter((member) => member.role === 'manager').length;
  const selectableManagers = filteredMembers.filter((member) => member.role === 'manager');

  const handleSelectManager = (member) => {
    if (member.role !== 'manager') {
      Alert.alert('Manager required', 'Only workspace team members with the manager role can be assigned to a branch.');
      return;
    }

    setSelectedManager(member);
    setManagerQuery(member.email);
  };

  const clearSelectedManager = () => {
    setSelectedManager(null);
    setManagerQuery('');
  };

  const handleCreateBranch = async () => {
    if (!branchName.trim() || !location.trim()) {
      Alert.alert('Validation Error', 'Please fill in branch name and location');
      return;
    }

    if (!currentWorkspaceId) {
      Alert.alert('Workspace required', 'Please select a workspace before creating a branch');
      return;
    }

    if (selectedManager && selectedManager.role !== 'manager') {
      Alert.alert('Manager required', 'Please select a team member who already has the manager role.');
      return;
    }

    setLoading(true);
    try {
      const createdBranch = await api.post(`/workspaces/${currentWorkspaceId}/branches`, {
        name: branchName.trim(),
        description: [location.trim(), phone.trim(), address.trim()].filter(Boolean).join(' | '),
        location: location.trim(),
        phone: phone.trim(),
        address: address.trim(),
        managerUserId: selectedManager?.id,
      });

      let followUpMessage = `${branchName.trim()} - ${location.trim()}`;
      const normalizedInviteEmail = inviteEmail.trim().toLowerCase();
      if (normalizedInviteEmail && createdBranch?.id) {
        const inviteResult = await api.post(`/workspaces/${currentWorkspaceId}/team/invite`, {
          email: normalizedInviteEmail,
          role: inviteRole,
          branchId: createdBranch.id,
          branchRole: inviteRole,
        });

        if (inviteResult?.alreadyMember) {
          followUpMessage += `\n\n${normalizedInviteEmail} was added to the branch immediately.`;
        } else {
          followUpMessage += `\n\n${normalizedInviteEmail} was invited to this branch as ${inviteRole}.`;
          if (inviteRole === 'manager' && !selectedManager) {
            followUpMessage += '\nThey will become the branch manager after accepting the invite.';
          }
        }
      }

      Alert.alert('Branch Created', followUpMessage, [
        {
          text: 'OK',
          onPress: () => {
            navigation.goBack();
          },
        },
      ]);
    } catch (err) {
      if (err?.data?.code === 'PLAN_LIMIT_REACHED') {
        setUpgradePayload(err.data);
        setShowUpgradeModal(true);
        return;
      }
      if (!err?.response) {
        Alert.alert('Offline', 'Branch creation requires a connection right now.');
        return;
      }
      Alert.alert('Error', getErrorMessage(err, 'Unable to create branch'));
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
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Title>Create Branch</Title>
            <Subtle>Set branch details, then assign one of your existing workspace managers.</Subtle>
          </View>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <MaterialIcons name="close" size={24} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        </View>

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
        </Card>

        <Card style={{ marginBottom: 16 }}>
          <View style={styles.sectionHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.textPrimary, fontSize: 15, fontWeight: '700' }}>Branch Manager</Text>
              <Subtle>{managerCount} manager{managerCount === 1 ? '' : 's'} available from your current workspace team</Subtle>
            </View>
            <TouchableOpacity onPress={clearSelectedManager} disabled={!selectedManager}>
              <Text style={{ color: selectedManager ? theme.colors.primary : theme.colors.textSecondary, fontWeight: '700' }}>
                Clear
              </Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.card,
                color: theme.colors.textPrimary,
                borderColor: theme.colors.border,
              },
            ]}
            placeholder="Search team members by name or email"
            placeholderTextColor={theme.colors.textSecondary}
            value={managerQuery}
            onChangeText={setManagerQuery}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={{ color: theme.colors.textSecondary, fontSize: 11, marginTop: 6 }}>
            Only team members with the manager role can be assigned. Update their role in Team Management first if needed.
          </Text>

          {selectedManager ? (
            <View style={[styles.selectedManagerCard, { borderColor: theme.colors.success, backgroundColor: `${theme.colors.success}10` }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>{selectedManager.name}</Text>
                <Text style={{ color: theme.colors.textSecondary }}>{selectedManager.email}</Text>
              </View>
              <View style={[styles.roleBadge, { backgroundColor: `${theme.colors.success}18` }]}>
                <Text style={{ color: theme.colors.success, fontSize: 11, fontWeight: '700' }}>Manager selected</Text>
              </View>
            </View>
          ) : null}

          {teamLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={theme.colors.primary} />
              <Text style={{ color: theme.colors.textSecondary, marginTop: 10 }}>Loading workspace team members...</Text>
            </View>
          ) : null}

          {!teamLoading && teamError ? (
            <View style={[styles.infoBox, { borderColor: theme.colors.error, backgroundColor: `${theme.colors.error}10` }]}>
              <Text style={{ color: theme.colors.error, fontSize: 12, fontWeight: '600' }}>{teamError}</Text>
            </View>
          ) : null}

          {!teamLoading && !teamError && teamMembers.length === 0 ? (
            <EmptyState
              icon="group"
              title="No team members found"
              subtitle="Add managers in Team Management before assigning one to a branch."
              style={{ paddingBottom: 8 }}
            />
          ) : null}

          {!teamLoading && !teamError && teamMembers.length > 0 && filteredMembers.length === 0 ? (
            <EmptyState
              icon="person-search"
              title="No matches"
              subtitle="Try a different name or email."
              style={{ paddingBottom: 8 }}
            />
          ) : null}

          {!teamLoading && !teamError && filteredMembers.length > 0 ? (
            <View style={{ marginTop: 12 }}>
              {filteredMembers.slice(0, 8).map((member) => {
                const isManager = member.role === 'manager';
                const isSelected = selectedManager?.id === member.id;
                return (
                  <TouchableOpacity
                    key={member.id}
                    onPress={() => handleSelectManager(member)}
                    style={[
                      styles.memberRow,
                      {
                        borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                        backgroundColor: isSelected ? `${theme.colors.primary}10` : theme.colors.card,
                        opacity: isManager ? 1 : 0.68,
                      },
                    ]}
                  >
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>{member.name}</Text>
                      <Text style={{ color: theme.colors.textSecondary, marginTop: 2 }}>{member.email}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <View style={[styles.roleBadge, { backgroundColor: isManager ? `${theme.colors.success}18` : `${theme.colors.warning}18` }]}>
                        <Text style={{ color: isManager ? theme.colors.success : theme.colors.warning, fontSize: 11, fontWeight: '700' }}>
                          {member.role}
                        </Text>
                      </View>
                      <Text style={{ color: theme.colors.textSecondary, fontSize: 11, marginTop: 6 }}>
                        {isManager ? (isSelected ? 'Assigned' : 'Tap to assign') : 'Promote in Team Management'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          {!teamLoading && !teamError && filteredMembers.length > 8 ? (
            <Text style={{ color: theme.colors.textSecondary, fontSize: 11, marginTop: 10 }}>
              Showing the first 8 matches. Refine your search to narrow the list.
            </Text>
          ) : null}

          {!teamLoading && !teamError && teamMembers.length > 0 && selectableManagers.length === 0 && managerQuery.trim() ? (
            <View style={[styles.infoBox, { borderColor: theme.colors.warning, backgroundColor: `${theme.colors.warning}10` }]}>
              <Text style={{ color: theme.colors.warning, fontSize: 12, fontWeight: '600' }}>
                Matching team members were found, but none of them currently have the manager role.
              </Text>
            </View>
          ) : null}
        </Card>

        <Card style={{ marginBottom: 16 }}>
          <Text style={{ color: theme.colors.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: 6 }}>
            Invite New Team Member
          </Text>
          <Subtle>Optional. Add someone to this branch now instead of waiting to invite them later.</Subtle>

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.card,
                color: theme.colors.textPrimary,
                borderColor: theme.colors.border,
                marginTop: 12,
              },
            ]}
            placeholder="Email address"
            placeholderTextColor={theme.colors.textSecondary}
            value={inviteEmail}
            onChangeText={setInviteEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <View
            style={[
              styles.input,
              {
                padding: 0,
                overflow: 'hidden',
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
                marginTop: 12,
              },
            ]}
          >
            <Picker selectedValue={inviteRole} onValueChange={setInviteRole} style={{ color: theme.colors.textPrimary }}>
              <Picker.Item label="Staff" value="staff" />
              <Picker.Item label="Manager" value="manager" />
            </Picker>
          </View>

          <Text style={{ color: theme.colors.textSecondary, fontSize: 11, marginTop: 8 }}>
            If this email already belongs to your workspace, the person will be added to the branch immediately.
          </Text>
        </Card>

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

        <AppButton
          title={loading ? 'Creating...' : 'Create Branch'}
          icon="add-location-alt"
          variant="primary"
          onPress={handleCreateBranch}
          loading={loading}
          style={styles.submitButton}
        />

        <UpgradeModal
          visible={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          onUpgrade={() => {
            setShowUpgradeModal(false);
            navigation.navigate('Subscription');
          }}
          title="Branch limit reached"
          message={upgradePayload?.message || 'Your plan limit has been reached. Upgrade to create more branches.'}
          plan={upgradePayload?.meta?.plan}
          limit={upgradePayload?.meta?.limit}
          current={upgradePayload?.meta?.current}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  selectedManagerCard: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  roleBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  infoBox: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  loadingWrap: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButton: {
    marginTop: 8,
  },
});
