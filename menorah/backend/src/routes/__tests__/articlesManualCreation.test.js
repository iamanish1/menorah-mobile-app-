const express = require('express');
const request = require('supertest');

const mockArticleCreate = jest.fn();
const mockBuildUniqueSlug = jest.fn();
const mockCountArticleWords = jest.fn();

jest.mock('../../middleware/auth', () => ({
  adminAuth: (req, _res, next) => {
    req.user = { _id: '64f000000000000000000001', role: 'admin' };
    next();
  }
}));

jest.mock('../../models/Article', () => ({
  create: (...args) => mockArticleCreate(...args)
}));

jest.mock('../../models/ArticleGenerationRun', () => ({}));

jest.mock('../../services/articleGenerationService', () => ({
  buildUniqueSlug: (...args) => mockBuildUniqueSlug(...args),
  countArticleWords: (...args) => mockCountArticleWords(...args),
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
  buildArticleCanonicalUrl: (slug) => `https://www.menorah.me/articles/${slug}`
}));

const articlesRouter = require('../articles');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/articles', articlesRouter);
  return app;
};

const buildArticleDocument = (fields) => {
  const _id = { toString: () => '64f000000000000000000099' };
  return {
    ...fields,
    _id,
    toObject: () => ({ ...fields, _id })
  };
};

describe('manual article creation', () => {
  beforeEach(() => {
    mockArticleCreate.mockReset();
    mockBuildUniqueSlug.mockReset().mockResolvedValue('restored-article');
    mockCountArticleWords.mockReset().mockReturnValue(42);
    mockArticleCreate.mockImplementation(async (fields) => buildArticleDocument(fields));
  });

  test('creates a private, editor-authored draft with a canonical landing URL', async () => {
    const response = await request(buildApp())
      .post('/api/articles/admin')
      .send({
        title: 'Restored article',
        excerpt: 'A concise summary of the restored article.',
        category: 'Wellbeing',
        tags: ['support', ' wellbeing '],
        contentBlocks: [{ type: 'paragraph', text: 'This is the original article body restored by an editor.' }]
      })
      .expect(201);

    expect(mockBuildUniqueSlug).toHaveBeenCalledWith('Restored article');
    expect(mockArticleCreate).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Restored article',
      slug: 'restored-article',
      status: 'draft',
      generatedByAi: false,
      reviewedByHuman: false,
      canonicalUrl: 'https://www.menorah.me/articles/restored-article',
      wordCount: 42,
      contentBlocks: [{
        type: 'paragraph',
        text: 'This is the original article body restored by an editor.',
        level: null,
        items: [],
        url: null,
        alt: '',
        caption: ''
      }]
    }));
    expect(response.body.data.article.status).toBe('draft');
    expect(response.body.data.article.canonicalUrl).toBe('https://www.menorah.me/articles/restored-article');
  });

  test('rejects an empty structured body before writing an article', async () => {
    await request(buildApp())
      .post('/api/articles/admin')
      .send({
        title: 'Restored article',
        excerpt: 'A concise summary of the restored article.',
        category: 'Wellbeing',
        contentBlocks: []
      })
      .expect(400);

    expect(mockArticleCreate).not.toHaveBeenCalled();
  });
});
