const express = require('express');
const { param, query, validationResult } = require('express-validator');
const Article = require('../models/Article');
const { buildArticleCanonicalUrl } = require('../services/articleCanonicalUrl');

const router = express.Router();

const ARTICLE_SELECT_LIST = '-contentBlocks';

const formatArticle = (article) => {
  if (!article) {
    return null;
  }

  const plain = typeof article.toObject === 'function' ? article.toObject() : article;

  return {
    ...plain,
    id: plain._id?.toString(),
    _id: plain._id?.toString(),
    // Do not expose a stale API-origin URL saved by an earlier version of the
    // pipeline. The landing origin plus immutable slug is the canonical URL.
    canonicalUrl: buildArticleCanonicalUrl(plain.slug)
  };
};

const validationErrorResponse = (res, errors) => res.status(400).json({
  success: false,
  message: 'Validation failed',
  errors
});

// Public articles must reflect a completed admin publish immediately. The
// landing app fetches these routes with no-store as well, so a page reload (or
// a mobile/web refetch) cannot be served a stale pre-publication response.
const setPublicArticleCacheHeaders = (res) => {
  res.set('Cache-Control', 'no-store, max-age=0');
};

router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('category').optional().isString().trim(),
  query('q').optional().isString().trim()
], async (req, res) => {
  try {
    setPublicArticleCacheHeaders(res);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return validationErrorResponse(res, errors.array());
    }

    const { page = 1, limit = 10, category, q } = req.query;
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    const filter = { status: 'published' };

    if (category) {
      filter.category = { $regex: `^${category}$`, $options: 'i' };
    }

    if (q) {
      filter.$text = { $search: q };
    }

    const sort = q
      ? { score: { $meta: 'textScore' }, publishedAt: -1, createdAt: -1 }
      : { publishedAt: -1, createdAt: -1 };

    const [articles, total] = await Promise.all([
      Article.find(filter, q ? { score: { $meta: 'textScore' } } : undefined)
        .select(ARTICLE_SELECT_LIST)
        .sort(sort)
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber)
        .lean(),
      Article.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: {
        articles: articles.map(formatArticle),
        pagination: {
          page: pageNumber,
          limit: limitNumber,
          total,
          pages: Math.ceil(total / limitNumber)
        }
      }
    });
  } catch (error) {
    console.error('Get articles error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/categories/list', async (_req, res) => {
  try {
    setPublicArticleCacheHeaders(res);
    const categories = await Article.distinct('category', { status: 'published' });
    const normalized = categories
      .map((category) => String(category).trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    res.json({
      success: true,
      data: { categories: normalized }
    });
  } catch (error) {
    console.error('Get article categories error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.use('/admin', (_req, res) =>
  res.status(404).json({
    success: false,
    message: 'Article admin routes are not available on this service'
  })
);

router.get('/:slug', [
  param('slug').isString().trim().notEmpty()
], async (req, res) => {
  try {
    setPublicArticleCacheHeaders(res);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return validationErrorResponse(res, errors.array());
    }

    const article = await Article.findOne({
      slug: req.params.slug,
      status: 'published'
    }).lean();

    if (!article) {
      return res.status(404).json({ success: false, message: 'Article not found' });
    }

    res.json({
      success: true,
      data: { article: formatArticle(article) }
    });
  } catch (error) {
    console.error('Get article error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
