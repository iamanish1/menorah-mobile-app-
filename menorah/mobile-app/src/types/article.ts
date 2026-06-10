export type ArticleContentBlockType =
  | 'heading'
  | 'paragraph'
  | 'quote'
  | 'bullet_list'
  | 'image'
  | 'callout';

export interface ArticleContentBlock {
  type: ArticleContentBlockType;
  text?: string | null;
  level?: number | null;
  items?: string[];
  url?: string | null;
  alt?: string | null;
  caption?: string | null;
}

export interface Article {
  id?: string;
  _id?: string;
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  tags: string[];
  coverImageUrl?: string | null;
  coverImagePublicId?: string | null;
  imagePrompt?: string;
  contentBlocks?: ArticleContentBlock[];
  seoTitle?: string;
  seoDescription?: string;
  canonicalUrl?: string;
  generatedByAi?: boolean;
  reviewedByHuman?: boolean;
  reviewedAt?: string | null;
  publishedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  wordCount?: number;
  readTime?: string;
}
