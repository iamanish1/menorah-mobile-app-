const Article = require('../models/Article');
const ArticleGenerationRun = require('../models/ArticleGenerationRun');
const slugify = require('../utils/slugify');
const {
  countArticleWords,
  generateArticleDraft,
  generateArticleTopics,
  getWordRange
} = require('./articleAiService');
const { resolveCoverImage } = require('./articleImageService');

const DEFAULT_TIMEZONE = 'Asia/Dubai';

const getNumber = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getManualMaxCount = () => getNumber(process.env.ARTICLE_MANUAL_MAX_COUNT, 20);

const getDailyCount = () => getNumber(process.env.ARTICLE_DAILY_GENERATION_COUNT, 10);

const getTimezone = () => process.env.ARTICLE_GENERATION_TIMEZONE || DEFAULT_TIMEZONE;

const MAX_WORD_TARGET_ATTEMPTS = 4;

const normalizeTags = (tags) => {
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 12);
};

const buildCanonicalUrl = (slug) => {
  const baseUrl = (process.env.PUBLIC_WEB_BASE_URL || '').replace(/\/+$/, '');
  return baseUrl ? `${baseUrl}/articles/${slug}` : '';
};

const buildUniqueSlug = async (title) => {
  const baseSlug = slugify(title);
  let candidate = baseSlug;
  let suffix = 2;

  while (await Article.exists({ slug: candidate })) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
};

const getDateKey = (date = new Date(), timezone = getTimezone()) => {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return `${year}-${month}-${day}`;
};

const formatRun = (run) => {
  if (!run) {
    return null;
  }

  const plain = typeof run.toObject === 'function' ? run.toObject() : run;

  return {
    ...plain,
    id: plain._id?.toString(),
    _id: plain._id?.toString()
  };
};

const getRecentArticles = async () => {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  return Article.find({ createdAt: { $gte: since } })
    .select('title slug category')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
};

const buildExpansionParagraphs = () => [
  'A useful way to move from awareness to care is to make support easier to reach before a crisis starts. That can mean saving a helpline, booking a first conversation with a professional, or choosing one trusted person who can hear the truth without turning it into a debate. Preparation makes help feel less like a last resort and more like a normal part of staying well.',
  'Workplaces, families, and friend groups can also make a difference by changing the questions they ask. Instead of waiting for a man to prove he is struggling, they can create space for ordinary check-ins about sleep, stress, anger, grief, confidence, and loneliness. These conversations do not need to be dramatic. They need to be consistent, respectful, and private enough that honesty feels safe.',
  'The point is not to turn every difficult day into a deep conversation. It is to give men more room to be honest before pressure becomes too heavy. A simple check-in, a quieter evening, a boundary, or a first appointment can all be meaningful steps when they are chosen with care.',
  'Men also benefit when support options are practical and easy to understand. A short conversation, a private app-based resource, a peer support space, or a session with a trained professional can each meet a different need. The important part is having a path that feels realistic enough to use before stress becomes overwhelming.',
  'Awareness is not a replacement for care, but it can lower the barrier to care. When men hear clear, respectful language about mental health, it becomes easier to name what is happening and choose one next step. That step might be rest, a boundary, a conversation, or professional support.'
];

const expandShortDraftToRange = ({ draft, input, range }) => {
  if (!draft || !Array.isArray(draft.contentBlocks)) {
    return { draft, wordCount: countArticleWords(draft) };
  }

  let wordCount = countArticleWords(draft);
  if (wordCount >= range.min) {
    return { draft, wordCount };
  }

  const expandedDraft = {
    ...draft,
    contentBlocks: [...draft.contentBlocks]
  };

  for (const paragraph of buildExpansionParagraphs()) {
    const block = { type: 'paragraph', text: paragraph };
    const blockWordCount = countArticleWords({ contentBlocks: [block] });

    if (wordCount + blockWordCount > range.max) {
      continue;
    }

    expandedDraft.contentBlocks.push(block);
    wordCount += blockWordCount;

    if (wordCount >= range.min) {
      break;
    }
  }

  return { draft: expandedDraft, wordCount };
};

const buildArticleDraftWithWordTarget = async (input) => {
  const range = getWordRange();
  let lastWordCount = 0;
  let lastDraft = null;

  for (let attempt = 1; attempt <= MAX_WORD_TARGET_ATTEMPTS; attempt += 1) {
    const isRetry = attempt > 1;
    const draft = await generateArticleDraft({
      ...input,
      targetWordCount: range.target,
      minWordCount: range.min,
      maxWordCount: range.max,
      strictWordCount: isRetry,
      wordCountFeedback: isRetry
        ? [
            `The previous draft body was ${lastWordCount} words, measured only from contentBlocks text and list items.`,
            `Rewrite the article body to be between ${range.min} and ${range.max} words, aiming close to ${range.target}.`,
            lastWordCount < range.min
              ? 'Expand the body with additional practical paragraphs, examples, and supportive guidance.'
              : 'Tighten the body while preserving the most useful guidance.',
            'Do not rely on title, excerpt, SEO fields, tags, or imagePrompt to satisfy the word count.'
          ].join(' ')
        : input.wordCountFeedback
    });
    const wordCount = countArticleWords(draft);
    lastDraft = draft;

    if (wordCount >= range.min && wordCount <= range.max) {
      return { draft, wordCount };
    }

    lastWordCount = wordCount;
  }

  const expanded = expandShortDraftToRange({ draft: lastDraft, input, range });
  if (expanded.wordCount >= range.min && expanded.wordCount <= range.max) {
    return expanded;
  }

  throw new Error(`Generated article word count ${expanded.wordCount || lastWordCount} is outside ${range.min}-${range.max}`);
};

const createReviewArticle = async ({ input, run }) => {
  const { draft, wordCount } = await buildArticleDraftWithWordTarget(input);
  const articleDraft = {
    ...draft,
    imagePrompt: String(input.imagePrompt || draft.imagePrompt || '').trim()
  };
  const slug = await buildUniqueSlug(articleDraft.title);
  const image = await resolveCoverImage({
    ...input,
    article: {
      ...articleDraft,
      slug
    }
  });

  const article = await Article.create({
    ...articleDraft,
    slug,
    tags: normalizeTags(articleDraft.tags),
    coverImageUrl: image.url,
    coverImagePublicId: image.publicId,
    coverImageStorage: image.metadata,
    canonicalUrl: buildCanonicalUrl(slug),
    status: 'review',
    generationRun: run?._id || null,
    wordCount,
    generatedByAi: true,
    reviewedByHuman: false,
    reviewedBy: null,
    reviewedAt: null,
    publishedAt: null
  });

  return article.toObject();
};

const createManualGenerationRun = async ({ count, requestedBy }) => {
  const max = getManualMaxCount();
  const requestedCount = Number.parseInt(count, 10);

  if (!Number.isFinite(requestedCount) || requestedCount < 1 || requestedCount > max) {
    throw new Error(`Count must be between 1 and ${max}`);
  }

  return ArticleGenerationRun.create({
    source: 'manual',
    status: 'queued',
    requestedCount,
    timezone: getTimezone(),
    requestedBy
  });
};

const createScheduledGenerationRun = async () => {
  const timezone = getTimezone();
  const dateKey = getDateKey(new Date(), timezone);

  try {
    return await ArticleGenerationRun.create({
      source: 'scheduled',
      status: 'queued',
      requestedCount: getDailyCount(),
      timezone,
      dateKey
    });
  } catch (error) {
    if (error.code === 11000) {
      return ArticleGenerationRun.findOne({ source: 'scheduled', dateKey });
    }
    throw error;
  }
};

const updateRunError = async ({ runId, topic, stage, message }) => {
  return ArticleGenerationRun.findByIdAndUpdate(runId, {
    $inc: { failedCount: 1 },
    $push: {
      errors: {
        topic: String(topic || ''),
        stage,
        message: String(message || 'Generation failed'),
        at: new Date()
      }
    }
  }, { new: true });
};

const executeGenerationRun = async (runId) => {
  const run = await ArticleGenerationRun.findOneAndUpdate({
    _id: runId,
    status: { $in: ['queued', 'failed'] }
  }, {
    status: 'running',
    startedAt: new Date(),
    finishedAt: null,
    completedCount: 0,
    failedCount: 0,
    articleIds: [],
    errors: []
  }, {
    new: true
  });

  if (!run) {
    return run;
  }

  try {
    const recentArticles = await getRecentArticles();
    const topics = await generateArticleTopics({
      count: run.requestedCount,
      recentArticles
    });

    for (const topicInput of topics.slice(0, run.requestedCount)) {
      const currentRun = await ArticleGenerationRun.findById(run._id).select('status').lean();
      if (currentRun?.status !== 'running') {
        break;
      }

      try {
        const article = await createReviewArticle({
          input: topicInput,
          run
        });

        await ArticleGenerationRun.findByIdAndUpdate(run._id, {
          $inc: { completedCount: 1 },
          $push: { articleIds: article._id }
        });
      } catch (error) {
        await updateRunError({
          runId: run._id,
          topic: topicInput.topic,
          stage: 'article',
          message: error.message
        });
      }
    }

    const fresh = await ArticleGenerationRun.findById(run._id);
    const status = fresh.completedCount === fresh.requestedCount
      ? 'completed'
      : fresh.completedCount > 0
        ? 'partial'
        : 'failed';

    fresh.status = status;
    fresh.finishedAt = new Date();
    await fresh.save();
    return fresh;
  } catch (error) {
    const failed = await ArticleGenerationRun.findByIdAndUpdate(run._id, {
      status: 'failed',
      finishedAt: new Date(),
      $push: {
        errors: {
          stage: 'run',
          message: error.message,
          at: new Date()
        }
      }
    }, { new: true });

    return failed;
  }
};

const startGenerationRun = (runId) => {
  setImmediate(() => {
    executeGenerationRun(runId).catch((error) => {
      console.error('Article generation run failed:', error);
    });
  });
};

module.exports = {
  buildCanonicalUrl,
  buildUniqueSlug,
  countArticleWords,
  createManualGenerationRun,
  createReviewArticle,
  createScheduledGenerationRun,
  executeGenerationRun,
  formatRun,
  getDateKey,
  getDailyCount,
  getManualMaxCount,
  getTimezone,
  normalizeTags,
  startGenerationRun
};
