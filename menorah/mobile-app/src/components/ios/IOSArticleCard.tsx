import { Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { BookOpen } from "lucide-react-native";
import type { Article } from "@/types/article";
import { useIOSTheme } from "./iosTheme";

type IOSArticleCardProps = {
  item: Article;
  onPress: () => void;
};

export default function IOSArticleCard({ item, onPress }: IOSArticleCardProps) {
  const iosTheme = useIOSTheme();
  const imageUrl = item.coverImageUrl;
  const category = item.category?.trim() || "Article";

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={`Open article: ${item.title}`}
      style={[
        {
          width: 238,
          height: 206,
          borderRadius: iosTheme.radius.xl,
          backgroundColor: iosTheme.colors.surface,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: iosTheme.colors.border,
          marginRight: iosTheme.spacing.lg,
        },
        iosTheme.shadows.card,
      ]}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={{ width: "100%", height: 126 }}
          contentFit="cover"
        />
      ) : (
        <View
          style={{
            width: "100%",
            height: 126,
            backgroundColor: iosTheme.colors.primary,
          }}
        >
          <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <Text
              style={{
                color: iosTheme.colors.onPrimary,
                fontSize: 34,
                fontWeight: "900",
              }}
            >
              {item.title.charAt(0).toUpperCase()}
            </Text>
          </View>
        </View>
      )}
      <View
        style={{
          paddingHorizontal: iosTheme.spacing.lg,
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: iosTheme.spacing.md,
        }}
      >
        <Text
          style={{
            flex: 1,
            color: iosTheme.colors.text,
            fontSize: 18,
            lineHeight: 23,
            fontWeight: "900",
          }}
          numberOfLines={2}
        >
          {category}
        </Text>
        <BookOpen
          size={18}
          color={iosTheme.colors.primaryMuted}
          strokeWidth={2.4}
        />
      </View>
    </TouchableOpacity>
  );
}
