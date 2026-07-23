const express = require('express');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const rateLimit = require('express-rate-limit');
const { body, param, query, validationResult } = require('express-validator');
const BrandAsset = require('../models/BrandAsset');
const BrandGuideline = require('../models/BrandGuideline');
const SocialPost = require('../models/SocialPost');
const InstagramAccount = require('../models/InstagramAccount');
const GenerationJob = require('../models/GenerationJob');
const SocialPromptSettings = require('../models/SocialPromptSettings');
const SocialWorkflow = require('../models/SocialWorkflow');
const SocialGenerationRun = require('../models/SocialGenerationRun');
const { adminAuth } = require('../middleware/auth');
const { storeMediaBuffer } = require('../services/mediaStorage');
const { createSocialPostDraft } = require('../services/socialStudio/socialStudio.service');
const {
  defaultGuidelinePayload,
  getActiveBrandGuidelines,
  normalizeGuidelinePayload
} = require('../services/socialStudio/assetSelector.service');
const { generateBackgroundImage, generateCaption } = require('../services/socialStudio/aiProvider.service');
const { renderStaticPost } = require('../services/socialStudio/postRenderer.service');
const { runQualityCheck } = require('../services/socialStudio/qualityCheck.service');
const { publishApprovedPost, encryptToken, verifyInstagramAccount } = require('../services/socialStudio/instagramPublisher.service');
const { scheduleApprovedPost } = require('../services/socialStudio/socialScheduler.service');
const {
  countCampaignPosts,
  createWorkflowRun,
  getMaxPostsPerRun,
  getRunPosts,
  normalizeCampaignBrief
} = require('../services/socialStudio/workflowRunner.service');
const { normalizeHashtags, parseList, toPlainText } = require('../services/socialStudio/textUtils');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/') && file.mimetype !== 'application/pdf' && !file.mimetype.includes('font')) {
      return cb(new Error('Only image, PDF, and font assets are allowed'));
    }
    cb(null, true);
  }
});

const generationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.SOCIAL_STUDIO_GENERATION_RATE_LIMIT, 10) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip)
});

router.use(adminAuth);

const validationErrorResponse = (res, errors) => res.status(400).json({
  success: false,
  message: 'Validation failed',
  errors
});

const id = (value) => value?._id?.toString?.() || value?.id?.toString?.() || value?.toString?.();

const formatModel = (doc) => {
  if (!doc) return null;
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    ...plain,
    id: id(plain)
  };
};

const formatInstagramAccount = (account) => {
  const plain = formatModel(account);
  if (!plain) return null;
  delete plain.accessTokenEncrypted;
  return plain;
};

const normalizeSchedulePayload = (schedule = {}) => ({
  enabled: Boolean(schedule.enabled),
  type: ['none', 'once', 'daily', 'weekly', 'monthly'].includes(schedule.type) ? schedule.type : 'none',
  timezone: toPlainText(schedule.timezone || 'Asia/Dubai'),
  runAt: schedule.runAt ? new Date(schedule.runAt) : null,
  timeOfDay: /^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.timeOfDay || '') ? schedule.timeOfDay : '09:00',
  dayOfWeek: Math.max(0, Math.min(6, Number(schedule.dayOfWeek) || 0)),
  dayOfMonth: Math.max(1, Math.min(31, Number(schedule.dayOfMonth) || 1)),
  lastScheduledKey: toPlainText(schedule.lastScheduledKey || '')
});

const normalizeWorkflowPayload = (payload = {}, userId = null, { partial = false } = {}) => {
  const next = {};

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'name')) next.name = toPlainText(payload.name);
  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'description')) next.description = toPlainText(payload.description || '');
  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'status')) {
    next.status = ['active', 'paused', 'archived'].includes(payload.status) ? payload.status : 'active';
  }
  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'customMaxPosts')) {
    next.customMaxPosts = Math.max(1, Math.min(100, Number(payload.customMaxPosts) || getMaxPostsPerRun()));
  }
  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'schedule')) next.schedule = normalizeSchedulePayload(payload.schedule || {});
  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'campaigns')) {
    next.campaigns = Array.isArray(payload.campaigns)
      ? payload.campaigns.map(normalizeCampaignBrief).filter((campaign) => campaign.topic && campaign.campaignName)
      : [];
  }

  if (userId) next.updatedBy = userId;
  return next;
};

const EXTENSION_BY_MIME = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['image/svg+xml', '.svg'],
  ['application/pdf', '.pdf'],
  ['font/ttf', '.ttf'],
  ['font/otf', '.otf'],
  ['font/woff', '.woff'],
  ['font/woff2', '.woff2'],
]);

const saveUploadedAsset = async (file) => {
  const originalExtension = path.extname(file.originalname || '').toLowerCase();
  const extension = EXTENSION_BY_MIME.get(file.mimetype)
    || (/^\.[a-z0-9]{1,10}$/.test(originalExtension) ? originalExtension : '.bin');
  const stored = await storeMediaBuffer(file.buffer, {
    service: 'social-studio',
    category: 'brand-assets',
    extension,
    contentType: file.mimetype || 'application/octet-stream',
    cloudinaryFolder:
      process.env.CLOUDINARY_SOCIAL_STUDIO_ASSET_FOLDER
      || 'menorah/social-studio-assets',
    cloudinaryResourceType: 'auto',
  });

  return {
    url: stored.url,
    publicId: stored.metadata.publicId || '',
    filename: path.basename(stored.metadata.objectKey),
    metadata: stored.metadata,
  };
};

const getImageDimensions = async (file) => {
  if (!file?.mimetype?.startsWith('image/')) {
    return { width: null, height: null };
  }
  try {
    const metadata = await sharp(file.buffer).metadata();
    return { width: metadata.width || null, height: metadata.height || null };
  } catch {
    return { width: null, height: null };
  }
};

const renderAndCheckPost = async (post, { regenerateBackground = false } = {}) => {
  const brandGuideline = await getActiveBrandGuidelines();
  const assets = post.selectedAssetIds?.length
    ? await BrandAsset.find({ _id: { $in: post.selectedAssetIds }, status: 'active' })
    : [];
  const backgroundImage = regenerateBackground
    ? await generateBackgroundImage({
      topic: post.topic,
      campaignName: post.campaignName,
      audience: post.audience,
      objective: post.objective,
      tone: post.tone,
      imagePrompt: post.aiPrompt,
      hookText: post.hookText,
      bodyText: post.bodyText,
      ctaText: post.ctaText,
      brandGuideline
    })
    : null;

  const rendered = await renderStaticPost({
    socialPost: post,
    brandGuideline,
    assets,
    backgroundImageBuffer: backgroundImage?.imageBuffer || null
  });
  Object.assign(post, rendered);
  if (backgroundImage?.modelUsed) {
    const existingModels = String(post.modelUsed || '')
      .split('+')
      .map((item) => item.trim())
      .filter(Boolean);
    post.modelUsed = Array.from(new Set([...existingModels, backgroundImage.modelUsed])).join(' + ');
  }
  const quality = runQualityCheck({ socialPost: post, brandGuideline, assets });
  post.qualityScore = quality.qualityScore;
  post.qualityIssues = quality.qualityIssues;
  await post.save();
  return post;
};

// GET /api/admin/social-studio/stats
router.get('/stats', async (_req, res) => {
  try {
    const [statusCounts, recentPosts, connectedAccounts] = await Promise.all([
      SocialPost.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      SocialPost.find().sort({ createdAt: -1 }).limit(6).lean(),
      InstagramAccount.countDocuments({ status: 'connected' })
    ]);

    res.json({
      success: true,
      data: {
        counts: statusCounts.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        connectedAccounts,
        recentPosts: recentPosts.map(formatModel)
      }
    });
  } catch (error) {
    console.error('Social Studio stats error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Prompt settings
router.get('/settings/prompts', async (_req, res) => {
  try {
    const settings = await SocialPromptSettings.findOneAndUpdate(
      { key: 'default' },
      { $setOnInsert: { key: 'default', textSystemPrompt: '', imageSystemPrompt: '' } },
      { new: true, upsert: true }
    ).lean();
    res.json({ success: true, data: { settings: formatModel(settings) } });
  } catch (error) {
    console.error('Get Social Studio prompt settings error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.patch('/settings/prompts', [
  body('textSystemPrompt').optional().isString().isLength({ max: 8000 }),
  body('imageSystemPrompt').optional().isString().isLength({ max: 8000 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return validationErrorResponse(res, errors.array());

    const updates = { updatedBy: req.user._id };
    if (Object.prototype.hasOwnProperty.call(req.body, 'textSystemPrompt')) updates.textSystemPrompt = toPlainText(req.body.textSystemPrompt);
    if (Object.prototype.hasOwnProperty.call(req.body, 'imageSystemPrompt')) updates.imageSystemPrompt = toPlainText(req.body.imageSystemPrompt);

    const settings = await SocialPromptSettings.findOneAndUpdate(
      { key: 'default' },
      { $set: updates, $setOnInsert: { key: 'default' } },
      { new: true, upsert: true, runValidators: true }
    ).lean();
    res.json({ success: true, data: { settings: formatModel(settings) } });
  } catch (error) {
    console.error('Update Social Studio prompt settings error:', error);
    res.status(400).json({ success: false, message: error.message || 'Unable to update prompt settings' });
  }
});

// Workflows and generation runs
router.get('/workflows', async (_req, res) => {
  try {
    const workflows = await SocialWorkflow.find({ status: { $ne: 'archived' } }).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data: { workflows: workflows.map(formatModel) } });
  } catch (error) {
    console.error('List Social Studio workflows error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/workflows', [
  body('name').trim().isLength({ min: 2, max: 160 }),
  body('campaigns').isArray({ min: 1 }),
  body('customMaxPosts').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return validationErrorResponse(res, errors.array());

    const payload = normalizeWorkflowPayload(req.body, req.user._id);
    const requestedCount = countCampaignPosts(payload.campaigns);
    const maxPosts = Math.min(getMaxPostsPerRun(), payload.customMaxPosts || getMaxPostsPerRun());
    if (requestedCount > maxPosts) {
      return res.status(400).json({ success: false, message: `Workflow requests ${requestedCount} posts, but the limit is ${maxPosts}` });
    }

    const workflow = await SocialWorkflow.create({
      ...payload,
      createdBy: req.user._id,
      updatedBy: req.user._id
    });
    res.status(201).json({ success: true, data: { workflow: formatModel(workflow) } });
  } catch (error) {
    console.error('Create Social Studio workflow error:', error);
    res.status(400).json({ success: false, message: error.message || 'Unable to create workflow' });
  }
});

router.post('/workflows/:id/run', [param('id').isMongoId()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return validationErrorResponse(res, errors.array());

    const workflow = await SocialWorkflow.findById(req.params.id);
    if (!workflow || workflow.status === 'archived') return res.status(404).json({ success: false, message: 'Workflow not found' });
    if (workflow.status === 'paused') return res.status(400).json({ success: false, message: 'Workflow is paused' });

    const settings = await SocialPromptSettings.findOne({ key: 'default' }).lean();
    const run = await createWorkflowRun({
      workflow,
      requestedBy: req.user._id,
      source: 'manual',
      textSystemPrompt: settings?.textSystemPrompt || '',
      imageSystemPrompt: settings?.imageSystemPrompt || ''
    });

    res.status(202).json({ success: true, data: { run: formatModel(run) } });
  } catch (error) {
    console.error('Run Social Studio workflow error:', error);
    res.status(400).json({ success: false, message: error.message || 'Unable to run workflow' });
  }
});

router.patch('/workflows/:id', [
  param('id').isMongoId(),
  body('name').optional().trim().isLength({ min: 2, max: 160 }),
  body('campaigns').optional().isArray({ min: 1 }),
  body('customMaxPosts').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return validationErrorResponse(res, errors.array());

    const payload = normalizeWorkflowPayload(req.body, req.user._id, { partial: true });
    if (payload.campaigns) {
      const maxPosts = Math.min(getMaxPostsPerRun(), payload.customMaxPosts || getMaxPostsPerRun());
      const requestedCount = countCampaignPosts(payload.campaigns);
      if (requestedCount > maxPosts) {
        return res.status(400).json({ success: false, message: `Workflow requests ${requestedCount} posts, but the limit is ${maxPosts}` });
      }
    }

    const workflow = await SocialWorkflow.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true }).lean();
    if (!workflow) return res.status(404).json({ success: false, message: 'Workflow not found' });
    res.json({ success: true, data: { workflow: formatModel(workflow) } });
  } catch (error) {
    console.error('Update Social Studio workflow error:', error);
    res.status(400).json({ success: false, message: error.message || 'Unable to update workflow' });
  }
});

router.delete('/workflows/:id', [param('id').isMongoId()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return validationErrorResponse(res, errors.array());
    const workflow = await SocialWorkflow.findByIdAndUpdate(req.params.id, { status: 'archived', updatedBy: req.user._id }, { new: true }).lean();
    if (!workflow) return res.status(404).json({ success: false, message: 'Workflow not found' });
    res.json({ success: true, data: { workflow: formatModel(workflow) } });
  } catch (error) {
    console.error('Archive Social Studio workflow error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/runs', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('workflow').optional().isMongoId()
], async (req, res) => {
  try {
    const pageNumber = Math.max(1, Number(req.query.page) || 1);
    const limitNumber = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const filter = {};
    if (req.query.workflow) filter.workflow = req.query.workflow;

    const [runs, total] = await Promise.all([
      SocialGenerationRun.find(filter).sort({ createdAt: -1 }).skip((pageNumber - 1) * limitNumber).limit(limitNumber).lean(),
      SocialGenerationRun.countDocuments(filter)
    ]);
    res.json({
      success: true,
      data: {
        runs: runs.map(formatModel),
        pagination: { page: pageNumber, limit: limitNumber, total, pages: Math.ceil(total / limitNumber) }
      }
    });
  } catch (error) {
    console.error('List Social Studio runs error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/runs/:id', [param('id').isMongoId()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return validationErrorResponse(res, errors.array());

    const run = await SocialGenerationRun.findById(req.params.id).lean();
    if (!run) return res.status(404).json({ success: false, message: 'Run not found' });
    const posts = await getRunPosts(run);
    res.json({ success: true, data: { run: formatModel(run), posts: posts.map(formatModel) } });
  } catch (error) {
    console.error('Get Social Studio run error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Brand assets
router.get('/brand-assets', [
  query('type').optional().isString().trim(),
  query('status').optional().isIn(['active', 'archived', 'all'])
], async (req, res) => {
  try {
    const filter = {};
    if (req.query.type) filter.type = req.query.type;
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
    else filter.status = 'active';

    const assets = await BrandAsset.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: { assets: assets.map(formatModel) } });
  } catch (error) {
    console.error('Social Studio brand assets error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/brand-assets', upload.single('file'), [
  body('type').isIn(['logo', 'font', 'image', 'icon', 'template', 'background', 'product_image', 'reference_post', 'brand_guideline']),
  body('name').trim().isLength({ min: 2, max: 120 }),
  body('url').optional().isString().trim().isLength({ max: 1000 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return validationErrorResponse(res, errors.array());
    if (!req.file && !req.body.url) {
      return res.status(400).json({ success: false, message: 'Upload a file or provide an asset URL' });
    }

    const saved = req.file
      ? await saveUploadedAsset(req.file)
      : {
        url: req.body.url,
        publicId: req.body.publicId || '',
        filename: req.body.filename || '',
        metadata: null,
      };
    const dimensions = req.file ? await getImageDimensions(req.file) : {
      width: Number(req.body.width) || null,
      height: Number(req.body.height) || null
    };

    const asset = await BrandAsset.create({
      type: req.body.type,
      name: req.body.name,
      filename: saved.filename,
      url: saved.url,
      publicId: saved.publicId,
      storage: saved.metadata,
      mimeType: req.file?.mimetype || req.body.mimeType || '',
      sizeBytes: req.file?.size || Number(req.body.sizeBytes) || 0,
      tags: parseList(req.body.tags).map((tag) => tag.toLowerCase()),
      colors: parseList(req.body.colors),
      width: dimensions.width,
      height: dimensions.height,
      metadata: req.body.metadata ? JSON.parse(req.body.metadata) : {},
      uploadedBy: req.user._id
    });

    res.status(201).json({ success: true, data: { asset: formatModel(asset) } });
  } catch (error) {
    console.error('Create Social Studio brand asset error:', error);
    res.status(400).json({ success: false, message: error.message || 'Unable to create asset' });
  }
});

router.patch('/brand-assets/:id', [
  param('id').isMongoId(),
  body('status').optional().isIn(['active', 'archived'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return validationErrorResponse(res, errors.array());

    const updates = {};
    ['name', 'url', 'publicId', 'filename', 'mimeType', 'status'].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) updates[field] = req.body[field];
    });
    if (Object.prototype.hasOwnProperty.call(req.body, 'url')) {
      updates.storage = null;
      if (!Object.prototype.hasOwnProperty.call(req.body, 'publicId')) {
        updates.publicId = '';
      }
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'tags')) updates.tags = parseList(req.body.tags).map((tag) => tag.toLowerCase());
    if (Object.prototype.hasOwnProperty.call(req.body, 'colors')) updates.colors = parseList(req.body.colors);
    if (Object.prototype.hasOwnProperty.call(req.body, 'metadata')) updates.metadata = req.body.metadata;

    const asset = await BrandAsset.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true }).lean();
    if (!asset) return res.status(404).json({ success: false, message: 'Brand asset not found' });
    res.json({ success: true, data: { asset: formatModel(asset) } });
  } catch (error) {
    console.error('Update Social Studio brand asset error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.delete('/brand-assets/:id', [param('id').isMongoId()], async (req, res) => {
  try {
    const asset = await BrandAsset.findByIdAndUpdate(req.params.id, { status: 'archived' }, { new: true }).lean();
    if (!asset) return res.status(404).json({ success: false, message: 'Brand asset not found' });
    res.json({ success: true, data: { asset: formatModel(asset) } });
  } catch (error) {
    console.error('Archive Social Studio brand asset error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Brand guidelines
router.get('/brand-guidelines/active', async (_req, res) => {
  try {
    const guideline = await getActiveBrandGuidelines();
    res.json({ success: true, data: { guideline: formatModel(guideline) } });
  } catch (error) {
    console.error('Get Social Studio guideline error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/brand-guidelines', async (req, res) => {
  try {
    const payload = normalizeGuidelinePayload({ ...defaultGuidelinePayload, ...req.body, createdBy: req.user._id, updatedBy: req.user._id });
    if (payload.status === 'active') {
      await BrandGuideline.updateMany({ status: 'active' }, { status: 'inactive' });
    }
    const guideline = await BrandGuideline.create(payload);
    res.status(201).json({ success: true, data: { guideline: formatModel(guideline) } });
  } catch (error) {
    console.error('Create Social Studio guideline error:', error);
    res.status(400).json({ success: false, message: error.message || 'Unable to create guideline' });
  }
});

router.patch('/brand-guidelines/:id', [param('id').isMongoId()], async (req, res) => {
  try {
    const payload = normalizeGuidelinePayload({ ...req.body, updatedBy: req.user._id }, { partial: true });
    if (payload.status === 'active') {
      await BrandGuideline.updateMany({ _id: { $ne: req.params.id }, status: 'active' }, { status: 'inactive' });
    }
    const guideline = await BrandGuideline.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true }).lean();
    if (!guideline) return res.status(404).json({ success: false, message: 'Brand guideline not found' });
    res.json({ success: true, data: { guideline: formatModel(guideline) } });
  } catch (error) {
    console.error('Update Social Studio guideline error:', error);
    res.status(400).json({ success: false, message: error.message || 'Unable to update guideline' });
  }
});

// Post generation and management
router.post('/posts/generate', generationLimiter, [
  body('topic').trim().isLength({ min: 3, max: 220 }),
  body('campaignName').optional().isString().trim().isLength({ max: 120 }),
  body('audience').optional().isString().trim().isLength({ max: 240 }),
  body('objective').optional().isString().trim().isLength({ max: 240 }),
  body('tone').optional().isString().trim().isLength({ max: 160 }),
  body('postType').optional().isIn(['single_image', 'carousel', 'reel_cover']),
  body('aspectRatio').optional().isIn(['1:1', '4:5', '9:16']),
  body('textSystemPrompt').optional().isString().isLength({ max: 8000 }),
  body('imageSystemPrompt').optional().isString().isLength({ max: 8000 }),
  body('sequenceNumber').optional().isInt({ min: 1, max: 100 }),
  body('totalCount').optional().isInt({ min: 1, max: getMaxPostsPerRun() })
], async (req, res) => {
  try {
    if (process.env.SOCIAL_STUDIO_ENABLED === 'false') {
      return res.status(403).json({ success: false, message: 'AI Social Studio is disabled' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) return validationErrorResponse(res, errors.array());

    const { post, job } = await createSocialPostDraft({ input: req.body, createdBy: req.user._id });
    res.status(201).json({ success: true, data: { post: formatModel(post), job: formatModel(job) } });
  } catch (error) {
    console.error('Generate Social Studio post error:', error);
    res.status(500).json({ success: false, message: error.message || 'Unable to generate post' });
  }
});

router.get('/posts', [
  query('status').optional().isIn(['all', 'draft', 'needs_review', 'approved', 'scheduled', 'publishing', 'published', 'rejected', 'failed_generation', 'failed_publish', 'expired_token']),
  query('campaignName').optional().isString().trim(),
  query('q').optional().isString().trim(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res) => {
  try {
    const { status = 'needs_review', campaignName, q, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status !== 'all') filter.status = status;
    if (campaignName) filter.campaignName = campaignName;
    if (q) filter.$text = { $search: q };

    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    const sort = q ? { score: { $meta: 'textScore' }, createdAt: -1 } : { createdAt: -1 };
    const [posts, total] = await Promise.all([
      SocialPost.find(filter, q ? { score: { $meta: 'textScore' } } : undefined)
        .sort(sort)
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber)
        .lean(),
      SocialPost.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: {
        posts: posts.map(formatModel),
        pagination: { page: pageNumber, limit: limitNumber, total, pages: Math.ceil(total / limitNumber) }
      }
    });
  } catch (error) {
    console.error('List Social Studio posts error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/posts/:id', [param('id').isMongoId()], async (req, res) => {
  try {
    const post = await SocialPost.findById(req.params.id)
      .populate('selectedAssetIds')
      .populate('instagramAccount', 'businessName igUserId pageId username accountType status lastVerifiedAt tokenExpiresAt')
      .lean();
    if (!post) return res.status(404).json({ success: false, message: 'Social post not found' });
    res.json({ success: true, data: { post: formatModel(post) } });
  } catch (error) {
    console.error('Get Social Studio post error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.patch('/posts/:id', [
  param('id').isMongoId(),
  body('hashtags').optional().isArray(),
  body('scheduledAt').optional({ nullable: true }).isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return validationErrorResponse(res, errors.array());

    const post = await SocialPost.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Social post not found' });

    const textFields = ['hookText', 'bodyText', 'ctaText', 'caption', 'campaignName', 'audience', 'objective', 'tone', 'aiPrompt', 'designBrief', 'aspectRatio', 'templateKey'];
    let needsRender = false;
    textFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        post[field] = ['aspectRatio', 'templateKey'].includes(field) ? req.body[field] : toPlainText(req.body[field]);
        if (['hookText', 'bodyText', 'ctaText', 'aspectRatio', 'templateKey'].includes(field)) needsRender = true;
      }
    });
    if (Object.prototype.hasOwnProperty.call(req.body, 'hashtags')) post.hashtags = normalizeHashtags(req.body.hashtags);
    if (Object.prototype.hasOwnProperty.call(req.body, 'selectedAssetIds')) {
      post.selectedAssetIds = req.body.selectedAssetIds;
      needsRender = true;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'scheduledAt')) post.scheduledAt = req.body.scheduledAt ? new Date(req.body.scheduledAt) : null;

    await post.save();
    if (needsRender) await renderAndCheckPost(post);
    res.json({ success: true, data: { post: formatModel(post) } });
  } catch (error) {
    console.error('Update Social Studio post error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

router.post('/posts/:id/regenerate-caption', [param('id').isMongoId()], async (req, res) => {
  try {
    const post = await SocialPost.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Social post not found' });
    const brandGuideline = await getActiveBrandGuidelines();
    const caption = await generateCaption({ socialPost: post, brandGuideline });
    post.caption = caption.caption;
    post.hashtags = normalizeHashtags([...(caption.hashtags || []), ...(brandGuideline.instagramRules?.defaultHashtags || [])]);
    await post.save();
    res.json({ success: true, data: { post: formatModel(post) } });
  } catch (error) {
    console.error('Regenerate Social Studio caption error:', error);
    res.status(500).json({ success: false, message: error.message || 'Unable to regenerate caption' });
  }
});

router.post('/posts/:id/regenerate-image', [param('id').isMongoId()], async (req, res) => {
  try {
    const post = await SocialPost.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Social post not found' });
    await renderAndCheckPost(post, { regenerateBackground: true });
    res.json({ success: true, data: { post: formatModel(post) } });
  } catch (error) {
    console.error('Regenerate Social Studio image error:', error);
    res.status(500).json({ success: false, message: error.message || 'Unable to regenerate image' });
  }
});

router.post('/posts/:id/render', [param('id').isMongoId()], async (req, res) => {
  try {
    const post = await SocialPost.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Social post not found' });
    await renderAndCheckPost(post);
    res.json({ success: true, data: { post: formatModel(post) } });
  } catch (error) {
    console.error('Render Social Studio post error:', error);
    res.status(500).json({ success: false, message: error.message || 'Unable to render post' });
  }
});

router.post('/posts/:id/approve', [param('id').isMongoId()], async (req, res) => {
  try {
    const post = await SocialPost.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Social post not found' });
    if (!post.finalImageUrl) await renderAndCheckPost(post);
    post.status = 'approved';
    post.approvedBy = req.user._id;
    post.reviewedBy = req.user._id;
    post.rejectionReason = '';
    post.errorLog = null;
    await post.save();
    res.json({ success: true, data: { post: formatModel(post) } });
  } catch (error) {
    console.error('Approve Social Studio post error:', error);
    res.status(500).json({ success: false, message: error.message || 'Unable to approve post' });
  }
});

router.post('/posts/:id/reject', [
  param('id').isMongoId(),
  body('reason').optional().isString().trim().isLength({ max: 500 })
], async (req, res) => {
  try {
    const post = await SocialPost.findByIdAndUpdate(req.params.id, {
      status: 'rejected',
      rejectedBy: req.user._id,
      reviewedBy: req.user._id,
      rejectionReason: toPlainText(req.body.reason || ''),
      scheduledAt: null
    }, { new: true }).lean();
    if (!post) return res.status(404).json({ success: false, message: 'Social post not found' });
    res.json({ success: true, data: { post: formatModel(post) } });
  } catch (error) {
    console.error('Reject Social Studio post error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/posts/:id/schedule', [
  param('id').isMongoId(),
  body('scheduledAt').isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return validationErrorResponse(res, errors.array());
    const post = await scheduleApprovedPost(req.params.id, new Date(req.body.scheduledAt));
    res.json({ success: true, data: { post: formatModel(post) } });
  } catch (error) {
    console.error('Schedule Social Studio post error:', error);
    res.status(400).json({ success: false, message: error.message || 'Unable to schedule post' });
  }
});

router.post('/posts/:id/publish-now', [param('id').isMongoId()], async (req, res) => {
  try {
    const post = await publishApprovedPost(req.params.id);
    res.json({ success: true, data: { post: formatModel(post) } });
  } catch (error) {
    console.error('Publish Social Studio post error:', error.message);
    res.status(400).json({ success: false, message: error.message || 'Unable to publish post' });
  }
});

router.post('/posts/:id/retry', [param('id').isMongoId()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return validationErrorResponse(res, errors.array());

    const post = await SocialPost.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Social post not found' });

    if (['failed_publish', 'expired_token'].includes(post.status)) {
      post.status = 'approved';
      post.errorLog = null;
      await post.save();
      const published = await publishApprovedPost(post._id);
      return res.json({ success: true, data: { post: formatModel(published) } });
    }

    if (post.status === 'failed_generation') {
      post.errorLog = null;
      await renderAndCheckPost(post, { regenerateBackground: true });
      post.status = 'needs_review';
      await post.save();
      return res.json({ success: true, data: { post: formatModel(post) } });
    }

    return res.status(400).json({ success: false, message: 'Only failed posts can be retried' });
  } catch (error) {
    console.error('Retry Social Studio post error:', error.message);
    res.status(400).json({ success: false, message: error.message || 'Unable to retry post' });
  }
});

router.get('/generation-jobs/:id', [param('id').isMongoId()], async (req, res) => {
  try {
    const job = await GenerationJob.findById(req.params.id).lean();
    if (!job) return res.status(404).json({ success: false, message: 'Generation job not found' });
    res.json({ success: true, data: { job: formatModel(job) } });
  } catch (error) {
    console.error('Get Social Studio job error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Instagram account manager
router.get('/instagram/accounts', async (_req, res) => {
  try {
    const accounts = await InstagramAccount.find().sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data: { accounts: accounts.map(formatInstagramAccount) } });
  } catch (error) {
    console.error('List Social Studio Instagram accounts error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/instagram/accounts/manual-connect', [
  body('businessName').trim().isLength({ min: 2, max: 120 }),
  body('igUserId').trim().isLength({ min: 3, max: 120 }),
  body('accessToken').isString().trim().isLength({ min: 20 }),
  body('pageId').optional().isString().trim().isLength({ max: 120 }),
  body('username').optional().isString().trim().isLength({ max: 120 }),
  body('tokenExpiresAt').optional({ nullable: true }).isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return validationErrorResponse(res, errors.array());

    const encryptedToken = encryptToken(req.body.accessToken);
    const account = await InstagramAccount.findOneAndUpdate(
      { igUserId: req.body.igUserId },
      {
        businessName: req.body.businessName,
        igUserId: req.body.igUserId,
        pageId: req.body.pageId || '',
        username: req.body.username || '',
        accountType: req.body.accountType || 'BUSINESS',
        accessTokenEncrypted: encryptedToken,
        tokenExpiresAt: req.body.tokenExpiresAt ? new Date(req.body.tokenExpiresAt) : null,
        connectedBy: req.user._id,
        status: 'connected'
      },
      { new: true, upsert: true, runValidators: true }
    ).lean();

    res.status(201).json({ success: true, data: { account: formatInstagramAccount(account) } });
  } catch (error) {
    console.error('Manual connect Social Studio Instagram account error:', error.message);
    res.status(400).json({ success: false, message: error.message || 'Unable to connect Instagram account' });
  }
});

router.post('/instagram/accounts/:id/verify', [param('id').isMongoId()], async (req, res) => {
  try {
    const account = await verifyInstagramAccount(req.params.id);
    res.json({ success: true, data: { account: formatInstagramAccount(account) } });
  } catch (error) {
    console.error('Verify Social Studio Instagram account error:', error.message);
    res.status(400).json({ success: false, message: error.message || 'Unable to verify account' });
  }
});

router.delete('/instagram/accounts/:id', [param('id').isMongoId()], async (req, res) => {
  try {
    const account = await InstagramAccount.findByIdAndUpdate(req.params.id, { status: 'revoked' }, { new: true }).lean();
    if (!account) return res.status(404).json({ success: false, message: 'Instagram account not found' });
    res.json({ success: true, data: { account: formatInstagramAccount(account) } });
  } catch (error) {
    console.error('Disconnect Social Studio Instagram account error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/publish-logs', async (_req, res) => {
  try {
    const posts = await SocialPost.find({
      status: { $in: ['published', 'failed_publish', 'expired_token'] }
    }).sort({ updatedAt: -1 }).limit(50).lean();
    res.json({ success: true, data: { logs: posts.map(formatModel) } });
  } catch (error) {
    console.error('List Social Studio publish logs error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
