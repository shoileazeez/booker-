import React, { useState } from 'react';
import {
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { AppButton, Card } from '../../components/UI';
import { api } from '../../api/client';
import { showSuccessToast } from '../../utils/toast';

export default function ForgotPasswordScreen({ navigation }) {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  const { width } = useWindowDimensions();
  const isCompact = width < 380;
  const cardWidth = Math.min(width - (isCompact ? 24 : 36), 460);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');

  const handleSendReset = async () => {
    setError(null);
    setNotice('');
    setLoading(true);
    try {
      const trimmedEmail = email.trim();
      const response = await api.post('/auth/forgot-password', {
        email: trimmedEmail,
      });
      setNotice(
        response?.message ||
          'If an account exists for that email, a 6-digit reset code has been sent.',
      );
      showSuccessToast('Reset code sent');
      navigation.navigate('ResetPassword', { email: trimmedEmail });
    } catch (err) {
      setError(err?.message || 'Unable to send reset code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={[styles.brand, { color: theme.colors.textPrimary }]}>
        BizRecord
      </Text>
      <Text
        style={[
          styles.title,
          { color: theme.colors.textPrimary, fontSize: isCompact ? 20 : 22 },
        ]}
      >
        Reset Password
      </Text>
      <Card style={{ width: cardWidth }}>
        <Text style={{ color: theme.colors.textSecondary, marginBottom: 8 }}>
          Enter your account email. We will send a 6-digit reset code.
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              color: theme.colors.textPrimary,
              borderColor: theme.colors.border,
            },
          ]}
          placeholder="you@store.com"
          placeholderTextColor={theme.colors.textSecondary}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          accessible
          accessibilityLabel="Email address"
          returnKeyType="done"
        />
        {error ? (
          <Text style={{ color: theme.colors.danger || '#d32f2f', marginTop: 10 }}>
            {error}
          </Text>
        ) : null}
        {notice ? (
          <Text style={{ color: theme.colors.success || '#388e3c', marginTop: 10 }}>
            {notice}
          </Text>
        ) : null}
        <AppButton
          title={loading ? 'Sending...' : 'Send reset code'}
          onPress={handleSendReset}
          loading={loading}
          disabled={loading || !email.trim()}
          style={{ marginTop: 16 }}
          accessibilityLabel="Send reset code"
        />
        <AppButton
          title="I already have a code"
          onPress={() => navigation.navigate('ResetPassword', { email: email.trim() })}
          variant="secondary"
          style={{ marginTop: 10 }}
          accessibilityLabel="I already have a code"
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
  container: { flex: 1, alignItems: 'center', padding: 20, justifyContent: 'center' },
  brand: { fontSize: 28, fontWeight: '700', marginBottom: 12 },
  title: { fontWeight: '700', marginBottom: 12 },
  input: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
});
