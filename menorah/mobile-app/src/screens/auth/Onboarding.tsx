import { View, Text, Linking, TouchableOpacity } from "react-native";
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
      width="190"
      height="260"
      viewBox="0 0 190 260"
      style={{ opacity, transform: [{ scaleX: flip ? -1 : 1 }] }}
    >
      {/* Stem */}
      <Path
        d="M95,260 Q90,220 82,180 Q74,140 60,100 Q48,68 32,40 Q22,22 10,8"
        stroke="#3d6b50"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* Large leaf left */}
      <Path
        d="M82,180 Q38,165 22,118 Q14,90 32,72 Q52,60 72,88 Q88,112 82,180 Z"
        fill="#4a7c5f"
      />
      {/* Mid leaf left */}
      <Path
        d="M74,130 Q30,118 16,74 Q10,50 30,40 Q52,34 66,64 Q78,90 74,130 Z"
        fill="#3d6b50"
      />
      {/* Small top leaf */}
      <Path
        d="M64,88 Q44,72 40,38 Q38,18 54,12 Q70,8 76,38 Q82,62 64,88 Z"
        fill="#4a7c5f"
        opacity="0.85"
      />
      {/* Right leaf */}
      <Path
        d="M82,180 Q118,152 138,108 Q150,78 136,58 Q118,44 100,68 Q86,92 82,180 Z"
        fill="#5a8c6f"
        opacity="0.75"
      />
      {/* Small right leaf */}
      <Path
        d="M72,130 Q108,112 124,74 Q132,52 120,38 Q104,28 90,52 Q78,74 72,130 Z"
        fill="#4a7c5f"
        opacity="0.65"
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
    : ['#f2faf5', '#eef8f0', '#fafffe'];

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={bgColors} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>

          {/* Leaf — top left */}
          <View style={{ position: 'absolute', top: -16, left: -22, zIndex: 0 }}>
            <LeafCluster opacity={isDark ? 0.3 : 0.88} />
          </View>

          {/* Leaf — right side, faded */}
          <View style={{ position: 'absolute', top: 20, right: -70, zIndex: 0 }}>
            <LeafCluster opacity={isDark ? 0.1 : 0.18} flip />
          </View>

          {/* Scroll-free layout */}
          <View style={{ flex: 1, paddingHorizontal: 26, zIndex: 1, justifyContent: 'space-between', paddingBottom: 20 }}>

            {/* ── Top: logo + headings + trust ── */}
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 10 }}>

              {/* Logo */}
              <View style={{ position: 'relative', marginBottom: 28 }}>
                {/* Sparkle top-left */}
                <Text style={{
                  position: 'absolute', top: -10, left: -16,
                  color: '#4a7c5f', fontSize: 18, fontWeight: '300',
                }}>✦</Text>
                {/* Sparkle bottom-right */}
                <Text style={{
                  position: 'absolute', bottom: 8, right: -18,
                  color: '#4a7c5f', fontSize: 13, opacity: 0.6,
                }}>✦</Text>

                {/* White ring */}
                <View style={{
                  width: 152, height: 152, borderRadius: 76,
                  backgroundColor: 'white',
                  alignItems: 'center', justifyContent: 'center',
                  shadowColor: '#2d5c3e',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.16,
                  shadowRadius: 22,
                  elevation: 10,
                  padding: 6,
                }}>
                  {/* Dark green inner circle */}
                  <View style={{
                    width: 140, height: 140, borderRadius: 70,
                    backgroundColor: '#2d5c3e',
                    alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden',
                  }}>
                    <Image
                      source={require('../../../assets/icon.png')}
                      style={{ width: 140, height: 140 }}
                      contentFit="cover"
                    />
                  </View>
                </View>
              </View>

              {/* "Welcome to" */}
              <Text style={{
                fontSize: 18, fontWeight: '500',
                color: isDark ? colors.muted : '#3d4a3d',
                marginBottom: 4, textAlign: 'center',
              }}>
                Welcome to
              </Text>

              {/* "Menorah Health" */}
              <Text style={{
                fontSize: 38, fontWeight: '900',
                color: isDark ? '#7ab894' : '#2d5c3e',
                letterSpacing: -0.5, textAlign: 'center',
                marginBottom: 14,
              }}>
                Menorah Health
              </Text>

              {/* Heart divider */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                <View style={{ width: 38, height: 1.5, backgroundColor: '#4a7c5f', borderRadius: 2, marginRight: 10 }} />
                <Heart size={14} color="#4a7c5f" fill="#4a7c5f" />
                <View style={{ width: 38, height: 1.5, backgroundColor: '#4a7c5f', borderRadius: 2, marginLeft: 10 }} />
              </View>

              {/* Description */}
              <Text style={{
                fontSize: 16, color: isDark ? colors.muted : '#5a6e5a',
                textAlign: 'center', lineHeight: 26,
                paddingHorizontal: 6, marginBottom: 28,
              }}>
                Private, secure counselling{'\n'}designed to support your{'\n'}mental well-being.
              </Text>

              {/* Trust badge */}
              <View style={{
                width: '100%',
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
                borderRadius: 18, padding: 16,
                flexDirection: 'row', alignItems: 'center',
                borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(0,0,0,0.06)',
              }}>
                <View style={{
                  width: 52, height: 52, borderRadius: 26,
                  backgroundColor: isDark ? '#1a3328' : '#dceee4',
                  alignItems: 'center', justifyContent: 'center', marginRight: 14, flexShrink: 0,
                }}>
                  <ShieldCheck size={24} color="#2d5c3e" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? colors.text : '#1a2e1e', marginBottom: 3 }}>
                    You're in safe hands
                  </Text>
                  <Text style={{ fontSize: 13, color: isDark ? colors.muted : '#6a7e6a', lineHeight: 19 }}>
                    Your conversations are 100%{'\n'}private and confidential.
                  </Text>
                </View>
              </View>
            </View>

            {/* ── Bottom: buttons + footer ── */}
            <View style={{ width: '100%' }}>

              {/* Get Started */}
              <TouchableOpacity
                onPress={() => navigation.navigate("Login")}
                activeOpacity={0.88}
                style={{
                  backgroundColor: '#2d5c3e',
                  borderRadius: 16, height: 60,
                  flexDirection: 'row', alignItems: 'center',
                  paddingHorizontal: 22, marginBottom: 12,
                }}
              >
                <View style={{
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Sprout size={20} color="white" />
                </View>
                <Text style={{
                  flex: 1, fontSize: 17, fontWeight: '700',
                  color: 'white', textAlign: 'center',
                  marginLeft: -36,
                }}>
                  Get Started
                </Text>
                <ArrowRight size={20} color="rgba(255,255,255,0.8)" />
              </TouchableOpacity>

              {/* Help & Helplines */}
              <TouchableOpacity
                onPress={() => Linking.openURL("https://menorahhealth.com/")}
                activeOpacity={0.88}
                style={{
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'white',
                  borderRadius: 16, height: 60,
                  flexDirection: 'row', alignItems: 'center',
                  paddingHorizontal: 22, marginBottom: 20,
                  borderWidth: 1.5, borderColor: isDark ? colors.border : '#c4d4c4',
                }}
              >
                <View style={{
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: isDark ? '#1a3328' : '#eef6f1',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <LifeBuoy size={20} color="#2d5c3e" />
                </View>
                <Text style={{
                  flex: 1, fontSize: 17, fontWeight: '700',
                  color: '#2d5c3e', textAlign: 'center',
                  marginLeft: -36,
                }}>
                  Help & Helplines
                </Text>
                <ArrowRight size={20} color="#2d5c3e" />
              </TouchableOpacity>

              {/* Footer */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' }}>
                <Lock size={13} color={isDark ? colors.muted : '#8a9a8a'} style={{ marginTop: 2, marginRight: 5 }} />
                <Text style={{ fontSize: 12, color: isDark ? colors.muted : '#7a8a7a', textAlign: 'center', lineHeight: 20 }}>
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
            </View>

          </View>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}
