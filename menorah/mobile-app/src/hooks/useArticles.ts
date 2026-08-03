import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { isPublishedArticle } from '@/lib/articles';

export interface ArticleListParams {
  page?: number;
  limit?: number;
  category?: string;
  q?: string;
}

export function useArticles(params?: ArticleListParams) {
  return useQuery({
    queryKey: ['articles', params ?? {}],
    // Publishing happens in the admin app, outside this query client's cache.
    // Re-fetch when the Articles screen is revisited so both iOS and Android
    // readers pick up an approved article without waiting for the default
    // five-minute application stale time.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
    queryFn: async () => {
      const response = await api.getArticles(params);

      if (!response.success || !response.data) {
        throw new Error(response.message || 'Unable to load articles');
      }

      return {
        ...response.data,
        articles: response.data.articles.filter(isPublishedArticle),
      };
    },
  });
}

export function useArticle(slug?: string) {
  return useQuery({
    queryKey: ['article', slug],
    enabled: Boolean(slug),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
    queryFn: async () => {
      const response = await api.getArticle(slug as string);

      if (!response.success || !response.data) {
        throw new Error(response.message || 'Unable to load article');
      }

      if (!isPublishedArticle(response.data.article)) {
        throw new Error('This article is not published');
      }

      return response.data.article;
    },
  });
}
