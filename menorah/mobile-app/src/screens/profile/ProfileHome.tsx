import { View, Text, ScrollView, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import {
  CalendarDays, BookOpen, MessageCircleMore, Pencil,
  ShieldCheck, FileText, LogOut, ChevronRight,
  User, Settings, MessageSquare, Heart,
} from "lucide-react-native";
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";
import { useAuth } from "@/state/useAuth";
import { CommonActions, useNavigation } from "@react-navigation/native";

const WELLNESS_TIPS = [
  "Taking care of yourself isn't selfish. It's essential. Remember to breathe deeply and practice self-compassion today.",
  "Small steps every day lead to big changes. Be patient with yourself on this journey.",
  "Your mental health matters. Reaching out for support is a sign of strength, not weakness.",
  "Rest is not laziness. Giving yourself time to recharge is an act of self-care.",
];

const dailyTip = WELLNESS_TIPS[new Date().getDay() % WELLNESS_TIPS.length];

const QUICK_ACTIONS = [
  {
    icon: CalendarDays,
    label: 'Book Your\nFirst Session',
    sub: 'Start your wellness journey',
    route: 'GenderSelection',
  },
  {
    icon: BookOpen,
    label: 'Wellness\nResources',
    sub: 'Articles, exercises and more',
    route: 'CrisisHelp',
  },
  {
    icon: MessageCircleMore,
    label: 'Get\nSupport',
    sub: "We're here to help",
    route: 'CrisisHelp',
  },
];

const ACCOUNT_ITEMS = [
  { icon: User,     label: 'Edit Profile',       sub: 'Update your personal information', route: 'EditProfile', danger: false },
  { icon: Settings, label: 'Settings & Privacy', sub: 'Manage your preferences',          route: 'Settings',    danger: false },
  { icon: FileText, label: 'Terms & Privacy',    sub: 'Read our policies',                route: 'Legal',       danger: false },
  { icon: LogOut,   label: 'Sign Out',           sub: 'Logout from your account',         route: null,          danger: true  },
];

export default function ProfileHome({ navigation }: any) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const { logout, user } = useAuth();
  const rootNavigation = useNavigation();
  const isDark = scheme === 'dark';

  const memberSince = (() => {
    try {
      if (!user?.createdAt) return null;
      return new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } catch { return null; }
  })();

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out', style: 'destructive',
          onPress: async () => {
            try { await logout(); } catch {}
            setTimeout(() => {
              try {
                const rootNav = navigation.getParent()?.getParent();
                if (rootNav?.reset) {
                  rootNav.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
                } else {
                  rootNavigation.dispatch(
                    CommonActions.reset({ index: 0, routes: [{ name: 'Onboarding' }] })
                  );
                }
              } catch {}
            }, 250);
          },
        },
      ],
      { cancelable: true }
    );
  };

  const cardBg   = isDark ? colors.surface : '#ffffff';
  const pageBg   = isDark ? colors.bg : '#f5f7f5';
  const bannerBg = isDark ? '#1a2e22' : '#edf7f1';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: pageBg }}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 36 }}
      >

        {/* ── Hero Header ── */}
        <View style={{
          backgroundColor: colors.primary,
          paddingTop: 20, paddingBottom: 28, paddingHorizontal: 20,
          borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
          overflow: 'hidden', position: 'relative',
        }}>
          {/* Decorative circles */}
          <View style={{
            position: 'absolute', right: -20, top: -40,
            width: 180, height: 180, borderRadius: 90,
            backgroundColor: 'rgba(255,255,255,0.06)',
          }} />
          <View style={{
            position: 'absolute', right: 30, bottom: -60,
            width: 140, height: 140, borderRadius: 70,
            backgroundColor: 'rgba(255,255,255,0.05)',
          }} />

          {/* Edit pencil button — top right */}
          <TouchableOpacity
            onPress={() => navigation.navigate('EditProfile')}
            style={{
              position: 'absolute', top: 16, right: 16,
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: 'rgba(255,255,255,0.18)',
              alignItems: 'center', justifyContent: 'center',
              zIndex: 1,
            }}
          >
            <Pencil size={17} color="white" strokeWidth={2.2} />
          </TouchableOpacity>

          {/* Avatar + info row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            {/* Avatar */}
            {user?.profileImage ? (
              <Image
                source={{ uri: user.profileImage }}
                style={{
                  width: 80, height: 80, borderRadius: 40,
                  borderWidth: 3, borderColor: 'rgba(255,255,255,0.7)',
                  marginRight: 16,
                }}
                contentFit="cover"
              />
            ) : (
              <View style={{
                width: 80, height: 80, borderRadius: 40,
                borderWidth: 3, borderColor: 'rgba(255,255,255,0.7)',
                backgroundColor: 'rgba(255,255,255,0.15)',
                alignItems: 'center', justifyContent: 'center',
                marginRight: 16,
              }}>
                <Text style={{ fontSize: 32, fontWeight: '900', color: 'white' }}>
                  {user?.firstName?.charAt(0)?.toUpperCase() || 'U'}
                </Text>
              </View>
            )}

            {/* Name / email / badge */}
            <View style={{ flex: 1 }}>
              <Text style={{
                fontSize: 22, fontWeight: '800', color: 'white',
                letterSpacing: -0.3, marginBottom: 4,
              }}>
                {user ? `${user.firstName} ${user.lastName}` : 'User'}
              </Text>
              <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.80)', marginBottom: 12 }}>
                {user?.email || ''}
              </Text>
              {/* Member badge */}
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 5,
                backgroundColor: 'rgba(255,255,255,0.18)',
                alignSelf: 'flex-start',
                paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
              }}>
                <ShieldCheck size={12} color="white" />
                <Text style={{ fontSize: 11, fontWeight: '700', color: 'white' }}>
                  {memberSince ? `Member since ${memberSince}` : 'Verified Member'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Quick Actions ── */}
        <View style={{ paddingHorizontal: 20, marginTop: 24, marginBottom: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 14, letterSpacing: -0.2 }}>
            Quick Actions
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {QUICK_ACTIONS.map((item, i) => {
              const Icon = item.icon;
              return (
                <TouchableOpacity
                  key={i}
                  onPress={() => navigation.navigate(item.route)}
                  activeOpacity={0.88}
                  style={{
                    flex: 1,
                    backgroundColor: cardBg,
                    borderRadius: 18,
                    paddingVertical: 18, paddingHorizontal: 10,
                    alignItems: 'center',
                    borderWidth: 1, borderColor: colors.border,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: isDark ? 0.1 : 0.04,
                    shadowRadius: 4, elevation: 1,
                  }}
                >
                  <View style={{
                    width: 46, height: 46, borderRadius: 15,
                    backgroundColor: colors.primary + '12',
                    alignItems: 'center', justifyContent: 'center',
                    marginBottom: 12,
                  }}>
                    <Icon size={22} color={colors.primary} />
                  </View>
                  <Text style={{
                    fontSize: 12, fontWeight: '700', color: colors.text,
                    textAlign: 'center', marginBottom: 5, lineHeight: 17,
                  }}>
                    {item.label}
                  </Text>
                  <Text style={{
                    fontSize: 10, color: colors.muted,
                    textAlign: 'center', lineHeight: 14,
                  }}>
                    {item.sub}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Wellness Tip ── */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <View style={{
            backgroundColor: cardBg, borderRadius: 20,
            borderWidth: 1, borderColor: colors.border,
            overflow: 'hidden', flexDirection: 'row', minHeight: 130,
          }}>
            {/* Left text */}
            <View style={{ flex: 1, padding: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <View style={{
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: colors.primary + '12',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Heart size={18} color={colors.primary} />
                </View>
                <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>Wellness Tip</Text>
                <Text style={{ fontSize: 16 }}>🌱</Text>
              </View>
              <Text style={{ fontSize: 14, color: colors.text, lineHeight: 22 }}>
                {dailyTip}
              </Text>
            </View>

            {/* Right plant illustration */}
            <View style={{
              width: 90,
              backgroundColor: colors.primary + '08',
              alignItems: 'center', justifyContent: 'flex-end',
              paddingBottom: 10,
            }}>
              {/* Pot */}
              <View style={{
                width: 38, height: 24, borderRadius: 5,
                backgroundColor: colors.primary + '45',
              }} />
              {/* Stem */}
              <View style={{
                position: 'absolute', bottom: 30, left: 44,
                width: 3, height: 46, borderRadius: 2,
                backgroundColor: colors.primary + '55',
              }} />
              {/* Leaves */}
              {[
                { left: 30, bottom: 58,  rotate: '-35deg', w: 24, h: 13 },
                { left: 48, bottom: 65,  rotate: '35deg',  w: 24, h: 13 },
                { left: 34, bottom: 76,  rotate: '-20deg', w: 20, h: 11 },
                { left: 48, bottom: 82,  rotate: '25deg',  w: 18, h: 10 },
              ].map((leaf, i) => (
                <View key={i} style={{
                  position: 'absolute',
                  left: leaf.left, bottom: leaf.bottom,
                  width: leaf.w, height: leaf.h,
                  borderRadius: leaf.h / 2,
                  backgroundColor: colors.primary + (i < 2 ? '65' : '45'),
                  transform: [{ rotate: leaf.rotate }],
                }} />
              ))}
            </View>
          </View>
        </View>

        {/* ── Account ── */}
        <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 14, letterSpacing: -0.2 }}>
            Account
          </Text>
          <View style={{
            backgroundColor: cardBg, borderRadius: 20,
            borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
          }}>
            {ACCOUNT_ITEMS.map((item, i) => {
              const Icon = item.icon;
              return (
                <TouchableOpacity
                  key={i}
                  onPress={item.danger ? handleSignOut : () => navigation.navigate(item.route!)}
                  activeOpacity={0.82}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 16, paddingVertical: 15,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: colors.border,
                  }}
                >
                  <View style={{
                    width: 40, height: 40, borderRadius: 12,
                    backgroundColor: item.danger ? '#fef2f2' : colors.primary + '12',
                    alignItems: 'center', justifyContent: 'center',
                    marginRight: 14,
                  }}>
                    <Icon size={19} color={item.danger ? '#ef4444' : colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{
                      fontSize: 15, fontWeight: '700',
                      color: item.danger ? '#ef4444' : colors.text,
                      marginBottom: 2,
                    }}>
                      {item.label}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>
                      {item.sub}
                    </Text>
                  </View>
                  <ChevronRight size={17} color={item.danger ? '#ef4444' : colors.muted} strokeWidth={2.5} />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Feedback banner ── */}
        <View style={{ paddingHorizontal: 20 }}>
          <TouchableOpacity
            activeOpacity={0.88}
            style={{
              backgroundColor: bannerBg, borderRadius: 18,
              padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14,
              borderWidth: 1, borderColor: colors.primary + '28',
            }}
          >
            <View style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: colors.primary + '18',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <MessageSquare size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 }}>
                We'd love your feedback!
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>
                Help us improve your experience
              </Text>
            </View>
            <ChevronRight size={16} color={colors.muted} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
