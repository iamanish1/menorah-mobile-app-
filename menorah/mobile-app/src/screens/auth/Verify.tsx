import { View, Text, Pressable, Alert } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { useAuth } from '@/state/useAuth';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function Verify({ navigation, route }: any) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const {
    verifyEmail,
    verifyEmailOtp,
    resendEmailVerification,
    resendEmailOtp,
    user,
  } = useAuth();
  
  // Get email from route params or user object
  const email = route?.params?.email || user?.email;
  const flow = route?.params?.flow
    || (route?.params?.fromSignup === true ? 'signup' : 'account');
  const shouldOfferIdentityVerification = flow === 'signup';
  const requestedInitialCode = useRef(false);

  useEffect(() => {
    if (
      flow !== 'account'
      || !route?.params?.requestCode
      || !email
      || requestedInitialCode.current
    ) return;

    requestedInitialCode.current = true;
    resendEmailVerification(email).then(result => {
      if (!result.success) {
        Alert.alert('Could not send code', result.message || 'Tap resend to try again.');
      }
    });
  }, [email, flow, resendEmailVerification, route?.params?.requestCode]);

  const handleVerify = async () => {
    if (!code || code.length !== 6) {
      Alert.alert('Error', 'Please enter a valid 6-digit code');
      return;
    }

    if (!email) {
      Alert.alert('Error', 'Email not found. Please try logging in again.');
      return;
    }

    setLoading(true);
    try {
      const result = flow === 'signup'
        ? await verifyEmailOtp(email, code)
        : await verifyEmail(email, code);
      if (result.success) {
        if (result.requiresSignIn) {
          Alert.alert('Email verified', result.message || 'Please sign in to continue.', [{
            text: 'Sign in',
            onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Login' }] }),
          }]);
          return;
        }

        Alert.alert('Success', shouldOfferIdentityVerification ? 'Email verified. You can verify your identity now or skip for later.' : 'Email verified successfully!', [
          {
            text: 'OK',
            onPress: () => {
              navigation.reset({
                index: 0,
                routes: [
                  shouldOfferIdentityVerification
                    ? { name: 'IdentityVerification', params: { fromSignup: true } }
                    : { name: 'Tabs' },
                ],
              });
            },
          },
        ]);
      } else {
        Alert.alert('Verification Failed', result.message || 'Invalid verification code');
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) {
      Alert.alert('Error', 'Email not found. Please try logging in again.');
      return;
    }

    setResending(true);
    try {
      const result = flow === 'signup'
        ? await resendEmailOtp(email)
        : await resendEmailVerification(email);
      if (result.success) {
        Alert.alert('Success', 'Verification code sent successfully!');
      } else {
        Alert.alert('Error', result.message || 'Failed to resend verification code');
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setResending(false);
    }
  };

  return (
    <View style={{ flex: 1, padding: 24, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={{ fontSize: 28, fontWeight: '600', color: colors.text, marginBottom: 8 }}>
          Verify your email
        </Text>
        <Text style={{ fontSize: 16, color: colors.muted, marginBottom: 32 }}>
          We&apos;ve sent a verification code to {email || 'your email address'}
        </Text>
        
        <Input
          label="Verification Code"
          placeholder="Enter 6-digit code"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
        />
        
        <View style={{ marginTop: 24 }}>
          <Button 
            title={loading ? 'Verifying...' : 'Verify Email'} 
            onPress={handleVerify}
            loading={loading}
            disabled={loading || code.length !== 6}
          />
        </View>
        
        <Pressable 
          onPress={handleResend} 
          disabled={resending}
          style={{ marginTop: 16, alignItems: 'center' }}
        >
          <Text style={{ 
            color: resending ? colors.muted : colors.primary, 
            fontSize: 14,
            fontWeight: '600'
          }}>
            {resending ? 'Sending...' : 'Didn\'t receive code? Resend'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
