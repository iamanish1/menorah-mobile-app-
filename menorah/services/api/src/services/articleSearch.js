const ARTICLE_SEARCH_FIELDS = [
  'title',
  'excerpt',
  'category',
  'tags',
  'seoTitle',
  'seoDescription',
  'contentBlocks.text',
  'contentBlocks.items'
];

const ARTICLE_SEARCH_EQUIVALENTS = {
  man: ['man', 'men'],
  men: ['men', 'man'],
  woman: ['woman', 'women'],
  women: ['women', 'woman']
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getArticleSearchTermVariants = (term) => {
  const normalized = String(term).toLowerCase();
  return ARTICLE_SEARCH_EQUIVALENTS[normalized] || [term];
};

/**
 * Build a bounded, literal, case-insensitive query for article readers.
 * Every word is required, and each word can match the article title or the
 * other reader-facing metadata/content fields. This guarantees that a title
 * containing the entered words is discoverable on every Mentle surface.
 */
const buildArticleSearchClauses = (value) => String(value || '')
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 10)
  .map((term) => {
    const pattern = getArticleSearchTermVariants(term)
      .map(escapeRegex)
      .join('|');
    const searchRegex = new RegExp(pattern, 'i');

    return {
      $or: ARTICLE_SEARCH_FIELDS.map((field) => ({ [field]: searchRegex }))
    };
  });

const appendArticleSearchClauses = (filter, value) => {
  const searchClauses = buildArticleSearchClauses(value);

  if (searchClauses.length) {
    filter.$and = [...(filter.$and || []), ...searchClauses];
  }

  return filter;
};

module.exports = {
  ARTICLE_SEARCH_FIELDS,
  appendArticleSearchClauses,
  buildArticleSearchClauses,
  escapeRegex
};
