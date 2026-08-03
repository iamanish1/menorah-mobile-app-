import { useCallback, useMemo, useState, type ComponentType } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Linking,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
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
} from "lucide-react-native";
import HelpSheet from "@/components/help/HelpSheet";
import MobileCounsellorDiscovery from "@/components/discover/mobile-counsellor-discovery";
import {
  IOSArticleCard,
  IOSActionCard,
  IOSCard,
  IOSChatBanner,
  IOSDiscoverHeader,
  IOSHeroCard,
  IOSScreen,
  IOSSectionHeader,
  useIOSTheme,
} from "@/components/ios";
import { discoverScrollY } from "@/components/ios/iosScrollSignals";
import { useArticles } from "@/hooks/useArticles";
import { INSTA } from "@/mock/instagram";
import { mockCounsellors } from "@/mock/counsellors";
import { SUBSCRIPTION_PLANS } from "@/screens/subscription/subscriptionPlans";
import { useNotifications } from "@/state/useNotifications";
import type { Article } from "@/types/article";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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

function flattenSearchKeywords(
  values: SearchKeyword[],
): Array<string | number> {
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
  const haystack = flattenSearchKeywords([
    result.title,
    result.subtitle,
    result.badge,
    ...result.keywords,
  ])
    .join(" ")
    .toLowerCase();

  return tokens.every((token) => {
    const candidates =
      token.endsWith("s") && token.length > 3
        ? [token, token.slice(0, -1)]
        : [token];
    return candidates.some((candidate) => haystack.includes(candidate));
  });
}

function getSearchResultSummary(
  resultCount: number,
  query: string,
  isLoading: boolean,
) {
  const quotedQuery = `“${query}”`;

  if (isLoading) {
    return `Searching for ${quotedQuery}…`;
  }

  if (resultCount === 0) {
    return `No results for ${quotedQuery}`;
  }

  return `${resultCount.toLocaleString()} ${resultCount === 1 ? "result" : "results"} for ${quotedQuery}`;
}

export default function Discover({ navigation }: any) {
  const [help, setHelp] = useState(false);
  const [q, setQ] = useState("");
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
  const articles = useMemo(
    () => articlesData?.articles || [],
    [articlesData?.articles],
  );

  const openArticle = useCallback(
    (article: Article) => {
      navigation.navigate("ArticleDetail", { slug: article.slug });
    },
    [navigation],
  );

  const searchGroups = useMemo<SearchGroup[]>(() => {
    if (!isSearching) {
      return [];
    }

    const filterResults = (results: SearchDestination[]) =>
      results.filter((result) => matchesSearch(result, normalizedQuery));

    const subscriptionResults = filterResults(
      SUBSCRIPTION_PLANS.map((plan) => ({
        id: `subscription-${plan.id}`,
        badge: "SUBSCRIPTION",
        title: plan.title,
        subtitle: `${plan.price} - ${plan.billingLabel}. ${plan.description}`,
        keywords: [
          plan.shortLabel,
          plan.description,
          plan.billingLabel,
          plan.features,
          "subscription",
          "subs",
          "membership",
          "premium access",
          "premium",
          "payment",
          "pricing",
          "plan",
        ],
        Icon: CreditCard,
        onPress: () =>
          navigation.navigate("SubscriptionDetails", {
            subscriptionType: plan.id,
          }),
        color: plan.color,
      })),
    );

    const articleResults = articles.map((article) => ({
      id: `article-${article.id || article._id || article.slug}`,
      badge: article.category || "ARTICLE",
      title: article.title,
      subtitle:
        article.excerpt || article.readTime || "Read this article in the app.",
      keywords: [
        article.category,
        article.excerpt,
        article.tags,
        article.readTime,
        article.contentBlocks?.flatMap((block) => [
          block.text,
          block.alt,
          block.caption,
          block.items,
        ]),
        "article",
        "articles",
        "blog",
        "read",
        "cms",
        "mental health",
        "wellness",
      ],
      Icon: FileText,
      onPress: () => openArticle(article),
    }));

    const socialResults = filterResults(
      INSTA.map((post) => ({
        id: `instagram-${post.id}`,
        badge: "INSTAGRAM",
        title: "Community update",
        subtitle: post.caption || "Open this Instagram update.",
        keywords: [
          "instagram",
          "insta",
          "post",
          "posts",
          "psot",
          "psots",
          "update",
          "updates",
          "community",
          "social",
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
        badge: "COUNSELLOR",
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
          "counsellor",
          "counselor",
          "therapist",
          "therapy",
          "support",
        ],
        Icon: Users,
        onPress: () =>
          navigation.navigate("CounsellorList", {
            initialSearch: trimmedQuery,
          }),
      })),
    );

    const featureResults = filterResults([
      {
        id: "feature-mental-health-check-in",
        badge: "FEATURE",
        title: "Mental Health Check-in",
        subtitle: "Complete a private seven-question GAD-7 screening tool.",
        keywords: [
          "mental health check-in",
          "psychometric",
          "assessment",
          "gad-7",
          "anxiety questionnaire",
          "screening",
          "wellness",
        ],
        Icon: ClipboardCheck,
        onPress: () => navigation.navigate("MentalHealthCheckIn"),
      },
      {
        id: "feature-counsellors",
        badge: "FEATURE",
        title: "Find counsellors",
        subtitle: "Browse therapists by issue, language, and availability.",
        keywords: [
          "find support",
          "counsellors",
          "counselors",
          "therapists",
          "doctors",
          "anxiety",
          "depression",
          "stress",
          "trauma",
          "help",
        ],
        Icon: Users,
        onPress: () =>
          navigation.navigate("CounsellorList", {
            initialSearch: trimmedQuery,
          }),
      },
      {
        id: "feature-book-session",
        badge: "FEATURE",
        title: "Book a session",
        subtitle: "Choose a counsellor, duration, date, and time.",
        keywords: [
          "book",
          "booking",
          "appointment",
          "session",
          "duration",
          "hourly rate",
          "therapy",
          "calendar",
          "schedule",
        ],
        Icon: CalendarDays,
        onPress: () => navigation.navigate("CounsellorList"),
      },
      {
        id: "feature-articles",
        badge: "FEATURE",
        title: "Article library",
        subtitle: "Search and read CMS articles inside the app.",
        keywords: [
          "articles",
          "article",
          "blog",
          "cms",
          "read",
          "updates",
          "mental health reads",
          "wellness",
        ],
        Icon: BookOpen,
        onPress: () =>
          navigation.navigate("ArticleList", { initialSearch: trimmedQuery }),
      },
      {
        id: "feature-bookings",
        badge: "FEATURE",
        title: "Your bookings",
        subtitle: "See upcoming and past therapy bookings.",
        keywords: [
          "bookings",
          "appointments",
          "calendar",
          "schedule",
          "upcoming",
          "past sessions",
        ],
        Icon: CalendarDays,
        onPress: () => navigation.navigate("Bookings"),
      },
      {
        id: "feature-chat",
        badge: "FEATURE",
        title: "Chat",
        subtitle: "Open your support conversations.",
        keywords: [
          "chat",
          "messages",
          "conversation",
          "support",
          "talk",
          "help",
        ],
        Icon: MessageCircle,
        onPress: () => navigation.navigate("Chat"),
      },
      {
        id: "feature-alerts",
        badge: "FEATURE",
        title: "Alerts",
        subtitle: "Open notifications and app alerts.",
        keywords: ["alerts", "notifications", "bell", "updates", "reminders"],
        Icon: Bell,
        onPress: () => navigation.navigate("Notifications"),
      },
      {
        id: "feature-profile",
        badge: "FEATURE",
        title: "Profile",
        subtitle: "Manage your Menorah account.",
        keywords: [
          "profile",
          "account",
          "user",
          "personal details",
          "edit profile",
        ],
        Icon: User,
        onPress: () => navigation.navigate("Profile"),
      },
      {
        id: "feature-settings",
        badge: "FEATURE",
        title: "Settings",
        subtitle: "Change app and account settings.",
        keywords: [
          "settings",
          "preferences",
          "account settings",
          "app settings",
        ],
        Icon: Settings,
        onPress: () => navigation.navigate("Settings"),
      },
      {
        id: "feature-ekyc",
        badge: "FEATURE",
        title: "Optional face check",
        subtitle: "Complete or review your account trust check.",
        keywords: ["face check", "selfie", "trust", "safety", "verification"],
        Icon: Shield,
        onPress: () => navigation.navigate("IdentityVerification"),
      },
      {
        id: "feature-privacy",
        badge: "FEATURE",
        title: "Privacy settings",
        subtitle: "Control privacy and security options.",
        keywords: ["privacy", "security", "private", "confidential", "data"],
        Icon: ShieldCheck,
        onPress: () => navigation.navigate("PrivacySettings"),
      },
      {
        id: "feature-crisis",
        badge: "FEATURE",
        title: "Crisis help",
        subtitle: "Open urgent support resources.",
        keywords: [
          "crisis",
          "emergency",
          "urgent",
          "help",
          "support",
          "hotline",
          "danger",
        ],
        Icon: HeartPulse,
        onPress: () => navigation.navigate("CrisisHelp"),
      },
      {
        id: "feature-legal",
        badge: "FEATURE",
        title: "Legal",
        subtitle: "Read app policies and legal information.",
        keywords: [
          "legal",
          "terms",
          "privacy policy",
          "policy",
          "policies",
          "conditions",
        ],
        Icon: FileText,
        onPress: () => navigation.navigate("Legal"),
      },
      {
        id: "feature-premium",
        badge: "FEATURE",
        title: "Premium plans",
        subtitle: "Compare weekly, monthly, and yearly subscriptions.",
        keywords: [
          "premium",
          "subscription",
          "subs",
          "membership",
          "weekly",
          "monthly",
          "yearly",
          "payments",
        ],
        Icon: Sparkles,
        onPress: () =>
          navigation.navigate("SubscriptionDetails", {
            subscriptionType: "monthly",
          }),
      },
    ]);

    return [
      { title: "Subscriptions", results: subscriptionResults },
      { title: "Articles", results: articleResults },
      { title: "Community updates", results: socialResults },
      { title: "Counsellors", results: counsellorResults },
      { title: "App features", results: featureResults },
    ].filter((group) => group.results.length > 0);
  }, [
    articles,
    isSearching,
    navigation,
    normalizedQuery,
    openArticle,
    trimmedQuery,
  ]);

  const totalResults = searchGroups.reduce(
    (sum, group) => sum + group.results.length,
    0,
  );
  const searchResultSummary = getSearchResultSummary(
    totalResults,
    trimmedQuery,
    articlesLoading,
  );
  const headerFullHeight =
    insets.top + iosTheme.spacing.xl + 68 + iosTheme.spacing.lg;
  const headerOpacity = discoverScrollY.interpolate({
    inputRange: [0, 54, 104],
    outputRange: [1, 0.5, 0],
    extrapolate: "clamp",
  });
  const headerTranslateY = discoverScrollY.interpolate({
    inputRange: [0, 104],
    outputRange: [0, -24],
    extrapolate: "clamp",
  });
  const headerHeight = discoverScrollY.interpolate({
    inputRange: [0, 104],
    outputRange: [headerFullHeight, 0],
    extrapolate: "clamp",
  });

  const renderSearchResult = (result: SearchDestination) => {
    const Icon = result.Icon;
    const color = result.color || iosTheme.colors.primary;

    return (
      <IOSCard
        key={result.id}
        onPress={result.onPress}
        style={{ marginBottom: iosTheme.spacing.md }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: iosTheme.spacing.md,
          }}
        >
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: iosTheme.radius.lg,
              backgroundColor: `${color}18`,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon size={22} color={color} strokeWidth={2.2} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={iosTheme.typography.caption} numberOfLines={1}>
              {result.badge}
            </Text>
            <Text
              style={[iosTheme.typography.cardTitle, { marginTop: 2 }]}
              numberOfLines={2}
            >
              {result.title}
            </Text>
            <Text
              style={[
                iosTheme.typography.body,
                { marginTop: iosTheme.spacing.xs },
              ]}
              numberOfLines={2}
            >
              {result.subtitle}
            </Text>
          </View>

          <ArrowRight
            size={18}
            color={iosTheme.colors.textMuted}
            strokeWidth={2.2}
          />
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
          overflow: "hidden",
        }}
      >
        <IOSDiscoverHeader
          onMenuPress={() => setHelp(true)}
          onNotificationsPress={() => navigation.navigate("Notifications")}
          onChatPress={() => navigation.navigate("Chat")}
          unreadCount={unreadCount}
        />
      </Animated.View>

      <IOSScreen
        edges={["right", "bottom", "left"]}
        contentContainerStyle={{ paddingTop: iosTheme.spacing.sm }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: discoverScrollY } } }],
          {
            useNativeDriver: false,
          },
        )}
        scrollEventThrottle={16}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
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
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: iosTheme.spacing.lg,
                gap: iosTheme.spacing.sm,
              },
              iosTheme.shadows.card,
            ]}
          >
            <Search
              size={18}
              color={iosTheme.colors.textMuted}
              strokeWidth={2.2}
            />
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
                alignItems: "center",
                justifyContent: "center",
              },
              iosTheme.shadows.card,
            ]}
          >
            <SlidersHorizontal
              size={20}
              color={iosTheme.colors.primary}
              strokeWidth={2.2}
            />
          </TouchableOpacity>
        </View>

        {isSearching ? (
          <View>
            <Text
              selectable
              accessibilityLiveRegion="polite"
              style={[
                iosTheme.typography.body,
                {
                  marginBottom: iosTheme.spacing.lg,
                  fontWeight: "600",
                  fontVariant: ["tabular-nums"],
                },
              ]}
            >
              {searchResultSummary}
            </Text>

            {searchGroups.map((group) => (
              <View
                key={group.title}
                style={{ marginBottom: iosTheme.spacing.lg }}
              >
                <IOSSectionHeader title={group.title} />
                {group.results.map(renderSearchResult)}
              </View>
            ))}

            {totalResults === 0 && !articlesLoading ? (
              <IOSCard>
                <Text style={iosTheme.typography.cardTitle}>
                  Try searching for
                </Text>
                <Text
                  style={[
                    iosTheme.typography.body,
                    { marginTop: iosTheme.spacing.sm },
                  ]}
                >
                  Counsellors, bookings, subscriptions, Instagram, face check,
                  chat, articles, anxiety, or stress.
                </Text>
              </IOSCard>
            ) : null}
          </View>
        ) : (
          <View>
            <IOSHeroCard
              source={require("../../../assets/brand/team-hero.jpeg")}
              eyebrow="Menorah"
              title="Mind Over Matter, Redefined"
              subtitle="Book a Session Now"
              subtitleStyle={{
                fontSize: 18,
                lineHeight: 24,
                fontWeight: "800",
              }}
              height={248}
              accessibilityLabel="Find a counsellor and book a session"
              accessibilityHint="Opens the counsellor directory"
              onPress={() => navigation.navigate("CounsellorList")}
            />

            <IOSChatBanner
              title="Chat with us"
              subtitle="Speak with a trained clinical psychology student or another man just like you in a safe space."
              onPress={() => navigation.navigate("Chat")}
              style={{ marginTop: iosTheme.spacing.xl }}
            />

            <IOSActionCard
              title="Take Mental Health Check-in"
              subtitle="Private seven-question GAD-7 screening tool"
              actionLabel="Start Check-in"
              icon={ClipboardCheck}
              onPress={() => navigation.navigate("MentalHealthCheckIn")}
              style={{ marginTop: iosTheme.spacing.xl }}
            />

            <IOSSectionHeader
              title="Read Articles"
              actionLabel="View all"
              onPress={() => navigation.navigate("ArticleList")}
            />
            {articlesLoading ? (
              <IOSCard style={{ marginRight: iosTheme.layout.screenPadding }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: iosTheme.spacing.md,
                  }}
                >
                  <ActivityIndicator color={iosTheme.colors.primary} />
                  <Text style={iosTheme.typography.body}>
                    Loading articles...
                  </Text>
                </View>
              </IOSCard>
            ) : articlesError ? (
              <IOSCard
                onPress={() => refetchArticles()}
                style={{ marginRight: iosTheme.layout.screenPadding }}
              >
                <Text style={iosTheme.typography.cardTitle}>
                  Articles could not load
                </Text>
                <Text
                  style={[
                    iosTheme.typography.body,
                    { marginTop: iosTheme.spacing.xs },
                  ]}
                >
                  Tap to try again.
                </Text>
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
                renderItem={({ item }) => (
                  <IOSArticleCard
                    item={item}
                    onPress={() => openArticle(item)}
                  />
                )}
              />
            ) : (
              <IOSCard style={{ marginRight: iosTheme.layout.screenPadding }}>
                <Text style={iosTheme.typography.cardTitle}>
                  No articles yet
                </Text>
                <Text
                  style={[
                    iosTheme.typography.body,
                    { marginTop: iosTheme.spacing.xs },
                  ]}
                >
                  Check back soon for new Menorah reads.
                </Text>
              </IOSCard>
            )}

            <View style={{ marginTop: iosTheme.spacing.xxl }}>
              <MobileCounsellorDiscovery
                onOpenDirectory={(search) =>
                  navigation.navigate("CounsellorList", {
                    initialSearch: search || "",
                  })
                }
                onOpenCounsellor={(counsellorId) =>
                  navigation.navigate("CounsellorProfile", { counsellorId })
                }
              />
            </View>

            <IOSSectionHeader
              title="Community updates"
              actionLabel="Instagram"
              onPress={() =>
                Linking.openURL("https://www.instagram.com/wearemenorah")
              }
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
                  <BookOpen
                    size={20}
                    color={iosTheme.colors.primary}
                    strokeWidth={2.2}
                  />
                  <Text
                    style={[
                      iosTheme.typography.caption,
                      { marginTop: iosTheme.spacing.md },
                    ]}
                  >
                    INSTAGRAM
                  </Text>
                  <Text
                    style={[
                      iosTheme.typography.body,
                      { marginTop: iosTheme.spacing.xs },
                    ]}
                    numberOfLines={4}
                  >
                    {item.caption}
                  </Text>
                </IOSCard>
              )}
            />
          </View>
        )}
      </IOSScreen>

      <HelpSheet visible={help} onClose={() => setHelp(false)} />
    </View>
  );
}
