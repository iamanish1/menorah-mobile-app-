import { Pressable, View, Text } from "react-native";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import { ArrowUpRight, Heart, MessageCircle } from "lucide-react-native";
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";

export type InstaPost = {
  id: string;
  image: string;
  url: string;
  caption?: string;
  likes?: string;
  comments?: string;
};

export default function InstaPostCard({ item }: { item: InstaPost }) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  return (
    <Pressable onPress={() => Linking.openURL(item.url)} style={{ width: 220, height: 250, marginRight: 16 }}>
      <View style={{ 
        borderRadius: 24, 
        overflow: 'hidden', 
        borderWidth: 1, 
        borderColor: colors.border,
        flex: 1,
        backgroundColor: colors.card,
      }}>
        <Image source={{ uri: item.image }} style={{ width: "100%", height: 168 }} contentFit="cover" />
        <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "800", letterSpacing: 0.4 }}>
              INSTAGRAM
            </Text>
            <ArrowUpRight size={16} color={colors.primary} />
          </View>
          <Text style={{ color: colors.cardText, fontSize: 14, fontWeight: "600", lineHeight: 20 }} numberOfLines={3}>
            {item.caption || "Follow the latest mental wellness updates on Instagram."}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginRight: 14 }}>
              <Heart size={14} color={colors.muted} />
              <Text style={{ color: colors.muted, fontSize: 12, marginLeft: 5, fontWeight: "600" }}>
                {item.likes || "1.2k"}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <MessageCircle size={14} color={colors.muted} />
              <Text style={{ color: colors.muted, fontSize: 12, marginLeft: 5, fontWeight: "600" }}>
                {item.comments || "48"}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
