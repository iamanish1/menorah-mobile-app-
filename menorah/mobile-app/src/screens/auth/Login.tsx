import { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import { Eye, EyeOff, Mail, Lock, ArrowRight } from 'lucide-react-native';
import NetworkError from '@/components/ui/NetworkError';
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";
import { useAuth } from '@/state/useAuth';

function LeafCluster({ opacity = 1, flip = false }: { opacity?: number; flip?: boolean }) {
  return (
    <Svg
      width="140"
      height="190"
      viewBox="0 0 140 190"
      style={{ opacity, transform: [{ scaleX: flip ? -1 : 1 }] }}
    >
      <Path
        d="M68,190 Q64,158 58,128 Q52,98 42,70 Q34,48 22,28 Q14,16 6,4"
        stroke="#3d6b50" strokeWidth="2" fill="none" strokeLinecap="round"
      />
      <Path
        d="M58,128 Q24,116 12,76 Q6,54 20,40 Q38,28 54,52 Q64,72 58,128 Z"
        fill="#4a7c5f"
      />
      <Path
        d="M52,90 Q18,78 8,44 Q2,24 18,16 Q38,10 50,36 Q60,56 52,90 Z"
        fill="#3d6b50"
      />
      <Path
        d="M46,56 Q28,44 26,18 Q24,4 36,0 Q50,0 56,22 Q60,42 46,56 Z"
        fill="#4a7c5f" opacity="0.85"
      />
      <Path
        d="M58,128 Q88,104 102,68 Q110,46 100,30 Q86,18 72,40 Q62,60 58,128 Z"
        fill="#5a8c6f" opacity="0.7"
      />
    </Svg>
  );
}

export default function Login({ navigation }: any) {
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [showNetworkError, setShowNetworkError] = useState(false);
  const [emailFocus, setEmailFocus]     = useState(false);
  const [passFocus, setPassFocus]       = useState(false);

  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const isDark = scheme === 'dark';
  const { login } = useAuth();

  const handleLogin = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setLoading(true);
    setShowNetworkError(false);
    try {
      const result = await login(normalizedEmail, password);
      if (result.success) {
        navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
      } else {
        if (result.message?.includes('Network error')) {
          setShowNetworkError(true);
        } else {
          Alert.alert('Login Failed', result.message || 'Invalid credentials');
        }
      }
    } catch {
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const bgColors: readonly [string, string, string] = isDark
    ? ['#0d1b14', '#0f2018', '#111f16']
    : ['#eef8f1', '#f2faf5', '#fafffe'];

  const fieldBg   = isDark ? 'rgba(255,255,255,0.06)' : 'white';
  const fieldBorder = (focused: boolean) =>
    focused ? '#2d5c3e' : (isDark ? colors.border : '#dde6dd');

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={bgColors} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ flex: 1 }}>

        {/* Leaf — top left */}
        <View style={{ position: 'absolute', top: 0, left: -14, zIndex: 0 }}>
          <LeafCluster opacity={isDark ? 0.25 : 0.75} />
        </View>
        {/* Leaf — bottom right faded */}
        <View style={{ position: 'absolute', bottom: -20, right: -50, zIndex: 0 }}>
          <LeafCluster opacity={isDark ? 0.08 : 0.14} flip />
        </View>

        <SafeAreaView style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 28, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >

            {/* ── Logo ── */}
            <View style={{ alignItems: 'center', marginBottom: 22 }}>
              <View style={{
                width: 100, height: 100, borderRadius: 50,
                backgroundColor: 'white',
                alignItems: 'center', justifyContent: 'center',
                shadowColor: '#2d5c3e',
                shadowOffset: { width: 0, height: 5 },
                shadowOpacity: 0.15, shadowRadius: 14, elevation: 8,
                padding: 4,
              }}>
                <View style={{
                  width: 92, height: 92, borderRadius: 46,
                  backgroundColor: '#2d5c3e',
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
            </View>

            {/* ── Heading ── */}
            <Text style={{
              fontSize: 30, fontWeight: '900',
              color: isDark ? '#7ab894' : '#1a2e1e',
              textAlign: 'center', letterSpacing: -0.4,
              marginBottom: 6,
            }}>
              Welcome Back
            </Text>
            <Text style={{
              fontSize: 14, color: isDark ? colors.muted : '#6a7e6a',
              textAlign: 'center', lineHeight: 22, marginBottom: 28,
            }}>
              Sign in to continue your mental health journey
            </Text>

            {/* ── Form card ── */}
            <View style={{
              backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.65)',
              borderRadius: 20, padding: 20,
              borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(0,0,0,0.06)',
              marginBottom: 16,
            }}>

              {/* Email */}
              <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? colors.text : '#2a3a2a', marginBottom: 8 }}>
                Email
              </Text>
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: fieldBg,
                borderRadius: 12, borderWidth: 1.5,
                borderColor: fieldBorder(emailFocus),
                paddingHorizontal: 14, paddingVertical: 13,
                marginBottom: 16,
              }}>
                <Mail size={17} color={emailFocus ? '#2d5c3e' : colors.muted} style={{ marginRight: 10 }} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setEmailFocus(true)}
                  onBlur={() => setEmailFocus(false)}
                  placeholder="Enter your email"
                  placeholderTextColor={colors.muted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="emailAddress"
                  style={{ flex: 1, fontSize: 15, color: isDark ? colors.text : '#1a2e1e' }}
                />
              </View>

              {/* Password */}
              <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? colors.text : '#2a3a2a', marginBottom: 8 }}>
                Password
              </Text>
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: fieldBg,
                borderRadius: 12, borderWidth: 1.5,
                borderColor: fieldBorder(passFocus),
                paddingHorizontal: 14, paddingVertical: 13,
                marginBottom: 12,
              }}>
                <Lock size={17} color={passFocus ? '#2d5c3e' : colors.muted} style={{ marginRight: 10 }} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setPassFocus(true)}
                  onBlur={() => setPassFocus(false)}
                  placeholder="Enter your password"
                  placeholderTextColor={colors.muted}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  textContentType="password"
                  style={{ flex: 1, fontSize: 15, color: isDark ? colors.text : '#1a2e1e' }}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ padding: 4 }}>
                  {showPassword
                    ? <EyeOff size={18} color={colors.muted} />
                    : <Eye size={18} color={colors.muted} />}
                </TouchableOpacity>
              </View>

              {/* Forgot */}
              <TouchableOpacity
                onPress={() => navigation.navigate('Forgot')}
                style={{ alignSelf: 'flex-end' }}
              >
                <Text style={{ color: '#2d5c3e', fontSize: 13, fontWeight: '700' }}>
                  Forgot Password?
                </Text>
              </TouchableOpacity>
            </View>

            {/* ── Sign In button ── */}
            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.88}
              style={{
                backgroundColor: loading ? '#5a8c6f' : '#2d5c3e',
                borderRadius: 16, height: 58,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                marginBottom: 16,
                shadowColor: '#2d5c3e',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
              }}
            >
              {loading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: 'white', marginRight: 6 }}>
                    Sign In
                  </Text>
                  <ArrowRight size={18} color="rgba(255,255,255,0.8)" />
                </>
              )}
            </TouchableOpacity>

            {/* ── Sign Up link ── */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: isDark ? colors.muted : '#6a7e6a', fontSize: 14 }}>
                Don't have an account?{' '}
              </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                <Text style={{ color: '#2d5c3e', fontSize: 14, fontWeight: '700' }}>
                  Sign Up
                </Text>
              </TouchableOpacity>
            </View>

            {/* Network Error */}
            {showNetworkError && (
              <NetworkError onRetry={handleLogin} showDiagnostics={true} />
            )}

          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}
