import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { ActivityIndicator, Animated, FlatList, Linking, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  CreditCard,
  FileText,
  HeartPulse,
  Instagram,
  MessageCircle,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  User,
  Users,
} from 'lucide-react-native';
import HelpSheet from '@/components/help/HelpSheet';
import FreeSessionModal from '@/components/modals/FreeSessionModal';
import {
  IOSActionCard,
  IOSArticleCard,
  IOSCard,
  IOSChatBanner,
  IOSDiscoverHeader,
  IOSHeroCard,
  IOSScreen,
  IOSSectionHeader,
  useIOSTheme,
} from '@/components/ios';
import { discoverScrollY } from '@/components/ios/iosScrollSignals';
import { useArticles } from '@/hooks/useArticles';
import { INSTA } from '@/mock/instagram';
import { mockCounsellors } from '@/mock/counsellors';
import { SUBSCRIPTION_PLANS } from '@/screens/subscription/subscriptionPlans';
import subscriptionService from '@/services/subscriptionService';
import { useNotifications } from '@/state/useNotifications';
import type { Article } from '@/types/article';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type SessionType = 'basic' | 'premium' | 'pro';

type SearchIconProps = {
  color?: string;
  size?: number;
  strokeWidth?: number;
};

type SearchDestination = {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  keywords: SearchKeyword[];
  Icon: ComponentType<SearchIconProps>;
  onPress: () => void;
  color?: string;
};

type SearchGroup = {
  title: string;
  results: SearchDestination[];
};

type SearchKeyword = string | number | null | undefined | SearchKeyword[];

const SESSION_DETAILS: Record<SessionType, { duration: number; price: number; label: string }> = {
  basic: { duration: 45, price: 1000, label: '45 min' },
  premium: { duration: 60, price: 2000, label: '60 min' },
  pro: { duration: 90, price: 3000, label: '90 min' },
};

const SESSION_SEARCH_ITEMS: Array<{
  id: SessionType;
  title: string;
  description: string;
  keywords: SearchKeyword[];
}> = [
  {
    id: 'basic',
    title: 'Basic session',
    description: '45 minutes for getting started with support.',
    keywords: ['basic', '45', '45 min', 'session', 'therapy', 'counselling', 'counseling', 'book', 'INR 1000', '1000'],
  },
  {
    id: 'premium',
    title: 'Premium session',
    description: '60 minutes for a deeper therapy experience.',
    keywords: [
      'premium',
      '60',
      '60 min',
      'session',
      'therapy',
      'counselling',
      'counseling',
      'book',
      'INR 2000',
      '2000',
    ],
  },
  {
    id: 'pro',
    title: 'Pro session',
    description: '90 minutes for an extended deep-dive session.',
    keywords: ['pro', '90', '90 min', 'session', 'therapy', 'counselling', 'counseling', 'book', 'INR 3000', '3000'],
  },
];

function flattenSearchKeywords(values: SearchKeyword[]): Array<string | number> {
  return values.flatMap((value): Array<string | number> => {
    if (Array.isArray(value)) {
      return flattenSearchKeywords(value);
    }

    if (value === null || value === undefined) {
      return [];
    }

    return [value];
  });
}

function matchesSearch(result: SearchDestination, normalizedQuery: string) {
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const haystack = flattenSearchKeywords([result.title, result.subtitle, result.badge, ...result.keywords])
    .join(' ')
    .toLowerCase();

  return tokens.every((token) => {
    const candidates = token.endsWith('s') && token.length > 3 ? [token, token.slice(0, -1)] : [token];
    return candidates.some((candidate) => haystack.includes(candidate));
  });
}

export default function Discover({ navigation }: any) {
  const [help, setHelp] = useState(false);
  const [q, setQ] = useState('');
  const [showFreeSessionModal, setShowFreeSessionModal] = useState(false);
  const { unreadCount } = useNotifications();
  const insets = useSafeAreaInsets();
  const iosTheme = useIOSTheme();
  const trimmedQuery = q.trim();
  const normalizedQuery = trimmedQuery.toLowerCase();
  const isSearching = normalizedQuery.length > 0;
  const {
    data: articlesData,
    isLoading: articlesLoading,
    isError: articlesError,
    refetch: refetchArticles,
  } = useArticles({
    page: 1,
    limit: isSearching ? 30 : 8,
    q: isSearching ? trimmedQuery : undefined,
  });
  const articles = articlesData?.articles || [];

  useEffect(() => {
    const checkModal = async () => {
      try {
        const seen = await AsyncStorage.getItem('hasSeenFreeSessionModal');
        if (seen) return;

        const hasPremium = await subscriptionService.hasPremiumSubscription();
        if (!hasPremium) setShowFreeSessionModal(true);
      } catch (error) {
        console.warn('Unable to check subscription modal state:', error);
      }
    };

    const timer = setTimeout(checkModal, 800);
    return () => clearTimeout(timer);
  }, []);

  const handleCloseModal = async () => {
    await AsyncStorage.setItem('hasSeenFreeSessionModal', 'true').catch(() => {});
    setShowFreeSessionModal(false);
  };

  const handleBookFreeSession = async () => {
    await AsyncStorage.setItem('hasSeenFreeSessionModal', 'true').catch(() => {});
    setShowFreeSessionModal(false);
    navigation.navigate('GenderSelection');
  };

  const handleSessionSelect = (sessionType: SessionType) => {
    const details = SESSION_DETAILS[sessionType];
    navigation.navigate('GenderSelection', {
      sessionType,
      duration: details.duration,
      price: details.price,
    });
  };

  const openArticle = (article: Article) => {
    navigation.navigate('ArticleDetail', { slug: article.slug });
  };

  const searchGroups = useMemo<SearchGroup[]>(() => {
    if (!isSearching) {
      return [];
    }

    const filterResults = (results: SearchDestination[]) =>
      results.filter((result) => matchesSearch(result, normalizedQuery));

    const sessionResults = filterResults(
      SESSION_SEARCH_ITEMS.map((session) => {
        const details = SESSION_DETAILS[session.id];

        return {
          id: `session-${session.id}`,
          badge: 'SESSION',
          title: session.title,
          subtitle: `${details.label} - INR ${details.price}. ${session.description}`,
          keywords: ['appointment', 'booking', 'price', 'pricing', session.keywords],
          Icon: ShieldCheck,
          onPress: () => handleSessionSelect(session.id),
        };
      }),
    );

    const subscriptionResults = filterResults(
      SUBSCRIPTION_PLANS.map((plan) => ({
        id: `subscription-${plan.id}`,
        badge: 'SUBSCRIPTION',
        title: plan.title,
        subtitle: `${plan.price} - ${plan.billingLabel}. ${plan.description}`,
        keywords: [
          plan.shortLabel,
          plan.description,
          plan.billingLabel,
          plan.features,
          'subscription',
          'subs',
          'membership',
          'premium access',
          'premium',
          'payment',
          'pricing',
          'plan',
        ],
        Icon: CreditCard,
        onPress: () =>
          navigation.navigate('SubscriptionDetails', {
            subscriptionType: plan.id,
          }),
        color: plan.color,
      })),
    );

    const articleResults = articles.map((article) => ({
      id: `article-${article.id || article._id || article.slug}`,
      badge: article.category || 'ARTICLE',
      title: article.title,
      subtitle: article.excerpt || article.readTime || 'Read this article in the app.',
      keywords: [
        article.category,
        article.excerpt,
        article.tags,
        article.readTime,
        article.contentBlocks?.flatMap((block) => [block.text, block.alt, block.caption, block.items]),
        'article',
        'articles',
        'blog',
        'read',
        'cms',
        'mental health',
        'wellness',
      ],
      Icon: FileText,
      onPress: () => openArticle(article),
    }));

    const socialResults = filterResults(
      INSTA.map((post) => ({
        id: `instagram-${post.id}`,
        badge: 'INSTAGRAM',
        title: 'Community update',
        subtitle: post.caption || 'Open this Instagram update.',
        keywords: [
          'instagram',
          'insta',
          'post',
          'posts',
          'psot',
          'psots',
          'update',
          'updates',
          'community',
          'social',
          post.platform,
          post.caption,
        ],
        Icon: Instagram,
        onPress: () => Linking.openURL(post.url),
      })),
    );

    const counsellorResults = filterResults(
      mockCounsellors.map((c) => ({
        id: `counsellor-${c.id}`,
        badge: 'COUNSELLOR',
        title: c.name,
        subtitle: `${c.specialization} - ${c.language}`,
        keywords: [
          c.name,
          c.specialization,
          c.language,
          c.languages,
          c.location,
          c.specializations,
          c.availability,
          'counsellor',
          'counselor',
          'therapist',
          'therapy',
          'support',
        ],
        Icon: Users,
        onPress: () =>
          navigation.navigate('CounsellorList', {
            initialSearch: trimmedQuery,
          }),
      })),
    );

    const featureResults = filterResults([
      {
        id: 'feature-counsellors',
        badge: 'FEATURE',
        title: 'Find counsellors',
        subtitle: 'Browse therapists by issue, language, and availability.',
        keywords: [
          'find support',
          'counsellors',
          'counselors',
          'therapists',
          'doctors',
          'anxiety',
          'depression',
          'stress',
          'trauma',
          'help',
        ],
        Icon: Users,
        onPress: () =>
          navigation.navigate('CounsellorList', {
            initialSearch: trimmedQuery,
          }),
      },
      {
        id: 'feature-book-session',
        badge: 'FEATURE',
        title: 'Book a session',
        subtitle: 'Choose your session type and start a booking.',
        keywords: [
          'book',
          'booking',
          'appointment',
          'session',
          'basic',
          'premium',
          'pro',
          'therapy',
          'calendar',
          'schedule',
        ],
        Icon: CalendarDays,
        onPress: () => navigation.navigate('GenderSelection'),
      },
      {
        id: 'feature-articles',
        badge: 'FEATURE',
        title: 'Article library',
        subtitle: 'Search and read CMS articles inside the app.',
        keywords: ['articles', 'article', 'blog', 'cms', 'read', 'updates', 'mental health reads', 'wellness'],
        Icon: BookOpen,
        onPress: () => navigation.navigate('ArticleList', { initialSearch: trimmedQuery }),
      },
      {
        id: 'feature-bookings',
        badge: 'FEATURE',
        title: 'Your bookings',
        subtitle: 'See upcoming and past therapy bookings.',
        keywords: ['bookings', 'appointments', 'calendar', 'schedule', 'upcoming', 'past sessions'],
        Icon: CalendarDays,
        onPress: () => navigation.navigate('Bookings'),
      },
      {
        id: 'feature-chat',
        badge: 'FEATURE',
        title: 'Chat',
        subtitle: 'Open your support conversations.',
        keywords: ['chat', 'messages', 'conversation', 'support', 'talk', 'help'],
        Icon: MessageCircle,
        onPress: () => navigation.navigate('Chat'),
      },
      {
        id: 'feature-alerts',
        badge: 'FEATURE',
        title: 'Alerts',
        subtitle: 'Open notifications and app alerts.',
        keywords: ['alerts', 'notifications', 'bell', 'updates', 'reminders'],
        Icon: Bell,
        onPress: () => navigation.navigate('Notifications'),
      },
      {
        id: 'feature-profile',
        badge: 'FEATURE',
        title: 'Profile',
        subtitle: 'Manage your Menorah account.',
        keywords: ['profile', 'account', 'user', 'personal details', 'edit profile'],
        Icon: User,
        onPress: () => navigation.navigate('Profile'),
      },
      {
        id: 'feature-settings',
        badge: 'FEATURE',
        title: 'Settings',
        subtitle: 'Change app and account settings.',
        keywords: ['settings', 'preferences', 'account settings', 'app settings'],
        Icon: Settings,
        onPress: () => navigation.navigate('Settings'),
      },
      {
        id: 'feature-ekyc',
        badge: 'FEATURE',
        title: 'Identity verification',
        subtitle: 'Complete or review optional eKYC verification.',
        keywords: ['identity', 'verification', 'ekyc', 'e kyc', 'kyc', 'face id', 'selfie', 'verify account'],
        Icon: Shield,
        onPress: () => navigation.navigate('IdentityVerification'),
      },
      {
        id: 'feature-privacy',
        badge: 'FEATURE',
        title: 'Privacy settings',
        subtitle: 'Control privacy and security options.',
        keywords: ['privacy', 'security', 'private', 'confidential', 'data'],
        Icon: ShieldCheck,
        onPress: () => navigation.navigate('PrivacySettings'),
      },
      {
        id: 'feature-crisis',
        badge: 'FEATURE',
        title: 'Crisis help',
        subtitle: 'Open urgent support resources.',
        keywords: ['crisis', 'emergency', 'urgent', 'help', 'support', 'hotline', 'danger'],
        Icon: HeartPulse,
        onPress: () => navigation.navigate('CrisisHelp'),
      },
      {
        id: 'feature-legal',
        badge: 'FEATURE',
        title: 'Legal',
        subtitle: 'Read app policies and legal information.',
        keywords: ['legal', 'terms', 'privacy policy', 'policy', 'policies', 'conditions'],
        Icon: FileText,
        onPress: () => navigation.navigate('Legal'),
      },
      {
        id: 'feature-premium',
        badge: 'FEATURE',
        title: 'Premium plans',
        subtitle: 'Compare weekly, monthly, and yearly subscriptions.',
        keywords: ['premium', 'subscription', 'subs', 'membership', 'weekly', 'monthly', 'yearly', 'payments'],
        Icon: Sparkles,
        onPress: () =>
          navigation.navigate('SubscriptionDetails', {
            subscriptionType: 'monthly',
          }),
      },
    ]);

    return [
      { title: 'Session types', results: sessionResults },
      { title: 'Subscriptions', results: subscriptionResults },
      { title: 'Articles', results: articleResults },
      { title: 'Community updates', results: socialResults },
      { title: 'Counsellors', results: counsellorResults },
      { title: 'App features', results: featureResults },
    ].filter((group) => group.results.length > 0);
  }, [articles, isSearching, navigation, normalizedQuery, trimmedQuery]);

  const totalResults = searchGroups.reduce((sum, group) => sum + group.results.length, 0);
  const headerFullHeight = insets.top + iosTheme.spacing.xl + 68 + iosTheme.spacing.lg;
  const headerOpacity = discoverScrollY.interpolate({
    inputRange: [0, 54, 104],
    outputRange: [1, 0.5, 0],
    extrapolate: 'clamp',
  });
  const headerTranslateY = discoverScrollY.interpolate({
    inputRange: [0, 104],
    outputRange: [0, -24],
    extrapolate: 'clamp',
  });
  const headerHeight = discoverScrollY.interpolate({
    inputRange: [0, 104],
    outputRange: [headerFullHeight, 0],
    extrapolate: 'clamp',
  });

  const renderSearchResult = (result: SearchDestination) => {
    const Icon = result.Icon;
    const color = result.color || iosTheme.colors.primary;

    return (
      <IOSCard key={result.id} onPress={result.onPress} style={{ marginBottom: iosTheme.spacing.md }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: iosTheme.spacing.md,
          }}
        >
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: iosTheme.radius.lg,
              backgroundColor: `${color}18`,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon size={22} color={color} strokeWidth={2.2} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={iosTheme.typography.caption} numberOfLines={1}>
              {result.badge}
            </Text>
            <Text style={[iosTheme.typography.cardTitle, { marginTop: 2 }]} numberOfLines={2}>
              {result.title}
            </Text>
            <Text style={[iosTheme.typography.body, { marginTop: iosTheme.spacing.xs }]} numberOfLines={2}>
              {result.subtitle}
            </Text>
          </View>

          <ArrowRight size={18} color={iosTheme.colors.textMuted} strokeWidth={2.2} />
        </View>
      </IOSCard>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: iosTheme.colors.background }}>
      <Animated.View
        style={{
          height: headerHeight,
          opacity: headerOpacity,
          transform: [{ translateY: headerTranslateY }],
          backgroundColor: iosTheme.colors.background,
          overflow: 'hidden',
        }}
      >
        <IOSDiscoverHeader
          onMenuPress={() => setHelp(true)}
          onNotificationsPress={() => navigation.navigate('Notifications')}
          onChatPress={() => navigation.navigate('Chat')}
          unreadCount={unreadCount}
        />
      </Animated.View>

      <IOSScreen
        edges={['right', 'bottom', 'left']}
        contentContainerStyle={{ paddingTop: iosTheme.spacing.sm }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: discoverScrollY } } }], {
          useNativeDriver: false,
        })}
        scrollEventThrottle={16}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: iosTheme.spacing.md,
            marginBottom: iosTheme.spacing.xl,
          }}
        >
          <View
            style={[
              {
                flex: 1,
                height: 50,
                borderRadius: iosTheme.radius.pill,
                backgroundColor: iosTheme.colors.surface,
                borderWidth: 1,
                borderColor: iosTheme.colors.border,
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: iosTheme.spacing.lg,
                gap: iosTheme.spacing.sm,
              },
              iosTheme.shadows.card,
            ]}
          >
            <Search size={18} color={iosTheme.colors.textMuted} strokeWidth={2.2} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search plans, posts, articles, features"
              placeholderTextColor={iosTheme.colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              style={{
                flex: 1,
                color: iosTheme.colors.text,
                fontSize: 15,
                paddingVertical: 0,
              }}
            />
          </View>

          <TouchableOpacity
            activeOpacity={0.84}
            accessibilityRole="button"
            accessibilityLabel="Open filters"
            style={[
              {
                width: 50,
                height: 50,
                borderRadius: 25,
                backgroundColor: iosTheme.colors.surface,
                borderWidth: 1,
                borderColor: iosTheme.colors.border,
                alignItems: 'center',
                justifyContent: 'center',
              },
              iosTheme.shadows.card,
            ]}
          >
            <SlidersHorizontal size={20} color={iosTheme.colors.primary} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>

        {isSearching ? (
          <View>
            <IOSCard style={{ marginBottom: iosTheme.spacing.lg }}>
              <Text style={iosTheme.typography.cardTitle}>Search results</Text>
              <Text style={[iosTheme.typography.body, { marginTop: iosTheme.spacing.xs }]}>
                {articlesLoading
                  ? `Searching CMS articles and app content for "${trimmedQuery}"`
                  : totalResults > 0
                    ? `${totalResults} result${totalResults === 1 ? '' : 's'} found for "${trimmedQuery}"`
                    : `No matches found for "${trimmedQuery}"`}
              </Text>
            </IOSCard>

            {searchGroups.map((group) => (
              <View key={group.title} style={{ marginBottom: iosTheme.spacing.lg }}>
                <IOSSectionHeader title={group.title} />
                {group.results.map(renderSearchResult)}
              </View>
            ))}

            {totalResults === 0 && !articlesLoading ? (
              <IOSCard>
                <Text style={iosTheme.typography.cardTitle}>Try searching for</Text>
                <Text style={[iosTheme.typography.body, { marginTop: iosTheme.spacing.sm }]}>
                  Basic, premium, pro, subscriptions, Instagram, eKYC, bookings, chat, articles, anxiety, or stress.
                </Text>
              </IOSCard>
            ) : null}
          </View>
        ) : (
          <View>
            <IOSHeroCard
              source={require('../../../assets/brand/team-hero.jpeg')}
              eyebrow="Menorah"
              title="Mind Over Matter, Redefined"
              subtitle="A calmer place to begin the conversation."
              height={248}
              onPress={() => navigation.navigate('CounsellorList')}
            />

            <IOSChatBanner
              title="Chat with us"
              subtitle="Speak with a trained clinical psychology student or another man just like you in a safe space."
              onPress={() => navigation.navigate('Chat')}
              style={{ marginTop: iosTheme.spacing.xl }}
            />

            <IOSSectionHeader
              title="Read Articles"
              actionLabel="View all"
              onPress={() => navigation.navigate('ArticleList')}
            />
            {articlesLoading ? (
              <IOSCard style={{ marginRight: iosTheme.layout.screenPadding }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: iosTheme.spacing.md,
                  }}
                >
                  <ActivityIndicator color={iosTheme.colors.primary} />
                  <Text style={iosTheme.typography.body}>Loading articles...</Text>
                </View>
              </IOSCard>
            ) : articlesError ? (
              <IOSCard onPress={() => refetchArticles()} style={{ marginRight: iosTheme.layout.screenPadding }}>
                <Text style={iosTheme.typography.cardTitle}>Articles could not load</Text>
                <Text style={[iosTheme.typography.body, { marginTop: iosTheme.spacing.xs }]}>Tap to try again.</Text>
              </IOSCard>
            ) : articles.length > 0 ? (
              <FlatList
                data={articles}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => item.id || item._id || item.slug}
                contentContainerStyle={{
                  paddingRight: iosTheme.layout.screenPadding,
                }}
                renderItem={({ item }) => <IOSArticleCard item={item} onPress={() => openArticle(item)} />}
              />
            ) : (
              <IOSCard style={{ marginRight: iosTheme.layout.screenPadding }}>
                <Text style={iosTheme.typography.cardTitle}>No articles yet</Text>
                <Text style={[iosTheme.typography.body, { marginTop: iosTheme.spacing.xs }]}>
                  Check back soon for new Menorah reads.
                </Text>
              </IOSCard>
            )}

            <View
              style={{
                flexDirection: 'row',
                gap: iosTheme.spacing.md,
                marginTop: iosTheme.spacing.md,
              }}
            >
              <IOSActionCard
                compact
                icon={Users}
                title="Find support"
                subtitle="Browse counsellors"
                onPress={() => navigation.navigate('CounsellorList')}
                style={{ flex: 1 }}
              />
              <IOSActionCard
                compact
                icon={CalendarDays}
                title="Book session"
                subtitle="Choose a format"
                onPress={() => navigation.navigate('GenderSelection')}
                style={{ flex: 1 }}
              />
            </View>

            <IOSSectionHeader title="Session types" />
            <View style={{ gap: iosTheme.spacing.md }}>
              {(Object.entries(SESSION_DETAILS) as Array<[SessionType, (typeof SESSION_DETAILS)[SessionType]]>).map(
                ([sessionType, details]) => (
                  <IOSCard key={sessionType} onPress={() => handleSessionSelect(sessionType)}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: iosTheme.spacing.md,
                      }}
                    >
                      <View
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: iosTheme.radius.lg,
                          backgroundColor: iosTheme.colors.surfaceAlt,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <ShieldCheck size={22} color={iosTheme.colors.primary} strokeWidth={2.2} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={iosTheme.typography.cardTitle}>
                          {sessionType.charAt(0).toUpperCase() + sessionType.slice(1)}
                        </Text>
                        <Text style={[iosTheme.typography.body, { marginTop: 2 }]}>
                          {details.label} session - INR {details.price}
                        </Text>
                      </View>
                    </View>
                  </IOSCard>
                ),
              )}
            </View>

            <IOSSectionHeader
              title="Community updates"
              actionLabel="Instagram"
              onPress={() => Linking.openURL('https://www.instagram.com/wearemenorah')}
            />
            <FlatList
              data={INSTA}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{
                paddingRight: iosTheme.layout.screenPadding,
              }}
              renderItem={({ item }) => (
                <IOSCard
                  onPress={() => Linking.openURL(item.url)}
                  style={{
                    width: 236,
                    minHeight: 154,
                    marginRight: iosTheme.spacing.lg,
                  }}
                >
                  <BookOpen size={20} color={iosTheme.colors.primary} strokeWidth={2.2} />
                  <Text style={[iosTheme.typography.caption, { marginTop: iosTheme.spacing.md }]}>INSTAGRAM</Text>
                  <Text style={[iosTheme.typography.body, { marginTop: iosTheme.spacing.xs }]} numberOfLines={4}>
                    {item.caption}
                  </Text>
                </IOSCard>
              )}
            />
          </View>
        )}
      </IOSScreen>

      <HelpSheet visible={help} onClose={() => setHelp(false)} />
      <FreeSessionModal
        visible={showFreeSessionModal}
        onClose={handleCloseModal}
        onBookSession={handleBookFreeSession}
      />
    </View>
  );
}
