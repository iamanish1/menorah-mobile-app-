import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Eye, EyeOff } from 'lucide-react-native';
import Input from '@/components/ui/Input';
import NetworkError from '@/components/ui/NetworkError';
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";
import { useAuth } from '@/state/useAuth';

export default function Login({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showNetworkError, setShowNetworkError] = useState(false);

  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const { login } = useAuth();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    
    setLoading(true);
    setShowNetworkError(false);
    try {
      const result = await login(email, password);
      if (result.success) {
        // Navigate to main app after successful login
        navigation.reset({
          index: 0,
          routes: [{ name: 'Tabs' }],
        });
      } else {
        if (result.message?.includes('Network error')) {
          setShowNetworkError(true);
        } else {
          Alert.alert('Login Failed', result.message || 'Invalid credentials');
        }
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 40 }}>
        {/* Logo */}
        <View style={{ alignItems: 'center' }}>
          <View style={{
            width: 80,
            height: 80,
            backgroundColor: colors.primary,
            borderRadius: 40,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24
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
            Welcome Back
          </Text>
          <Text style={{ 
            fontSize: 16, 
            color: colors.muted, 
            textAlign: 'center' 
          }}>
            Sign in to continue your mental health journey
          </Text>
        </View>

        {/* Form */}
        <View style={{ marginTop: 48 }}>
          <Input
            label="Email"
            placeholder="Enter your email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          
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
              borderColor: colors.border,
              borderRadius: 12,
              paddingHorizontal: 16,
              flexDirection: 'row',
              alignItems: 'center'
            }}>
              <Input
                placeholder="Enter your password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                style={{
                  flex: 1,
                  borderWidth: 0,
                  backgroundColor: 'transparent',
                  paddingVertical: 12,
                  fontSize: 16,
                  color: colors.cardText
                }}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                {showPassword ? (
                  <EyeOff size={20} color={colors.muted} />
                ) : (
                  <Eye size={20} color={colors.muted} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            onPress={() => navigation.navigate('Forgot')}
            style={{ alignSelf: 'flex-end', marginBottom: 24 }}
          >
            <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>
              Forgot Password?
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleLogin}
            disabled={loading}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 12,
              paddingVertical: 16,
              alignItems: 'center',
              marginBottom: 16,
              opacity: loading ? 0.7 : 1
            }}
          >
            <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
              {loading ? 'Signing In...' : 'Sign In'}
            </Text>
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ color: colors.muted, fontSize: 14 }}>
              Don't have an account?{' '}
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>
                Sign Up
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Network Error Component */}
        {showNetworkError && (
          <NetworkError 
            onRetry={handleLogin}
            showDiagnostics={true}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
