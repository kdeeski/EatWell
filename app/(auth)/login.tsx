import { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { colors } from '../../constants/theme';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setError(null);

    const { error: authError } = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    // Root layout listens for auth state change and redirects automatically
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <View style={styles.header}>
          <Text style={styles.appName}>EatWell</Text>
          <Text style={styles.tagline}>
            What do I feel like tonight?
          </Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.text.placeholder}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={colors.text.placeholder}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
          />

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={styles.submitButton}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={colors.text.inverse} />
              : <Text style={styles.submitButtonText}>
                  {isSignUp ? 'Create account' : 'Sign in'}
                </Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchMode}
            onPress={() => { setIsSignUp(!isSignUp); setError(null); }}
          >
            <Text style={styles.switchModeText}>
              {isSignUp
                ? 'Already have an account? Sign in'
                : "First time? Create an account"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.app },
  inner: {
    flex: 1,
    justifyContent: 'center',
    padding: 28,
  },
  header: { marginBottom: 48, alignItems: 'center' },
  appName: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.brand.primary,
    letterSpacing: -1,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: colors.text.placeholder,
    fontStyle: 'italic',
  },
  form: { gap: 12 },
  input: {
    backgroundColor: colors.background.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: 16,
    fontSize: 16,
    color: colors.text.primary,
  },
  errorText: {
    fontSize: 14,
    color: colors.state.dangerBright,
    textAlign: 'center',
    marginTop: 4,
  },
  submitButton: {
    backgroundColor: colors.brand.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: { color: colors.text.inverse, fontWeight: '700', fontSize: 16 },
  switchMode: { alignItems: 'center', paddingVertical: 8 },
  switchModeText: { fontSize: 14, color: colors.text.muted },
});
