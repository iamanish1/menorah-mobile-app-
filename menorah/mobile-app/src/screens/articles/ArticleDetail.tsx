import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useEffect } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { ArrowLeft, AlertCircle, ShieldCheck } from 'lucide-react-native';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { useArticle } from '@/hooks/useArticles';
import type { ArticleContentBlock } from '@/types/article';

const EDITORIAL_REVIEWER_NAME = 'Menorah Editorial Team';

const formatDate = (value?: string | null) => {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

export default function ArticleDetail({ route, navigation }: any) {
  const slug = route?.params?.slug as string | undefined;
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const isDark = scheme === 'dark';
  const insets = useSafeAreaInsets();
  const { data: article, isLoading, isError, error, refetch } = useArticle(slug);

  useEffect(() => {
    if (!slug) {
      return undefined;
    }

    const unsubscribe = navigation.addListener?.('focus', () => {
      void refetch();
    });

    return typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }, [navigation, refetch, slug]);

  const cardBg = isDark ? colors.surface : '#ffffff';
  const subtleBg = isDark ? 'rgba(255,255,255,0.06)' : '#f0f9f4';

  const renderBlock = (block: ArticleContentBlock, index: number) => {
    const key = `${block.type}-${index}`;

    switch (block.type) {
      case 'heading':
        return (
          <Text
            key={key}
            style={{
              color: colors.text,
              fontSize: block.level === 3 ? 20 : 23,
              lineHeight: block.level === 3 ? 27 : 31,
              fontWeight: '900',
              marginTop: index === 0 ? 0 : 22,
              marginBottom: 10,
            }}
          >
            {block.text}
          </Text>
        );
      case 'paragraph':
        return (
          <Text key={key} style={{ color: colors.cardText, fontSize: 16, lineHeight: 26, marginBottom: 14 }}>
            {block.text}
          </Text>
        );
      case 'quote':
        return (
          <View
            key={key}
            style={{
              borderLeftWidth: 3,
              borderLeftColor: colors.primary,
              backgroundColor: subtleBg,
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderRadius: 10,
              marginBottom: 16,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 16, lineHeight: 25, fontStyle: 'italic' }}>
              {block.text}
            </Text>
          </View>
        );
      case 'bullet_list':
        return (
          <View key={key} style={{ marginBottom: 16, gap: 8 }}>
            {(block.items || []).map((item, itemIndex) => (
              <View key={`${key}-${itemIndex}`} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}>
                <Text style={{ color: colors.primary, fontSize: 17, lineHeight: 25 }}>{'\u2022'}</Text>
                <Text style={{ color: colors.cardText, fontSize: 16, lineHeight: 25, flex: 1 }}>{item}</Text>
              </View>
            ))}
          </View>
        );
      case 'image':
        if (!block.url) {
          return null;
        }

        return (
          <View key={key} style={{ marginBottom: 18 }}>
            <Image
              source={{ uri: block.url }}
              style={{ width: '100%', aspectRatio: 16 / 10, borderRadius: 14, backgroundColor: colors.sand }}
              contentFit="cover"
              accessibilityLabel={block.alt || article?.title || 'Article image'}
            />
            {block.caption ? (
              <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 7 }}>
                {block.caption}
              </Text>
            ) : null}
          </View>
        );
      case 'callout':
        return (
          <View
            key={key}
            style={{
              flexDirection: 'row',
              gap: 10,
              backgroundColor: colors.primary + '14',
              borderWidth: 1,
              borderColor: colors.primary + '33',
              borderRadius: 14,
              padding: 14,
              marginBottom: 16,
            }}
          >
            <AlertCircle size={18} color={colors.primary} />
            <Text style={{ color: colors.text, fontSize: 14, lineHeight: 21, flex: 1 }}>
              {block.text}
            </Text>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingTop: 6,
          paddingBottom: 10,
          backgroundColor: colors.bg,
        }}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: cardBg,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
          }}
        >
          <ArrowLeft size={19} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '900', flex: 1 }} numberOfLines={1}>
          Article
        </Text>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.muted, marginTop: 12, fontSize: 14 }}>Loading article...</Text>
        </View>
      ) : isError || !article ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 8, textAlign: 'center' }}>
            Article could not load
          </Text>
          <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 18 }}>
            {error instanceof Error ? error.message : 'Please check your connection and try again.'}
          </Text>
          <TouchableOpacity
            onPress={() => refetch()}
            style={{
              minHeight: 44,
              paddingHorizontal: 18,
              borderRadius: 22,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: 'white', fontSize: 14, fontWeight: '800' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 28 + insets.bottom }}
        >
          {article.coverImageUrl ? (
            <Image
              source={{ uri: article.coverImageUrl }}
              style={{ width: '100%', aspectRatio: 16 / 10, backgroundColor: colors.sand }}
              contentFit="cover"
              accessibilityLabel={article.title}
            />
          ) : null}

          <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
            <View
              style={{
                alignSelf: 'flex-start',
                backgroundColor: colors.primary + '16',
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
                marginBottom: 12,
              }}
            >
              <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '900' }}>
                {article.category || 'Article'}
              </Text>
            </View>

            <Text style={{ color: colors.text, fontSize: 28, lineHeight: 36, fontWeight: '900' }}>
              {article.title}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 16, lineHeight: 24, marginTop: 10 }}>
              {article.excerpt}
            </Text>

            {formatDate(article.publishedAt || article.createdAt) ? (
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 12 }}>
                {formatDate(article.publishedAt || article.createdAt)}
              </Text>
            ) : null}

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: colors.primary + '12',
                borderWidth: 1,
                borderColor: colors.primary + '24',
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 8,
                alignSelf: 'flex-start',
                marginTop: 14,
              }}
            >
              <ShieldCheck size={16} color={colors.primary} />
              <Text style={{ color: colors.text, fontSize: 12, fontWeight: '800' }}>
                Editorially reviewed by {EDITORIAL_REVIEWER_NAME}
              </Text>
            </View>

            {article.tags?.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
                {article.tags.slice(0, 8).map((tag) => (
                  <View
                    key={tag}
                    style={{
                      backgroundColor: subtleBg,
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700' }}>{tag}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View
              style={{
                flexDirection: 'row',
                gap: 10,
                backgroundColor: colors.primary + '10',
                borderWidth: 1,
                borderColor: colors.primary + '28',
                borderRadius: 16,
                padding: 14,
                marginTop: 18,
              }}
            >
              <AlertCircle size={18} color={colors.primary} />
              <Text style={{ color: colors.cardText, fontSize: 13, lineHeight: 20, flex: 1 }}>
                This article is for education and reflection only. It is not a diagnosis, treatment, or emergency
                support. If safety feels uncertain, contact local emergency services or a trusted crisis helpline.
              </Text>
            </View>

            <View
              style={{
                backgroundColor: cardBg,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 18,
                padding: 18,
                marginTop: 20,
              }}
            >
              {article.contentBlocks?.length ? (
                article.contentBlocks.map(renderBlock)
              ) : (
                <Text style={{ color: colors.muted, fontSize: 15, lineHeight: 23 }}>
                  This article is published, but the body content is not available yet.
                </Text>
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
