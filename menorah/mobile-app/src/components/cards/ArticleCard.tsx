import { TouchableOpacity, View, Text } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronRight } from "lucide-react-native";
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";
import type { Article } from "@/types/article";

type ArticleCardProps = {
  item: Article;
  onPress: () => void;
};

export default function ArticleCard({ item, onPress }: ArticleCardProps) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={`Open article ${item.title}`}
      style={{ width: 260, height: 224, marginRight: 16 }}
    >
      <View style={{
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
        flex: 1,
        backgroundColor: colors.card,
      }}>
        {item.coverImageUrl ? (
          <Image source={{ uri: item.coverImageUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
        ) : (
          <View style={{ width: "100%", height: "100%", backgroundColor: colors.primary }}>
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
              <Text style={{ color: "white", fontSize: 44, fontWeight: "900" }}>
                {item.title.charAt(0).toUpperCase()}
              </Text>
            </View>
          </View>
        )}
        <LinearGradient
          colors={["rgba(17,24,39,0.04)", "rgba(17,24,39,0.28)", "rgba(17,24,39,0.88)"]}
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
        />
        <View style={{ position: "absolute", top: 14, left: 14, right: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{
            backgroundColor: "rgba(255,255,255,0.16)",
            borderRadius: 999,
            paddingHorizontal: 10,
            paddingVertical: 6,
          }}>
            <Text style={{ color: "white", fontSize: 11, fontWeight: "700" }} numberOfLines={1}>
              {item.category || "ARTICLE"}
            </Text>
          </View>
          <View style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: "rgba(255,255,255,0.16)",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <ChevronRight size={16} color="white" />
          </View>
        </View>
        <View style={{ position: "absolute", left: 16, right: 16, bottom: 16 }}>
          <Text style={{
            color: 'white',
            fontSize: 22,
            fontWeight: '700',
            lineHeight: 28,
            marginBottom: 8,
          }} numberOfLines={2}>
            {item.title}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <Text style={{
              color: 'rgba(255,255,255,0.78)',
              fontSize: 12,
              fontWeight: "600",
              flex: 1,
            }} numberOfLines={1}>
              {item.readTime || "Read now"}
            </Text>
            <Text style={{
              color: 'rgba(255,255,255,0.92)',
              fontSize: 12,
              fontWeight: '700',
            }}>
              Open article
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}
