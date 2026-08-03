const {
  toPlainArticleText,
  validateContentBlocks
} = require('../../services/articleContent');
const { countArticleWords } = require('../../services/articleAiService');

const ARTICLE_TEXT_FIELDS = [
  'title',
  'excerpt',
  'category',
  'seoTitle',
  'seoDescription',
  'imagePrompt'
];
const CONTENT_TEXT_FIELDS = ['text', 'alt', 'caption'];
const REQUIRED_TEXT_BOUNDS = {
  title: [3, 200],
  excerpt: [10, 800],
  category: [2, 80]
};

const hasChanged = (before, after) => JSON.stringify(before) !== JSON.stringify(after);

const normalizeStoredString = (value) => (
  typeof value === 'string' ? toPlainArticleText(value) : value
);

// Do not use normalizeContentBlocks here. Its purpose is to construct the
// canonical shape for new data; a historical cleanup must leave every absent
// field and every unknown legacy field untouched.
const normalizeExistingContentBlocks = (blocks) => {
  if (!Array.isArray(blocks)) {
    return { value: blocks, changed: false };
  }

  let changed = false;
  const value = blocks.map((block) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) {
      return block;
    }

    let next = block;
    CONTENT_TEXT_FIELDS.forEach((field) => {
      const normalized = normalizeStoredString(block[field]);
      if (normalized !== block[field]) {
        next = next === block ? { ...block } : next;
        next[field] = normalized;
        changed = true;
      }
    });

    if (Array.isArray(block.items)) {
      const items = block.items
        .map(normalizeStoredString)
        .filter((item) => typeof item !== 'string' || item);
      if (hasChanged(block.items, items)) {
        next = next === block ? { ...block } : next;
        next.items = items;
        changed = true;
      }
    }

    return next;
  });

  return { value: changed ? value : blocks, changed };
};

const buildArticleChanges = (article) => {
  const changes = {};

  ARTICLE_TEXT_FIELDS.forEach((field) => {
    const normalized = normalizeStoredString(article[field]);
    if (normalized !== article[field]) {
      changes[field] = normalized;
    }
  });

  if (Array.isArray(article.tags)) {
    const tags = article.tags
      .map(normalizeStoredString)
      .filter((tag) => typeof tag !== 'string' || tag);
    if (hasChanged(article.tags, tags)) {
      changes.tags = tags;
    }
  }

  const contentBlocks = normalizeExistingContentBlocks(article.contentBlocks);
  if (contentBlocks.changed) {
    try {
      validateContentBlocks(contentBlocks.value);
    } catch (error) {
      // A legacy document that would become invalid is left completely alone
      // for a human to review. A formatting migration must never write an
      // invalid public article or alter its SEO timestamps.
      return {
        changes: {},
        skipped: true,
        reason: error.message
      };
    }

    changes.contentBlocks = contentBlocks.value;
    const wordCount = countArticleWords({ contentBlocks: contentBlocks.value });
    if (article.wordCount !== wordCount) {
      changes.wordCount = wordCount;
    }
  }

  // This migration uses raw collection writes, so explicitly apply the same
  // essential bounds enforced by the editor before accepting any cleanup.
  // A Markdown-only required field must be reviewed by a human, not written
  // as an empty public value.
  const finalArticle = { ...article, ...changes };
  for (const [field, [min, max]] of Object.entries(REQUIRED_TEXT_BOUNDS)) {
    const value = finalArticle[field];
    if (typeof value !== 'string' || value.length < min || value.length > max) {
      return {
        changes: {},
        skipped: true,
        reason: `Article ${field} must be between ${min} and ${max} characters after formatting cleanup`
      };
    }
  }

  return { changes, skipped: false };
};

/**
 * Article readers intentionally render stored strings as plain text. Earlier
 * AI drafts could therefore expose Markdown markers such as **bold** in the
 * public web site, portals, and mobile apps. Only genuinely changed documents
 * are written, keeping unchanged article timestamps and sitemap lastmod dates
 * intact. The migration is also safe to re-run.
 */
module.exports = {
  buildArticleChanges,
  normalizeExistingContentBlocks,

  async up({ mongoose }) {
    const articles = mongoose.connection.db.collection('articles');
    const cursor = articles.find({}, {
      projection: {
        title: 1,
        excerpt: 1,
        category: 1,
        tags: 1,
        contentBlocks: 1,
        seoTitle: 1,
        seoDescription: 1,
        imagePrompt: 1,
        wordCount: 1
      }
    });
    const operations = [];
    let updated = 0;
    let skipped = 0;

    for await (const article of cursor) {
      const result = buildArticleChanges(article);
      if (result.skipped) {
        skipped += 1;
        console.warn(`Skipped article ${article._id}: ${result.reason}`);
        continue;
      }

      if (!Object.keys(result.changes).length) {
        continue;
      }

      operations.push({
        updateOne: {
          filter: { _id: article._id },
          update: {
            $set: {
              ...result.changes,
              updatedAt: new Date()
            }
          }
        }
      });
      updated += 1;

      if (operations.length === 200) {
        await articles.bulkWrite(operations, { ordered: false });
        operations.length = 0;
      }
    }

    if (operations.length) {
      await articles.bulkWrite(operations, { ordered: false });
    }

    console.log(`Normalized Markdown formatting in ${updated} article(s); skipped ${skipped} invalid article(s).`);
  }
};
