import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from './src/theme/ThemeContext';
import { WorkspaceProvider, useWorkspace } from './src/context/WorkspaceContext';
import MainTabs from './src/navigation/MainTabs';
import AuthStack from './src/navigation/AuthStack';
import ReAuthStack from './src/navigation/ReAuthStack';
import WorkspaceSetupScreen from './src/screens/workspace/WorkspaceSetupScreen';
import WorkspaceInvitesScreen from './src/screens/workspace/WorkspaceInvitesScreen';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { CustomerSelectProvider } from './src/context/CustomerSelectContext';
import { initDb } from './src/storage/sqlite';
import { api } from './src/api/client';
import { initializeNotificationInbox } from './src/services/notificationInbox';
import { ensurePushChannel } from './src/services/pushNotifications';

const Stack = createNativeStackNavigator();

function RootNavigator() {
  const { user, loading, requiresReAuth } = useAuth();
  const { workspaces, loading: loadingWorkspaces } = useWorkspace();
  const [pendingInvites, setPendingInvites] = useState([]);

  useEffect(() => {
    if (!user || requiresReAuth || loading) {
      setPendingInvites([]);
      return;
    }

    let mounted = true;
    const loadPendingInvites = async () => {
      try {
        const invitesRes = await api.get('/workspaces/invites/pending').catch(() => []);
        if (mounted) {
          setPendingInvites(Array.isArray(invitesRes) ? invitesRes : []);
        }
      } catch {
        if (mounted) {
          setPendingInvites([]);
        }
      }
    };

    loadPendingInvites();

    return () => {
      mounted = false;
    };
  }, [user, requiresReAuth, loading]);

  if (loading || (user && loadingWorkspaces && !requiresReAuth)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        <Stack.Screen name="Auth" component={AuthStack} />
      ) : requiresReAuth ? (
        <Stack.Screen name="ReAuthFlow" component={ReAuthStack} />
      ) : pendingInvites.length > 0 && workspaces.length === 0 ? (
        <Stack.Screen name="JoinWorkspace" component={WorkspaceInvitesScreen} />
      ) : workspaces.length === 0 ? (
        <Stack.Screen name="WorkspaceSetup" component={WorkspaceSetupScreen} />
      ) : (
        <Stack.Screen name="Main" component={MainTabs} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  useEffect(() => {
    let cleanupInboxListener = null;
    initDb().catch(() => {
      // Keep app boot resilient if local SQLite is temporarily unavailable.
    });
    ensurePushChannel().catch(() => null);
    initializeNotificationInbox()
      .then((cleanup) => {
        cleanupInboxListener = cleanup;
      })
      .catch(() => null);

    return () => {
      if (typeof cleanupInboxListener === 'function') {
        cleanupInboxListener();
      }
    };
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ThemeProvider>
          <WorkspaceProvider>
            <CustomerSelectProvider>
              <NavigationContainer>
                <RootNavigator />
              </NavigationContainer>
            </CustomerSelectProvider>
          </WorkspaceProvider>
        </ThemeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
