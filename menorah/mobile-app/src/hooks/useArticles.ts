import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ArticleListParams {
  page?: number;
  limit?: number;
  category?: string;
  q?: string;
}

export function useArticles(params?: ArticleListParams) {
  return useQuery({
    queryKey: ['articles', params ?? {}],
    queryFn: async () => {
      const response = await api.getArticles(params);

      if (!response.success || !response.data) {
        throw new Error(response.message || 'Unable to load articles');
      }

      return response.data;
    },
  });
}

export function useArticle(slug?: string) {
  return useQuery({
    queryKey: ['article', slug],
    enabled: Boolean(slug),
    queryFn: async () => {
      const response = await api.getArticle(slug as string);

      if (!response.success || !response.data) {
        throw new Error(response.message || 'Unable to load article');
      }

      return response.data.article;
    },
  });
}
