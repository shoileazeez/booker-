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
  useWindowDimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAuth } from '../context/AuthContext';

const SettingsScreen = function({ navigation }) {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  const workspace = useWorkspace();
  const { user, logout } = useAuth();
  const { width } = useWindowDimensions();

  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);

  const currentWorkspace = workspace.workspaces.find((w) => w.id === workspace.currentWorkspaceId);
  const userRole = user?.role || 'user';
  const contentWidth = Math.min(width - 32, 760);
  const horizontalPadding = width < 380 ? 12 : 16;
  const titleSize = width < 380 ? 24 : 28;
  const subtitleSize = width < 380 ? 14 : 16;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{
        alignItems: 'center',
        paddingHorizontal: horizontalPadding,
        paddingBottom: Platform.OS === 'web' ? 90 : 100
      }}
    >
      <StatusBar barStyle="dark-content" />
      <View style={[styles.screenHeader, { width: contentWidth }]}> 
        <TouchableOpacity
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            }
          }}
          style={[styles.backButton, { borderColor: theme.colors.border, opacity: navigation.canGoBack() ? 1 : 0.35 }]}
          disabled={!navigation.canGoBack()}
        >
          <MaterialIcons name="arrow-back" size={20} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text
          style={[styles.screenTitle, { color: theme.colors.textPrimary, fontSize: titleSize }]}
        >
          Settings
        </Text>
        <Text
          style={[styles.screenSubtitle, { color: theme.colors.textSecondary, fontSize: subtitleSize }]}
        >
          Manage your app preferences
        </Text>
      </View>

      <View
        style={[styles.settingsCard, { backgroundColor: theme.colors.card, width: contentWidth }]}
      >
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <MaterialIcons
              name="palette"
              size={24}
              color={theme.colors.primary}
            />
            <View style={styles.settingText}>
              <Text
                style={[
                  styles.settingTitle,
                  { color: theme.colors.textPrimary }
                ]}
              >
                Dark Mode
              </Text>
              <Text
                style={[
                  styles.settingDescription,
                  { color: theme.colors.textSecondary }
                ]}
              >
                Switch between light and dark theme
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[
              styles.settingToggle,
              {
                backgroundColor: themeContext.darkMode
                  ? theme.colors.primary
                  : theme.colors.border
              }
            ]}
            onPress={themeContext.toggleDarkMode}
          >
            <View
              style={[
                styles.toggleIndicator,
                {
                  transform: [
                    { translateX: themeContext.darkMode ? 20 : 2 }
                  ],
                  backgroundColor: theme.colors.card
                }
              ]}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <MaterialIcons
              name="info"
              size={24}
              color={theme.colors.primary}
            />
            <View style={styles.settingText}>
              <Text
                style={[
                  styles.settingTitle,
                  { color: theme.colors.textPrimary }
                ]}
              >
                About BizRecord
              </Text>
              <Text
                style={[
                  styles.settingDescription,
                  { color: theme.colors.textSecondary }
                ]}
              >
                Version 1.0.0 - Business records and inventory tracking
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View
        style={[styles.settingsCard, { backgroundColor: theme.colors.card, width: contentWidth }]}
      >
        {/* Switch Workspace */}
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <MaterialIcons
              name="business"
              size={24}
              color={theme.colors.primary}
            />
            <View style={styles.settingText}>
              <Text style={[styles.settingTitle, { color: theme.colors.textPrimary }]}>
                Switch Workspace
              </Text>
              <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                {currentWorkspace?.name || 'No workspace selected'}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={function() { setShowWorkspaceModal(true); }}>
            <MaterialIcons name="swap-horiz" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Create New Workspace */}
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <MaterialIcons name="add-business" size={24} color={theme.colors.primary} />
            <View style={styles.settingText}>
              <Text style={[styles.settingTitle, { color: theme.colors.textPrimary }]}>
                Create New Workspace
              </Text>
              <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                Set up a separate workspace
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={function() { navigation.navigate('CreateWorkspace'); }}>
            <MaterialIcons name="add-circle" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Branch Manager */}
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <MaterialIcons name="account-tree" size={24} color={theme.colors.primary} />
            <View style={styles.settingText}>
              <Text style={[styles.settingTitle, { color: theme.colors.textPrimary }]}> 
                Branch Manager
              </Text>
              <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}> 
                View and manage workspace branches
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={function() { navigation.navigate('BranchList'); }}>
            <MaterialIcons name="chevron-right" size={24} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Create Branch */}
        <View style={[styles.settingItem, { borderBottomWidth: 0 }]}> 
          <View style={styles.settingInfo}>
            <MaterialIcons name="add-location-alt" size={24} color={theme.colors.primary} />
            <View style={styles.settingText}>
              <Text style={[styles.settingTitle, { color: theme.colors.textPrimary }]}> 
                Create Branch
              </Text>
              <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}> 
                Add new branch to workspace
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={function() { navigation.navigate('CreateBranch'); }}>
            <MaterialIcons name="add-circle" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <View
        style={[styles.settingsCard, { backgroundColor: theme.colors.card, width: contentWidth }]}
      >
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <MaterialIcons
              name="account-circle"
              size={24}
              color={theme.colors.primary}
            />
            <View style={styles.settingText}>
              <Text
                style={[
                  styles.settingTitle,
                  { color: theme.colors.textPrimary }
                ]}
              >
                Your Role
              </Text>
              <Text
                style={[
                  styles.settingDescription,
                  { color: theme.colors.textSecondary }
                ]}
              >
                {userRole}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Workspace Switcher Modal */}
      <Modal
        visible={showWorkspaceModal}
        animationType="slide"
        transparent={true}
        onRequestClose={function() {
          setShowWorkspaceModal(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: theme.colors.card,
                maxHeight: '80%'
              }
            ]}
          >
            <View style={styles.modalHeader}>
              <Text
                style={[
                  styles.modalTitle,
                  { color: theme.colors.textPrimary }
                ]}
              >
                Switch Workspace
              </Text>
              <TouchableOpacity
                onPress={function() {
                  setShowWorkspaceModal(false);
                }}
              >
                <MaterialIcons
                  name="close"
                  size={24}
                  color={theme.colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {workspace.workspaces.map(function(ws) {
                const isCurrentWorkspace = ws.id === workspace.currentWorkspaceId;
                const roleLabel = userRole;

                return (
                  <TouchableOpacity
                    key={ws.id}
                    style={[
                      styles.workspaceItem,
                      {
                        backgroundColor: isCurrentWorkspace ? theme.colors.primary + '20' : 'transparent',
                        borderColor: isCurrentWorkspace ? theme.colors.primary : theme.colors.border
                      }
                    ]}
                    onPress={function() {
                      workspace.setCurrentWorkspaceId(ws.id);
                      setShowWorkspaceModal(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.roleAssignmentUserName,
                          { color: theme.colors.textPrimary }
                        ]}
                      >
                        {ws.name}
                        {isCurrentWorkspace ? ' ✓' : ''}
                      </Text>
                      <Text
                        style={[
                          styles.roleAssignmentCurrentRole,
                          { color: theme.colors.textSecondary }
                        ]}
                      >
                        Role: {roleLabel}
                      </Text>
                    </View>
                    {isCurrentWorkspace && (
                      <MaterialIcons
                        name="check-circle"
                        size={20}
                        color={theme.colors.primary}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.updateButton,
                  { backgroundColor: theme.colors.primary }
                ]}
                onPress={function() {
                  setShowWorkspaceModal(false);
                }}
              >
                <Text style={styles.updateButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View
        style={[styles.settingsCard, { backgroundColor: theme.colors.card, width: contentWidth }]}
      >
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={logout}
        >
          <Text style={[styles.logoutText, { color: theme.colors.primary }]}>Sign out</Text>
        </TouchableOpacity>
      </View>

    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%'
  },
  screenHeader: {
    paddingHorizontal: 4,
    paddingTop: 20,
    paddingBottom: 12
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
    marginBottom: 4
  },
  screenSubtitle: {
    fontSize: 16
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
    borderBottomColor: '#F3F4F6'
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  settingText: {
    marginLeft: 16,
    flex: 1
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2
  },
  settingDescription: {
    fontSize: 14
  },
  settingToggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    padding: 2,
    justifyContent: 'center'
  },
  toggleIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
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
    elevation: 5
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600'
  },
  modalBody: {
    marginBottom: 24
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center'
  },
  updateButton: {
    marginLeft: 8
  },
  updateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF'
  },
  roleAssignmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 0,
    marginVertical: 8,
    borderBottomWidth: 1
  },
  roleAssignmentUserName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4
  },
  roleAssignmentCurrentRole: {
    fontSize: 12
  },
  roleAssignmentActions: {
    flexDirection: 'row',
    marginLeft: 12
  },
  roleButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginHorizontal: 4
  },
  roleButtonText: {
    fontSize: 12,
    fontWeight: '600'
  },
  logoutButton: {
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 12
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600'
  },
  workspaceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginVertical: 8,
    borderRadius: 8,
    borderWidth: 1
  }
});

export default SettingsScreen;
 