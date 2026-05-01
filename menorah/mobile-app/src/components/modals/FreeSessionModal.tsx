import { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, Modal, Animated,
  Dimensions, Platform,
} from 'react-native';
import { X, Sparkles, ShieldCheck, Clock, Heart } from 'lucide-react-native';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';

interface FreeSessionModalProps {
  visible: boolean;
  onClose: () => void;
  onBookSession: () => void;
}

const { width } = Dimensions.get('window');

const FEATURES = [
  { icon: Clock,       label: '45-minute session',      sub: 'A full session, completely free' },
  { icon: ShieldCheck, label: 'Completely confidential', sub: 'Your privacy is our priority' },
  { icon: Heart,       label: 'Expert counsellors',      sub: 'Licensed & experienced professionals' },
];

export default function FreeSessionModal({ visible, onClose, onBookSession }: FreeSessionModalProps) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 200 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scaleAnim, { toValue: 0.85, duration: 150, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={{
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
      }}>
        <Animated.View style={{
          width: '100%',
          maxWidth: 360,
          opacity: opacityAnim,
          transform: [{ scale: scaleAnim }],
        }}>
          {/* Card */}
          <View style={{
            backgroundColor: colors.card,
            borderRadius: 28,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: colors.border,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.3,
            shadowRadius: 24,
            elevation: 16,
          }}>
            {/* Top accent strip */}
            <View style={{
              height: 4,
              backgroundColor: colors.primary,
            }} />

            {/* Main content */}
            <View style={{ padding: 24 }}>
              {/* Close button */}
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{ position: 'absolute', top: 16, right: 16, zIndex: 1 }}
              >
                <View style={{
                  backgroundColor: colors.surface,
                  borderRadius: 20,
                  padding: 6,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}>
                  <X size={16} color={colors.muted} />
                </View>
              </TouchableOpacity>

              {/* Icon badge */}
              <View style={{ alignItems: 'center', marginBottom: 16, marginTop: 4 }}>
                <View style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: colors.primary + '18',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 2,
                  borderColor: colors.primary + '30',
                }}>
                  <Sparkles size={28} color={colors.primary} />
                </View>

                {/* FREE pill */}
                <View style={{
                  backgroundColor: colors.primary,
                  paddingHorizontal: 12,
                  paddingVertical: 3,
                  borderRadius: 20,
                  marginTop: -10,
                  marginLeft: 36,
                }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.8 }}>
                    FREE
                  </Text>
                </View>
              </View>

              {/* Headline */}
              <Text style={{
                fontSize: 22,
                fontWeight: '800',
                color: colors.cardText,
                textAlign: 'center',
                marginBottom: 6,
                lineHeight: 28,
              }}>
                Your First Session is on Us
              </Text>
              <Text style={{
                fontSize: 13,
                color: colors.muted,
                textAlign: 'center',
                lineHeight: 19,
                marginBottom: 22,
                paddingHorizontal: 8,
              }}>
                Begin your mental health journey with a complimentary session from one of our expert counsellors.
              </Text>

              {/* Feature rows */}
              <View style={{
                backgroundColor: colors.surface,
                borderRadius: 16,
                padding: 14,
                marginBottom: 22,
                borderWidth: 1,
                borderColor: colors.border,
                gap: 12,
              }}>
                {FEATURES.map(({ icon: Icon, label, sub }, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: colors.primary + '15',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Icon size={17} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.cardText }}>{label}</Text>
                      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>{sub}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* CTA buttons */}
              <TouchableOpacity
                onPress={onBookSession}
                activeOpacity={0.85}
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: 16,
                  paddingVertical: 15,
                  alignItems: 'center',
                  marginBottom: 10,
                  shadowColor: colors.primary,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.35,
                  shadowRadius: 8,
                  elevation: 6,
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: 0.2 }}>
                  Book My Free Session
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onClose}
                activeOpacity={0.7}
                style={{ alignItems: 'center', paddingVertical: 8 }}
              >
                <Text style={{ fontSize: 13, color: colors.muted, fontWeight: '500' }}>
                  Maybe later
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
