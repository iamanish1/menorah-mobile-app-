import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Mail, CheckCircle2 } from 'lucide-react-native';
import Input from '@/components/ui/Input';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { useAuth } from '@/state/useAuth';

export default function Forgot({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const { forgotPassword } = useAuth();

  const validateEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (error) {
      setError('');
    }
  };

  const handleSubmit = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError('Email is required');
      return;
    }

    if (!validateEmail(normalizedEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await forgotPassword(normalizedEmail);

      if (result.success) {
        setSuccess(true);
      } else {
        Alert.alert('Reset Failed', result.message || 'Unable to send reset link right now.');
      }
    } catch (submitError) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
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
          <View style={{ alignItems: 'center', marginBottom: 32 }}>
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
                <Mail size={34} color="white" />
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
              {success ? 'Check your inbox' : 'Reset password'}
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
                ? `We sent a reset link to ${email.trim().toLowerCase()}. Open it on this device to choose a new password.`
                : "Enter your email address and we'll send you a secure link to reset your password."}
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
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: colors.cardText,
                  marginBottom: 8,
                }}
              >
                Didn&apos;t receive the email?
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: colors.muted,
                  lineHeight: 21,
                }}
              >
                Check your spam folder, wait a minute, or try again with the same email address.
              </Text>
            </View>
          ) : (
            <View style={{ marginBottom: 8 }}>
              <Input
                label="Email address"
                placeholder="you@example.com"
                value={email}
                onChangeText={handleEmailChange}
                keyboardType="email-address"
                autoCapitalize="none"
                error={error}
                style={{ borderRadius: 14 }}
              />
            </View>
          )}

          <TouchableOpacity
            onPress={success ? () => navigation.navigate('Login') : handleSubmit}
            disabled={loading}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: loading ? 0.7 : 1,
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
                  Sending reset link...
                </Text>
              </View>
            ) : (
              <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
                {success ? 'Back to sign in' : 'Send reset link'}
              </Text>
            )}
          </TouchableOpacity>

          {success && (
            <TouchableOpacity
              onPress={() => {
                setSuccess(false);
                handleSubmit();
              }}
              disabled={loading}
              style={{ alignItems: 'center', marginBottom: 8 }}
            >
              <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>
                Resend email
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 }}>
          <Text style={{ color: colors.muted, fontSize: 14 }}>
            Remember your password?{' '}
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>
              Sign in
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
