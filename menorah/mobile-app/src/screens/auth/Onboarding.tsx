import { View, Text, Linking, TouchableOpacity, ScrollView, useWindowDimensions } from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Svg, { Path, Circle, Ellipse, Rect, G } from 'react-native-svg';
import { ShieldCheck, Sprout, LifeBuoy, ArrowRight, Heart, Lock, Brain } from 'lucide-react-native';
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";

/* ─── SVG Leaf for corners ─── */
function LeafSprig({ width = 90, height = 120, opacity = 1, flip = false }: {
  width?: number; height?: number; opacity?: number; flip?: boolean;
}) {
  return (
    <Svg
      width={width} height={height}
      viewBox="0 0 90 120"
      style={{ opacity, transform: [{ scaleX: flip ? -1 : 1 }] }}
    >
      <Path d="M45,118 Q42,95 38,72 Q34,50 26,32 Q18,16 8,4"
        stroke="#3d6b50" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <Path d="M38,72 Q14,62 6,36 Q2,18 14,10 Q28,4 36,26 Q42,44 38,72 Z"
        fill="#4a7c5f" />
      <Path d="M34,44 Q12,36 6,14 Q3,2 14,0 Q26,0 32,20 Q38,36 34,44 Z"
        fill="#3d6b50" opacity="0.85" />
      <Path d="M38,72 Q62,56 68,32 Q72,16 62,8 Q50,2 42,20 Q36,38 38,72 Z"
        fill="#5a8c6f" opacity="0.7" />
    </Svg>
  );
}

/* ─── Main hero illustration ─── */
function HeroIllustration({ width }: { width: number }) {
  const h = Math.round(width * 0.82);
  const cx = width / 2;

  return (
    <View style={{ width, height: h, position: 'relative' }}>
      <Svg width={width} height={h} viewBox={`0 0 ${width} ${h}`}>

        {/* ── Arch background ── */}
        <Path
          d={`M0,${h} Q0,${h * 0.28} ${cx},${h * 0.08} Q${width},${h * 0.28} ${width},${h} Z`}
          fill="#edf7f0"
        />

        {/* ── Left side leaves ── */}
        <G opacity="0.75">
          <Path d={`M${cx * 0.38},${h * 0.92} Q${cx * 0.08},${h * 0.68} ${cx * 0.18},${h * 0.46} Q${cx * 0.26},${h * 0.34} ${cx * 0.36},${h * 0.46} Q${cx * 0.52},${h * 0.64} ${cx * 0.38},${h * 0.92} Z`}
            fill="#5a8c6f" />
          <Path d={`M${cx * 0.22},${h * 0.88} Q${cx * 0.0},${h * 0.66} ${cx * 0.08},${h * 0.46} Q${cx * 0.15},${h * 0.36} ${cx * 0.26},${h * 0.46} Q${cx * 0.38},${h * 0.62} ${cx * 0.22},${h * 0.88} Z`}
            fill="#3d6b50" />
          <Path d={`M${cx * 0.14},${h * 0.72} Q${cx * 0.0},${h * 0.54} ${cx * 0.06},${h * 0.38} Q${cx * 0.12},${h * 0.28} ${cx * 0.2},${h * 0.38} Q${cx * 0.3},${h * 0.52} ${cx * 0.14},${h * 0.72} Z`}
            fill="#4a7c5f" opacity="0.9" />
        </G>

        {/* ── Right side leaves ── */}
        <G opacity="0.75">
          <Path d={`M${width - cx * 0.38},${h * 0.92} Q${width - cx * 0.08},${h * 0.68} ${width - cx * 0.18},${h * 0.46} Q${width - cx * 0.26},${h * 0.34} ${width - cx * 0.36},${h * 0.46} Q${width - cx * 0.52},${h * 0.64} ${width - cx * 0.38},${h * 0.92} Z`}
            fill="#5a8c6f" />
          <Path d={`M${width - cx * 0.22},${h * 0.88} Q${width - cx * 0.0},${h * 0.66} ${width - cx * 0.08},${h * 0.46} Q${width - cx * 0.15},${h * 0.36} ${width - cx * 0.26},${h * 0.46} Q${width - cx * 0.38},${h * 0.62} ${width - cx * 0.22},${h * 0.88} Z`}
            fill="#3d6b50" />
        </G>

        {/* ── Sparkles ── */}
        <Path d={`M${cx * 0.7},${h * 0.22} L${cx * 0.72},${h * 0.16} L${cx * 0.74},${h * 0.22} L${cx * 0.8},${h * 0.24} L${cx * 0.74},${h * 0.26} L${cx * 0.72},${h * 0.32} L${cx * 0.7},${h * 0.26} L${cx * 0.64},${h * 0.24} Z`}
          fill="#4a7c5f" opacity="0.5" />
        <Path d={`M${cx * 1.3},${h * 0.4} L${cx * 1.32},${h * 0.36} L${cx * 1.34},${h * 0.4} L${cx * 1.38},${h * 0.41} L${cx * 1.34},${h * 0.42} L${cx * 1.32},${h * 0.46} L${cx * 1.3},${h * 0.42} L${cx * 1.26},${h * 0.41} Z`}
          fill="#4a7c5f" opacity="0.4" />

        {/* ── Person: left arm ── */}
        <Path
          d={`M${cx * 0.82},${h * 0.58} Q${cx * 0.6},${h * 0.56} ${cx * 0.42},${h * 0.64} Q${cx * 0.36},${h * 0.67} ${cx * 0.32},${h * 0.73} L${cx * 0.36},${h * 0.78} Q${cx * 0.4},${h * 0.73} ${cx * 0.48},${h * 0.7} Q${cx * 0.64},${h * 0.63} ${cx * 0.84},${h * 0.65} Z`}
          fill="#c9845a"
        />

        {/* ── Person: right arm ── */}
        <Path
          d={`M${cx * 1.18},${h * 0.58} Q${cx * 1.4},${h * 0.56} ${cx * 1.58},${h * 0.64} Q${cx * 1.64},${h * 0.67} ${cx * 1.68},${h * 0.73} L${cx * 1.64},${h * 0.78} Q${cx * 1.6},${h * 0.73} ${cx * 1.52},${h * 0.7} Q${cx * 1.36},${h * 0.63} ${cx * 1.16},${h * 0.65} Z`}
          fill="#c9845a"
        />

        {/* ── Person: left palm ── */}
        <Ellipse cx={cx * 0.3} cy={h * 0.76} rx={cx * 0.1} ry={h * 0.05} fill="#c9845a" />

        {/* ── Person: right palm ── */}
        <Ellipse cx={cx * 1.7} cy={h * 0.76} rx={cx * 0.1} ry={h * 0.05} fill="#c9845a" />

        {/* ── Person: shirt/torso ── */}
        <Path
          d={`M${cx * 0.78},${h * 0.52} Q${cx * 0.68},${h * 0.54} ${cx * 0.64},${h * 0.72} Q${cx * 0.62},${h * 0.84} ${cx * 0.63},${h * 0.98} L${cx * 1.37},${h * 0.98} Q${cx * 1.38},${h * 0.84} ${cx * 1.36},${h * 0.72} Q${cx * 1.32},${h * 0.54} ${cx * 1.22},${h * 0.52} Q${cx * 1.1},${h * 0.48} ${cx},${h * 0.48} Q${cx * 0.9},${h * 0.48} ${cx * 0.78},${h * 0.52} Z`}
          fill="#3d6b50"
        />

        {/* ── Person: neck ── */}
        <Rect x={cx - cx * 0.08} y={h * 0.37} width={cx * 0.16} height={h * 0.14} rx={cx * 0.05} fill="#c9845a" />

        {/* ── Person: head ── */}
        <Circle cx={cx} cy={h * 0.28} r={cx * 0.2} fill="#c9845a" />

        {/* ── Person: hair ── */}
        <Path
          d={`M${cx - cx * 0.2},${h * 0.26} Q${cx - cx * 0.19},${h * 0.1} ${cx},${h * 0.08} Q${cx + cx * 0.19},${h * 0.1} ${cx + cx * 0.2},${h * 0.26} Q${cx + cx * 0.15},${h * 0.13} ${cx},${h * 0.11} Q${cx - cx * 0.15},${h * 0.13} ${cx - cx * 0.2},${h * 0.26} Z`}
          fill="#3d2b1f"
        />

        {/* ── Person: closed eyes (peaceful) ── */}
        <Path d={`M${cx - cx * 0.1},${h * 0.265} Q${cx - cx * 0.06},${h * 0.29} ${cx - cx * 0.02},${h * 0.265}`}
          stroke="#3d2b1f" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <Path d={`M${cx + cx * 0.02},${h * 0.265} Q${cx + cx * 0.06},${h * 0.29} ${cx + cx * 0.1},${h * 0.265}`}
          stroke="#3d2b1f" strokeWidth="1.8" fill="none" strokeLinecap="round" />

        {/* ── Person: gentle smile ── */}
        <Path d={`M${cx - cx * 0.07},${h * 0.31} Q${cx},${h * 0.34} ${cx + cx * 0.07},${h * 0.31}`}
          stroke="#3d2b1f" strokeWidth="1.5" fill="none" strokeLinecap="round" />

      </Svg>

      {/* Brain icon on left palm */}
      <View style={{
        position: 'absolute',
        top: h * 0.63,
        left: cx * 0.18,
        width: cx * 0.22,
        height: cx * 0.22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(237,247,240,0.9)',
        borderRadius: cx * 0.11,
      }}>
        <Brain size={cx * 0.14} color="#4a7c5f" />
      </View>

      {/* Heart icon on right palm */}
      <View style={{
        position: 'absolute',
        top: h * 0.63,
        right: cx * 0.18,
        width: cx * 0.22,
        height: cx * 0.22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(237,247,240,0.9)',
        borderRadius: cx * 0.11,
      }}>
        <Heart size={cx * 0.14} color="#2d5c3e" fill="#2d5c3e" />
      </View>
    </View>
  );
}

/* ─── Main screen ─── */
export default function Onboarding({ navigation }: any) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const isDark = scheme === 'dark';
  const { width } = useWindowDimensions();

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#0d1b14' : 'white' }}>

      {/* Small leaf — bottom right decorative */}
      <View style={{ position: 'absolute', bottom: 60, right: -12, zIndex: 0, opacity: isDark ? 0.15 : 0.5 }}>
        <LeafSprig width={70} height={90} flip />
      </View>

      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >

          {/* ── Hero ── */}
          <View style={{ position: 'relative' }}>

            {/* Menorah logo — top left */}
            <View style={{
              position: 'absolute', top: 14, left: 16, zIndex: 10,
              width: 46, height: 46, borderRadius: 23,
              backgroundColor: '#2d5c3e',
              alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
              shadowColor: '#2d5c3e',
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.3, shadowRadius: 6, elevation: 5,
            }}>
              <Image
                source={require('../../../assets/brand/menorah-logo-no-bg.png')}
                style={{ width: 34, height: 34 }}
                contentFit="contain"
              />
            </View>

            {/* Top-right leaf sprig */}
            <View style={{ position: 'absolute', top: 0, right: 0, zIndex: 0, opacity: isDark ? 0.2 : 0.55 }}>
              <LeafSprig width={80} height={105} flip />
            </View>

            <HeroIllustration width={width} />
          </View>

          {/* ── Text content ── */}
          <View style={{ paddingHorizontal: 26, paddingTop: 10 }}>

            {/* Welcome to */}
            <Text style={{
              fontSize: 18, fontWeight: '500',
              color: isDark ? '#9ab8a4' : '#3d4a3d',
              textAlign: 'center', marginBottom: 4,
            }}>
              Welcome to
            </Text>

            {/* Menorah Health */}
            <Text style={{
              fontSize: 36, fontWeight: '900',
              color: isDark ? '#7ab894' : '#2d5c3e',
              textAlign: 'center', letterSpacing: -0.5,
              marginBottom: 14,
            }}>
              Menorah Health
            </Text>

            {/* Heart divider */}
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              justifyContent: 'center', marginBottom: 14,
            }}>
              <View style={{ width: 36, height: 1.5, backgroundColor: '#4a7c5f', borderRadius: 2, marginRight: 10 }} />
              <Heart size={13} color="#4a7c5f" fill="#4a7c5f" />
              <View style={{ width: 36, height: 1.5, backgroundColor: '#4a7c5f', borderRadius: 2, marginLeft: 10 }} />
            </View>

            {/* Description */}
            <Text style={{
              fontSize: 15, color: isDark ? '#7a9a84' : '#5a6e5a',
              textAlign: 'center', lineHeight: 24,
              paddingHorizontal: 8, marginBottom: 20,
            }}>
              Private, secure counselling{'\n'}designed to support your{'\n'}mental well-being.
            </Text>

            {/* Trust badge */}
            <View style={{
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f2f8f4',
              borderRadius: 18, padding: 14,
              flexDirection: 'row', alignItems: 'center',
              borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(0,0,0,0.07)',
              marginBottom: 20,
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

            {/* Get Started */}
            <TouchableOpacity
              onPress={() => navigation.navigate("Login")}
              activeOpacity={0.88}
              style={{
                backgroundColor: '#2d5c3e',
                borderRadius: 16, height: 58,
                flexDirection: 'row', alignItems: 'center',
                paddingHorizontal: 20, marginBottom: 12,
                shadowColor: '#2d5c3e',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.28, shadowRadius: 10, elevation: 5,
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
                flex: 1, fontSize: 17, fontWeight: '800',
                color: 'white', textAlign: 'center', marginLeft: -34,
              }}>
                Get Started
              </Text>
              <ArrowRight size={19} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>

            {/* Help & Helplines */}
            <TouchableOpacity
              onPress={() => Linking.openURL("https://menorah.me/")}
              activeOpacity={0.88}
              style={{
                backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'white',
                borderRadius: 16, height: 58,
                flexDirection: 'row', alignItems: 'center',
                paddingHorizontal: 20, marginBottom: 18,
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
                color: '#2d5c3e', textAlign: 'center', marginLeft: -34,
              }}>
                Help & Helplines
              </Text>
              <ArrowRight size={19} color="#2d5c3e" />
            </TouchableOpacity>

            {/* Footer */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' }}>
              <Lock size={12} color={isDark ? colors.muted : '#8a9a8a'} style={{ marginTop: 3, marginRight: 5 }} />
              <Text style={{ fontSize: 12, color: isDark ? colors.muted : '#7a8a7a', textAlign: 'center', lineHeight: 19, flex: 1 }}>
                By continuing, you agree to our{' '}
                <Text
                  onPress={() => Linking.openURL("https://menorah.me/terms-and-conditions")}
                  style={{ color: '#2d5c3e', fontWeight: '700' }}
                >
                  Terms
                </Text>
                {' '}and{' '}
                <Text
                  onPress={() => Linking.openURL("https://menorah.me/privacy-policy")}
                  style={{ color: '#2d5c3e', fontWeight: '700' }}
                >
                  Privacy Policy
                </Text>
                .
              </Text>
            </View>

          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
