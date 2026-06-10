import { useState, useEffect } from "react";
import {
  View, ScrollView, FlatList, Linking, Text, TouchableOpacity,
  TextInput,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BookOpen, ChevronRight, SlidersHorizontal, Search } from "lucide-react-native";
import Navbar from "@/components/nav/Navbar";
import HelpSheet from "@/components/help/HelpSheet";
import SectionHeader from "@/components/ui/SectionHeader";
import SessionTypeSelector from "@/components/discover/SessionTypeSelector";
import SubscriptionSelector from "@/components/discover/SubscriptionSelector";
import FindCounsellorHero from "@/components/discover/FindCounsellorHero";
import InstaPostCard from "@/components/cards/InstaPostCard";
import { mockCounsellors } from "@/mock/counsellors";
import { INSTA } from "@/mock/instagram";
import { useNotifications } from "@/state/useNotifications";
import { useAuth } from "@/state/useAuth";
import { useArticles } from "@/hooks/useArticles";
import { palettes } from "@/theme/colors";
import { useThemeMode } from "@/theme/ThemeProvider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FreeSessionModal from "@/components/modals/FreeSessionModal";
import subscriptionService from "@/services/subscriptionService";

export default function Discover({ navigation }: any) {
  const [help, setHelp] = useState(false);
  const [q, setQ] = useState("");
  const [showFreeSessionModal, setShowFreeSessionModal] = useState(false);

  useEffect(() => {
    const checkModal = async () => {
      try {
        const seen = await AsyncStorage.getItem('hasSeenFreeSessionModal');
        if (seen) return;
        const hasPremium = await subscriptionService.hasPremiumSubscription();
        if (!hasPremium) setShowFreeSessionModal(true);
      } catch { undefined; }
    };
    const t = setTimeout(checkModal, 800);
    return () => clearTimeout(t);
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

  const insets = useSafeAreaInsets();
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const { unreadCount } = useNotifications();
  const { user } = useAuth();
  const { data: articlesData } = useArticles({ page: 1, limit: 8 });
  const articles = articlesData?.articles || [];

  const normalizedQuery = q.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;

  const matchedCounsellors = isSearching
    ? mockCounsellors.filter((c) =>
        [c.name, c.specialization, c.language, c.location, ...c.specializations]
          .join(" ").toLowerCase().includes(normalizedQuery)
      )
    : [];

  const matchedArticles = isSearching
    ? articles.filter((a) =>
        [a.title, a.excerpt, a.category, ...(a.tags || [])].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery)
      )
    : [];

  const matchedSocialPosts = isSearching
    ? INSTA.filter((p) => (p.caption ?? '').toLowerCase().includes(normalizedQuery))
    : [];

  const totalResults = matchedCounsellors.length + matchedArticles.length + matchedSocialPosts.length;

  const openArticleDetail = (slug: string) => {
    const parentNavigation = navigation.getParent?.();

    if (parentNavigation?.navigate) {
      parentNavigation.navigate('ArticleDetail', { slug });
      return;
    }

    navigation.navigate('ArticleDetail', { slug });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View
        style={{
          backgroundColor: colors.sand,
          borderBottomLeftRadius: 24,
          borderBottomRightRadius: 24,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          paddingBottom: 14,
        }}
      >
        <Navbar
          onHelp={() => setHelp(true)}
          onBell={() => navigation.navigate('Notifications')}
          unreadCount={unreadCount}
          userName={user?.firstName}
          userImage={user?.profileImage}
        />

        {/* Search bar + filter button */}
        <View style={{ paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.card,
              borderRadius: 50,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: 14,
              height: 46,
              gap: 8,
            }}
          >
            <Search size={16} color={colors.muted} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search by name, issue, therapy..."
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              style={{
                flex: 1,
                fontSize: 14,
                color: colors.text,
                paddingVertical: 0,
              }}
            />
          </View>
          <TouchableOpacity
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SlidersHorizontal size={18} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 28 + insets.bottom, paddingTop: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {isSearching ? (
          /* ── Search results ── */
          <View style={{ paddingHorizontal: 16 }}>
            <View
              style={{
                backgroundColor: colors.card,
                borderRadius: 20,
                padding: 16,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: 16,
              }}
            >
              <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 4 }}>
                Search results
              </Text>
              <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 20 }}>
                {totalResults > 0
                  ? `${totalResults} result${totalResults === 1 ? '' : 's'} found for "${q.trim()}"`
                  : `No matches found for "${q.trim()}"`}
              </Text>
            </View>

            {matchedCounsellors.length > 0 && (
              <View style={{ marginBottom: 18 }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 12 }}>Counsellors</Text>
                {matchedCounsellors.slice(0, 4).map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => navigation.navigate("Bookings")}
                    activeOpacity={0.9}
                    style={{
                      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
                      borderRadius: 18, padding: 14, marginBottom: 10,
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.cardText, marginBottom: 4 }}>{c.name}</Text>
                    <Text style={{ fontSize: 13, color: colors.muted }}>{c.specialization} • {c.language}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {matchedArticles.length > 0 && (
              <View style={{ marginBottom: 18 }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 12 }}>Articles</Text>
                {matchedArticles.slice(0, 4).map((a) => (
                  <TouchableOpacity
                    key={a.id || a._id || a.slug}
                    onPress={() => openArticleDetail(a.slug)}
                    activeOpacity={0.9}
                    style={{
                      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
                      borderRadius: 18, padding: 14, marginBottom: 10,
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.cardText, marginBottom: 4 }}>{a.title}</Text>
                    <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>{a.excerpt || a.category}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {matchedSocialPosts.length > 0 && (
              <View style={{ marginBottom: 18 }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 12 }}>Social media</Text>
                {matchedSocialPosts.slice(0, 4).map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => Linking.openURL(p.url)}
                    activeOpacity={0.9}
                    style={{
                      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
                      borderRadius: 18, padding: 14, marginBottom: 10,
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary, marginBottom: 6, letterSpacing: 0.4 }}>
                      INSTAGRAM
                    </Text>
                    <Text style={{ fontSize: 14, color: colors.cardText, lineHeight: 20 }}>{p.caption}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {totalResults === 0 && (
              <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 16 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 6 }}>
                  Try searching for things like:
                </Text>
                <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 22 }}>
                  Anxiety, trauma, CBT, relationship, stress, depression, mindfulness
                </Text>
              </View>
            )}
          </View>
        ) : (
          /* ── Home feed ── */
          <>
            {/* Find Counsellor Hero */}
            <FindCounsellorHero onPress={() => navigation.navigate('CounsellorList')} />

            {/* Session Type */}
            <SessionTypeSelector
              onSessionSelect={(sessionType) => {
                const details: Record<string, { duration: number; price: number }> = {
                  basic: { duration: 45, price: 1000 },
                  premium: { duration: 60, price: 2000 },
                  pro: { duration: 90, price: 3000 },
                };
                navigation.navigate("GenderSelection", {
                  sessionType,
                  duration: details[sessionType].duration,
                  price: details[sessionType].price,
                });
              }}
            />

            {/* Subscription */}
            <View style={{ marginTop: 20 }}>
              <SubscriptionSelector />
            </View>

            {/* Read Articles */}
            <SectionHeader
              title="Articles"
              onPress={() => navigation.navigate('Articles')}
              style={{ marginTop: 20 }}
            />
            <TouchableOpacity
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel="Open Articles tab"
              onPress={() => navigation.navigate('Articles')}
              style={{
                marginHorizontal: 16,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                padding: 16,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: scheme === 'dark' ? 0.1 : 0.04,
                shadowRadius: 8,
                elevation: 1,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 18,
                    backgroundColor: colors.primary + '16',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <BookOpen size={24} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 17, fontWeight: '900', marginBottom: 4 }}>
                    Read in the app
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
                    Browse CMS-published mental health articles in the native Articles tab.
                  </Text>
                </View>
                <ChevronRight size={20} color={colors.primary} />
              </View>
            </TouchableOpacity>

            {/* Social Media */}
            <SectionHeader
              title="Our Social Media Presence"
              onPress={() => Linking.openURL("https://www.instagram.com/wearemenorah")}
              style={{ marginTop: 8 }}
            />
            <FlatList
              data={INSTA}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(i) => i.id}
              contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 4 }}
              renderItem={({ item }) => <InstaPostCard item={item} />}
            />
          </>
        )}
      </ScrollView>

      <HelpSheet visible={help} onClose={() => setHelp(false)} />
      <FreeSessionModal
        visible={showFreeSessionModal}
        onClose={handleCloseModal}
        onBookSession={handleBookFreeSession}
      />
    </View>
  );
}
