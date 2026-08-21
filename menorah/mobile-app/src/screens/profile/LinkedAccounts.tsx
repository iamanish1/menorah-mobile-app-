import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import {
  GoogleSignin,
  isCancelledResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import {
  Apple,
  ArrowLeft,
  CheckCircle2,
  Chrome,
  KeyRound,
  Link2,
  ShieldCheck,
} from 'lucide-react-native';
import Input from '@/components/ui/Input';
import { ENV } from '@/lib/env';
import { LinkedProviders, SocialProvider, api } from '@/lib/api';
import { useAuth } from '@/state/useAuth';
import { palettes } from '@/theme/colors';
import { useThemeMode } from '@/theme/ThemeProvider';

const providerLinked = (linkedProviders: LinkedProviders | undefined, provider: SocialProvider) => {
  if (Array.isArray(linkedProviders)) return linkedProviders.includes(provider);
  return Boolean(linkedProviders?.[provider]);
};

export default function LinkedAccounts({ navigation }: any) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const isDark = scheme === 'dark';
  const headerBg = isDark ? colors.primaryDark : colors.primary;
  const { user, updateUser, refreshUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<SocialProvider | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  const googleAvailable = ENV.SOCIAL_GOOGLE_CONFIGURED && !ENV.IS_EXPO_GO;
  const isEligible = user?.role === 'user' && user.isEmailVerified;
  const googleLinked = providerLinked(user?.linkedProviders, 'google');
  const appleLinked = providerLinked(user?.linkedProviders, 'apple');

  useEffect(() => {
    if (!googleAvailable) return;

    GoogleSignin.configure({
      webClientId: ENV.GOOGLE_WEB_CLIENT_ID,
      iosClientId: Platform.OS === 'ios' ? ENV.GOOGLE_IOS_CLIENT_ID : undefined,
      offlineAccess: false,
      forceCodeForRefreshToken: false,
    });
  }, [googleAvailable]);

  useEffect(() => {
    let mounted = true;
    if (Platform.OS !== 'ios') return undefined;

    AppleAuthentication.isAvailableAsync()
      .then(available => {
        if (mounted) setAppleAvailable(available);
      })
      .catch(() => {
        if (mounted) setAppleAvailable(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const accountSummary = useMemo(() => [
    { provider: 'google' as const, title: 'Google', linked: googleLinked },
    { provider: 'apple' as const, title: 'Apple', linked: appleLinked },
  ], [appleLinked, googleLinked]);

  const ensureReauthenticated = () => {
    if (!isEligible) {
      Alert.alert('Account not eligible', 'Only verified patient accounts can link a social sign-in provider.');
      return false;
    }

    if (!currentPassword) {
      Alert.alert('Current password required', 'Enter your current password before linking a sign-in provider.');
      return false;
    }

    return true;
  };

  const linkProvider = async (provider: SocialProvider, providerToken: string) => {
    try {
      const response = await api.linkSocialProvider({
        provider,
        providerToken,
        currentPassword,
      });

      if (!response.success) {
        Alert.alert('Could not link account', response.message || 'Please try again.');
        return;
      }

      if (response.data?.user) {
        updateUser(response.data.user);
      } else {
        await refreshUser();
      }
      Alert.alert('Account linked', `${provider === 'google' ? 'Google' : 'Apple'} can now be used to sign in to this account.`);
    } finally {
      // Never retain a re-authentication password after an OAuth attempt.
      setCurrentPassword('');
    }
  };

  const handleGoogleLink = async () => {
    if (!ensureReauthenticated()) return;
    if (!googleAvailable) {
      Alert.alert('Google unavailable', 'Google Sign-In is not configured for this build.');
      return;
    }

    setLoadingProvider('google');
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const result = await GoogleSignin.signIn();
      if (isCancelledResponse(result)) return;

      const providerToken = result.data.idToken;
      if (!providerToken) {
        Alert.alert('Google Sign-In failed', 'Google did not return an identity token.');
        return;
      }

      await linkProvider('google', providerToken);
    } catch (error: any) {
      if (error?.code === statusCodes.SIGN_IN_CANCELLED) return;
      Alert.alert('Google Sign-In failed', error?.message || 'Please try again.');
    } finally {
      setLoadingProvider(null);
      setCurrentPassword('');
    }
  };

  const handleAppleLink = async () => {
    if (!ensureReauthenticated()) return;
    if (!appleAvailable) {
      Alert.alert('Apple unavailable', 'Apple Sign-In is available on supported iOS devices only.');
      return;
    }

    setLoadingProvider('apple');
    try {
      const credential = await AppleAuthentication.signInAsync();
      if (!credential.identityToken) {
        Alert.alert('Apple Sign-In failed', 'Apple did not return an identity token.');
        return;
      }

      await linkProvider('apple', credential.identityToken);
    } catch (error: any) {
      if (error?.code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert('Apple Sign-In failed', error?.message || 'Please try again.');
    } finally {
      setLoadingProvider(null);
      setCurrentPassword('');
    }
  };

  if (!isEligible) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{
          backgroundColor: headerBg,
          paddingHorizontal: 16,
          paddingVertical: 20,
          flexDirection: 'row',
          alignItems: 'center',
          borderBottomLeftRadius: 24,
          borderBottomRightRadius: 24,
        }}>
          <TouchableOpacity accessibilityRole="button" onPress={() => navigation.goBack()}>
            <ArrowLeft size={24} color="white" />
          </TouchableOpacity>
          <Text style={{ color: 'white', fontSize: 20, fontWeight: '700', marginLeft: 16 }}>
            Linked Sign-In Accounts
          </Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', padding: 28 }}>
          <ShieldCheck size={42} color={colors.muted} />
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', marginTop: 16 }}>
            Verified patient account required
          </Text>
          <Text style={{ color: colors.muted, fontSize: 15, lineHeight: 21, marginTop: 8 }}>
            Sign in to a verified patient account to manage linked social sign-in providers.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{
        backgroundColor: headerBg,
        paddingHorizontal: 16,
        paddingVertical: 20,
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
      }}>
        <TouchableOpacity accessibilityRole="button" onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color="white" />
        </TouchableOpacity>
        <Text style={{ color: 'white', fontSize: 20, fontWeight: '700', marginLeft: 16 }}>
          Linked Sign-In Accounts
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36 }} keyboardShouldPersistTaps="handled">
        <View style={{
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 20,
          padding: 18,
          marginTop: 8,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary + '1A', alignItems: 'center', justifyContent: 'center' }}>
              <Link2 size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: colors.cardText }}>Add a sign-in option</Text>
              <Text style={{ fontSize: 14, color: colors.muted, marginTop: 3 }}>Your existing account stays separate and unchanged.</Text>
            </View>
          </View>
          <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 19, marginTop: 16 }}>
            We require your current password and verify the provider account before linking it. A linked provider cannot be unlinked in this app; contact support if you need help.
          </Text>
        </View>

        <View style={{ marginTop: 24 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 10 }}>Current password</Text>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 14,
            paddingHorizontal: 14,
          }}>
            <KeyRound size={20} color={colors.muted} />
            <Input
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Enter your current password"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              textContentType="password"
              style={{
                flex: 1,
                borderWidth: 0,
                backgroundColor: 'transparent',
                paddingVertical: 13,
                marginBottom: 0,
              }}
            />
            <TouchableOpacity accessibilityRole="button" onPress={() => setShowPassword(value => !value)}>
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>
                {showPassword ? 'Hide' : 'Show'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ marginTop: 28 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 10 }}>Providers</Text>
          {accountSummary.map(({ provider, title, linked }) => (
            <View key={provider} style={{
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 18,
              padding: 16,
              marginBottom: 12,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {provider === 'google'
                  ? <Chrome size={23} color={colors.cardText} />
                  : <Apple size={23} color={colors.cardText} />}
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ color: colors.cardText, fontSize: 16, fontWeight: '700' }}>{title}</Text>
                  <Text style={{ color: linked ? '#16A34A' : colors.muted, fontSize: 13, marginTop: 3 }}>
                    {linked ? 'Linked to this account' : 'Not linked'}
                  </Text>
                </View>
                {linked ? <CheckCircle2 size={22} color="#16A34A" /> : null}
              </View>

              {!linked && provider === 'google' ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={handleGoogleLink}
                  disabled={Boolean(loadingProvider) || !googleAvailable}
                  style={{
                    marginTop: 16,
                    backgroundColor: googleAvailable ? colors.primary : colors.border,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 48,
                    opacity: loadingProvider ? 0.7 : 1,
                  }}
                >
                  {loadingProvider === 'google'
                    ? <ActivityIndicator color="white" />
                    : <Text style={{ color: googleAvailable ? 'white' : colors.muted, fontWeight: '700' }}>
                      {googleAvailable ? 'Link Google' : 'Google unavailable in this build'}
                    </Text>}
                </TouchableOpacity>
              ) : null}

              {!linked && provider === 'apple' ? (
                appleAvailable ? (
                  <View pointerEvents={loadingProvider ? 'none' : 'auto'} style={{ marginTop: 16, opacity: loadingProvider ? 0.7 : 1 }}>
                    <AppleAuthentication.AppleAuthenticationButton
                      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                      cornerRadius={12}
                      style={{ width: '100%', height: 48 }}
                      onPress={handleAppleLink}
                    />
                  </View>
                ) : (
                  <View style={{ marginTop: 16, borderRadius: 12, backgroundColor: colors.border, minHeight: 48, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ color: colors.muted, fontWeight: '700' }}>Apple unavailable on this device</Text>
                  </View>
                )
              ) : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
