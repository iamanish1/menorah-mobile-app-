import { useState } from "react";
import { View, ScrollView, FlatList, Linking, useWindowDimensions } from "react-native";
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
import { INSTA } from "@/mock/instagram";
import { useNotifications } from "@/state/useNotifications";
import { palettes } from "@/theme/colors";
import { useThemeMode } from "@/theme/ThemeProvider";

export default function Discover({ navigation }: any) {
  const [help, setHelp] = useState(false);
  const [q, setQ] = useState("");
  const { width } = useWindowDimensions();
  const GAP = 12;
  const H_PAD = 16 * 2;
  const tileW = Math.floor((width - H_PAD - GAP) / 2);
  const tileH = 130;

  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const { unreadCount } = useNotifications();

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
              style={{ backgroundColor: colors.card, marginBottom: 0 }}
            />
          </View>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20, paddingTop: 14 }} showsVerticalScrollIndicator={false}>
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
      </ScrollView>

      <HelpSheet visible={help} onClose={() => setHelp(false)} />
    </View>
  );
}
