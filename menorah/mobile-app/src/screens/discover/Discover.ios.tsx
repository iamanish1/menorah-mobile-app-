import { useEffect, useMemo, useState } from 'react';
import { Animated, FlatList, Linking, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BookOpen,
  CalendarDays,
  Search,
  ShieldCheck,
  SlidersHorizontal,
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
import { ARTICLES } from '@/mock/articles';
import { INSTA } from '@/mock/instagram';
import { mockCounsellors } from '@/mock/counsellors';
import subscriptionService from '@/services/subscriptionService';
import { useNotifications } from '@/state/useNotifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SESSION_DETAILS: Record<string, { duration: number; price: number; label: string }> = {
  basic: { duration: 45, price: 1000, label: '45 min' },
  premium: { duration: 60, price: 2000, label: '60 min' },
  pro: { duration: 90, price: 3000, label: '90 min' },
};

export default function Discover({ navigation }: any) {
  const [help, setHelp] = useState(false);
  const [q, setQ] = useState('');
  const [showFreeSessionModal, setShowFreeSessionModal] = useState(false);
  const { unreadCount } = useNotifications();
  const insets = useSafeAreaInsets();
  const iosTheme = useIOSTheme();

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

  const handleSessionSelect = (sessionType: string) => {
    const details = SESSION_DETAILS[sessionType];
    navigation.navigate('GenderSelection', {
      sessionType,
      duration: details.duration,
      price: details.price,
    });
  };

  const normalizedQuery = q.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;

  const matchedCounsellors = useMemo(
    () =>
      isSearching
        ? mockCounsellors.filter((c) =>
            [c.name, c.specialization, c.language, c.location, ...c.specializations]
              .join(' ')
              .toLowerCase()
              .includes(normalizedQuery)
          )
        : [],
    [isSearching, normalizedQuery]
  );

  const matchedArticles = useMemo(
    () =>
      isSearching
        ? ARTICLES.filter((article) =>
            [article.title, article.excerpt, article.category]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()
              .includes(normalizedQuery)
          )
        : [],
    [isSearching, normalizedQuery]
  );

  const matchedSocialPosts = useMemo(
    () =>
      isSearching
        ? INSTA.filter((post) => (post.caption ?? '').toLowerCase().includes(normalizedQuery))
        : [],
    [isSearching, normalizedQuery]
  );

  const totalResults = matchedCounsellors.length + matchedArticles.length + matchedSocialPosts.length;
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
              placeholder="Search support, articles, counsellors"
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
                {totalResults > 0
                  ? `${totalResults} result${totalResults === 1 ? '' : 's'} found for "${q.trim()}"`
                  : `No matches found for "${q.trim()}"`}
              </Text>
            </IOSCard>

            {matchedCounsellors.length > 0 ? (
              <View style={{ marginBottom: iosTheme.spacing.lg }}>
                <IOSSectionHeader title="Counsellors" />
                {matchedCounsellors.slice(0, 4).map((c) => (
                  <IOSCard
                    key={c.id}
                    onPress={() => navigation.navigate('Bookings')}
                    style={{ marginBottom: iosTheme.spacing.md }}
                  >
                    <Text style={iosTheme.typography.cardTitle}>{c.name}</Text>
                    <Text style={[iosTheme.typography.body, { marginTop: iosTheme.spacing.xs }]}>
                      {c.specialization} - {c.language}
                    </Text>
                  </IOSCard>
                ))}
              </View>
            ) : null}

            {matchedArticles.length > 0 ? (
              <View style={{ marginBottom: iosTheme.spacing.lg }}>
                <IOSSectionHeader title="Articles" />
                {matchedArticles.slice(0, 4).map((article) => (
                  <IOSCard
                    key={article.id}
                    onPress={() => Linking.openURL(article.url)}
                    style={{ marginBottom: iosTheme.spacing.md }}
                  >
                    <Text style={iosTheme.typography.cardTitle}>{article.title}</Text>
                    <Text style={[iosTheme.typography.body, { marginTop: iosTheme.spacing.xs }]}>
                      {article.excerpt || article.category}
                    </Text>
                  </IOSCard>
                ))}
              </View>
            ) : null}

            {matchedSocialPosts.length > 0 ? (
              <View style={{ marginBottom: iosTheme.spacing.lg }}>
                <IOSSectionHeader title="Social media" />
                {matchedSocialPosts.slice(0, 4).map((post) => (
                  <IOSCard
                    key={post.id}
                    onPress={() => Linking.openURL(post.url)}
                    style={{ marginBottom: iosTheme.spacing.md }}
                  >
                    <Text style={iosTheme.typography.caption}>INSTAGRAM</Text>
                    <Text style={[iosTheme.typography.body, { marginTop: iosTheme.spacing.xs }]}>
                      {post.caption}
                    </Text>
                  </IOSCard>
                ))}
              </View>
            ) : null}

            {totalResults === 0 ? (
              <IOSCard>
                <Text style={iosTheme.typography.cardTitle}>Try searching for</Text>
                <Text style={[iosTheme.typography.body, { marginTop: iosTheme.spacing.sm }]}>
                  Anxiety, trauma, CBT, relationships, stress, depression, or mindfulness.
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
              onPress={() => Linking.openURL('https://menorah.me/newsletter')}
            />
            <FlatList
              data={ARTICLES}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingRight: iosTheme.layout.screenPadding }}
              renderItem={({ item }) => (
                <IOSArticleCard item={item} onPress={() => Linking.openURL(item.url)} />
              )}
            />

            <View style={{ flexDirection: 'row', gap: iosTheme.spacing.md, marginTop: iosTheme.spacing.md }}>
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
              {Object.entries(SESSION_DETAILS).map(([sessionType, details]) => (
                <IOSCard key={sessionType} onPress={() => handleSessionSelect(sessionType)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: iosTheme.spacing.md }}>
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
              ))}
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
              contentContainerStyle={{ paddingRight: iosTheme.layout.screenPadding }}
              renderItem={({ item }) => (
                <IOSCard
                  onPress={() => Linking.openURL(item.url)}
                  style={{ width: 236, minHeight: 154, marginRight: iosTheme.spacing.lg }}
                >
                  <BookOpen size={20} color={iosTheme.colors.primary} strokeWidth={2.2} />
                  <Text style={[iosTheme.typography.caption, { marginTop: iosTheme.spacing.md }]}>
                    INSTAGRAM
                  </Text>
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
