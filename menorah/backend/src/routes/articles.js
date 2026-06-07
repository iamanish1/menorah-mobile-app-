const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const Article = require('../models/Article');
const { adminAuth } = require('../middleware/auth');
const slugify = require('../utils/slugify');
const { generateArticleDraft } = require('../services/articleAiService');
const { generateAndUploadCoverImage } = require('../services/articleImageService');

const router = express.Router();

const ARTICLE_SELECT_LIST = '-contentBlocks';
const EDITABLE_FIELDS = [
  'title',
  'excerpt',
  'category',
  'tags',
  'contentBlocks',
  'seoTitle',
  'seoDescription',
  'canonicalUrl',
  'coverImageUrl',
  'coverImagePublicId',
  'imagePrompt',
  'status'
];

const formatArticle = (article) => {
  if (!article) {
    return null;
  }

  return {
    ...article,
    id: article._id?.toString(),
    _id: article._id?.toString()
  };
};

const validationErrorResponse = (res) => res.status(400).json({
  success: false,
  message: 'Validation failed'
});

const buildCanonicalUrl = (slug) => {
  const baseUrl = (process.env.PUBLIC_WEB_BASE_URL || '').replace(/\/+$/, '');
  return baseUrl ? `${baseUrl}/articles/${slug}` : '';
};

const buildUniqueSlug = async (title) => {
  const baseSlug = slugify(title);
  let candidate = baseSlug;
  let suffix = 2;

  while (await Article.exists({ slug: candidate })) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
};

const normalizeTags = (tags) => {
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags.map((tag) => String(tag).trim()).filter(Boolean);
};

// GET /api/articles
router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('category').optional().isString().trim(),
  query('q').optional().isString().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return validationErrorResponse(res);
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

// GET /api/articles/categories/list
router.get('/categories/list', async (req, res) => {
  try {
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

// POST /api/articles/admin/generate
router.post('/admin/generate', adminAuth, [
  body('topic').trim().isLength({ min: 3, max: 200 }).withMessage('Topic is required'),
  body('category').trim().isLength({ min: 2, max: 80 }).withMessage('Category is required'),
  body('audience').optional().isString().trim().isLength({ max: 200 }),
  body('tone').optional().isString().trim().isLength({ max: 120 }),
  body('length').optional().isIn(['short', 'medium', 'long'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const draft = await generateArticleDraft(req.body);
    const slug = await buildUniqueSlug(draft.title);
    const image = await generateAndUploadCoverImage(draft.imagePrompt, slug);

    const article = await Article.create({
      ...draft,
      slug,
      tags: normalizeTags(draft.tags),
      coverImageUrl: image.url,
      coverImagePublicId: image.publicId,
      canonicalUrl: buildCanonicalUrl(slug),
      status: 'review',
      generatedByAi: true,
      reviewedByHuman: false,
      publishedAt: null
    });

    res.status(201).json({
      success: true,
      data: { article: formatArticle(article.toObject()) }
    });
  } catch (error) {
    console.error('Generate article error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PATCH /api/articles/admin/:id
router.patch('/admin/:id', adminAuth, [
  param('id').isMongoId().withMessage('Invalid article ID'),
  body('title').optional().trim().isLength({ min: 3, max: 200 }),
  body('excerpt').optional().trim().isLength({ min: 10, max: 800 }),
  body('category').optional().trim().isLength({ min: 2, max: 80 }),
  body('tags').optional().isArray(),
  body('contentBlocks').optional().isArray(),
  body('status').optional().isIn(['draft', 'review', 'published', 'archived'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const updates = {};
    EDITABLE_FIELDS.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates[field] = req.body[field];
      }
    });

    if (updates.tags) {
      updates.tags = normalizeTags(updates.tags);
    }

    if (updates.status === 'published') {
      updates.reviewedByHuman = true;
      updates.publishedAt = new Date();
    }

    const article = await Article.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true
    }).lean();

    if (!article) {
      return res.status(404).json({ success: false, message: 'Article not found' });
    }

    res.json({
      success: true,
      data: { article: formatArticle(article) }
    });
  } catch (error) {
    console.error('Update article error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/articles/admin/:id/publish
router.post('/admin/:id/publish', adminAuth, [
  param('id').isMongoId().withMessage('Invalid article ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return validationErrorResponse(res);
    }

    const article = await Article.findByIdAndUpdate(req.params.id, {
      status: 'published',
      reviewedByHuman: true,
      publishedAt: new Date()
    }, {
      new: true,
      runValidators: true
    }).lean();

    if (!article) {
      return res.status(404).json({ success: false, message: 'Article not found' });
    }

    res.json({
      success: true,
      data: { article: formatArticle(article) }
    });
  } catch (error) {
    console.error('Publish article error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// DELETE /api/articles/admin/:id
router.delete('/admin/:id', adminAuth, [
  param('id').isMongoId().withMessage('Invalid article ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return validationErrorResponse(res);
    }

    const article = await Article.findByIdAndUpdate(req.params.id, {
      status: 'archived'
    }, {
      new: true,
      runValidators: true
    }).lean();

    if (!article) {
      return res.status(404).json({ success: false, message: 'Article not found' });
    }

    res.json({
      success: true,
      data: { article: formatArticle(article) }
    });
  } catch (error) {
    console.error('Archive article error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/articles/:slug
router.get('/:slug', [
  param('slug').isString().trim().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return validationErrorResponse(res);
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
