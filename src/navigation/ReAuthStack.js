import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ReAuthScreen from '../screens/auth/ReAuthScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';

const Stack = createNativeStackNavigator();

export default function ReAuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ReAuth" component={ReAuthScreen} />
      <Stack.Screen name="Forgot" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
}
