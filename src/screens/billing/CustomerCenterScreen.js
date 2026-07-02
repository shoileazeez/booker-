import React from 'react';
import { View, StyleSheet } from 'react-native';
import { RevenueCatCustomerCenter } from 'react-native-purchases-ui';
import { useTheme } from '../../theme/ThemeContext';

export default function CustomerCenterScreen({ navigation }) {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <RevenueCatCustomerCenter
        onAction={(action) => {
          if (action === 'RESTORE_COMPLETED' || action === 'RESTORE_ERROR') {
            // handled internally by Customer Center
          }
        }}
        onDismiss={() => {
          navigation?.goBack();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
