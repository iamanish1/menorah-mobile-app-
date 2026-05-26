import { Pressable, View, Text, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import { ArrowUpRight } from "lucide-react-native";
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";

export type SocialPlatform = 'instagram' | 'youtube' | 'twitter';

export type InstaPost = {
  id: string;
  image: string;
  url: string;
  caption?: string;
  likes?: string;
  comments?: string;
  platform?: SocialPlatform;
};

function getPlatformMeta(url: string, platform?: SocialPlatform) {
  const p = platform ?? (
    url.includes('youtube') ? 'youtube' :
    url.includes('twitter') || url.includes('x.com') ? 'twitter' :
    'instagram'
  );
  if (p === 'youtube') return { label: 'YOUTUBE', color: '#ef4444', icon: '▶' };
  if (p === 'twitter') return { label: 'X (TWITTER)', color: '#000000', icon: '𝕏' };
  return { label: 'INSTAGRAM', color: '#e1306c', icon: '◉' };
}

export default function InstaPostCard({ item }: { item: InstaPost }) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const { width } = useWindowDimensions();
  const cardW = Math.floor(width * 0.72);
  const meta = getPlatformMeta(item.url, item.platform);
  const cardBg = scheme === 'dark' ? colors.surface : colors.card;

  return (
    <Pressable
      onPress={() => Linking.openURL(item.url)}
      style={{ width: cardW, marginRight: 12 }}
    >
      <View
        style={{
          backgroundColor: cardBg,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.border,
          flexDirection: 'row',
          overflow: 'hidden',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: scheme === 'dark' ? 0.16 : 0.05,
          shadowRadius: 6,
          elevation: 1,
        }}
      >
        {/* Thumbnail */}
        <Image
          source={{ uri: item.image }}
          style={{ width: 80, height: 96 }}
          contentFit="cover"
        />

        {/* Content */}
        <View style={{ flex: 1, padding: 12, justifyContent: 'space-between' }}>
          {/* Platform row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: meta.color, fontSize: 11, fontWeight: '800', letterSpacing: 0.4 }}>
              {meta.label}
            </Text>
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ArrowUpRight size={13} color={colors.muted} />
            </View>
          </View>

          {/* Caption */}
          <Text
            numberOfLines={3}
            style={{
              color: colors.cardText,
              fontSize: 13,
              fontWeight: '600',
              lineHeight: 19,
              marginTop: 6,
            }}
          >
            {item.caption ?? 'Follow the latest mental wellness updates.'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
