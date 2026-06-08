import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, CheckCircle2, LockKeyhole, Eye, EyeOff } from 'lucide-react-native';
import Input from '@/components/ui/Input';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { useAuth } from '@/state/useAuth';

export default function ResetPassword({ navigation, route }: any) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const { resetPassword } = useAuth();

  const token = useMemo(() => {
    if (typeof route?.params?.token === 'string') {
      return route.params.token.trim();
    }
    return '';
  }, [route?.params?.token]);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const validate = () => {
    let isValid = true;

    if (!token) {
      Alert.alert('Invalid link', 'This password reset link is missing or invalid. Please request a new one.');
      return false;
    }

    if (!password.trim()) {
      setPasswordError('New password is required');
      isValid = false;
    } else if (password.trim().length < 8) {
      setPasswordError('Password must be at least 8 characters long');
      isValid = false;
    } else {
      setPasswordError('');
    }

    if (!confirmPassword.trim()) {
      setConfirmError('Please confirm your new password');
      isValid = false;
    } else if (password !== confirmPassword) {
      setConfirmError('Passwords do not match');
      isValid = false;
    } else {
      setConfirmError('');
    }

    return isValid;
  };

  const handleSubmit = async () => {
    if (!validate()) {
      return;
    }

    setLoading(true);

    try {
      const result = await resetPassword(token, password.trim());

      if (result.success) {
        setSuccess(true);
      } else {
        Alert.alert('Reset Failed', result.message || 'We could not reset your password. Please request a new link.');
      }
    } catch (error) {
      Alert.alert('Reset Failed', 'Something went wrong while updating your password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Login')}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 28,
          }}
        >
          <ArrowLeft size={20} color={colors.text} />
        </TouchableOpacity>

        <View style={{ flex: 1, justifyContent: 'center' }}>
          <View style={{ alignItems: 'center', marginBottom: 28 }}>
            <View
              style={{
                width: 84,
                height: 84,
                borderRadius: 42,
                backgroundColor: success ? '#DCFCE7' : colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 20,
              }}
            >
              {success ? (
                <CheckCircle2 size={36} color="#16A34A" />
              ) : (
                <LockKeyhole size={34} color="white" />
              )}
            </View>

            <Text
              style={{
                fontSize: 28,
                fontWeight: '700',
                color: colors.text,
                marginBottom: 10,
                textAlign: 'center',
              }}
            >
              {success ? 'Password updated' : 'Create new password'}
            </Text>

            <Text
              style={{
                fontSize: 15,
                color: colors.muted,
                textAlign: 'center',
                lineHeight: 22,
                maxWidth: 320,
              }}
            >
              {success
                ? 'Your password has been reset successfully. Use your new password the next time you sign in.'
                : 'Choose a strong new password to secure your Menorah Health account.'}
            </Text>
          </View>

          {success ? (
            <View
              style={{
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 20,
                padding: 20,
                marginBottom: 24,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.cardText, marginBottom: 8 }}>
                All set
              </Text>
              <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 21 }}>
                You can return to sign in now. If this link was opened by mistake, the old reset token can no longer be used.
              </Text>
            </View>
          ) : (
            <View style={{ marginBottom: 8 }}>
              <View style={{ position: 'relative' }}>
                <Input
                  label="New password"
                  placeholder="Enter your new password"
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    if (passwordError) {
                      setPasswordError('');
                    }
                  }}
                  secureTextEntry={!showPassword}
                  error={passwordError}
                  style={{ borderRadius: 14, paddingRight: 52 }}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((prev) => !prev)}
                  style={{ position: 'absolute', right: 16, top: 46 }}
                >
                  {showPassword ? <EyeOff size={20} color={colors.muted} /> : <Eye size={20} color={colors.muted} />}
                </TouchableOpacity>
              </View>

              <View style={{ position: 'relative' }}>
                <Input
                  label="Confirm new password"
                  placeholder="Re-enter your new password"
                  value={confirmPassword}
                  onChangeText={(value) => {
                    setConfirmPassword(value);
                    if (confirmError) {
                      setConfirmError('');
                    }
                  }}
                  secureTextEntry={!showConfirmPassword}
                  error={confirmError}
                  style={{ borderRadius: 14, paddingRight: 52 }}
                />
                <TouchableOpacity
                  onPress={() => setShowConfirmPassword((prev) => !prev)}
                  style={{ position: 'absolute', right: 16, top: 46 }}
                >
                  {showConfirmPassword ? (
                    <EyeOff size={20} color={colors.muted} />
                  ) : (
                    <Eye size={20} color={colors.muted} />
                  )}
                </TouchableOpacity>
              </View>

              {!token && (
                <Text style={{ fontSize: 13, color: '#EF4444', marginTop: 4 }}>
                  This reset link is invalid. Please go back and request a new one.
                </Text>
              )}
            </View>
          )}

          <TouchableOpacity
            onPress={success ? () => navigation.reset({ index: 0, routes: [{ name: 'Login' }] }) : handleSubmit}
            disabled={loading || (!success && !token)}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: loading || (!success && !token) ? 0.65 : 1,
              marginBottom: 16,
              shadowColor: colors.primary,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.18,
              shadowRadius: 10,
              elevation: 3,
            }}
          >
            {loading ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ActivityIndicator size="small" color="white" style={{ marginRight: 8 }} />
                <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
                  Updating password...
                </Text>
              </View>
            ) : (
              <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
                {success ? 'Back to sign in' : 'Reset password'}
              </Text>
            )}
          </TouchableOpacity>

          {!success && (
            <TouchableOpacity onPress={() => navigation.navigate('Forgot')} style={{ alignItems: 'center' }}>
              <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>
                Request a new reset link
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
