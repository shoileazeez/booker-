import React, { useEffect, useState } from 'react';
import { Modal } from 'react-native';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Card, AppButton } from '../../components/UI';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { showSuccessToast } from '../../utils/toast';

export default function LoginScreen({ navigation, route }) {
  const { login, setBiometricOptIn, isBiometricAvailable, getBiometricOptIn } = useAuth();
  const themeContext = useTheme();
  const theme = themeContext.theme;
  const { width } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showBiometricModal, setShowBiometricModal] = useState(false);
  const isCompact = width < 380;
  const formWidth = Math.min(width - (isCompact ? 24 : 36), 460);

  useEffect(() => {
    const flashMessage = route?.params?.flashMessage;
    if (flashMessage) {
      showSuccessToast(flashMessage);
      navigation.setParams({ flashMessage: undefined });
    }
  }, [navigation, route?.params?.flashMessage]);

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      showSuccessToast('Signed in successfully');
      // After successful login, prompt for biometric opt-in (Android only)
      if (
        Platform.OS === 'android' &&
        (await isBiometricAvailable()) &&
        !(await getBiometricOptIn())
      ) {
        setShowBiometricModal(true);
      }
    } catch (err) {
      const message = err?.message || 'Unable to sign in';
      setError(message);
      if (/email not verified/i.test(message)) {
        navigation.replace('VerifyEmail', {
          email: email.trim(),
          fromLogin: true,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.hero}>
          <Text style={[styles.logo, { color: theme.colors.textPrimary, fontSize: isCompact ? 32 : 38 }]}>BizRecord</Text>
          <Text style={[styles.tagline, { color: theme.colors.textSecondary }]}>Track stock, sales, debt and expenses in one place</Text>
        </View>
        <Card style={{ width: formWidth }}>
          <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Email</Text>
          <TextInput
            style={[styles.input, { color: theme.colors.textPrimary, borderColor: theme.colors.border }]}
            value={email}
            onChangeText={setEmail}
            placeholder="you@store.com"
            placeholderTextColor={theme.colors.textSecondary}
            autoCapitalize="none"
            keyboardType="email-address"
            accessible
            accessibilityLabel="Email address"
          />
          <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Password</Text>
          <TextInput
            style={[styles.input, { color: theme.colors.textPrimary, borderColor: theme.colors.border }]}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••"
            placeholderTextColor={theme.colors.textSecondary}
            secureTextEntry
            accessible
            accessibilityLabel="Password"
          />
          <AppButton
            title="Sign in"
            onPress={handleLogin}
            loading={loading}
            disabled={loading || !email.trim() || !password}
            style={{ marginTop: 14 }}
            accessibilityLabel="Sign in"
          />
          {error ? <Text style={{ color: theme.colors.danger || '#d32f2f', marginTop: 10 }}>{error}</Text> : null}
          <AppButton
            title="Forgot password?"
            onPress={() => navigation.navigate('Forgot')}
            variant="secondary"
            style={{ marginTop: 10 }}
            accessibilityLabel="Forgot password"
          />
          <AppButton
            title="Create an account"
            onPress={() => navigation.navigate('Register')}
            variant="secondary"
            style={{ marginTop: 10 }}
            accessibilityLabel="Create an account"
          />
        </Card>
      </KeyboardAvoidingView>
      {/* Biometric opt-in modal */}
      <Modal
        visible={showBiometricModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBiometricModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
          <Card style={{ padding: 24, borderRadius: 16, width: 320, alignItems: 'center' }}>
            <Text style={{ fontWeight: '700', fontSize: 18, marginBottom: 10, color: theme.colors.textPrimary }}>Enable Fingerprint Unlock?</Text>
            <Text style={{ color: theme.colors.textSecondary, marginBottom: 18, textAlign: 'center' }}>
              For faster offline access, you can unlock the app with your fingerprint next time.
            </Text>
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <AppButton
                title="Enable"
                onPress={async () => {
                  await setBiometricOptIn(true);
                  setShowBiometricModal(false);
                }}
                style={{ marginRight: 8, minWidth: 90 }}
              />
              <AppButton
                title="Not now"
                onPress={async () => {
                  await setBiometricOptIn(false);
                  setShowBiometricModal(false);
                }}
                variant="secondary"
                style={{ minWidth: 90 }}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  hero: { alignItems: 'center', marginBottom: 18 },
  logo: { fontWeight: '700', marginBottom: 24 },
  tagline: { fontSize: 13, marginTop: -14, textAlign: 'center' },
  form: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  label: { fontSize: 12, marginTop: 8 },
  input: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginTop: 6,
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  button: { padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 6 },
  buttonText: { color: '#fff', fontWeight: '700' }
});
