import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Platform,
  StatusBar,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAuth } from '../context/AuthContext';
import UpgradeModal from '../components/UpgradeModal';
import { api } from '../api/client';

const SettingsScreen = function({ navigation }) {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  const workspace = useWorkspace();
  const { user, logout } = useAuth();
  const { width } = useWindowDimensions();

  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradePayload, setUpgradePayload] = useState(null);
  const [pendingInviteCount, setPendingInviteCount] = useState(0);
  const [pendingInviteUnavailable, setPendingInviteUnavailable] = useState(false);

  const currentWorkspace = workspace.currentWorkspace || workspace.workspaces.find((w) => w.id === workspace.currentWorkspaceId);
  const currentBranch = workspace.currentBranch || workspace.branches?.find((b) => b.id === workspace.currentBranchId);
  const workspaceAccessBlocked = !!currentWorkspace && String(currentWorkspace?.status || 'active').toLowerCase() !== 'active';
  const userRole = currentWorkspace?.role || user?.role || 'user';
  const isWorkspaceOwner = userRole === 'owner';
  const canManageWorkspace = !workspaceAccessBlocked && (userRole === 'owner' || userRole === 'manager');
  const normalizedPlan = user?.plan === 'pro' ? 'pro' : 'basic';
  const planLimit = normalizedPlan === 'pro' ? 3 : 1;
  const ownedWorkspacesCount = (workspace.workspaces || []).filter(
    (item) => String(item?.role || '').toLowerCase() === 'owner',
  ).length;
  const trialDaysLeft = user?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(user.trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : 0;
  const contentWidth = Math.min(width - 32, 760);
  const horizontalPadding = width < 380 ? 12 : 16;
  const titleSize = width < 380 ? 24 : 28;
  const subtitleSize = width < 380 ? 14 : 16;

  const openUpgradeModal = (feature) => {
    setUpgradePayload({
      message:
        normalizedPlan === 'basic'
          ? 'Your Basic plan allows only 1 workspace. Upgrade to create more workspaces and branches.'
          : 'You have reached your Pro plan workspace limit. Upgrade to continue creating more workspaces and branches.',
      meta: {
        plan: normalizedPlan,
        limit: planLimit,
        current: ownedWorkspacesCount,
        feature,
      },
    });
    setShowUpgradeModal(true);
  };

  const handleCreateWorkspace = () => {
    if (ownedWorkspacesCount >= planLimit) {
      openUpgradeModal('workspace.create');
      return;
    }
    navigation.navigate('CreateWorkspace');
  };

  useFocusEffect(
    React.useCallback(() => {
      let active = true;

      const loadPendingInvites = async () => {
        try {
          const invites = await api.get('/workspaces/invites/pending');
          if (active) {
            setPendingInviteCount(Array.isArray(invites) ? invites.length : 0);
            setPendingInviteUnavailable(false);
          }
        } catch (err) {
          if (active) {
            setPendingInviteCount(0);
            setPendingInviteUnavailable(true);
          }
        }
      };

      loadPendingInvites();
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{
        alignItems: 'center',
        paddingHorizontal: horizontalPadding,
        paddingBottom: Platform.OS === 'web' ? 90 : 100,
      }}
      accessibilityLabel="Settings screen"
    >
      <StatusBar barStyle="dark-content" />
      <View style={[styles.screenHeader, { width: contentWidth, marginBottom: 8 }]}>
        <TouchableOpacity
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            }
          }}
          style={[styles.backButton, { borderColor: theme.colors.border, opacity: navigation.canGoBack() ? 1 : 0.35 }]}
          disabled={!navigation.canGoBack()}
          accessibilityLabel="Go back"
        >
          <MaterialIcons name="arrow-back" size={20} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.screenTitle, { color: theme.colors.textPrimary, fontSize: titleSize }]} accessibilityRole="header">
          Settings
        </Text>
        <Text style={[styles.screenSubtitle, { color: theme.colors.textSecondary, fontSize: subtitleSize }]}>
          Manage your app preferences
        </Text>
      </View>

      <View style={[styles.settingsCard, { backgroundColor: theme.colors.card, width: contentWidth }]}>
        {workspaceAccessBlocked ? (
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <MaterialIcons name="lock-clock" size={24} color={theme.colors.warning} />
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: theme.colors.textPrimary }]}>Workspace access paused</Text>
                <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                  {currentWorkspace?.name || 'This workspace'} is {String(currentWorkspace?.status || 'inactive').replace(/_/g, ' ')}. Come online and renew billing to continue using protected business screens.
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => {
              if (!isWorkspaceOwner) {
                Alert.alert('Permission required', 'Only workspace owners can manage subscriptions.');
                return;
              }
              navigation.navigate('Subscription');
            }}>
              <MaterialIcons name="chevron-right" size={24} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <MaterialIcons name="palette" size={24} color={theme.colors.primary} />
            <View style={styles.settingText}>
              <Text style={[styles.settingTitle, { color: theme.colors.textPrimary }]}>Dark Mode</Text>
              <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                Switch between light and dark theme
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[
              styles.settingToggle,
              {
                backgroundColor: themeContext.darkMode ? theme.colors.primary : theme.colors.border,
              },
            ]}
            onPress={themeContext.toggleDarkMode}
          >
            <View
              style={[
                styles.toggleIndicator,
                {
                  transform: [{ translateX: themeContext.darkMode ? 20 : 2 }],
                  backgroundColor: theme.colors.card,
                },
              ]}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <MaterialIcons name="info" size={24} color={theme.colors.primary} />
            <View style={styles.settingText}>
              <Text style={[styles.settingTitle, { color: theme.colors.textPrimary }]}>About BizRecord</Text>
              <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                Version 1.0.0 - Business records and inventory tracking
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={[styles.settingsCard, { backgroundColor: theme.colors.card, width: contentWidth }]}>
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <MaterialIcons name="workspace-premium" size={24} color={theme.colors.primary} />
            <View style={styles.settingText}>
              <Text style={[styles.settingTitle, { color: theme.colors.textPrimary }]}>Current Plan</Text>
              <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                {normalizedPlan.toUpperCase()} • {ownedWorkspacesCount}/{planLimit} owned workspaces
                {user?.trialStatus === 'active' ? ` • Trial: ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left` : ''}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => {
            if (!isWorkspaceOwner) {
              Alert.alert('Permission required', 'Only workspace owners can upgrade the workspace plan.');
              return;
            }
            openUpgradeModal('plan.view');
          }}>
            <MaterialIcons name="arrow-upward" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <MaterialIcons name="business" size={24} color={theme.colors.primary} />
            <View style={styles.settingText}>
              <Text style={[styles.settingTitle, { color: theme.colors.textPrimary }]}>Switch Workspace</Text>
              <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                {currentWorkspace?.name || 'No workspace selected'}
              </Text>
            </View>
          </View>
            <TouchableOpacity onPress={() => navigation.navigate('UserSettings')}>
            <MaterialIcons name="swap-horiz" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <MaterialIcons name="storefront" size={24} color={theme.colors.primary} />
            <View style={styles.settingText}>
              <Text style={[styles.settingTitle, { color: theme.colors.textPrimary }]}>Active Branch</Text>
              <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                {currentBranch?.name || 'No branch selected'}
              </Text>
              <View style={styles.scopeBadgeRow}>
                <View style={[styles.scopeBadge, { backgroundColor: `${theme.colors.primary}18` }]}>
                  <Text style={[styles.scopeBadgeText, { color: theme.colors.primary }]}>
                    {userRole === 'owner' ? 'Owner: all branches' : 'Scoped to branch'}
                  </Text>
                </View>
                <View style={[styles.scopeBadge, { backgroundColor: `${theme.colors.warning}18` }]}>
                  <Text style={[styles.scopeBadgeText, { color: theme.colors.warning }]}>
                    {currentBranch ? 'Permissions active' : 'Pick a branch'}
                  </Text>
                </View>
              </View>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => setShowBranchModal(true)}
            disabled={!workspace.branches?.length}
          >
            <MaterialIcons name="swap-horiz" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <MaterialIcons name="login" size={24} color={theme.colors.primary} />
            <View style={styles.settingText}>
              <Text style={[styles.settingTitle, { color: theme.colors.textPrimary }]}>Join Workspace</Text>
              <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                {pendingInviteUnavailable
                  ? 'Invite count unavailable offline. Connect to refresh pending invites.'
                  : pendingInviteCount > 0
                  ? `${pendingInviteCount} pending invite${pendingInviteCount === 1 ? '' : 's'} waiting for you`
                  : 'Accept a workspace invite with your email code'}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('JoinWorkspace')} style={styles.joinWorkspaceAction}>
            {pendingInviteCount > 0 ? (
              <View style={[styles.inviteCountBadge, { backgroundColor: theme.colors.primary }]}>
                <Text style={styles.inviteCountText}>{pendingInviteCount}</Text>
              </View>
            ) : null}
            <MaterialIcons name="chevron-right" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <MaterialIcons name="add-business" size={24} color={theme.colors.primary} />
            <View style={styles.settingText}>
              <Text style={[styles.settingTitle, { color: theme.colors.textPrimary }]}>Create New Workspace</Text>
              <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                Set up a separate workspace
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={handleCreateWorkspace}>
            <MaterialIcons name="add-circle" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={[styles.settingItem, !canManageWorkspace && styles.disabledSettingItem]}>
          <View style={styles.settingInfo}>
            <MaterialIcons name="group" size={24} color={theme.colors.primary} />
            <View style={styles.settingText}>
              <Text style={[styles.settingTitle, { color: theme.colors.textPrimary }]}>Team Management</Text>
              <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                {workspaceAccessBlocked ? 'Unavailable until this workspace billing is renewed online' : 'Invite and manage workspace team members'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => {
              if (!canManageWorkspace && workspaceAccessBlocked) {
                Alert.alert('Billing required', 'This workspace is not active. Come online and renew billing to manage team access.');
                return;
              }
              if (canManageWorkspace) {
                navigation.navigate('TeamManagement');
              }
            }}
            disabled={!canManageWorkspace}
          >
            <MaterialIcons name="group-add" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={[styles.settingItem, { borderBottomWidth: 0 }, !canManageWorkspace && styles.disabledSettingItem]}>
          <View style={styles.settingInfo}>
            <MaterialIcons name="account-tree" size={24} color={theme.colors.primary} />
            <View style={styles.settingText}>
              <Text style={[styles.settingTitle, { color: theme.colors.textPrimary }]}>Branch Management</Text>
              <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                {workspaceAccessBlocked ? 'Unavailable until this workspace billing is renewed online' : 'View branch performance, managers and branch staffing'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => {
              if (!canManageWorkspace && workspaceAccessBlocked) {
                Alert.alert('Billing required', 'This workspace is not active. Come online and renew billing to manage branches.');
                return;
              }
              if (canManageWorkspace) {
                navigation.push('BranchList');
              }
            }}
            disabled={!canManageWorkspace}
          >
            <MaterialIcons name="chevron-right" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.settingsCard, { backgroundColor: theme.colors.card, width: contentWidth }]}>
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <MaterialIcons name="account-circle" size={24} color={theme.colors.primary} />
            <View style={styles.settingText}>
              <Text style={[styles.settingTitle, { color: theme.colors.textPrimary }]}>Your Role</Text>
              <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>{userRole}</Text>
            </View>
          </View>
        </View>
      </View>

      <Modal
        visible={showWorkspaceModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowWorkspaceModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.card, maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>Switch Workspace</Text>
              <TouchableOpacity onPress={() => setShowWorkspaceModal(false)}>
                <MaterialIcons name="close" size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {workspace.workspaces.map((ws) => {
                const isCurrentWorkspace = ws.id === workspace.currentWorkspaceId;
                const roleLabel = ws.role || user?.role || 'user';

                return (
                  <TouchableOpacity
                    key={ws.id}
                    style={[
                      styles.workspaceItem,
                      {
                        backgroundColor: isCurrentWorkspace ? `${theme.colors.primary}20` : 'transparent',
                        borderColor: isCurrentWorkspace ? theme.colors.primary : theme.colors.border,
                      },
                    ]}
                    onPress={() => {
                      workspace.setCurrentWorkspaceId(ws.id);
                      setShowWorkspaceModal(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.roleAssignmentUserName, { color: theme.colors.textPrimary }]}>
                        {ws.name}
                        {isCurrentWorkspace ? ' ✓' : ''}
                      </Text>
                      <Text style={[styles.roleAssignmentCurrentRole, { color: theme.colors.textSecondary }]}>
                        Role: {roleLabel}
                      </Text>
                    </View>
                    {isCurrentWorkspace ? (
                      <MaterialIcons name="check-circle" size={20} color={theme.colors.primary} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.updateButton, { backgroundColor: theme.colors.primary }]}
                onPress={() => setShowWorkspaceModal(false)}
              >
                <Text style={styles.updateButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showBranchModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowBranchModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.card, maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>Switch Branch</Text>
              <TouchableOpacity onPress={() => setShowBranchModal(false)}>
                <MaterialIcons name="close" size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {(workspace.branches || []).map((branch) => {
                const isCurrentBranch = branch.id === workspace.currentBranchId;
                return (
                  <TouchableOpacity
                    key={branch.id}
                    style={[
                      styles.workspaceItem,
                      {
                        backgroundColor: isCurrentBranch ? `${theme.colors.primary}20` : 'transparent',
                        borderColor: isCurrentBranch ? theme.colors.primary : theme.colors.border,
                      },
                    ]}
                    onPress={() => {
                      workspace.setCurrentBranchId(branch.id);
                      setShowBranchModal(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.roleAssignmentUserName, { color: theme.colors.textPrimary }]}>
                        {branch.name}
                        {isCurrentBranch ? ' ✓' : ''}
                      </Text>
                      <Text style={[styles.roleAssignmentCurrentRole, { color: theme.colors.textSecondary }]}>
                        {branch.location || branch.status || 'active'}
                      </Text>
                    </View>
                    {isCurrentBranch ? (
                      <MaterialIcons name="check-circle" size={20} color={theme.colors.primary} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.updateButton, { backgroundColor: theme.colors.primary }]}
                onPress={() => setShowBranchModal(false)}
              >
                <Text style={styles.updateButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={[styles.settingsCard, { backgroundColor: theme.colors.card, width: contentWidth }]}>
        <View style={[styles.settingItem, { borderBottomWidth: 0 }]}>
          <View style={styles.settingInfo}>
            <MaterialIcons name="payments" size={24} color={theme.colors.primary} />
            <View style={styles.settingText}>
              <Text style={[styles.settingTitle, { color: theme.colors.textPrimary }]}>Subscription & Billing</Text>
              <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                Manage plan, add-ons and usage
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('Subscription')}>
            <MaterialIcons name="chevron-right" size={24} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.settingsCard, { backgroundColor: theme.colors.card, width: contentWidth }]}>
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Text style={[styles.logoutText, { color: theme.colors.primary }]}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        onUpgrade={() => {
          setShowUpgradeModal(false);
          navigation.navigate('Subscription');
        }}
        title="Upgrade required"
        message={upgradePayload?.message}
        plan={upgradePayload?.meta?.plan || normalizedPlan}
        limit={upgradePayload?.meta?.limit || planLimit}
        current={upgradePayload?.meta?.current || ownedWorkspacesCount}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
  screenHeader: {
    paddingHorizontal: 4,
    paddingTop: 20,
    paddingBottom: 12,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  screenSubtitle: {
    fontSize: 16,
  },
  settingsCard: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  disabledSettingItem: {
    opacity: 0.55,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingText: {
    marginLeft: 16,
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 14,
  },
  settingToggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    padding: 2,
    justifyContent: 'center',
  },
  toggleIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  modalBody: {
    marginBottom: 24,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  updateButton: {
    marginLeft: 8,
  },
  updateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  roleAssignmentUserName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  roleAssignmentCurrentRole: {
    fontSize: 12,
  },
  logoutButton: {
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 12,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
  },
  workspaceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  joinWorkspaceAction: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inviteCountBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginRight: 8,
  },
  inviteCountText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  scopeBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  scopeBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 8,
    marginBottom: 4,
  },
  scopeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
});

export default SettingsScreen;
