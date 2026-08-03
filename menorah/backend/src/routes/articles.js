const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const Article = require('../models/Article');
const ArticleGenerationRun = require('../models/ArticleGenerationRun');
const { adminAuth } = require('../middleware/auth');
const {
  requireAdminPermission,
} = require('../middleware/adminAuthorization');
const {
  buildUniqueSlug,
  countArticleWords,
  createManualGenerationRun,
  createReviewArticle,
  formatRun,
  getManualMaxCount,
  normalizeTags,
  startGenerationRun
} = require('../services/articleGenerationService');
const {
  enqueueArticlePublishedNotifications,
} = require('../services/pushNotificationService');
const { buildArticleCanonicalUrl } = require('../services/articleCanonicalUrl');
const {
  normalizeContentBlocks,
  toPlainArticleText,
  validateContentBlocks
} = require('../services/articleContent');
const { appendArticleSearchClauses, escapeRegex } = require('../services/articleSearch');

const router = express.Router();
const requireContentRead = requireAdminPermission('content_read');
const requireContentManage = requireAdminPermission('content_manage');

const ARTICLE_SELECT_LIST = '-contentBlocks';
const EDITABLE_FIELDS = [
  'title',
  'excerpt',
  'category',
  'tags',
  'contentBlocks',
  'seoTitle',
  'seoDescription',
  'coverImageUrl',
  'coverImagePublicId',
  'imagePrompt'
];
const PLAIN_TEXT_ARTICLE_FIELDS = [
  'title',
  'excerpt',
  'category',
  'seoTitle',
  'seoDescription',
  'imagePrompt'
];
const PLAIN_TEXT_GENERATION_INPUT_FIELDS = [
  'topic',
  'category',
  'audience',
  'tone',
  'imagePrompt',
  'imageStyle',
  'imageMood',
  'imageColors',
  'imageAvoid'
];

const hasOwnBodyField = (body, field) => Object.prototype.hasOwnProperty.call(body || {}, field);

const normalizeRequestTextFields = (req, fields) => {
  if (!req.body || typeof req.body !== 'object') {
    return;
  }

  fields.forEach((field) => {
    if (hasOwnBodyField(req.body, field) && typeof req.body[field] === 'string') {
      req.body[field] = toPlainArticleText(req.body[field]);
    }
  });
};

// Do this before express-validator runs. Validation must inspect the exact
// plain-text values that will be saved, otherwise a Markdown-only value could
// pass validation and become empty after cleanup.
const normalizeArticleEditorBody = (req, _res, next) => {
  normalizeRequestTextFields(req, PLAIN_TEXT_ARTICLE_FIELDS);

  if (Array.isArray(req.body?.tags)) {
    req.body.tags = normalizeTags(req.body.tags);
  }

  if (Array.isArray(req.body?.contentBlocks)) {
    req.body.contentBlocks = normalizeContentBlocks(req.body.contentBlocks);
  }

  next();
};

const normalizeArticleGenerationBody = (req, _res, next) => {
  normalizeRequestTextFields(req, PLAIN_TEXT_GENERATION_INPUT_FIELDS);
  next();
};

const formatArticle = (article) => {
  if (!article) {
    return null;
  }

  const plain = typeof article.toObject === 'function' ? article.toObject() : article;

  return {
    ...plain,
    id: plain._id?.toString(),
    _id: plain._id?.toString(),
    // Canonicals are derived from the stable slug and the landing origin, not
    // from an editable database value. This also repairs older records whose
    // stored URL used an API origin.
    canonicalUrl: buildArticleCanonicalUrl(plain.slug)
  };
};

const validationErrorResponse = (res, errors) => res.status(400).json({
  success: false,
  message: 'Validation failed',
  errors
});

// A newly published article is an SEO and reader-facing change. Do not leave
// an old list/detail response in a browser or intermediary cache after the
// admin presses Publish; the Next landing reader also uses no-store fetches.
const setPublicArticleCacheHeaders = (res) => {
  res.set('Cache-Control', 'no-store, max-age=0');
};

const buildArticleFilter = ({ status, q, runId }) => {
  const filter = {};

  if (status && status !== 'all') {
    filter.status = status;
  }

  if (runId) {
    filter.generationRun = runId;
  }

  appendArticleSearchClauses(filter, q);

  return filter;
};

const validateArticleForPublication = (article) => {
  const title = String(article?.title || '').trim();
  const excerpt = String(article?.excerpt || '').trim();
  const category = String(article?.category || '').trim();

  if (title.length < 3 || title.length > 200) {
    throw new Error('Article title must be between 3 and 200 characters before publishing');
  }

  if (excerpt.length < 10 || excerpt.length > 800) {
    throw new Error('Article excerpt must be between 10 and 800 characters before publishing');
  }

  if (category.length < 2 || category.length > 80) {
    throw new Error('Article category must be between 2 and 80 characters before publishing');
  }

  validateContentBlocks(article?.contentBlocks);
};

const articleInputValidators = [
  body('topic').trim().isLength({ min: 3, max: 200 }).withMessage('Topic is required'),
  body('category').trim().isLength({ min: 2, max: 80 }).withMessage('Category is required'),
  body('audience').optional().isString().trim().isLength({ max: 200 }),
  body('tone').optional().isString().trim().isLength({ max: 120 }),
  body('length').optional().isIn(['short', 'medium', 'long']),
  body('imagePrompt').optional().isString().trim().isLength({ max: 1000 }),
  body('imageStyle').optional().isString().trim().isLength({ max: 250 }),
  body('imageMood').optional().isString().trim().isLength({ max: 250 }),
  body('imageColors').optional().isString().trim().isLength({ max: 250 }),
  body('imageAvoid').optional().isString().trim().isLength({ max: 500 }),
  body('coverImageUrl').optional().isString().trim().isLength({ max: 1000 }),
  body('coverImagePublicId').optional().isString().trim().isLength({ max: 250 })
];

const manualArticleValidators = [
  body('title').trim().isLength({ min: 3, max: 200 }).withMessage('Title is required'),
  body('excerpt').trim().isLength({ min: 10, max: 800 }).withMessage('Excerpt is required'),
  body('category').trim().isLength({ min: 2, max: 80 }).withMessage('Category is required'),
  body('tags').optional().isArray(),
  body('contentBlocks').custom(validateContentBlocks),
  body('coverImageUrl').optional().isString().trim().isLength({ max: 1000 }),
  body('coverImagePublicId').optional().isString().trim().isLength({ max: 250 }),
  body('seoTitle').optional().isString().trim().isLength({ max: 200 }),
  body('seoDescription').optional().isString().trim().isLength({ max: 500 })
];

// GET /api/articles
router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('category').optional().isString().trim(),
  query('q').optional().isString().trim().isLength({ max: 100 })
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
      filter.category = new RegExp(`^${escapeRegex(category)}$`, 'i');
    }

    appendArticleSearchClauses(filter, q);

    const sort = { publishedAt: -1, createdAt: -1 };

    const [articles, total] = await Promise.all([
      Article.find(filter)
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

// POST /api/articles/admin/generation-runs
router.post('/admin/generation-runs', adminAuth, requireContentManage, [
  body('count').optional().isInt({ min: 1, max: getManualMaxCount() })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return validationErrorResponse(res, errors.array());
    }

    const run = await createManualGenerationRun({
      count: req.body.count || 10,
      requestedBy: req.user._id
    });

    startGenerationRun(run._id);

    res.status(202).json({
      success: true,
      data: { run: formatRun(run.toObject()) }
    });
  } catch (error) {
    console.error('Create article generation run error:', error);
    res.status(400).json({ success: false, message: error.message || 'Unable to start generation run' });
  }
});

// POST /api/articles/admin/generation-runs/cancel-active
router.post('/admin/generation-runs/cancel-active', adminAuth, requireContentManage, async (req, res) => {
  try {
    const now = new Date();
    const result = await ArticleGenerationRun.updateMany({
      status: { $in: ['queued', 'running'] }
    }, {
      $set: {
        status: 'failed',
        finishedAt: now
      },
      $push: {
        errors: {
          topic: '',
          stage: 'cancelled',
          message: 'Generation cancelled by admin.',
          at: now
        }
      }
    });

    res.json({
      success: true,
      data: {
        matchedCount: result.matchedCount ?? result.n ?? 0,
        modifiedCount: result.modifiedCount ?? result.nModified ?? 0
      }
    });
  } catch (error) {
    console.error('Cancel active article generation runs error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/articles/admin/generation-runs/:id
router.get('/admin/generation-runs/:id', adminAuth, requireContentRead, [
  param('id').isMongoId().withMessage('Invalid run ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return validationErrorResponse(res, errors.array());
    }

    const run = await ArticleGenerationRun.findById(req.params.id)
      .populate('articleIds', 'title slug status category coverImageUrl wordCount createdAt publishedAt')
      .lean();

    if (!run) {
      return res.status(404).json({ success: false, message: 'Generation run not found' });
    }

    res.json({
      success: true,
      data: { run: formatRun(run) }
    });
  } catch (error) {
    console.error('Get article generation run error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/articles/admin
router.get('/admin', adminAuth, requireContentRead, [
  query('status').optional().isIn(['all', 'draft', 'review', 'published', 'archived', 'rejected']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('q').optional().isString().trim().isLength({ max: 100 }),
  query('runId').optional().isMongoId()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return validationErrorResponse(res, errors.array());
    }

    const { page = 1, limit = 20, status = 'review', q, runId } = req.query;
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    const filter = buildArticleFilter({ status, q, runId });
    const sort = { createdAt: -1 };

    const [articles, total] = await Promise.all([
      Article.find(filter)
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
    console.error('Get admin articles error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/articles/admin
//
// The legacy admin surface only offered AI generation. A manual path is
// essential when an editor is restoring an existing article or the AI provider
// is unavailable. New records begin as drafts and retain the usual review and
// publish controls, so public readers only ever receive published content.
router.post('/admin', adminAuth, requireContentManage, normalizeArticleEditorBody, manualArticleValidators, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return validationErrorResponse(res, errors.array());
    }

    const title = toPlainArticleText(req.body.title);
    const contentBlocks = normalizeContentBlocks(req.body.contentBlocks);
    const slug = await buildUniqueSlug(title);
    const article = await Article.create({
      title,
      slug,
      excerpt: toPlainArticleText(req.body.excerpt),
      category: toPlainArticleText(req.body.category),
      tags: normalizeTags(req.body.tags),
      contentBlocks,
      coverImageUrl: String(req.body.coverImageUrl || '').trim() || null,
      coverImagePublicId: String(req.body.coverImagePublicId || '').trim() || null,
      seoTitle: toPlainArticleText(req.body.seoTitle),
      seoDescription: toPlainArticleText(req.body.seoDescription),
      canonicalUrl: buildArticleCanonicalUrl(slug),
      status: 'draft',
      wordCount: countArticleWords({ contentBlocks }),
      generatedByAi: false,
      reviewedByHuman: false,
      reviewedBy: null,
      reviewedAt: null,
      publishedAt: null
    });

    res.status(201).json({
      success: true,
      data: { article: formatArticle(article) }
    });
  } catch (error) {
    console.error('Create manual article error:', error);
    res.status(500).json({ success: false, message: 'Unable to create article' });
  }
});

// POST /api/articles/admin/generate
router.post('/admin/generate', adminAuth, requireContentManage, normalizeArticleGenerationBody, articleInputValidators, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return validationErrorResponse(res, errors.array());
    }

    const article = await createReviewArticle({ input: req.body });

    res.status(201).json({
      success: true,
      data: { article: formatArticle(article) }
    });
  } catch (error) {
    console.error('Generate article error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

// GET /api/articles/admin/:id
router.get('/admin/:id', adminAuth, requireContentRead, [
  param('id').isMongoId().withMessage('Invalid article ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return validationErrorResponse(res, errors.array());
    }

    const article = await Article.findById(req.params.id).lean();
    if (!article) {
      return res.status(404).json({ success: false, message: 'Article not found' });
    }

    res.json({
      success: true,
      data: { article: formatArticle(article) }
    });
  } catch (error) {
    console.error('Get admin article error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PATCH /api/articles/admin/:id
router.patch('/admin/:id', adminAuth, requireContentManage, normalizeArticleEditorBody, [
  param('id').isMongoId().withMessage('Invalid article ID'),
  body('title').optional().trim().isLength({ min: 3, max: 200 }),
  body('excerpt').optional().trim().isLength({ min: 10, max: 800 }),
  body('category').optional().trim().isLength({ min: 2, max: 80 }),
  body('tags').optional().isArray(),
  body('contentBlocks').optional().custom(validateContentBlocks),
  body('coverImageUrl').optional().isString().trim().isLength({ max: 1000 }),
  body('coverImagePublicId').optional().isString().trim().isLength({ max: 250 }),
  body('imagePrompt').optional().isString().trim().isLength({ max: 1000 }),
  body('seoTitle').optional().isString().trim().isLength({ max: 200 }),
  body('seoDescription').optional().isString().trim().isLength({ max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return validationErrorResponse(res, errors.array());
    }

    const updates = {};
    EDITABLE_FIELDS.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates[field] = req.body[field];
      }
    });

    if (!Object.keys(updates).length) {
      return res.status(400).json({
        success: false,
        message: 'Provide at least one editable article field'
      });
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'tags')) {
      updates.tags = normalizeTags(updates.tags);
    }

    PLAIN_TEXT_ARTICLE_FIELDS.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(updates, field)) {
        updates[field] = toPlainArticleText(updates[field]);
      }
    });

    if (Object.prototype.hasOwnProperty.call(updates, 'contentBlocks')) {
      updates.contentBlocks = normalizeContentBlocks(updates.contentBlocks);
      updates.wordCount = countArticleWords({ contentBlocks: updates.contentBlocks });
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'coverImageUrl')) {
      updates.coverImageStorage = null;
      if (!Object.prototype.hasOwnProperty.call(updates, 'coverImagePublicId')) {
        updates.coverImagePublicId = null;
      }
    }

    let transitionedToPublished = false;
    if (updates.status === 'published') {
      const existingArticle = await Article.findById(req.params.id).select('status').lean();
      if (!existingArticle) {
        return res.status(404).json({ success: false, message: 'Article not found' });
      }
      transitionedToPublished = existingArticle.status !== 'published';
    }

    const article = await Article.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true
    }).lean();

    if (!article) {
      return res.status(404).json({ success: false, message: 'Article not found' });
    }

    if (transitionedToPublished) {
      try {
        await enqueueArticlePublishedNotifications(article);
      } catch (notificationError) {
        console.error(
          'Queue article push notifications failed:',
          notificationError?.code || 'ARTICLE_PUSH_ENQUEUE_FAILED'
        );
      }
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
router.post('/admin/:id/publish', adminAuth, requireContentManage, [
  param('id').isMongoId().withMessage('Invalid article ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return validationErrorResponse(res, errors.array());
    }

    const existingArticle = await Article.findById(req.params.id).lean();
    if (!existingArticle) {
      return res.status(404).json({ success: false, message: 'Article not found' });
    }

    // Publishing is deliberately idempotent. A retry after a slow response
    // must preserve the original publication date, canonical record, and
    // review audit instead of moving a live article to the top of every list.
    if (existingArticle.status === 'published') {
      return res.json({
        success: true,
        data: { article: formatArticle(existingArticle) }
      });
    }

    try {
      validateArticleForPublication(existingArticle);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Article is not ready to publish'
      });
    }

    const now = new Date();

    const article = await Article.findOneAndUpdate({
      _id: req.params.id,
      status: { $ne: 'published' }
    }, {
      $set: {
        status: 'published',
        reviewedByHuman: true,
        reviewedBy: req.user._id,
        reviewedAt: now,
        publishedAt: now,
        rejectionReason: '',
        rejectedAt: null,
        canonicalUrl: buildArticleCanonicalUrl(existingArticle.slug)
      }
    }, {
      new: true,
      runValidators: true
    }).lean();

    if (!article) {
      // Another administrator may have won the same publish race. Re-read the
      // authoritative document and return the already-published result rather
      // than turning a safe retry into a false failure.
      const concurrentArticle = await Article.findById(req.params.id).lean();
      if (!concurrentArticle) {
        return res.status(404).json({ success: false, message: 'Article not found' });
      }

      if (concurrentArticle.status === 'published') {
        return res.json({
          success: true,
          data: { article: formatArticle(concurrentArticle) }
        });
      }

      return res.status(409).json({
        success: false,
        message: 'Article changed before it could be published. Refresh and try again.'
      });
    }

    if (existingArticle.status !== 'published') {
      try {
        await enqueueArticlePublishedNotifications(article);
      } catch (notificationError) {
        console.error(
          'Queue article push notifications failed:',
          notificationError?.code || 'ARTICLE_PUSH_ENQUEUE_FAILED'
        );
      }
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

// POST /api/articles/admin/:id/reject
router.post('/admin/:id/reject', adminAuth, requireContentManage, [
  param('id').isMongoId().withMessage('Invalid article ID'),
  body('reason').optional().isString().trim().isLength({ max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return validationErrorResponse(res, errors.array());
    }

    const article = await Article.findByIdAndUpdate(req.params.id, {
      status: 'rejected',
      reviewedByHuman: true,
      reviewedBy: req.user._id,
      reviewedAt: new Date(),
      rejectedAt: new Date(),
      rejectionReason: String(req.body.reason || '').trim(),
      publishedAt: null
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
    console.error('Reject article error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// DELETE /api/articles/admin/:id
router.delete('/admin/:id', adminAuth, requireContentManage, [
  param('id').isMongoId().withMessage('Invalid article ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return validationErrorResponse(res, errors.array());
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
