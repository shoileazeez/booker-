import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';

export default function ReAuthScreen({ navigation }) {
  const { user, unlockSession, logout } = useAuth();
  const themeContext = useTheme();
  const theme = themeContext.theme;
  const { width } = useWindowDimensions();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const isCompact = width < 380;
  const formWidth = Math.min(width - (isCompact ? 24 : 36), 460);

  const displayName = user?.name || user?.email?.split('@')[0] || 'there';

  const handleUnlock = async () => {
    if (!password) {
      setError('Please enter your password.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await unlockSession(password);
    } catch (err) {
      setError(err?.message || 'Incorrect password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.hero}>
        <Text style={[styles.logo, { color: theme.colors.textPrimary, fontSize: isCompact ? 32 : 38 }]}>
          BizRecord
        </Text>
      </View>

      <View style={[styles.form, { backgroundColor: theme.colors.card, width: formWidth, borderColor: theme.colors.border }]}>
        <Text style={[styles.welcome, { color: theme.colors.textPrimary }]}>
          Welcome back, {displayName}!
        </Text>

        {/* Read-only email badge */}
        <View style={[styles.emailBadge, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
          <Text style={[styles.emailText, { color: theme.colors.textSecondary }]}>{user?.email}</Text>
        </View>

        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Password</Text>
        <TextInput
          style={[styles.input, { color: theme.colors.textPrimary, borderColor: theme.colors.border }]}
          value={password}
          onChangeText={setPassword}
          placeholder="Enter your password"
          placeholderTextColor={theme.colors.textSecondary}
          secureTextEntry
          autoFocus
          onSubmitEditing={handleUnlock}
          returnKeyType="go"
        />

        {error ? (
          <Text style={{ color: theme.colors.danger || '#d32f2f', marginBottom: 10, fontSize: 13 }}>
            {error}
          </Text>
        ) : null}

        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.colors.primary, opacity: loading ? 0.7 : 1 }]}
          onPress={handleUnlock}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Continue</Text>
          )}
        </TouchableOpacity>

        <View style={styles.links}>
          <TouchableOpacity onPress={() => navigation.navigate('Forgot')}>
            <Text style={[styles.link, { color: theme.colors.primary }]}>Forgot your password?</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={logout}>
            <Text style={[styles.linkSecondary, { color: theme.colors.textSecondary }]}>
              Sign into another account
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  hero: { alignItems: 'center', marginBottom: 18 },
  logo: { fontWeight: '700', marginBottom: 4 },
  form: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  welcome: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  emailBadge: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  emailText: { fontSize: 14 },
  label: { fontSize: 12, marginBottom: 4 },
  input: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  button: { padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 2 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  links: { marginTop: 18, alignItems: 'center', gap: 12 },
  link: { fontSize: 13, fontWeight: '500' },
  linkSecondary: { fontSize: 13 },
});
