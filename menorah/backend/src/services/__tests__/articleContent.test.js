const Article = require('../../models/Article');
const {
  normalizeContentBlocks,
  validateContentBlocks
} = require('../articleContent');

const buildArticle = (contentBlocks) => new Article({
  title: 'A valid article title',
  slug: 'a-valid-article-title',
  excerpt: 'A valid article excerpt that is long enough for the CMS contract.',
  category: 'Wellbeing',
  contentBlocks
});

describe('article content contract', () => {
  test('accepts the normalized manual and AI-generated block contract in the Article schema', async () => {
    const contentBlocks = normalizeContentBlocks([
      { type: 'heading', text: 'A useful heading', level: 2 },
      { type: 'paragraph', text: 'A useful paragraph that a reader can understand.' },
      { type: 'bullet_list', items: ['First practical step', 'Second practical step'] },
      { type: 'image', url: 'https://res.cloudinary.com/menorah/image/upload/article.jpg', alt: 'Calm landscape' },
      { type: 'callout', text: 'Seek urgent help if safety feels uncertain.' }
    ]);

    expect(validateContentBlocks(contentBlocks)).toBe(true);
    await expect(buildArticle(contentBlocks).validate()).resolves.toBeUndefined();
  });

  test('rejects malformed blocks before they can become a review or published article', async () => {
    const malformedBlocks = [{ type: 'image', url: 'javascript:alert(1)' }];

    expect(() => validateContentBlocks(malformedBlocks)).toThrow('valid HTTP(S) URL');
    await expect(buildArticle(malformedBlocks).validate()).rejects.toThrow(
      'Article content must use supported, renderable content blocks'
    );
  });
});
