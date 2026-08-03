import { useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react-native';
import NetworkError from '@/components/ui/NetworkError';
import { IOSButton, IOSCard, IOSScreen, useIOSTheme } from '@/components/ios';
import { useAuth } from '@/state/useAuth';
import { SocialAuthButtons } from '@/components/auth/SocialAuthButtons';

export default function Login({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showNetworkError, setShowNetworkError] = useState(false);
  const [emailFocus, setEmailFocus] = useState(false);
  const [passFocus, setPassFocus] = useState(false);
  const { login } = useAuth();
  const iosTheme = useIOSTheme();

  const handleLogin = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail && !password) {
      Alert.alert('Missing Details', 'Please enter your email and password.');
      return;
    }

    if (!normalizedEmail) {
      Alert.alert('Missing Email', 'Please enter your email address.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    if (!password) {
      Alert.alert('Missing Password', 'Please enter your password.');
      return;
    }

    setLoading(true);
    setShowNetworkError(false);

    try {
      const result = await login(normalizedEmail, password);

      if (result.success) {
        if (result.needsVerification) {
          navigation.navigate('Verify', {
            email: result.email || normalizedEmail,
            flow: result.verificationFlow || 'account',
            requestCode: true,
          });
        } else {
          navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
        }
      } else if (result.message?.includes('Network error')) {
        setShowNetworkError(true);
      } else {
        Alert.alert('Login Failed', result.message || 'Invalid credentials');
      }
    } catch {
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fieldBorder = (focused: boolean) =>
    focused ? iosTheme.colors.primary : iosTheme.colors.border;

  return (
    <IOSScreen
      keyboardAvoiding
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        paddingTop: iosTheme.spacing.xl,
        paddingBottom: iosTheme.spacing.xxxl,
      }}
    >
      <View style={{ alignItems: 'center', marginBottom: iosTheme.spacing.xxl }}>
        <Text style={{ color: iosTheme.colors.textSecondary, fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 280 }}>
          Sign in to continue your mental health journey.
        </Text>
      </View>

      <IOSCard>
        <Text style={{ color: iosTheme.colors.text, fontSize: 28, lineHeight: 34, fontWeight: '900', marginBottom: iosTheme.spacing.xs }}>
          Welcome back
        </Text>
        <Text style={[iosTheme.typography.body, { marginBottom: iosTheme.spacing.xl }]}>
          Your private space is ready when you are.
        </Text>

        <SocialAuthButtons
          mode="signin"
          onSignUpRequired={() => navigation.replace('Register', { socialAccountNotFound: true })}
          onSuccess={(result) => {
            if (result.needsVerification) {
              navigation.navigate('Verify', {
                email: result.email,
                flow: result.verificationFlow || 'account',
                requestCode: true,
              });
              return;
            }
            navigation.reset({
              index: 0,
              routes: [result.needsProfileCompletion
                ? { name: 'EditProfile', params: { fromSocialAuth: true } }
                : { name: 'Tabs' }],
            });
          }}
        />

        <Text style={{ color: iosTheme.colors.text, fontSize: 13, lineHeight: 18, fontWeight: '800', marginBottom: iosTheme.spacing.sm }}>
          Email
        </Text>
        <View
          style={{
            minHeight: 56,
            borderRadius: iosTheme.radius.lg,
            borderWidth: 1.5,
            borderColor: fieldBorder(emailFocus),
            backgroundColor: iosTheme.colors.background,
            paddingHorizontal: iosTheme.spacing.lg,
            flexDirection: 'row',
            alignItems: 'center',
            gap: iosTheme.spacing.md,
            marginBottom: iosTheme.spacing.lg,
          }}
        >
          <Mail size={18} color={emailFocus ? iosTheme.colors.primary : iosTheme.colors.textMuted} strokeWidth={2.2} />
          <TextInput
            value={email}
            onChangeText={setEmail}
            onFocus={() => setEmailFocus(true)}
            onBlur={() => setEmailFocus(false)}
            placeholder="Enter your email"
            placeholderTextColor={iosTheme.colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
            style={{ flex: 1, fontSize: 15, color: iosTheme.colors.text, paddingVertical: 0 }}
          />
        </View>

        <Text style={{ color: iosTheme.colors.text, fontSize: 13, lineHeight: 18, fontWeight: '800', marginBottom: iosTheme.spacing.sm }}>
          Password
        </Text>
        <View
          style={{
            minHeight: 56,
            borderRadius: iosTheme.radius.lg,
            borderWidth: 1.5,
            borderColor: fieldBorder(passFocus),
            backgroundColor: iosTheme.colors.background,
            paddingHorizontal: iosTheme.spacing.lg,
            flexDirection: 'row',
            alignItems: 'center',
            gap: iosTheme.spacing.md,
            marginBottom: iosTheme.spacing.md,
          }}
        >
          <Lock size={18} color={passFocus ? iosTheme.colors.primary : iosTheme.colors.textMuted} strokeWidth={2.2} />
          <TextInput
            value={password}
            onChangeText={setPassword}
            onFocus={() => setPassFocus(true)}
            onBlur={() => setPassFocus(false)}
            placeholder="Enter your password"
            placeholderTextColor={iosTheme.colors.textMuted}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            textContentType="password"
            style={{ flex: 1, fontSize: 15, color: iosTheme.colors.text, paddingVertical: 0 }}
          />
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            style={{ padding: iosTheme.spacing.xs }}
          >
            {showPassword ? (
              <EyeOff size={19} color={iosTheme.colors.textMuted} strokeWidth={2.2} />
            ) : (
              <Eye size={19} color={iosTheme.colors.textMuted} strokeWidth={2.2} />
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => navigation.navigate('Forgot')}
          activeOpacity={0.8}
          style={{ alignSelf: 'flex-end', marginBottom: iosTheme.spacing.xl }}
        >
          <Text style={{ color: iosTheme.colors.primary, fontSize: 13, fontWeight: '800' }}>
            Forgot Password?
          </Text>
        </TouchableOpacity>

        <IOSButton title="Sign In" onPress={handleLogin} loading={loading} iconEnd={ArrowRight} />
      </IOSCard>

      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: iosTheme.spacing.xl }}>
        <Text style={{ color: iosTheme.colors.textSecondary, fontSize: 14 }}>
          Do not have an account?{' '}
        </Text>
        <TouchableOpacity onPress={() => navigation.navigate('Register')} activeOpacity={0.8}>
          <Text style={{ color: iosTheme.colors.primary, fontSize: 14, fontWeight: '900' }}>
            Sign Up
          </Text>
        </TouchableOpacity>
      </View>

      {showNetworkError ? (
        <View style={{ marginTop: iosTheme.spacing.xl }}>
          <NetworkError onRetry={handleLogin} showDiagnostics={true} />
        </View>
      ) : null}
    </IOSScreen>
  );
}
