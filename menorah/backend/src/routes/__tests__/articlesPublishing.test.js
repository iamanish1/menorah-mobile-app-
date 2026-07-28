const express = require('express');
const request = require('supertest');

const mockArticleId = '64f000000000000000000099';
let mockArticleState = null;

const mockAsLeanQuery = (value) => ({
  lean: jest.fn().mockResolvedValue(value ? { ...value } : value)
});

const mockAsDocument = (value) => ({
  ...value,
  _id: { toString: () => mockArticleId },
  toObject: () => ({ ...value, _id: { toString: () => mockArticleId } })
});

jest.mock('../../middleware/auth', () => ({
  adminAuth: (req, _res, next) => {
    req.user = { _id: '64f000000000000000000001', role: 'admin' };
    next();
  }
}));

jest.mock('../../models/Article', () => ({
  create: jest.fn(async (fields) => {
    mockArticleState = {
      ...fields,
      _id: { toString: () => mockArticleId },
      createdAt: new Date('2026-07-28T10:00:00.000Z'),
      updatedAt: new Date('2026-07-28T10:00:00.000Z')
    };
    return mockAsDocument(mockArticleState);
  }),
  findById: jest.fn(() => mockAsLeanQuery(mockArticleState)),
  findByIdAndUpdate: jest.fn((_id, updates) => {
    if (!mockArticleState) return mockAsLeanQuery(null);
    mockArticleState = {
      ...mockArticleState,
      ...updates,
      updatedAt: new Date('2026-07-28T10:01:00.000Z')
    };
    return mockAsLeanQuery(mockArticleState);
  }),
  findOneAndUpdate: jest.fn((filter, update) => {
    const canPublish = mockArticleState
      && String(filter?._id) === mockArticleId
      && mockArticleState.status !== 'published';

    if (!canPublish) return mockAsLeanQuery(null);

    mockArticleState = {
      ...mockArticleState,
      ...(update.$set || {}),
      updatedAt: new Date('2026-07-28T10:02:00.000Z')
    };
    return mockAsLeanQuery(mockArticleState);
  }),
  findOne: jest.fn((filter) => {
    const matches = mockArticleState
      && mockArticleState.slug === filter.slug
      && mockArticleState.status === filter.status;
    return mockAsLeanQuery(matches ? mockArticleState : null);
  }),
  find: jest.fn(),
  countDocuments: jest.fn(),
  distinct: jest.fn()
}));

jest.mock('../../models/ArticleGenerationRun', () => ({}));

jest.mock('../../services/articleGenerationService', () => ({
  buildUniqueSlug: jest.fn().mockResolvedValue('editor-approved-article'),
  countArticleWords: jest.fn(() => 42),
  createManualGenerationRun: jest.fn(),
  createReviewArticle: jest.fn(),
  formatRun: jest.fn(),
  getManualMaxCount: jest.fn(() => 20),
  normalizeTags: (tags) => Array.isArray(tags)
    ? tags.map((tag) => String(tag).trim()).filter(Boolean)
    : [],
  startGenerationRun: jest.fn()
}));

jest.mock('../../services/articleCanonicalUrl', () => ({
  buildArticleCanonicalUrl: (slug) => `https://menorah.me/articles/${slug}`
}));

const Article = require('../../models/Article');
const articlesRouter = require('../articles');
const publicArticlesRouter = require('../articles-public');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/articles', articlesRouter);
  app.use('/public/articles', publicArticlesRouter);
  return app;
};

describe('article publish pipeline', () => {
  beforeEach(() => {
    mockArticleState = null;
    Object.values(Article).forEach((method) => method?.mockClear?.());
  });

  test('keeps a manual article private until publish, validates updates, and serves the canonical published record', async () => {
    const app = buildApp();
    const manualBody = [{
      type: 'paragraph',
      text: 'A practical article body that is complete enough for a reader to review.'
    }];

    const created = await request(app)
      .post('/api/articles/admin')
      .send({
        title: 'Editor approved article',
        excerpt: 'A useful summary for the article card and search results.',
        category: 'Wellbeing',
        tags: ['support', ' wellbeing '],
        contentBlocks: manualBody
      })
      .expect(201);

    expect(created.body.data.article.status).toBe('draft');
    await request(app)
      .get('/public/articles/editor-approved-article')
      .expect(404);

    await request(app)
      .patch(`/api/articles/admin/${mockArticleId}`)
      .send({
        contentBlocks: [{ type: 'image', url: 'javascript:alert(1)' }]
      })
      .expect(400);

    expect(mockArticleState.contentBlocks).toEqual([
      expect.objectContaining({ type: 'paragraph', text: manualBody[0].text })
    ]);

    const published = await request(app)
      .post(`/api/articles/admin/${mockArticleId}/publish`)
      .expect(200);

    expect(published.body.data.article.status).toBe('published');
    expect(published.body.data.article.canonicalUrl).toBe(
      'https://menorah.me/articles/editor-approved-article'
    );
    expect(mockArticleState.reviewedByHuman).toBe(true);

    const publicRead = await request(app)
      .get('/public/articles/editor-approved-article')
      .expect(200);

    expect(publicRead.headers['cache-control']).toContain('no-store');
    expect(publicRead.body.data.article.status).toBe('published');
    expect(publicRead.body.data.article.canonicalUrl).toBe(
      'https://menorah.me/articles/editor-approved-article'
    );
  });

  test('makes publish retries idempotent and preserves the original published date', async () => {
    const app = buildApp();
    mockArticleState = {
      _id: { toString: () => mockArticleId },
      title: 'Ready article',
      slug: 'ready-article',
      excerpt: 'A useful summary for a ready article.',
      category: 'Wellbeing',
      tags: [],
      contentBlocks: [{ type: 'paragraph', text: 'A complete paragraph that is safe for every reader.' }],
      status: 'review',
      publishedAt: null,
      createdAt: new Date('2026-07-28T10:00:00.000Z'),
      updatedAt: new Date('2026-07-28T10:00:00.000Z')
    };

    await request(app)
      .post(`/api/articles/admin/${mockArticleId}/publish`)
      .expect(200);

    const originalPublishedAt = mockArticleState.publishedAt.toISOString();
    const publishMutations = Article.findOneAndUpdate.mock.calls.length;

    const retried = await request(app)
      .post(`/api/articles/admin/${mockArticleId}/publish`)
      .expect(200);

    expect(retried.body.data.article.status).toBe('published');
    expect(mockArticleState.publishedAt.toISOString()).toBe(originalPublishedAt);
    expect(Article.findOneAndUpdate).toHaveBeenCalledTimes(publishMutations);
  });
});
