import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Text, TouchableOpacity, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { useAuth } from '@/state/useAuth';
import { ENV } from '@/lib/env';
import { useIOSTheme } from '@/components/ios';

type Mode = 'signin' | 'signup';

interface SocialAuthButtonsProps {
  mode: Mode;
  onSuccess: () => void;
}

const getAppleFullName = (name?: AppleAuthentication.AppleAuthenticationFullName | null) => {
  if (!name) return null;
  return [name.givenName, name.familyName].filter(Boolean).join(' ').trim() || null;
};

export function SocialAuthButtons({ mode, onSuccess }: SocialAuthButtonsProps) {
  const iosTheme = useIOSTheme();
  const { loginWithGoogle, loginWithApple } = useAuth();
  const [loadingProvider, setLoadingProvider] = useState<'google' | 'apple' | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  const googleConfigured = ENV.SOCIAL_GOOGLE_CONFIGURED;

  useEffect(() => {
    if (!googleConfigured || ENV.IS_EXPO_GO) return;

    GoogleSignin.configure({
      webClientId: ENV.GOOGLE_WEB_CLIENT_ID,
      iosClientId: Platform.OS === 'ios' ? ENV.GOOGLE_IOS_CLIENT_ID : undefined,
      offlineAccess: false,
      forceCodeForRefreshToken: false
    });
  }, [googleConfigured]);

  useEffect(() => {
    let mounted = true;
    if (Platform.OS !== 'ios') return;

    AppleAuthentication.isAvailableAsync()
      .then((available) => {
        if (mounted) setAppleAvailable(available);
      })
      .catch(() => {
        if (mounted) setAppleAvailable(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const buttonText = useMemo(() => ({
    google: mode === 'signup' ? 'Continue with Google' : 'Sign in with Google',
    apple: mode === 'signup' ? 'Continue with Apple' : 'Sign in with Apple'
  }), [mode]);

  const handleGoogle = async () => {
    if (!googleConfigured) {
      Alert.alert('Google Sign-In unavailable', 'Google Sign-In is not configured for this build yet.');
      return;
    }
    if (ENV.IS_EXPO_GO) {
      Alert.alert('Development build required', 'Google Sign-In needs a Menorah development or production build, not Expo Go.');
      return;
    }

    setLoadingProvider('google');
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const result = await GoogleSignin.signIn();
      const idToken = (result as any)?.data?.idToken || (result as any)?.idToken;

      if (!idToken) {
        Alert.alert('Google Sign-In failed', 'Google did not return an identity token.');
        return;
      }

      const authResult = await loginWithGoogle(idToken);
      if (authResult.success) {
        onSuccess();
        return;
      }
      Alert.alert('Google Sign-In failed', authResult.message || 'Please try again.');
    } catch (error: any) {
      if (error?.code === statusCodes.SIGN_IN_CANCELLED) return;
      Alert.alert('Google Sign-In failed', error?.message || 'Please try again.');
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleApple = async () => {
    if (Platform.OS !== 'ios' || !appleAvailable) {
      Alert.alert('Apple Sign-In unavailable', 'Sign in with Apple is available on supported iOS devices only.');
      return;
    }

    setLoadingProvider('apple');
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL
        ],
      });

      if (!credential.identityToken) {
        Alert.alert('Apple Sign-In failed', 'Apple did not return an identity token.');
        return;
      }

      const authResult = await loginWithApple({
        identityToken: credential.identityToken,
        authorizationCode: credential.authorizationCode,
        email: credential.email,
        fullName: getAppleFullName(credential.fullName)
      });

      if (authResult.success) {
        onSuccess();
        return;
      }
      Alert.alert('Apple Sign-In failed', authResult.message || 'Please try again.');
    } catch (error: any) {
      if (error?.code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert('Apple Sign-In failed', error?.message || 'Please try again.');
    } finally {
      setLoadingProvider(null);
    }
  };

  const showGoogle = googleConfigured;
  const showApple = Platform.OS === 'ios' && appleAvailable;

  if (!showGoogle && !showApple) return null;

  return (
    <View style={{ gap: iosTheme.spacing.sm, marginBottom: iosTheme.spacing.lg }}>
      {showGoogle ? (
        <TouchableOpacity
          onPress={handleGoogle}
          disabled={Boolean(loadingProvider)}
          activeOpacity={0.86}
          style={{
            minHeight: 52,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: iosTheme.colors.border,
            backgroundColor: iosTheme.colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: iosTheme.spacing.sm,
            opacity: loadingProvider ? 0.7 : 1
          }}
        >
          {loadingProvider === 'google' ? <ActivityIndicator color={iosTheme.colors.primary} /> : null}
          <Text style={{ color: iosTheme.colors.text, fontSize: 15, fontWeight: '800' }}>{buttonText.google}</Text>
        </TouchableOpacity>
      ) : null}

      {showApple ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={mode === 'signup'
            ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
            : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={999}
          style={{ width: '100%', height: 52, opacity: loadingProvider ? 0.7 : 1 }}
          onPress={handleApple}
        />
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: iosTheme.spacing.sm, marginTop: iosTheme.spacing.xs }}>
        <View style={{ flex: 1, height: 1, backgroundColor: iosTheme.colors.border }} />
        <Text style={{ color: iosTheme.colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }}>
          OR USE EMAIL
        </Text>
        <View style={{ flex: 1, height: 1, backgroundColor: iosTheme.colors.border }} />
      </View>
    </View>
  );
}
