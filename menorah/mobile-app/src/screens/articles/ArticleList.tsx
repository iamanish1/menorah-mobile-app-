import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { ArrowLeft, ChevronRight, Search } from 'lucide-react-native';
import { useThemeMode } from '@/theme/ThemeProvider';
import { palettes } from '@/theme/colors';
import { useArticles } from '@/hooks/useArticles';
import type { Article } from '@/types/article';

const getArticleId = (article: Article) => article.id || article._id || article.slug;

const formatDate = (value?: string | null) => {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export default function ArticleList({ navigation, route }: any) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const isDark = scheme === 'dark';
  const [search, setSearch] = useState('');
  const isTabRoot = route?.name === 'Articles';
  const showBackButton = !isTabRoot && navigation.canGoBack?.();

  const query = search.trim();
  const { data, isLoading, isError, error, refetch, isFetching } = useArticles({
    page: 1,
    limit: 30,
    q: query || undefined,
  });

  const articles = data?.articles || [];
  const pageBg = isDark ? colors.bg : '#f8faf8';
  const cardBg = isDark ? colors.surface : '#ffffff';

  const subtitle = useMemo(() => {
    if (query) {
      return `${articles.length} result${articles.length === 1 ? '' : 's'} for "${query}"`;
    }

    return 'Latest mental health reads';
  }, [articles.length, query]);

  const openArticle = (slug: string) => {
    const parentNavigation = navigation.getParent?.();

    if (isTabRoot && parentNavigation?.navigate) {
      parentNavigation.navigate('ArticleDetail', { slug });
      return;
    }

    navigation.navigate('ArticleDetail', { slug });
  };

  const renderArticle = ({ item }: { item: Article }) => (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => openArticle(item.slug)}
      accessibilityRole="button"
      accessibilityLabel={`Open article ${item.title}`}
      style={{
        flexDirection: 'row',
        gap: 12,
        marginHorizontal: 16,
        marginBottom: 12,
        padding: 12,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: cardBg,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: isDark ? 0.12 : 0.04,
        shadowRadius: 4,
        elevation: 1,
      }}
    >
      {item.coverImageUrl ? (
        <Image
          source={{ uri: item.coverImageUrl }}
          style={{ width: 82, height: 92, borderRadius: 12, backgroundColor: colors.sand }}
          contentFit="cover"
          accessibilityLabel={item.title}
        />
      ) : (
        <View
          style={{
            width: 82,
            height: 92,
            borderRadius: 12,
            backgroundColor: colors.primary + '18',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: colors.primary, fontSize: 22, fontWeight: '900' }}>
            {item.title.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}

      <View style={{ flex: 1, minHeight: 92 }}>
        <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '800', marginBottom: 5 }} numberOfLines={1}>
          {item.category || 'Article'}
        </Text>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800', lineHeight: 21 }} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 6 }} numberOfLines={2}>
          {item.excerpt}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 'auto', paddingTop: 8 }}>
          <Text style={{ color: colors.muted, fontSize: 12, flex: 1 }} numberOfLines={1}>
            {formatDate(item.publishedAt || item.createdAt) || 'Read now'}
          </Text>
          <ChevronRight size={16} color={colors.primary} />
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: pageBg }} edges={['top']}>
      <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
          {showBackButton ? (
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
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: '900' }}>
              Articles
            </Text>
            <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>
              {subtitle}
            </Text>
          </View>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            height: 46,
            borderRadius: 23,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: cardBg,
            paddingHorizontal: 14,
            gap: 8,
          }}
        >
          <Search size={16} color={colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search articles"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={{ flex: 1, color: colors.text, fontSize: 14, paddingVertical: 0 }}
          />
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.muted, marginTop: 12, fontSize: 14 }}>Loading articles...</Text>
        </View>
      ) : isError ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 8, textAlign: 'center' }}>
            Articles could not load
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
        <FlatList
          data={articles}
          keyExtractor={getArticleId}
          renderItem={renderArticle}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 28 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingHorizontal: 32, paddingTop: 80 }}>
              <View
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: 34,
                  backgroundColor: colors.primary + '14',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 14,
                }}
              >
                <Search size={26} color={colors.primary} />
              </View>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center', marginBottom: 8 }}>
                No articles found
              </Text>
              <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' }}>
                {query ? 'Try a different search term.' : 'Published articles will appear here when they are ready.'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
