import { useState, useEffect } from "react";
import { View, ScrollView, FlatList, Linking, useWindowDimensions, Text, TouchableOpacity } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Navbar from "@/components/nav/Navbar";
import HelpSheet from "@/components/help/HelpSheet";
import Input from "@/components/ui/Input";
import SectionHeader from "@/components/ui/SectionHeader";
import QuickTile from "@/components/discover/QuickTile";
import HeroBanner from "@/components/discover/HeroBanner";
import SessionTypeSelector from "@/components/discover/SessionTypeSelector";
import SubscriptionSelector from "@/components/discover/SubscriptionSelector";
import ArticleCard from "@/components/cards/ArticleCard";
import InstaPostCard from "@/components/cards/InstaPostCard";
import { ARTICLES } from "@/mock/articles";
import { mockCounsellors } from "@/mock/counsellors";
import { INSTA } from "@/mock/instagram";
import { useNotifications } from "@/state/useNotifications";
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
      } catch {}
    };
    // Small delay so the screen finishes mounting before showing modal
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
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const GAP = 12;
  const H_PAD = 16 * 2;
  const tileW = Math.floor((width - H_PAD - GAP) / 2);
  const tileH = 130;

  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const { unreadCount } = useNotifications();
  const normalizedQuery = q.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;

  const matchedCounsellors = isSearching
    ? mockCounsellors.filter((counsellor) =>
        [
          counsellor.name,
          counsellor.specialization,
          counsellor.language,
          counsellor.location,
          ...counsellor.specializations,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      )
    : [];

  const matchedArticles = isSearching
    ? ARTICLES.filter((article) =>
        [article.title, article.excerpt, article.category]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      )
    : [];

  const matchedSocialPosts = isSearching
    ? INSTA.filter((post) => (post.caption ?? '').toLowerCase().includes(normalizedQuery))
    : [];

  const totalResults = matchedCounsellors.length + matchedArticles.length + matchedSocialPosts.length;

  const handleBellPress = () => {
    navigation.navigate('Notifications');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header: creamy background for both light and dark modes */}
      <View style={{ 
        paddingBottom: 10, 
        backgroundColor: colors.sand,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        borderBottomWidth: 1,
        borderBottomColor: colors.border
      }}>
        <Navbar onHelp={() => setHelp(true)} onBell={handleBellPress} unreadCount={unreadCount} />
        <View style={{ paddingHorizontal: 16 }}>
          <View style={{ marginTop: 6 }}>
            <Input 
              value={q} 
              onChangeText={setQ} 
              placeholder="Search by name, issue, therapy..." 
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
              style={{ backgroundColor: colors.card, marginBottom: 0 }}
            />
          </View>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 28 + insets.bottom, paddingTop: 14 }} showsVerticalScrollIndicator={false}>
        {isSearching ? (
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
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 6 }}>
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
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 12 }}>
                  Counsellors
                </Text>
                {matchedCounsellors.slice(0, 4).map((counsellor) => (
                  <TouchableOpacity
                    key={counsellor.id}
                    onPress={() => navigation.navigate("Bookings")}
                    activeOpacity={0.9}
                    style={{
                      backgroundColor: colors.card,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 18,
                      padding: 14,
                      marginBottom: 10,
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.cardText, marginBottom: 4 }}>
                      {counsellor.name}
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 4 }}>
                      {counsellor.specialization} • {counsellor.language}
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>
                      {counsellor.specializations.join(', ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {matchedArticles.length > 0 && (
              <View style={{ marginBottom: 18 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 12 }}>
                  Articles
                </Text>
                {matchedArticles.slice(0, 4).map((article) => (
                  <TouchableOpacity
                    key={article.id}
                    onPress={() => Linking.openURL(article.url)}
                    activeOpacity={0.9}
                    style={{
                      backgroundColor: colors.card,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 18,
                      padding: 14,
                      marginBottom: 10,
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.cardText, marginBottom: 4 }}>
                      {article.title}
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>
                      {article.excerpt || article.category || 'Open article'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {matchedSocialPosts.length > 0 && (
              <View style={{ marginBottom: 18 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 12 }}>
                  Social media
                </Text>
                {matchedSocialPosts.slice(0, 4).map((post) => (
                  <TouchableOpacity
                    key={post.id}
                    onPress={() => Linking.openURL(post.url)}
                    activeOpacity={0.9}
                    style={{
                      backgroundColor: colors.card,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 18,
                      padding: 14,
                      marginBottom: 10,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary, marginBottom: 6 }}>
                      INSTAGRAM
                    </Text>
                    <Text style={{ fontSize: 14, color: colors.cardText, lineHeight: 20 }}>
                      {post.caption}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {totalResults === 0 && (
              <View
                style={{
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 18,
                  padding: 16,
                }}
              >
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
          <>
        {/* Hero Banner */}
        <HeroBanner />

        {/* Get started — two tiles only (no article tile) */}
        <SectionHeader title="Get started" />
        <View style={{ paddingHorizontal: 16 }}>
          <View style={{ flexDirection: 'row', gap: GAP }}>
            <QuickTile
              title="Book a session"
              subtitle="Start now"
              image="https://images.unsplash.com/photo-1527137342181-19aab11a8ee8?q=80&w=1200&auto=format&fit=crop"
              onPress={() => navigation.navigate("Bookings")}
              width={tileW}
              height={tileH}
            />
            <QuickTile
              title="Find counsellor"
              subtitle="Explore profiles"
              image="https://images.unsplash.com/photo-1525182008055-f88b95ff7980?q=80&w=1200&auto=format&fit=crop"
              onPress={() => {}}
              width={tileW}
              height={tileH}
            />
          </View>
        </View>

        {/* Session Type Selector */}
        <View style={{ marginTop: 8, marginBottom: 0 }}>
          <SessionTypeSelector 
            onSessionSelect={(sessionType) => {
              // Navigate to gender selection with session type details
              const sessionDetails = {
                basic: { duration: 45, price: 1000 },
                premium: { duration: 60, price: 2000 },
                pro: { duration: 90, price: 3000 }
              };
              
              navigation.navigate("GenderSelection", { 
                sessionType,
                duration: sessionDetails[sessionType].duration,
                price: sessionDetails[sessionType].price
              });
            }} 
          />
        </View>

        {/* Subscription Selector */}
        <View style={{ marginTop: 8, marginBottom: 0 }}>
          <SubscriptionSelector 
            onSubscriptionSelect={(subscriptionType) => {
              // Handle subscription selection
              console.log('Selected subscription:', subscriptionType);
            }} 
          />
        </View>

        {/* Read Articles (old-app style horizontal cards) */}
        <SectionHeader 
          title="Read Articles" 
          onPress={() => Linking.openURL("https://menorahhealth.com/newsletter")} 
          style={{ marginTop: 0 }}
        />
        <FlatList
          data={ARTICLES}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 4 }}
          renderItem={({ item }) => <ArticleCard item={item} />}
        />

        {/* Instagram — SAME presentation as articles */}
        <SectionHeader 
          title="Our Social Media Presence" 
          onPress={() => Linking.openURL("https://www.instagram.com/wearemenorah")} 
          titleStyle={{ fontSize: 18 }}
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
