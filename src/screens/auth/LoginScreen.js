import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const themeContext = useTheme();
  const theme = themeContext.theme;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err?.message || 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text style={[styles.logo, { color: theme.colors.textPrimary }]}>Booker</Text>
      <View style={[styles.form, { backgroundColor: theme.colors.card }]}> 
        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Email</Text>
        <TextInput
          style={[styles.input, { color: theme.colors.textPrimary }]}
          value={email}
          onChangeText={setEmail}
          placeholder="you@store.com"
          placeholderTextColor={theme.colors.textSecondary}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Password</Text>
        <TextInput
          style={[styles.input, { color: theme.colors.textPrimary }]}
          value={password}
          onChangeText={setPassword}
          placeholder="••••••"
          placeholderTextColor={theme.colors.textSecondary}
          secureTextEntry
        />
        <TouchableOpacity onPress={() => navigation.navigate('Forgot')}>
          <Text style={{ color: theme.colors.primary, marginBottom: 12 }}>Forgot password?</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Register')}>
          <Text style={{ color: theme.colors.primary, marginBottom: 12 }}>Create an account</Text>
        </TouchableOpacity>

        {error ? <Text style={{ color: theme.colors.danger || '#d32f2f', marginBottom: 10 }}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.colors.primary, opacity: loading ? 0.7 : 1 }]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  logo: { fontSize: 36, fontWeight: '700', marginBottom: 24 },
  form: { width: '100%', borderRadius: 14, padding: 16 },
  label: { fontSize: 12, marginTop: 8 },
  input: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, marginTop: 6, backgroundColor: 'transparent' },
  button: { padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 6 },
  buttonText: { color: '#fff', fontWeight: '700' }
});
