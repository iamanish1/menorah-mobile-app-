import { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react-native';
import Input from '@/components/ui/Input';
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";
import { useAuth } from '@/state/useAuth';

type RegisterPayload = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  dateOfBirth: string;
  gender: string;
};

type BackendValidationError = {
  path?: string;
  param?: string;
  msg?: string;
  message?: string;
};

const validGenders = ['male', 'female', 'other', 'prefer-not-to-say'];

const normalizePhone = (value: string) => value.trim().replace(/[\s()-]/g, '');

const sanitizeRegisterPayload = (payload: RegisterPayload) => ({
  ...payload,
  password: `[redacted; length=${payload.password.length}]`,
});

const getBackendErrorMessage = (error: BackendValidationError) => error.msg || error.message;

export default function Register({ navigation }: any) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender] = useState('male');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const isDark = scheme === 'dark';
  const brandSurface = isDark ? colors.primaryDark : '#2d5c3e';
  const brandAccent = isDark ? colors.primary : '#2d5c3e';
  const primaryActionText = isDark ? colors.primaryDark : 'white';
  const { register } = useAuth();

  // Validation functions
  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePhone = (phone: string) => {
    return /^\+[1-9]\d{1,14}$/.test(normalizePhone(phone));
  };

  const validateDate = (date: string) => {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) return false;
    const dateObj = new Date(date);
    return dateObj instanceof Date && !isNaN(dateObj.getTime()) && dateObj <= new Date();
  };

  const getPasswordStrength = (password: string) => {
    if (password.length === 0) return { strength: 0, label: '', color: colors.muted };
    if (password.length < 6) return { strength: 1, label: 'Weak', color: '#EF4444' };
    if (password.length < 8) return { strength: 2, label: 'Fair', color: '#F59E0B' };
    if (password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password)) {
      return { strength: 3, label: 'Strong', color: '#10B981' };
    }
    return { strength: 2, label: 'Good', color: '#10B981' };
  };

  const validateField = (field: string, value: string) => {
    const newErrors = { ...errors };
    delete newErrors[field];

    switch (field) {
      case 'firstName':
        if (value && (value.trim().length < 2 || value.trim().length > 50)) {
          newErrors.firstName = 'First name must be between 2 and 50 characters';
        }
        break;
      case 'lastName':
        if (value && (value.trim().length < 2 || value.trim().length > 50)) {
          newErrors.lastName = 'Last name must be between 2 and 50 characters';
        }
        break;
      case 'email':
        if (value && !validateEmail(value.trim())) {
          newErrors.email = 'Please enter a valid email address';
        }
        break;
      case 'phone':
        if (value && !validatePhone(value)) {
          newErrors.phone = 'Phone must include country code and digits only (e.g., +971501234567)';
        }
        break;
      case 'dateOfBirth':
        if (value && !validateDate(value)) {
          newErrors.dateOfBirth = 'Please enter date in YYYY-MM-DD format';
        }
        break;
      case 'password':
        if (value && value.length < 8) {
          newErrors.password = 'Password must be at least 8 characters';
        }
        break;
      case 'confirmPassword':
        if (value && value !== password) {
          newErrors.confirmPassword = 'Passwords do not match';
        }
        break;
    }

    setErrors(newErrors);
  };

  const buildPayload = (): RegisterPayload => ({
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.trim().toLowerCase(),
    phone: normalizePhone(phone),
    password,
    dateOfBirth: dateOfBirth.trim(),
    gender,
  });

  const validationErrorsToFieldMap = (backendErrors?: BackendValidationError[]) => {
    const fieldErrors: Record<string, string> = {};

    backendErrors?.forEach((error) => {
      const field = error.path || error.param;
      const message = getBackendErrorMessage(error);

      if (field && message) {
        fieldErrors[field] = message;
      }
    });

    return fieldErrors;
  };

  const validationErrorsToFriendlyMessage = (backendErrors?: BackendValidationError[]) => {
    const messages = backendErrors
      ?.map(getBackendErrorMessage)
      .filter((message): message is string => Boolean(message));

    return messages?.length ? messages.join('\n') : undefined;
  };

  const handleRegister = async () => {
    // Reset errors
    setErrors({});
    const payload = buildPayload();

    // Validate all fields
    const newErrors: Record<string, string> = {};

    if (!payload.firstName) newErrors.firstName = 'First name is required';
    else if (payload.firstName.length < 2 || payload.firstName.length > 50) {
      newErrors.firstName = 'First name must be between 2 and 50 characters';
    }

    if (!payload.lastName) newErrors.lastName = 'Last name is required';
    else if (payload.lastName.length < 2 || payload.lastName.length > 50) {
      newErrors.lastName = 'Last name must be between 2 and 50 characters';
    }

    if (!payload.email) newErrors.email = 'Email is required';
    else if (!validateEmail(payload.email)) newErrors.email = 'Please enter a valid email';

    if (!payload.phone) newErrors.phone = 'Phone is required';
    else if (!validatePhone(payload.phone)) {
      newErrors.phone = 'Phone must include country code and digits only (e.g., +971501234567)';
    }

    if (!payload.dateOfBirth) newErrors.dateOfBirth = 'Date of birth is required';
    else if (!validateDate(payload.dateOfBirth)) newErrors.dateOfBirth = 'Please enter a valid past date in YYYY-MM-DD format';

    if (!validGenders.includes(payload.gender)) newErrors.gender = 'Please select a valid gender';

    if (!payload.password) newErrors.password = 'Password is required';
    else if (payload.password.length < 8) newErrors.password = 'Password must be at least 8 characters';

    if (!confirmPassword) newErrors.confirmPassword = 'Please confirm your password';
    else if (payload.password !== confirmPassword) newErrors.confirmPassword = 'Passwords do not match';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      Alert.alert('Validation Error', 'Please fill in all fields correctly');
      return;
    }

    setLoading(true);
    try {
      if (__DEV__) {
        console.log('[Register] POST /auth/register payload:', JSON.stringify(sanitizeRegisterPayload(payload), null, 2));
      }

      if (phone !== payload.phone) setPhone(payload.phone);

      const result = await register(payload);

      if (result.success) {
        if (__DEV__) {
          console.log('[Register] Registration successful:', result.message);
        }

        navigation.reset({
          index: 0,
          routes: [{ name: 'Verify', params: { email: payload.email, fromSignup: true } }],
        });
      } else {
        const backendFieldErrors = validationErrorsToFieldMap(result.errors);
        if (Object.keys(backendFieldErrors).length > 0) {
          setErrors(backendFieldErrors);
        }

        Alert.alert(
          'Registration Failed',
          validationErrorsToFriendlyMessage(result.errors) || result.message || 'Failed to create account. Please try again.'
        );
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const passwordStrength = getPasswordStrength(password);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={{ alignItems: 'center', marginBottom: 32 }}>
          <View style={{
            width: 100, height: 100, borderRadius: 50,
            backgroundColor: colors.card,
            alignItems: 'center', justifyContent: 'center',
            marginBottom: 20,
            shadowColor: brandAccent,
            shadowOffset: { width: 0, height: 5 },
            shadowOpacity: 0.15, shadowRadius: 14, elevation: 8,
            padding: 4,
          }}>
            <View style={{
              width: 92, height: 92, borderRadius: 46,
              backgroundColor: brandSurface,
              alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}>
              <Image
                source={require('../../../assets/brand/menorah-logo-no-bg.png')}
                style={{ width: 70, height: 70 }}
                contentFit="contain"
              />
            </View>
          </View>
          <Text style={{
            fontSize: 28,
            fontWeight: '700',
            color: colors.text,
            marginBottom: 8
          }}>
            Create Account
          </Text>
          <Text style={{
            fontSize: 15,
            color: colors.muted,
            textAlign: 'center',
            lineHeight: 22
          }}>
            Join Menorah Health and start your mental health journey
          </Text>
        </View>

        {/* Form */}
        <View>
          {/* Name Fields */}
          <View style={{ flexDirection: 'row', marginBottom: 4 }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Input
                label="First Name"
                placeholder="John"
                value={firstName}
                onChangeText={(text) => {
                  setFirstName(text);
                  validateField('firstName', text);
                }}
                keyboardType="default"
                autoCapitalize="words"
                error={errors.firstName}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Input
                label="Last Name"
                placeholder="Doe"
                value={lastName}
                onChangeText={(text) => {
                  setLastName(text);
                  validateField('lastName', text);
                }}
                keyboardType="default"
                autoCapitalize="words"
                error={errors.lastName}
              />
            </View>
          </View>

          {/* Email */}
          <Input
            label="Email"
            placeholder="john.doe@example.com"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              validateField('email', text);
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            error={errors.email}
          />

          {/* Phone */}
          <View style={{ marginBottom: 16 }}>
            <Input
              label="Phone Number"
              placeholder="+1234567890"
              value={phone}
              onChangeText={(text) => {
                const formatted = text.length > 0 && !text.startsWith('+') ? `+${text}` : text;
                setPhone(formatted);
                validateField('phone', formatted);
              }}
              keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'phone-pad'}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="telephoneNumber"
              error={errors.phone}
            />
            <Text style={{
              fontSize: 12,
              color: colors.muted,
              marginTop: 4,
              marginLeft: 4
            }}>
              Include country code (e.g., +1 for US, +44 for UK)
            </Text>
          </View>

          {/* Date of Birth */}
          <View style={{ marginBottom: 16 }}>
            <Input
              label="Date of Birth"
              placeholder="YYYY-MM-DD"
              value={dateOfBirth}
              onChangeText={(text) => {
                setDateOfBirth(text);
                validateField('dateOfBirth', text);
              }}
              keyboardType="default"
              error={errors.dateOfBirth}
            />
            <Text style={{
              fontSize: 12,
              color: colors.muted,
              marginTop: 4,
              marginLeft: 4
            }}>
              Format: YYYY-MM-DD (e.g., 1990-01-15)
            </Text>
          </View>

          {/* Gender Selection - Only Male */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{
              fontSize: 14,
              fontWeight: '600',
              color: colors.text,
              marginBottom: 12
            }}>
              Gender
            </Text>
            <View style={{
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: 12,
              backgroundColor: colors.primary,
              borderWidth: 2,
              borderColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Text style={{
                fontSize: 14,
                color: primaryActionText,
                fontWeight: '600'
              }}>
                Male
              </Text>
            </View>
          </View>

          {/* Password */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{
              fontSize: 14,
              fontWeight: '600',
              color: colors.text,
              marginBottom: 8
            }}>
              Password
            </Text>
            <View style={{
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: errors.password ? colors.error : colors.border,
              borderRadius: 12,
              paddingHorizontal: 16,
              flexDirection: 'row',
              alignItems: 'center'
            }}>
              <Input
                placeholder="Create a password"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  validateField('password', text);
                  if (confirmPassword) validateField('confirmPassword', confirmPassword);
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                style={{
                  flex: 1,
                  borderWidth: 0,
                  backgroundColor: 'transparent',
                  paddingVertical: 12,
                  fontSize: 16,
                  color: colors.cardText,
                  marginBottom: 0
                }}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={{ padding: 4 }}
              >
                {showPassword ? (
                  <EyeOff size={20} color={colors.muted} />
                ) : (
                  <Eye size={20} color={colors.muted} />
                )}
              </TouchableOpacity>
            </View>
            {password.length > 0 && (
              <View style={{ marginTop: 8, marginLeft: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <View style={{
                    flex: 1,
                    height: 4,
                    backgroundColor: colors.border,
                    borderRadius: 2,
                    marginRight: 8
                  }}>
                    <View style={{
                      width: `${(passwordStrength.strength / 3) * 100}%`,
                      height: 4,
                      backgroundColor: passwordStrength.color,
                      borderRadius: 2
                    }} />
                  </View>
                  <Text style={{
                    fontSize: 12,
                    color: passwordStrength.color,
                    fontWeight: '600'
                  }}>
                    {passwordStrength.label}
                  </Text>
                </View>
              </View>
            )}
            {errors.password && (
              <Text style={{
                fontSize: 12,
                color: colors.error,
                marginTop: 4,
                marginLeft: 4
              }}>
                {errors.password}
              </Text>
            )}
          </View>

          {/* Confirm Password */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{
              fontSize: 14,
              fontWeight: '600',
              color: colors.text,
              marginBottom: 8
            }}>
              Confirm Password
            </Text>
            <View style={{
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: errors.confirmPassword ? colors.error :
                          (confirmPassword && password === confirmPassword ? '#10B981' : colors.border),
              borderRadius: 12,
              paddingHorizontal: 16,
              flexDirection: 'row',
              alignItems: 'center'
            }}>
              <Input
                placeholder="Confirm your password"
                value={confirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  validateField('confirmPassword', text);
                }}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                style={{
                  flex: 1,
                  borderWidth: 0,
                  backgroundColor: 'transparent',
                  paddingVertical: 12,
                  fontSize: 16,
                  color: colors.cardText,
                  marginBottom: 0
                }}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {confirmPassword && password === confirmPassword && (
                  <View style={{ marginRight: 8 }}>
                    <CheckCircle2 size={18} color="#10B981" />
                  </View>
                )}
                {confirmPassword && password !== confirmPassword && (
                  <View style={{ marginRight: 8 }}>
                  <XCircle size={18} color={colors.error} />
                  </View>
                )}
                <TouchableOpacity
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{ padding: 4 }}
                >
                  {showConfirmPassword ? (
                    <EyeOff size={20} color={colors.muted} />
                  ) : (
                    <Eye size={20} color={colors.muted} />
                  )}
                </TouchableOpacity>
              </View>
            </View>
            {errors.confirmPassword && (
              <Text style={{
                fontSize: 12,
                color: colors.error,
                marginTop: 4,
                marginLeft: 4
              }}>
                {errors.confirmPassword}
              </Text>
            )}
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            onPress={handleRegister}
            disabled={loading}
            style={{
              backgroundColor: loading ? colors.muted : colors.primary,
              borderRadius: 12,
              paddingVertical: 16,
              alignItems: 'center',
              marginBottom: 20,
              opacity: loading ? 0.7 : 1,
              shadowColor: colors.primary,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 4
            }}
          >
            {loading ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ActivityIndicator size="small" color={primaryActionText} style={{ marginRight: 8 }} />
                <Text style={{ color: primaryActionText, fontSize: 16, fontWeight: '600' }}>
                  Creating Account...
                </Text>
              </View>
            ) : (
              <Text style={{ color: primaryActionText, fontSize: 16, fontWeight: '600' }}>
                Create Account
              </Text>
            )}
          </TouchableOpacity>

          {/* Sign In Link */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
            <Text style={{ color: colors.muted, fontSize: 14 }}>
              Already have an account?{' '}
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>
                Sign In
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
