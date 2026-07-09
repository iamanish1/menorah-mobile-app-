import { Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { BookOpen } from 'lucide-react-native';
import type { Article } from '@/types/article';
import { useIOSTheme } from './iosTheme';

type IOSArticleCardProps = {
  item: Article;
  onPress: () => void;
};

export default function IOSArticleCard({ item, onPress }: IOSArticleCardProps) {
  const iosTheme = useIOSTheme();
  const imageUrl = item.coverImageUrl;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={[
        {
          width: 238,
          height: 224,
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
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={{ width: '100%', height: 126 }} contentFit="cover" />
      ) : (
        <View style={{ width: '100%', height: 126, backgroundColor: iosTheme.colors.primary }}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: iosTheme.colors.onPrimary, fontSize: 34, fontWeight: '900' }}>
              {item.title.charAt(0).toUpperCase()}
            </Text>
          </View>
        </View>
      )}
      <View style={{ padding: iosTheme.spacing.lg, flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: iosTheme.spacing.sm }}>
          <Text style={{ color: iosTheme.colors.primaryMuted, fontSize: 11, lineHeight: 14, fontWeight: '900' }}>
            {item.category || 'ARTICLE'}
          </Text>
          <BookOpen size={16} color={iosTheme.colors.primaryMuted} strokeWidth={2.4} />
        </View>
        <Text style={{ color: iosTheme.colors.text, fontSize: 17, lineHeight: 23, fontWeight: '900' }} numberOfLines={3}>
          {item.title}
        </Text>
        <Text style={{ color: iosTheme.colors.textMuted, fontSize: 12, lineHeight: 16, fontWeight: '800', marginTop: 'auto', paddingTop: iosTheme.spacing.sm }}>
          {item.readTime || 'Read now'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
