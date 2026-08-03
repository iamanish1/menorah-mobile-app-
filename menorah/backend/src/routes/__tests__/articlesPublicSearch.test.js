const express = require('express');
const request = require('supertest');

const mockArticleFind = jest.fn();
const mockArticleCountDocuments = jest.fn();

jest.mock('../../models/Article', () => ({
  find: (...args) => mockArticleFind(...args),
  countDocuments: (...args) => mockArticleCountDocuments(...args),
  findOne: jest.fn(),
  distinct: jest.fn()
}));

jest.mock('../../services/articleCanonicalUrl', () => ({
  buildArticleCanonicalUrl: (slug) => `https://menorah.me/articles/${slug}`
}));

const publicArticlesRouter = require('../articles-public');

const objectId = (value) => ({ toString: () => value });

const articles = [
  {
    _id: objectId('64f000000000000000000001'),
    title: "The Impact of Loneliness on Men's Mental Health",
    excerpt: 'How men can find meaningful connection.',
    category: 'Men Wellbeing',
    tags: ['loneliness', 'mental health'],
    seoTitle: "Men's mental health and connection",
    seoDescription: 'Practical support for men.',
    contentBlocks: [{ type: 'paragraph', text: 'Connection is an important part of wellbeing.' }],
    slug: 'mens-mental-health',
    status: 'published'
  },
  {
    _id: objectId('64f000000000000000000002'),
    title: 'Managing Anger with Practical Tools',
    excerpt: 'A calm approach for stressful moments.',
    category: 'Men Wellbeing',
    tags: ['anger'],
    seoTitle: 'Managing anger',
    seoDescription: 'Practical emotional regulation techniques.',
    contentBlocks: [{ type: 'paragraph', text: 'Pause before responding under pressure.' }],
    slug: 'managing-anger',
    status: 'published'
  },
  {
    _id: objectId('64f000000000000000000003'),
    title: 'Managing Anger Draft',
    excerpt: 'This is not public yet.',
    category: 'Men Wellbeing',
    tags: ['anger'],
    seoTitle: 'Managing anger draft',
    seoDescription: 'Private draft.',
    contentBlocks: [],
    slug: 'managing-anger-draft',
    status: 'draft'
  },
  {
    _id: objectId('64f000000000000000000004'),
    title: 'Using a.b as a literal example',
    excerpt: 'A literal punctuation example.',
    category: 'Wellbeing',
    tags: ['literal'],
    seoTitle: 'Literal a.b example',
    seoDescription: 'Search punctuation safely.',
    contentBlocks: [],
    slug: 'literal-a-dot-b',
    status: 'published'
  },
  {
    _id: objectId('64f000000000000000000005'),
    title: 'Using axb as a wildcard example',
    excerpt: 'This must not match a literal dot query.',
    category: 'Wellbeing',
    tags: ['wildcard'],
    seoTitle: 'Wildcard example',
    seoDescription: 'A different article.',
    contentBlocks: [],
    slug: 'wildcard-a-x-b',
    status: 'published'
  }
];

const buildApp = () => {
  const app = express();
  app.use('/api/articles', publicArticlesRouter);
  return app;
};

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

const asRegExp = (value) => {
  if (value instanceof RegExp) return value;
  return new RegExp(value.$regex, value.$options);
};

const valueAtPath = (document, path) => path.split('.').reduce((value, key) => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const next = item?.[key];
      return Array.isArray(next) ? next : [next];
    });
  }
  return value?.[key];
}, document);

const matchesRegexCondition = (document, condition) => Object.entries(condition).some(([path, matcher]) => {
  const expression = asRegExp(matcher);
  const values = valueAtPath(document, path);
  const candidates = Array.isArray(values) ? values : [values];
  return candidates.some((value) => expression.test(String(value ?? '')));
});

const matchesFilter = (document, filter) => {
  if (document.status !== filter.status) return false;
  if (filter.category && !asRegExp(filter.category).test(document.category)) return false;
  if (!filter.$and) return false;
  return filter.$and.every((clause) => clause.$or.some((condition) => matchesRegexCondition(document, condition)));
};

const getSearchConditions = (filter) => filter.$and.flatMap((clause) => clause.$or);

describe('public article search', () => {
  beforeEach(() => {
    mockArticleFind.mockReset();
    mockArticleCountDocuments.mockReset();
    mockArticleFind.mockImplementation((filter) => makeFindQuery(articles.filter((article) => matchesFilter(article, filter))));
    mockArticleCountDocuments.mockImplementation(async (filter) => articles.filter((article) => matchesFilter(article, filter)).length);
  });

  test('finds published partial and man/men-equivalent matches while retaining the selected category', async () => {
    const response = await request(buildApp())
      .get('/api/articles')
      .query({ q: 'man', category: 'Men Wellbeing' })
      .expect(200);

    expect(response.body.data.articles.map((article) => article.slug)).toEqual([
      'mens-mental-health',
      'managing-anger'
    ]);

    const filter = mockArticleFind.mock.calls[0][0];
    expect(filter).toEqual(expect.objectContaining({
      status: 'published',
      category: expect.anything(),
      $and: expect.any(Array)
    }));
    expect(filter).not.toHaveProperty('$text');
    expect(mockArticleCountDocuments).toHaveBeenCalledWith(filter);

    const searchConditions = getSearchConditions(filter);
    expect(searchConditions.map((condition) => Object.keys(condition)[0]).sort()).toEqual([
      'category',
      'contentBlocks.items',
      'contentBlocks.text',
      'excerpt',
      'seoDescription',
      'seoTitle',
      'tags',
      'title'
    ]);

    const titleCondition = searchConditions.find((condition) => condition.title);
    const titleSearch = asRegExp(titleCondition.title);
    expect(titleSearch.test('Managing Anger with Practical Tools')).toBe(true);
    expect(titleSearch.test("The Impact of Loneliness on Men's Mental Health")).toBe(true);

    const categoryFilter = asRegExp(filter.category);
    expect(categoryFilter.test('Men Wellbeing')).toBe(true);
    expect(categoryFilter.test('Men Wellbeing Extra')).toBe(false);

    const query = mockArticleFind.mock.results[0].value;
    expect(query.select.mock.calls[0][0]).toBe('-contentBlocks');
    expect(query.sort.mock.calls[0][0]).not.toHaveProperty('score');
  });

  test('treats regex metacharacters in public search input as literal text', async () => {
    const response = await request(buildApp())
      .get('/api/articles')
      .query({ q: 'a.b' })
      .expect(200);

    expect(response.body.data.articles.map((article) => article.slug)).toEqual(['literal-a-dot-b']);

    const filter = mockArticleFind.mock.calls[0][0];
    expect(filter).not.toHaveProperty('$text');

    const titleCondition = getSearchConditions(filter).find((condition) => condition.title);
    const titleSearch = asRegExp(titleCondition.title);
    expect(titleSearch.test('Using a.b as a literal example')).toBe(true);
    expect(titleSearch.test('Using axb as a wildcard example')).toBe(false);
  });
});
