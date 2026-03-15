import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const themeContext = useTheme();
  const theme = themeContext.theme;
  const { width } = useWindowDimensions();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const isCompact = width < 380;
  const formWidth = Math.min(width - (isCompact ? 24 : 36), 500);

  const handleRegister = async () => {
    setError(null);

    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      setError('Please fill out all fields');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await register({ name: name.trim(), phone: phone.trim(), email: email.trim(), password });
    } catch (err) {
      setError(err?.message || 'Unable to register');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { backgroundColor: theme.colors.background }]}
        keyboardShouldPersistTaps="handled"
      >
      <View style={styles.hero}>
        <Text style={[styles.logo, { color: theme.colors.textPrimary, fontSize: isCompact ? 32 : 38 }]}>BizRecord</Text>
        <Text style={[styles.tagline, { color: theme.colors.textSecondary }]}>Create your account to start managing your business</Text>
      </View>
      <View style={[styles.form, { backgroundColor: theme.colors.card, width: formWidth, borderColor: theme.colors.border }]}> 
        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Name</Text>
        <TextInput
          style={[styles.input, { color: theme.colors.textPrimary, borderColor: theme.colors.border }]}
          value={name}
          onChangeText={setName}
          placeholder="Your full name"
          placeholderTextColor={theme.colors.textSecondary}
        />

        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Phone</Text>
        <TextInput
          style={[styles.input, { color: theme.colors.textPrimary, borderColor: theme.colors.border }]}
          value={phone}
          onChangeText={setPhone}
          placeholder="08012345678"
          placeholderTextColor={theme.colors.textSecondary}
          keyboardType="phone-pad"
        />

        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Email</Text>
        <TextInput
          style={[styles.input, { color: theme.colors.textPrimary, borderColor: theme.colors.border }]}
          value={email}
          onChangeText={setEmail}
          placeholder="you@store.com"
          placeholderTextColor={theme.colors.textSecondary}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Password</Text>
        <TextInput
          style={[styles.input, { color: theme.colors.textPrimary, borderColor: theme.colors.border }]}
          value={password}
          onChangeText={setPassword}
          placeholder="••••••"
          placeholderTextColor={theme.colors.textSecondary}
          secureTextEntry
        />

        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Confirm Password</Text>
        <TextInput
          style={[styles.input, { color: theme.colors.textPrimary, borderColor: theme.colors.border }]}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="••••••"
          placeholderTextColor={theme.colors.textSecondary}
          secureTextEntry
        />

        {error ? (
          <Text style={{ color: theme.colors.danger || '#d32f2f', marginBottom: 10 }}>{error}</Text>
        ) : null}

        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.colors.primary, opacity: loading ? 0.7 : 1 }]}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create account</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={{ color: theme.colors.primary, marginTop: 12, textAlign: 'center' }}>
            Already have an account? Sign in
          </Text>
        </TouchableOpacity>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
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
