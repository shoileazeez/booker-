import React, { useEffect } from 'react';
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
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { initDb } from './src/storage/sqlite';

const Stack = createNativeStackNavigator();

function RootNavigator() {
  const { user, loading, requiresReAuth } = useAuth();
  const { workspaces, loading: loadingWorkspaces } = useWorkspace();

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
    initDb();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ThemeProvider>
          <WorkspaceProvider>
            <NavigationContainer>
              <RootNavigator />
            </NavigationContainer>
          </WorkspaceProvider>
        </ThemeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
