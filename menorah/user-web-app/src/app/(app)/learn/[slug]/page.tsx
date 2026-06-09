import { LearnArticleReader } from './LearnArticleReader';

type LearnArticlePageProps = {
  params: Promise<{ slug: string }>;
};

export default async function LearnArticlePage({ params }: LearnArticlePageProps) {
  const { slug } = await params;
  return <LearnArticleReader slug={slug} />;
}
