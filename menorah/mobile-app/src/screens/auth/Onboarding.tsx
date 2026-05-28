import { View, Text, Linking, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import { ShieldCheck, Sprout, LifeBuoy, ArrowRight, Heart, Lock } from 'lucide-react-native';
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";

function LeafCluster({ opacity = 1, flip = false }: { opacity?: number; flip?: boolean }) {
  return (
    <Svg
      width="160"
      height="220"
      viewBox="0 0 160 220"
      style={{ opacity, transform: [{ scaleX: flip ? -1 : 1 }] }}
    >
      <Path
        d="M78,220 Q74,185 68,150 Q62,115 50,82 Q40,55 26,32 Q18,18 8,6"
        stroke="#3d6b50"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d="M68,150 Q30,136 16,92 Q8,66 24,50 Q44,38 62,62 Q76,84 68,150 Z"
        fill="#4a7c5f"
      />
      <Path
        d="M62,106 Q24,94 12,54 Q6,32 24,24 Q46,18 58,46 Q68,68 62,106 Z"
        fill="#3d6b50"
      />
      <Path
        d="M54,68 Q36,54 32,24 Q30,8 44,4 Q58,0 64,26 Q68,48 54,68 Z"
        fill="#4a7c5f"
        opacity="0.85"
      />
      <Path
        d="M68,150 Q100,124 116,84 Q126,58 114,40 Q98,28 82,50 Q70,72 68,150 Z"
        fill="#5a8c6f"
        opacity="0.7"
      />
      <Path
        d="M62,106 Q94,90 108,56 Q116,36 104,24 Q90,14 78,36 Q66,58 62,106 Z"
        fill="#4a7c5f"
        opacity="0.6"
      />
    </Svg>
  );
}

export default function Onboarding({ navigation }: any) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const isDark = scheme === 'dark';

  const bgColors: readonly [string, string, string] = isDark
    ? ['#0d1b14', '#0f2018', '#111f16']
    : ['#eef8f1', '#f2faf5', '#fafffe'];

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient
        colors={bgColors}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ flex: 1 }}
      >
        {/* Leaf — top left */}
        <View style={{ position: 'absolute', top: 0, left: -18, zIndex: 0 }}>
          <LeafCluster opacity={isDark ? 0.28 : 0.82} />
        </View>

        {/* Leaf — right side, very faded */}
        <View style={{ position: 'absolute', top: 30, right: -60, zIndex: 0 }}>
          <LeafCluster opacity={isDark ? 0.08 : 0.16} flip />
        </View>

        <SafeAreaView style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* ── Logo ── */}
            <View style={{ alignItems: 'center', marginBottom: 22 }}>
              {/* Sparkle top-left */}
              <Text style={{
                position: 'absolute', top: -4, left: '28%',
                color: '#4a7c5f', fontSize: 16, zIndex: 2,
              }}>✦</Text>
              {/* Sparkle right */}
              <Text style={{
                position: 'absolute', top: 18, right: '22%',
                color: '#4a7c5f', fontSize: 11, opacity: 0.65, zIndex: 2,
              }}>✦</Text>

              {/* White ring */}
              <View style={{
                width: 128, height: 128, borderRadius: 64,
                backgroundColor: 'white',
                alignItems: 'center', justifyContent: 'center',
                shadowColor: '#2d5c3e',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.18,
                shadowRadius: 18,
                elevation: 10,
                padding: 5,
              }}>
                {/* Dark green inner circle */}
                <View style={{
                  width: 118, height: 118, borderRadius: 59,
                  backgroundColor: '#2d5c3e',
                  alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden',
                }}>
                  <Image
                    source={require('../../../assets/brand/menorah-logo-no-bg.png')}
                    style={{ width: 90, height: 90 }}
                    contentFit="contain"
                  />
                </View>
              </View>
            </View>

            {/* ── "Welcome to" ── */}
            <Text style={{
              fontSize: 17, fontWeight: '500',
              color: isDark ? colors.muted : '#3d4a3d',
              textAlign: 'center', marginBottom: 4,
            }}>
              Welcome to
            </Text>

            {/* ── "Menorah Health" ── */}
            <Text style={{
              fontSize: 36, fontWeight: '900',
              color: isDark ? '#7ab894' : '#2d5c3e',
              letterSpacing: -0.5, textAlign: 'center',
              marginBottom: 14,
            }}>
              Menorah Health
            </Text>

            {/* ── Heart divider ── */}
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              justifyContent: 'center', marginBottom: 14,
            }}>
              <View style={{ width: 36, height: 1.5, backgroundColor: '#4a7c5f', borderRadius: 2, marginRight: 10 }} />
              <Heart size={13} color="#4a7c5f" fill="#4a7c5f" />
              <View style={{ width: 36, height: 1.5, backgroundColor: '#4a7c5f', borderRadius: 2, marginLeft: 10 }} />
            </View>

            {/* ── Description ── */}
            <Text style={{
              fontSize: 15, color: isDark ? colors.muted : '#5a6e5a',
              textAlign: 'center', lineHeight: 24,
              paddingHorizontal: 10, marginBottom: 22,
            }}>
              Private, secure counselling{'\n'}designed to support your{'\n'}mental well-being.
            </Text>

            {/* ── Trust badge ── */}
            <View style={{
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.75)',
              borderRadius: 16, padding: 14,
              flexDirection: 'row', alignItems: 'center',
              borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(0,0,0,0.07)',
              marginBottom: 24,
            }}>
              <View style={{
                width: 46, height: 46, borderRadius: 23,
                backgroundColor: isDark ? '#1a3328' : '#d8ecdf',
                alignItems: 'center', justifyContent: 'center',
                marginRight: 14, flexShrink: 0,
              }}>
                <ShieldCheck size={22} color="#2d5c3e" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: isDark ? colors.text : '#1a2e1e', marginBottom: 2 }}>
                  You're in safe hands
                </Text>
                <Text style={{ fontSize: 12, color: isDark ? colors.muted : '#6a7e6a', lineHeight: 18 }}>
                  Your conversations are 100% private and confidential.
                </Text>
              </View>
            </View>

            {/* ── Get Started ── */}
            <TouchableOpacity
              onPress={() => navigation.navigate("Login")}
              activeOpacity={0.88}
              style={{
                backgroundColor: '#2d5c3e',
                borderRadius: 16, height: 58,
                flexDirection: 'row', alignItems: 'center',
                paddingHorizontal: 20, marginBottom: 12,
              }}
            >
              <View style={{
                width: 34, height: 34, borderRadius: 17,
                backgroundColor: 'rgba(255,255,255,0.15)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Sprout size={18} color="white" />
              </View>
              <Text style={{
                flex: 1, fontSize: 17, fontWeight: '700',
                color: 'white', textAlign: 'center',
                marginLeft: -34,
              }}>
                Get Started
              </Text>
              <ArrowRight size={19} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>

            {/* ── Help & Helplines ── */}
            <TouchableOpacity
              onPress={() => Linking.openURL("https://menorahhealth.com/")}
              activeOpacity={0.88}
              style={{
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'white',
                borderRadius: 16, height: 58,
                flexDirection: 'row', alignItems: 'center',
                paddingHorizontal: 20, marginBottom: 20,
                borderWidth: 1.5, borderColor: isDark ? colors.border : '#c2d2c2',
              }}
            >
              <View style={{
                width: 34, height: 34, borderRadius: 17,
                backgroundColor: isDark ? '#1a3328' : '#eef5f0',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <LifeBuoy size={18} color="#2d5c3e" />
              </View>
              <Text style={{
                flex: 1, fontSize: 17, fontWeight: '700',
                color: '#2d5c3e', textAlign: 'center',
                marginLeft: -34,
              }}>
                Help & Helplines
              </Text>
              <ArrowRight size={19} color="#2d5c3e" />
            </TouchableOpacity>

            {/* ── Footer ── */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' }}>
              <Lock size={12} color={isDark ? colors.muted : '#8a9a8a'} style={{ marginTop: 3, marginRight: 5 }} />
              <Text style={{ fontSize: 12, color: isDark ? colors.muted : '#7a8a7a', textAlign: 'center', lineHeight: 19, flex: 1 }}>
                By continuing, you agree to our{' '}
                <Text
                  onPress={() => Linking.openURL("https://menorahhealth.com/terms-and-conditions")}
                  style={{ color: '#2d5c3e', fontWeight: '700' }}
                >
                  Terms
                </Text>
                {' '}and{' '}
                <Text
                  onPress={() => Linking.openURL("https://menorahhealth.app/privacy-policy")}
                  style={{ color: '#2d5c3e', fontWeight: '700' }}
                >
                  Privacy Policy
                </Text>
                .
              </Text>
            </View>

          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}
