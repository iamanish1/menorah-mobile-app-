const express = require('express');
const request = require('supertest');

const mockArticleFindOne = jest.fn();

jest.mock('../../models/Article', () => ({
  findOne: (...args) => mockArticleFindOne(...args),
  find: jest.fn(),
  countDocuments: jest.fn(),
  distinct: jest.fn()
}));

jest.mock('../../services/articleCanonicalUrl', () => ({
  buildArticleCanonicalUrl: (slug) => `https://menorah.me/articles/${slug}`
}));

const publicArticlesRouter = require('../articles-public');

const buildApp = () => {
  const app = express();
  app.use('/api/articles', publicArticlesRouter);
  return app;
};

describe('public article reader contract', () => {
  beforeEach(() => {
    mockArticleFindOne.mockReset();
  });

  test('serves a published article with its canonical landing URL', async () => {
    const _id = { toString: () => '64f000000000000000000099' };
    mockArticleFindOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id,
        slug: 'restored-article',
        title: 'Restored article',
        status: 'published',
        tags: [],
        contentBlocks: [{ type: 'paragraph', text: 'Published content.' }]
      })
    });

    const response = await request(buildApp())
      .get('/api/articles/restored-article')
      .expect(200);

    expect(mockArticleFindOne).toHaveBeenCalledWith({
      slug: 'restored-article',
      status: 'published'
    });
    expect(response.body.data.article.canonicalUrl).toBe('https://menorah.me/articles/restored-article');
  });
});
