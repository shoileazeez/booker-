import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

export default function ForgotPasswordScreen({ navigation }) {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  const { width } = useWindowDimensions();
  const isCompact = width < 380;
  const cardWidth = Math.min(width - (isCompact ? 24 : 36), 460);
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text style={[styles.brand, { color: theme.colors.textPrimary }]}>BizRecord</Text>
      <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: isCompact ? 20 : 22 }]}>Reset Password</Text>
      <View style={[styles.card, { backgroundColor: theme.colors.card, width: cardWidth, borderColor: theme.colors.border }]}> 
        <Text style={{ color: theme.colors.textSecondary }}>Enter your account email</Text>
        <TextInput
          style={[styles.input, { color: theme.colors.textPrimary, borderColor: theme.colors.border }]}
          placeholder="you@store.com"
          placeholderTextColor={theme.colors.textSecondary}
        />
        <TouchableOpacity style={[styles.button, { backgroundColor: theme.colors.primary }]} onPress={() => navigation.goBack()}>
          <Text style={styles.buttonText}>Send reset link</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', padding: 20, justifyContent: 'center' },
  brand: { fontSize: 28, fontWeight: '700', marginBottom: 12 },
  title: { fontWeight: '700', marginBottom: 12 },
  card: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  input: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  button: { marginTop: 12, padding: 12, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' }
});
