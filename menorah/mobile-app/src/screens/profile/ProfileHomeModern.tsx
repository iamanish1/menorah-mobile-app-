import { Alert, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { CommonActions, useNavigation } from '@react-navigation/native';
import {
  BookOpen,
  CalendarDays,
  Heart,
  LogOut,
  MessageCircleMore,
  Pencil,
  Settings,
  ShieldCheck,
  User,
} from 'lucide-react-native';
import {
  IOSActionCard,
  IOSCard,
  IOSHeader,
  IOSIconButton,
  IOSListItem,
  IOSScreen,
  IOSSectionHeader,
  useIOSTheme,
} from '@/components/ios';
import { useAuth } from '@/state/useAuth';

const WELLNESS_TIPS = [
  "Taking care of yourself isn't selfish. It's essential. Remember to breathe deeply and practice self-compassion today.",
  'Small steps every day lead to big changes. Be patient with yourself on this journey.',
  'Your mental health matters. Reaching out for support is a sign of strength, not weakness.',
  'Rest is not laziness. Giving yourself time to recharge is an act of self-care.',
];

const dailyTip = WELLNESS_TIPS[new Date().getDay() % WELLNESS_TIPS.length];

const QUICK_ACTIONS = [
  {
    icon: CalendarDays,
    label: 'Book a session',
    sub: 'Start your wellness journey',
    route: 'GenderSelection',
  },
  {
    icon: BookOpen,
    label: 'Resources',
    sub: 'Articles and support',
    route: 'CrisisHelp',
  },
  {
    icon: MessageCircleMore,
    label: 'Get support',
    sub: "We're here to help",
    route: 'CrisisHelp',
  },
];

const ACCOUNT_ITEMS = [
  { icon: User, label: 'Edit Profile', sub: 'Update your personal information', route: 'EditProfile', danger: false },
  { icon: Settings, label: 'Settings & Privacy', sub: 'Manage preferences and account deletion', route: 'Settings', danger: false },
  { icon: LogOut, label: 'Sign Out', sub: 'Logout from your account', route: null, danger: true },
];

const kycSubtitle = (status?: string) => {
  if (status === 'verified') return 'Verified with eKYC';
  if (status === 'manual_review' || status === 'pending') return 'Admin review in progress';
  if (status === 'rejected') return 'Resubmit clear identity photos';
  return 'Complete secure identity verification';
};

export default function ProfileHome({ navigation }: any) {
  const { logout, user } = useAuth();
  const rootNavigation = useNavigation();
  const iosTheme = useIOSTheme();

  const memberSince = (() => {
    try {
      if (!user?.createdAt) return null;
      return new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } catch {
      return null;
    }
  })();

  const initials = user?.firstName?.charAt(0)?.toUpperCase() || 'U';
  const kycStatus = user?.kyc?.status || 'not_started';
  const accountItems = [
    {
      icon: ShieldCheck,
      label: 'Identity Verification',
      sub: kycSubtitle(kycStatus),
      route: 'IdentityVerification',
      danger: false,
    },
    ...ACCOUNT_ITEMS,
  ];

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await logout();
            } catch (error) {
              console.warn('[ProfileHome] Logout failed before local reset:', error);
            }

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
              } catch (error) {
                console.warn('[ProfileHome] Failed to reset navigation after logout:', error);
              }
            }, 250);
          },
        },
      ],
      { cancelable: true }
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: iosTheme.colors.background }}>
      <IOSHeader
        title="Profile"
        subtitle="Settings and support"
        showWordmark={false}
        onMenuPress={() => navigation.navigate('Settings')}
        onRightPress={() => navigation.navigate('EditProfile')}
        rightIcon={Pencil}
      />

      <IOSScreen edges={['right', 'bottom', 'left']} contentContainerStyle={{ paddingTop: iosTheme.spacing.sm }}>
        <IOSCard contentStyle={{ padding: 0 }}>
          <View
            style={{
              backgroundColor: iosTheme.colors.primaryDeep,
              padding: iosTheme.spacing.xl,
              borderBottomLeftRadius: iosTheme.radius.xl,
              borderBottomRightRadius: iosTheme.radius.xl,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: iosTheme.spacing.md }}>
              {user?.profileImage ? (
                <Image
                  source={{ uri: user.profileImage }}
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 36,
                    borderWidth: 2,
                    borderColor: iosTheme.colors.inverseTextMuted,
                    flexShrink: 0,
                  }}
                  contentFit="cover"
                />
              ) : (
                <View
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 36,
                    borderWidth: 2,
                    borderColor: iosTheme.colors.inverseTextMuted,
                    backgroundColor: iosTheme.colors.inverseSurface,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Text style={{ color: iosTheme.colors.inverseText, fontSize: 28, lineHeight: 34, fontWeight: '900' }}>
                    {initials}
                  </Text>
                </View>
              )}

              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{ color: iosTheme.colors.inverseText, fontSize: 19, lineHeight: 24, fontWeight: '900' }}
                  numberOfLines={1}
                >
                  {user ? `${user.firstName} ${user.lastName}` : 'User'}
                </Text>
                <Text
                  style={{ color: iosTheme.colors.inverseTextMuted, fontSize: 13, lineHeight: 19, marginTop: 3 }}
                  numberOfLines={1}
                >
                  {user?.email || ''}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    alignSelf: 'flex-start',
                    gap: iosTheme.spacing.xs,
                    backgroundColor: iosTheme.colors.inverseSurface,
                    paddingHorizontal: iosTheme.spacing.md,
                    paddingVertical: 7,
                    borderRadius: iosTheme.radius.pill,
                    marginTop: iosTheme.spacing.md,
                  }}
                >
                  <ShieldCheck size={13} color={iosTheme.colors.inverseText} strokeWidth={2.2} />
                  <Text style={{ color: iosTheme.colors.inverseText, fontSize: 11, lineHeight: 14, fontWeight: '800' }}>
                    {kycStatus === 'verified' ? 'Identity verified' : memberSince ? `Member since ${memberSince}` : 'Member'}
                  </Text>
                </View>
              </View>

              <IOSIconButton
                icon={Pencil}
                onPress={() => navigation.navigate('EditProfile')}
                accessibilityLabel="Edit profile"
                color={iosTheme.colors.inverseText}
                backgroundColor={iosTheme.colors.inverseSurface}
                style={{ borderColor: iosTheme.colors.inverseSurfaceBorder, shadowOpacity: 0, flexShrink: 0 }}
              />
            </View>
          </View>

          <View style={{ padding: iosTheme.spacing.xl }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: iosTheme.spacing.md }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 18,
                  backgroundColor: iosTheme.colors.surfaceAlt,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Heart size={21} color={iosTheme.colors.primary} strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={iosTheme.typography.cardTitle}>Wellness Tip</Text>
                <Text style={[iosTheme.typography.body, { marginTop: iosTheme.spacing.xs }]}>
                  {dailyTip}
                </Text>
              </View>
            </View>
          </View>
        </IOSCard>

        {kycStatus !== 'verified' ? (
          <IOSActionCard
            dark
            icon={ShieldCheck}
            title={kycStatus === 'manual_review' || kycStatus === 'pending' ? 'Identity under review' : 'Verify identity'}
            subtitle={kycSubtitle(kycStatus)}
            actionLabel={kycStatus === 'manual_review' || kycStatus === 'pending' ? 'View status' : 'Start eKYC'}
            onPress={() => navigation.navigate('IdentityVerification')}
            style={{ marginTop: iosTheme.spacing.md }}
          />
        ) : null}

        <IOSSectionHeader title="Quick Actions" />
        <View style={{ gap: iosTheme.spacing.md }}>
          {QUICK_ACTIONS.map((item) => (
            <IOSActionCard
              key={item.label}
              compact
              icon={item.icon}
              title={item.label}
              subtitle={item.sub}
              onPress={() => navigation.navigate(item.route)}
            />
          ))}
        </View>

        <IOSSectionHeader title="Account" />
        <IOSCard>
          {accountItems.map((item, index) => (
            <IOSListItem
              key={item.label}
              title={item.label}
              subtitle={item.sub}
              icon={item.icon}
              danger={item.danger}
              showDivider={index < accountItems.length - 1}
              onPress={item.danger ? handleSignOut : () => navigation.navigate(item.route)}
            />
          ))}
        </IOSCard>
      </IOSScreen>
    </View>
  );
}
