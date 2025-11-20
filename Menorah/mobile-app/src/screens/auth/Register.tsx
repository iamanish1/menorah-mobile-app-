import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react-native';
import Input from '@/components/ui/Input';
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";
import { useAuth } from '@/state/useAuth';

export default function Register({ navigation }: any) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('male');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const { register } = useAuth();

  // Validation functions
  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePhone = (phone: string) => {
    return phone.startsWith('+') && phone.length >= 10;
  };

  const validateDate = (date: string) => {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) return false;
    const dateObj = new Date(date);
    return dateObj instanceof Date && !isNaN(dateObj.getTime());
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
      case 'email':
        if (value && !validateEmail(value)) {
          newErrors.email = 'Please enter a valid email address';
        }
        break;
      case 'phone':
        if (value && !validatePhone(value)) {
          newErrors.phone = 'Phone must include country code (e.g., +1234567890)';
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

  const handleRegister = async () => {
    // Reset errors
    setErrors({});

    // Validate all fields
    const newErrors: Record<string, string> = {};

    if (!firstName.trim()) newErrors.firstName = 'First name is required';
    if (!lastName.trim()) newErrors.lastName = 'Last name is required';
    if (!email.trim()) newErrors.email = 'Email is required';
    else if (!validateEmail(email)) newErrors.email = 'Please enter a valid email';
    
    if (!phone.trim()) newErrors.phone = 'Phone is required';
    else if (!validatePhone(phone)) newErrors.phone = 'Phone must include country code (e.g., +1234567890)';
    
    if (!dateOfBirth.trim()) newErrors.dateOfBirth = 'Date of birth is required';
    else if (!validateDate(dateOfBirth)) newErrors.dateOfBirth = 'Please enter date in YYYY-MM-DD format';
    
    if (!password) newErrors.password = 'Password is required';
    else if (password.length < 8) newErrors.password = 'Password must be at least 8 characters';
    
    if (!confirmPassword) newErrors.confirmPassword = 'Please confirm your password';
    else if (password !== confirmPassword) newErrors.confirmPassword = 'Passwords do not match';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      Alert.alert('Validation Error', 'Please fill in all fields correctly');
      return;
    }

    setLoading(true);
    try {
      console.log('📱 Registering user with email:', email);
      const result = await register({
        firstName,
        lastName,
        email,
        phone,
        password,
        dateOfBirth,
        gender
      });

      if (result.success) {
        console.log('✅ Registration successful');
        navigation.navigate('Verify', { email });
      } else {
        Alert.alert('Registration Failed', result.message || 'Failed to create account. Please try again.');
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
            width: 80,
            height: 80,
            backgroundColor: colors.primary,
            borderRadius: 40,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20
          }}>
            <Text style={{
              fontSize: 32,
              fontWeight: 'bold',
              color: 'white'
            }}>
              🧠
            </Text>
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
                setPhone(text);
                validateField('phone', text);
              }}
              keyboardType="phone-pad"
              autoCapitalize="none"
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
                color: 'white',
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
              borderColor: errors.password ? '#EF4444' : colors.border,
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
                color: '#EF4444', 
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
              borderColor: errors.confirmPassword ? '#EF4444' : 
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
                    <XCircle size={18} color="#EF4444" />
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
                color: '#EF4444', 
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
                <ActivityIndicator size="small" color="white" style={{ marginRight: 8 }} />
                <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
                  Creating Account...
                </Text>
              </View>
            ) : (
              <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
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
