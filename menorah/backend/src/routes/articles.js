const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const Article = require('../models/Article');
const ArticleGenerationRun = require('../models/ArticleGenerationRun');
const { adminAuth } = require('../middleware/auth');
const {
  requireAdminPermission,
} = require('../middleware/adminAuthorization');
const {
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
  'canonicalUrl',
  'coverImageUrl',
  'coverImagePublicId',
  'imagePrompt',
  'status',
  'rejectionReason'
];

const formatArticle = (article) => {
  if (!article) {
    return null;
  }

  const plain = typeof article.toObject === 'function' ? article.toObject() : article;

  return {
    ...plain,
    id: plain._id?.toString(),
    _id: plain._id?.toString()
  };
};

const validationErrorResponse = (res, errors) => res.status(400).json({
  success: false,
  message: 'Validation failed',
  errors
});

const buildArticleFilter = ({ status, q, runId }) => {
  const filter = {};

  if (status && status !== 'all') {
    filter.status = status;
  }

  if (runId) {
    filter.generationRun = runId;
  }

  if (q) {
    filter.$text = { $search: q };
  }

  return filter;
};

const updateReviewMetadata = (updates, userId) => {
  if (updates.status === 'published') {
    updates.reviewedByHuman = true;
    updates.reviewedBy = userId;
    updates.reviewedAt = new Date();
    updates.publishedAt = new Date();
    updates.rejectionReason = '';
    updates.rejectedAt = null;
  }

  if (updates.status === 'rejected') {
    updates.reviewedByHuman = true;
    updates.reviewedBy = userId;
    updates.reviewedAt = new Date();
    updates.rejectedAt = new Date();
    updates.publishedAt = null;
  }
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
  query('q').optional().isString().trim(),
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
    const sort = q
      ? { score: { $meta: 'textScore' }, createdAt: -1 }
      : { createdAt: -1 };

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
    console.error('Get admin articles error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/articles/admin/generate
router.post('/admin/generate', adminAuth, requireContentManage, articleInputValidators, async (req, res) => {
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
router.patch('/admin/:id', adminAuth, requireContentManage, [
  param('id').isMongoId().withMessage('Invalid article ID'),
  body('title').optional().trim().isLength({ min: 3, max: 200 }),
  body('excerpt').optional().trim().isLength({ min: 10, max: 800 }),
  body('category').optional().trim().isLength({ min: 2, max: 80 }),
  body('tags').optional().isArray(),
  body('contentBlocks').optional().isArray(),
  body('coverImageUrl').optional().isString().trim().isLength({ max: 1000 }),
  body('status').optional().isIn(['draft', 'review', 'published', 'archived', 'rejected']),
  body('rejectionReason').optional().isString().trim().isLength({ max: 500 })
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

    if (updates.tags) {
      updates.tags = normalizeTags(updates.tags);
    }

    if (updates.contentBlocks) {
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

    updateReviewMetadata(updates, req.user._id);

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

    const existingArticle = await Article.findById(req.params.id).select('status').lean();
    if (!existingArticle) {
      return res.status(404).json({ success: false, message: 'Article not found' });
    }

    const article = await Article.findByIdAndUpdate(req.params.id, {
      status: 'published',
      reviewedByHuman: true,
      reviewedBy: req.user._id,
      reviewedAt: new Date(),
      publishedAt: new Date(),
      rejectionReason: '',
      rejectedAt: null
    }, {
      new: true,
      runValidators: true
    }).lean();

    if (!article) {
      return res.status(404).json({ success: false, message: 'Article not found' });
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
