import { Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { ArrowUpRight } from 'lucide-react-native';
import type { Article } from '@/components/cards/ArticleCard';
import { iosTheme } from './iosTheme';

type IOSArticleCardProps = {
  item: Article;
  onPress: () => void;
};

export default function IOSArticleCard({ item, onPress }: IOSArticleCardProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={[
        {
          width: 246,
          minHeight: 250,
          borderRadius: iosTheme.radius.xl,
          backgroundColor: iosTheme.colors.surface,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: iosTheme.colors.border,
          marginRight: iosTheme.spacing.lg,
        },
        iosTheme.shadows.card,
      ]}
    >
      <Image source={{ uri: item.image }} style={{ width: '100%', height: 132 }} contentFit="cover" />
      <View style={{ padding: iosTheme.spacing.lg, flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: iosTheme.spacing.sm }}>
          <Text style={{ color: iosTheme.colors.primaryMuted, fontSize: 11, lineHeight: 14, fontWeight: '900' }}>
            {item.category || 'ARTICLE'}
          </Text>
          <ArrowUpRight size={16} color={iosTheme.colors.primaryMuted} strokeWidth={2.4} />
        </View>
        <Text style={{ color: iosTheme.colors.text, fontSize: 17, lineHeight: 22, fontWeight: '900', marginBottom: iosTheme.spacing.sm }} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={{ color: iosTheme.colors.textSecondary, fontSize: 13, lineHeight: 19 }} numberOfLines={3}>
          {item.excerpt || item.readTime || 'Read the latest from Menorah.'}
        </Text>
        <Text style={{ color: iosTheme.colors.textMuted, fontSize: 12, lineHeight: 16, fontWeight: '700', marginTop: iosTheme.spacing.md }}>
          {item.readTime || 'Read now'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
