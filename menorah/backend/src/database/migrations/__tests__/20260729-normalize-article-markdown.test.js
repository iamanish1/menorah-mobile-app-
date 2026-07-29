const { buildArticleChanges } = require('../20260729-normalize-article-markdown');

describe('20260729 article Markdown cleanup migration', () => {
  test('does not produce a write for clean content or alter ordinary punctuation', () => {
    const article = {
      title: 'A clean article',
      excerpt: 'A clean summary for readers.',
      category: 'Wellbeing',
      tags: ['support'],
      contentBlocks: [{
        type: 'paragraph',
        text: 'Contact support@menorah_health.com; 5 * 3 is 15 and ~20 minutes is approximate.'
      }],
      wordCount: 12
    };

    const result = buildArticleChanges(article);

    expect(result).toEqual({ changes: {}, skipped: false });
    expect(result.changes).not.toHaveProperty('updatedAt');
  });

  test('changes only Markdown-bearing values and preserves the stored block shape', () => {
    const article = {
      title: '**Fostering Connections**',
      excerpt: 'A clean summary for readers.',
      category: 'Wellbeing',
      seoDescription: 'Read **practical** advice for everyday support.',
      contentBlocks: [{
        type: 'bullet_list',
        items: [
          '**Engage in hobbies:** Find community.',
          '*Join community groups* to meet people.',
          '***'
        ],
        legacyMetadata: { source: 'ai' }
      }],
      wordCount: 1
    };

    const result = buildArticleChanges(article);

    expect(result.skipped).toBe(false);
    expect(result.changes).toEqual(expect.objectContaining({
      title: 'Fostering Connections',
      seoDescription: 'Read practical advice for everyday support.',
      contentBlocks: [{
        type: 'bullet_list',
        items: [
          'Engage in hobbies: Find community.',
          'Join community groups to meet people.'
        ],
        legacyMetadata: { source: 'ai' }
      }]
    }));
    expect(result.changes).toHaveProperty('wordCount');

    expect(buildArticleChanges({ ...article, ...result.changes }))
      .toEqual({ changes: {}, skipped: false });
  });

  test('skips a document if cleanup would make its existing content invalid', () => {
    const article = {
      title: 'A legacy article',
      contentBlocks: [{ type: 'bullet_list', items: ['**'] }]
    };

    expect(buildArticleChanges(article)).toEqual(expect.objectContaining({
      changes: {},
      skipped: true,
      reason: expect.stringContaining('bullet lists need at least one item')
    }));
  });

  test('skips an article if a required field would become invalid after cleanup', () => {
    const article = {
      title: '***',
      excerpt: 'A complete summary that is long enough for validation.',
      category: 'Wellbeing',
      contentBlocks: [{ type: 'paragraph', text: 'A complete paragraph for a reader.' }]
    };

    expect(buildArticleChanges(article)).toEqual(expect.objectContaining({
      changes: {},
      skipped: true,
      reason: expect.stringContaining('Article title must be between 3 and 200')
    }));
  });

  test('drops tags that become empty after cleanup without touching valid article text', () => {
    const article = {
      title: 'A valid article',
      excerpt: 'A complete summary that is long enough for validation.',
      category: 'Wellbeing',
      tags: ['***', 'support'],
      contentBlocks: [{ type: 'paragraph', text: 'A complete paragraph for a reader.' }]
    };

    expect(buildArticleChanges(article)).toEqual({
      changes: { tags: ['support'] },
      skipped: false
    });
  });
});
