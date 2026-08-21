const Article = require('../../models/Article');
const {
  normalizeContentBlocks,
  toPlainArticleText,
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

  test('removes Markdown presentation syntax from reader-facing article text', () => {
    expect(toPlainArticleText('**Engage in hobbies:** Find a shared interest.'))
      .toBe('Engage in hobbies: Find a shared interest.');
    expect(toPlainArticleText('## Fostering Connections')).toBe('Fostering Connections');
    expect(toPlainArticleText('- [Professional help](https://example.com)')).toBe('Professional help');
    expect(toPlainArticleText('***A grounded opening***')).toBe('A grounded opening');
    expect(toPlainArticleText('Use `private support` when it feels right.'))
      .toBe('Use private support when it feels right.');

    const blocks = normalizeContentBlocks([{
      type: 'bullet_list',
      items: [
        '**Join community groups:** Meet people with shared interests.',
        '- **Volunteer:** Build connection through a shared purpose.'
      ]
    }]);

    expect(blocks[0].items).toEqual([
      'Join community groups: Meet people with shared interests.',
      'Volunteer: Build connection through a shared purpose.'
    ]);
  });

  test('preserves ordinary punctuation while cleaning only presentation syntax', () => {
    const original = 'Contact foo__bar@example.com or support@menorah_health.com; 5 * 3 is 15 and ~20 minutes is approximate.';
    const normalized = toPlainArticleText(original);

    expect(normalized).toBe(original);
    expect(toPlainArticleText(normalized)).toBe(normalized);
    expect(toPlainArticleText('__')).toBe('');
  });
});
