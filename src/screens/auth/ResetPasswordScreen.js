import React, { useState } from 'react';
import {
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { api } from '../../api/client';
import { useTheme } from '../../theme/ThemeContext';
import { Card, AppButton } from '../../components/UI';

export default function ResetPasswordScreen({ route, navigation }) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const initialEmail = route?.params?.email || '';

  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const isCompact = width < 380;
  const formWidth = Math.min(width - (isCompact ? 24 : 36), 460);

  const handleReset = async () => {
    setError(null);
    setNotice('');
    setLoading(true);
    try {
      await api.post('/auth/reset-password', {
        email: email.trim(),
        code: code.trim(),
        newPassword,
      });
      navigation.replace('Login');
    } catch (err) {
      setError(err?.message || 'Unable to reset password');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setError(null);
    setNotice('');
    setResending(true);
    try {
      const response = await api.post('/auth/forgot-password', {
        email: email.trim(),
      });
      setNotice(
        response?.message ||
          'If an account exists for that email, a fresh reset code has been sent.',
      );
    } catch (err) {
      setError(err?.message || 'Unable to resend reset code');
    } finally {
      setResending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Card style={{ width: formWidth }}>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
          Reset Password
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
          Enter the 6-digit reset code from your email and choose a new password.
        </Text>

        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
          Email
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              color: theme.colors.textPrimary,
              borderColor: theme.colors.border,
            },
          ]}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          accessible
          accessibilityLabel="Email address"
        />

        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
          Reset code
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              color: theme.colors.textPrimary,
              borderColor: theme.colors.border,
            },
          ]}
          value={code}
          onChangeText={setCode}
          placeholder="123456"
          placeholderTextColor={theme.colors.textSecondary}
          keyboardType="number-pad"
          maxLength={6}
          accessible
          accessibilityLabel="Reset code"
        />

        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
          New password
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              color: theme.colors.textPrimary,
              borderColor: theme.colors.border,
            },
          ]}
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="Enter new password"
          placeholderTextColor={theme.colors.textSecondary}
          secureTextEntry
          accessible
          accessibilityLabel="New password"
        />

        {notice ? (
          <Text
            style={{ color: theme.colors.success || '#388e3c', marginBottom: 10 }}
          >
            {notice}
          </Text>
        ) : null}
        {error ? (
          <Text
            style={{ color: theme.colors.danger || '#d32f2f', marginBottom: 10 }}
          >
            {error}
          </Text>
        ) : null}

        <AppButton
          title={loading ? 'Resetting...' : 'Reset password'}
          onPress={handleReset}
          loading={loading}
          disabled={loading || !email.trim() || !code.trim() || !newPassword}
          style={{ marginTop: 14 }}
          accessibilityLabel="Reset password"
        />
        <AppButton
          title={resending ? 'Resending...' : 'Resend code'}
          onPress={handleResendCode}
          loading={resending}
          disabled={resending || !email.trim()}
          variant="secondary"
          style={{ marginTop: 10 }}
          accessibilityLabel="Resend code"
        />
        <AppButton
          title="Back to login"
          onPress={() => navigation.navigate('Login')}
          variant="ghost"
          style={{ marginTop: 10 }}
          accessibilityLabel="Back to login"
        />
      </Card>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 13, marginBottom: 12 },
  label: { fontSize: 12, marginTop: 8 },
  input: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginTop: 6,
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
});
