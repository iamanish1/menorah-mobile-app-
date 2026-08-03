const express = require('express');
const request = require('supertest');

const mockArticleFind = jest.fn();
const mockArticleCountDocuments = jest.fn();

jest.mock('../../middleware/auth', () => ({
  adminAuth: (req, _res, next) => {
    req.user = { _id: '64f000000000000000000001', role: 'admin' };
    next();
  }
}));

jest.mock('../../middleware/adminAuthorization', () => ({
  requireAdminPermission: jest.fn(() => (_req, _res, next) => next()),
  requireAssignedAdminRole: (_req, _res, next) => next(),
}));

jest.mock('../../models/Article', () => ({
  find: (...args) => mockArticleFind(...args),
  countDocuments: (...args) => mockArticleCountDocuments(...args),
  distinct: jest.fn()
}));

jest.mock('../../models/ArticleGenerationRun', () => ({}));

jest.mock('../../services/articleGenerationService', () => ({
  buildUniqueSlug: jest.fn(),
  countArticleWords: jest.fn(),
  createManualGenerationRun: jest.fn(),
  createReviewArticle: jest.fn(),
  formatRun: jest.fn(),
  getManualMaxCount: jest.fn(() => 20),
  normalizeTags: jest.fn(() => []),
  startGenerationRun: jest.fn()
}));

jest.mock('../../services/articleCanonicalUrl', () => ({
  buildArticleCanonicalUrl: (slug) => `https://menorah.me/articles/${slug}`
}));

const articlesRouter = require('../articles');

const objectId = (value) => ({ toString: () => value });

const makeFindQuery = (documents) => {
  const query = {
    select: jest.fn(),
    sort: jest.fn(),
    skip: jest.fn(),
    limit: jest.fn(),
    lean: jest.fn().mockResolvedValue(documents)
  };
  query.select.mockReturnValue(query);
  query.sort.mockReturnValue(query);
  query.skip.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
};

const asRegExp = (value) => value instanceof RegExp ? value : new RegExp(value.$regex, value.$options);

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/articles', articlesRouter);
  return app;
};

describe('admin article search', () => {
  beforeEach(() => {
    mockArticleFind.mockReset();
    mockArticleCountDocuments.mockReset();
    mockArticleFind.mockReturnValue(makeFindQuery([{
      _id: objectId('64f000000000000000000010'),
      title: 'Finding Connection When You Feel Alone',
      slug: 'finding-connection',
      excerpt: 'Practical support for building meaningful relationships.',
      category: 'Wellbeing',
      status: 'published'
    }]));
    mockArticleCountDocuments.mockResolvedValue(1);
  });

  test('matches partial title words without relying on the Mongo text index', async () => {
    const response = await request(buildApp())
      .get('/api/articles/admin')
      .query({ status: 'published', q: 'connec feel' })
      .expect(200);

    expect(response.body.data.articles.map((article) => article.slug)).toEqual(['finding-connection']);

    const filter = mockArticleFind.mock.calls[0][0];
    expect(filter).toEqual(expect.objectContaining({
      status: 'published',
      $and: expect.any(Array)
    }));
    expect(filter).not.toHaveProperty('$text');
    expect(filter.$and).toHaveLength(2);

    const titleMatchers = filter.$and.map((clause) => {
      const titleCondition = clause.$or.find((condition) => condition.title);
      return asRegExp(titleCondition.title);
    });

    expect(titleMatchers[0].test('Finding Connection When You Feel Alone')).toBe(true);
    expect(titleMatchers[1].test('Finding Connection When You Feel Alone')).toBe(true);
    expect(mockArticleCountDocuments).toHaveBeenCalledWith(filter);

    const query = mockArticleFind.mock.results[0].value;
    expect(query.select).toHaveBeenCalledWith('-contentBlocks');
    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
  });
});
