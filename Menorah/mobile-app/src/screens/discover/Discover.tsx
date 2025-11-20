import { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, FlatList, TouchableOpacity, Linking, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Navbar from "@/components/nav/Navbar";
import HelpSheet from "@/components/help/HelpSheet";
import Input from "@/components/ui/Input";
import SectionHeader from "@/components/ui/SectionHeader";
import QuickTile from "@/components/discover/QuickTile";
import HeroBanner from "@/components/discover/HeroBanner";
import SessionTypeSelector from "@/components/discover/SessionTypeSelector";
import SubscriptionSelector from "@/components/discover/SubscriptionSelector";
import { CounsellorCard } from "@/components/cards/CounsellorCard";
import ArticleCard from "@/components/cards/ArticleCard";
import InstaPostCard from "@/components/cards/InstaPostCard";
import { api } from "@/lib/api";
import { ARTICLES } from "@/mock/articles";
import { INSTA } from "@/mock/instagram";
import { palettes } from "@/theme/colors";
import { useThemeMode } from "@/theme/ThemeProvider";
import { ActivityIndicator, Alert } from "react-native";

const CATEGORIES = ["Anxiety","Depression","Relationships","Stress","Trauma","Mindfulness"];
const LANGS = ["English","Hindi","Urdu","Bengali","Tamil"];

export default function Discover({ navigation }: any) {
  const [help, setHelp] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [lang, setLang] = useState<string | null>(null);
  const [all, setAll] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { width } = useWindowDimensions();
  const GAP = 12;
  const H_PAD = 16 * 2;
  const tileW = Math.floor((width - H_PAD - GAP) / 2);
  const tileH = 130;

  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  // Same gradient as navbar - lighter on left, darker on right
  const navbarGradient = scheme === 'dark' ? ['#4a5a4a', '#1a2a1a'] : ['#6a7a6a', '#314830'];

  useEffect(() => {
    fetchCounsellors();
  }, [q, cat, lang]);

  const fetchCounsellors = async () => {
    setLoading(true);
    try {
      const response = await api.getCounsellors({
        search: q || undefined,
        specialization: cat || undefined,
        language: lang || undefined,
        page: 1,
        limit: 50,
        sortBy: 'rating',
        sortOrder: 'desc'
      });
      
      if (response.success && response.data) {
        setAll(response.data.counsellors || []);
      } else {
        console.error('Failed to fetch counsellors:', response.message);
        setAll([]);
      }
    } catch (error: any) {
      console.error('Error fetching counsellors:', error);
      Alert.alert('Error', 'Failed to load counsellors. Please try again.');
      setAll([]);
    } finally {
      setLoading(false);
    }
  };

  const topRated = useMemo(
    () => [...all].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 10),
    [all]
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header: creamy background for both light and dark modes */}
      <View style={{ 
        paddingBottom: 16, 
        backgroundColor: colors.sand,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24
      }}>
        <Navbar onHelp={() => setHelp(true)} onBell={() => {}} />
        <View style={{ paddingHorizontal: 16 }}>
          <View style={{ marginTop: 12 }}>
            <Input 
              value={q} 
              onChangeText={setQ} 
              placeholder="Search by name, issue, therapy..." 
              style={{ backgroundColor: 'white' }}
            />
          </View>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20, paddingTop: 8 }} showsVerticalScrollIndicator={false}>
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
          onPress={() => Linking.openURL("https://menorahhealth.com/")} 
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
          title="Instagram" 
          onPress={() => Linking.openURL("https://www.instagram.com/wearemenorah")} 
        />
        <FlatList
          data={INSTA}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 4 }}
          renderItem={({ item }) => <InstaPostCard item={item} />}
        />

        {/* Our Top Counsellors (horizontal) */}
        <SectionHeader title="Our Top Counsellors" />
        {loading ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={topRated}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(i: any) => String(i.id)}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 4 }}
            renderItem={({ item }) => (
              <CounsellorCard
                counsellor={item}
                variant="compact"
                onPress={() => navigation.navigate('CounsellorProfile', { counsellorId: item.id })}
              />
            )}
          />
        )}
      </ScrollView>

      <HelpSheet visible={help} onClose={() => setHelp(false)} />
    </View>
  );
}
