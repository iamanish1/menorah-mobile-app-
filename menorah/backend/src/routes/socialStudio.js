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
const {
  requireAdminPermission,
} = require('../middleware/adminAuthorization');
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
    if (!file.mimetype?.startsWith('image/') && file.mimetype !== 'application/pdf' && !file.mimetype?.includes('font')) {
      return cb(new Error('Only image, PDF, and font assets are allowed'));
    }
    cb(null, true);
  }
});

const supportedReelMimeTypes = new Set(['video/mp4', 'video/quicktime']);
const getSocialVideoMaxBytes = () => {
  const configuredBytes = Number.parseInt(process.env.SOCIAL_STUDIO_MAX_VIDEO_SIZE_BYTES, 10);
  const configuredMegabytes = Number.parseInt(process.env.SOCIAL_STUDIO_MAX_VIDEO_SIZE_MB, 10);
  const defaultLimit = 50 * 1024 * 1024;
  const hardLimit = 250 * 1024 * 1024;
  const configured = Number.isFinite(configuredBytes) ? configuredBytes
    : Number.isFinite(configuredMegabytes) ? configuredMegabytes * 1024 * 1024
      : defaultLimit;
  if (configured < 1024 * 1024) return defaultLimit;
  return Math.min(configured, hardLimit);
};

// Video is intentionally a separate multipart endpoint. Keeping a bounded
// in-memory upload prevents a large Reel from exhausting the API process.
const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: getSocialVideoMaxBytes(), files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!supportedReelMimeTypes.has(file.mimetype)) {
      return cb(new Error('Only MP4 or MOV Reel videos are allowed'));
    }
    cb(null, true);
  }
});

const handleVideoUpload = (req, res, next) => videoUpload.single('video')(req, res, (error) => {
  if (!error) return next();
  const message = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
    ? `Video must be ${Math.floor(getSocialVideoMaxBytes() / (1024 * 1024))} MB or smaller`
    : error.message || 'Unable to upload video';
  return res.status(400).json({ success: false, message });
});

const generationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.SOCIAL_STUDIO_GENERATION_RATE_LIMIT, 10) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip)
});

const videoUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.SOCIAL_STUDIO_VIDEO_UPLOAD_RATE_LIMIT, 10) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip)
});

router.use(adminAuth);
// Social Studio includes content search, publishing credentials, and file
// uploads. It is a content function, not a general support/admin surface.
router.use(requireAdminPermission('content_manage'));

const validationErrorResponse = (res, errors) => res.status(400).json({
  success: false,
  message: 'Validation failed',
  errors
});

const hostedImageUrlValidator = (value) => {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:') {
      throw new Error('Image URL must use HTTPS');
    }
    return true;
  } catch (error) {
    if (error instanceof Error && error.message === 'Image URL must use HTTPS') {
      throw error;
    }
    throw new Error('A valid HTTPS image URL is required');
  }
};

const isHttpsUrl = (value) => {
  try {
    return new URL(String(value || '').trim()).protocol === 'https:';
  } catch {
    return false;
  }
};

const isIsoBaseMediaFile = (buffer) => Buffer.isBuffer(buffer)
  && buffer.length >= 12
  && buffer.subarray(4, 8).toString('ascii') === 'ftyp';

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

const saveLocalVideo = async (file, filename) => {
  const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_PATH || './uploads', 'social-studio-videos');
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(path.join(uploadDir, filename), file.buffer);
  return `${getPublicBaseUrl()}/uploads/social-studio-videos/${filename}`;
};

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

const saveUploadedVideo = async (file) => {
  const safeName = `${Date.now()}-${file.originalname}`.replace(/[^A-Za-z0-9_.-]/g, '-');
  if (shouldUseCloudinaryForSocialStudio()) {
    const result = await uploadBuffer(file.buffer, {
      folder: process.env.CLOUDINARY_SOCIAL_STUDIO_VIDEO_FOLDER || 'menorah/social-studio-videos',
      resource_type: 'video',
      public_id: safeName.replace(/\.[^.]+$/, '')
    });
    return {
      url: result.secure_url,
      publicId: result.public_id,
      filename: safeName
    };
  }

  // api-admin stores uploads on its own volume in the production Compose
  // deployment. Do not create a Reel that looks publishable when another
  // service/proxy cannot reliably serve its bytes to Meta.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Production Reel uploads require Cloudinary video hosting');
  }

  const url = await saveLocalVideo(file, safeName);
  return { url, publicId: '', filename: safeName };
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

const isReel = (post) => post?.postType === 'reel';

const ensureEditablePost = (post) => {
  if (['published', 'publishing'].includes(post.status)) {
    throw new Error('Published or publishing posts cannot be edited');
  }
};

const returnPostToReview = (post) => {
  if (['approved', 'scheduled', 'rejected', 'failed_publish', 'expired_token'].includes(post.status)) {
    post.status = 'needs_review';
    post.scheduledAt = null;
    post.approvedBy = null;
    post.instagramContainerId = '';
    post.publishingStartedAt = null;
  }
};

const validateMediaForApproval = (post) => {
  if (isReel(post)) {
    if (!isHttpsUrl(post.videoUrl)) {
      throw new Error('An approved Reel requires a public HTTPS video upload');
    }
    if (!supportedReelMimeTypes.has(post.videoMimeType)) {
      throw new Error('An approved Reel must be an MP4 or MOV video');
    }
    return;
  }

  if (!post.finalImageUrl) {
    throw new Error('A final image is required before approval');
  }
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
//
// Existing content should not be trapped behind an AI provider. This path is
// intentionally manual: it stores an editor-supplied, hosted image and puts
// the post into the normal review queue. Approving it still requires an admin,
// and only the explicit publish action can send it to Instagram.
router.post('/posts', [
  body('topic').trim().isLength({ min: 3, max: 220 }),
  body('caption').trim().isLength({ min: 3, max: 2200 }),
  body('imageUrl').custom(hostedImageUrlValidator),
  body('campaignName').optional().isString().trim().isLength({ max: 120 }),
  body('hookText').optional().isString().trim().isLength({ max: 240 }),
  body('bodyText').optional().isString().trim().isLength({ max: 1200 }),
  body('ctaText').optional().isString().trim().isLength({ max: 240 }),
  body('hashtags').optional().isArray({ max: 30 }),
  body('postType').optional().isIn(['single_image', 'carousel', 'reel_cover']),
  body('aspectRatio').optional().isIn(['1:1', '4:5', '9:16']),
  body('templateKey').optional().isIn(['thought_leadership', 'educational_tip', 'announcement'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return validationErrorResponse(res, errors.array());

    const imageUrl = String(req.body.imageUrl).trim();
    const post = await SocialPost.create({
      platform: 'instagram',
      postType: req.body.postType || 'single_image',
      contentSource: 'manual',
      status: 'needs_review',
      topic: toPlainText(req.body.topic),
      campaignName: toPlainText(req.body.campaignName || ''),
      hookText: toPlainText(req.body.hookText || ''),
      bodyText: toPlainText(req.body.bodyText || ''),
      ctaText: toPlainText(req.body.ctaText || ''),
      caption: toPlainText(req.body.caption),
      hashtags: normalizeHashtags(req.body.hashtags || []),
      templateKey: req.body.templateKey || 'thought_leadership',
      aspectRatio: req.body.aspectRatio || '4:5',
      imageUrl,
      // A manual post already has a reviewed external image. Reuse it for the
      // existing preview and approval flow rather than forcing the renderer to
      // overwrite a restored asset.
      finalImageUrl: imageUrl,
      thumbnailUrl: imageUrl,
      qualityScore: 0,
      qualityIssues: ['Manual post: confirm the image and copy before publishing.'],
      createdBy: req.user._id
    });

    res.status(201).json({ success: true, data: { post: formatModel(post) } });
  } catch (error) {
    console.error('Create manual Social Studio post error:', error);
    res.status(500).json({ success: false, message: 'Unable to create social post' });
  }
});

// A Reel is uploaded through the admin panel, stored in the configured media
// host, and then follows the exact same review/approve/publish state machine
// as image posts. Uploading a file never contacts Meta.
router.post('/posts/video', videoUploadLimiter, handleVideoUpload, [
  body('topic').trim().isLength({ min: 3, max: 220 }),
  body('caption').trim().isLength({ min: 3, max: 2200 }),
  body('campaignName').optional().isString().trim().isLength({ max: 120 }),
  body('hookText').optional().isString().trim().isLength({ max: 240 }),
  body('bodyText').optional().isString().trim().isLength({ max: 1200 }),
  body('ctaText').optional().isString().trim().isLength({ max: 240 }),
  body('hashtags').optional().isString().isLength({ max: 1000 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return validationErrorResponse(res, errors.array());
    if (!req.file) return res.status(400).json({ success: false, message: 'Upload an MP4 or MOV Reel video' });
    if (!supportedReelMimeTypes.has(req.file.mimetype) || !isIsoBaseMediaFile(req.file.buffer)) {
      return res.status(400).json({ success: false, message: 'The uploaded file is not a valid MP4 or MOV video' });
    }

    const uploaded = await saveUploadedVideo(req.file);
    if (!isHttpsUrl(uploaded.url) && process.env.NODE_ENV === 'production') {
      return res.status(503).json({ success: false, message: 'Reel uploads require configured HTTPS video hosting in production' });
    }

    const post = await SocialPost.create({
      platform: 'instagram',
      postType: 'reel',
      contentSource: 'manual',
      status: 'needs_review',
      topic: toPlainText(req.body.topic),
      campaignName: toPlainText(req.body.campaignName || ''),
      hookText: toPlainText(req.body.hookText || ''),
      bodyText: toPlainText(req.body.bodyText || ''),
      ctaText: toPlainText(req.body.ctaText || ''),
      caption: toPlainText(req.body.caption),
      hashtags: normalizeHashtags(parseList(req.body.hashtags || [])),
      aspectRatio: '9:16',
      videoUrl: uploaded.url,
      videoPublicId: uploaded.publicId,
      videoMimeType: req.file.mimetype,
      videoSizeBytes: req.file.size,
      qualityScore: 0,
      qualityIssues: [
        'Manual Reel: confirm content rights, sound, captions, and the final playback before publishing.'
      ],
      createdBy: req.user._id
    });

    res.status(201).json({ success: true, data: { post: formatModel(post) } });
  } catch (error) {
    console.error('Create manual Social Studio Reel error:', error);
    const unavailable = error.message === 'Production Reel uploads require Cloudinary video hosting';
    res.status(unavailable ? 503 : 500).json({ success: false, message: error.message || 'Unable to upload Reel' });
  }
});

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
  body('imageUrl').optional().custom(hostedImageUrlValidator),
  body('scheduledAt').optional({ nullable: true }).isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return validationErrorResponse(res, errors.array());

    const post = await SocialPost.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Social post not found' });
    ensureEditablePost(post);
    if (isReel(post) && Object.prototype.hasOwnProperty.call(req.body, 'imageUrl')) {
      return res.status(400).json({ success: false, message: 'Replace a Reel by creating a new reviewed Reel upload' });
    }

    const textFields = ['hookText', 'bodyText', 'ctaText', 'caption', 'campaignName', 'audience', 'objective', 'tone', 'aiPrompt', 'designBrief', 'aspectRatio', 'templateKey'];
    let needsRender = false;
    let contentChanged = false;
    textFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        post[field] = ['aspectRatio', 'templateKey'].includes(field) ? req.body[field] : toPlainText(req.body[field]);
        contentChanged = true;
        if (['hookText', 'bodyText', 'ctaText', 'aspectRatio', 'templateKey'].includes(field)) needsRender = true;
      }
    });
    if (Object.prototype.hasOwnProperty.call(req.body, 'hashtags')) {
      post.hashtags = normalizeHashtags(req.body.hashtags);
      contentChanged = true;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'selectedAssetIds')) {
      post.selectedAssetIds = req.body.selectedAssetIds;
      needsRender = true;
      contentChanged = true;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'imageUrl')) {
      const imageUrl = String(req.body.imageUrl || '').trim();
      post.imageUrl = imageUrl;
      post.finalImageUrl = imageUrl;
      post.thumbnailUrl = imageUrl;
      contentChanged = true;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'scheduledAt')) post.scheduledAt = req.body.scheduledAt ? new Date(req.body.scheduledAt) : null;

    if (contentChanged) returnPostToReview(post);
    await post.save();
    // Manual restores retain their supplied image while editors adjust copy.
    // Explicit Render / Regenerate actions below still let an admin replace it
    // with a studio-rendered asset when that is intended.
    if (needsRender && post.contentSource !== 'manual' && !isReel(post)) await renderAndCheckPost(post);
    res.json({ success: true, data: { post: formatModel(post) } });
  } catch (error) {
    console.error('Update Social Studio post error:', error);
    res.status(error.message === 'Published or publishing posts cannot be edited' ? 409 : 500)
      .json({ success: false, message: error.message || 'Internal server error' });
  }
});

router.post('/posts/:id/regenerate-caption', [param('id').isMongoId()], async (req, res) => {
  try {
    const post = await SocialPost.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Social post not found' });
    ensureEditablePost(post);
    const brandGuideline = await getActiveBrandGuidelines();
    const caption = await generateCaption({ socialPost: post, brandGuideline });
    post.caption = caption.caption;
    post.hashtags = normalizeHashtags([...(caption.hashtags || []), ...(brandGuideline.instagramRules?.defaultHashtags || [])]);
    returnPostToReview(post);
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
    ensureEditablePost(post);
    if (isReel(post)) return res.status(400).json({ success: false, message: 'Uploaded Reels cannot be replaced by an AI image' });
    returnPostToReview(post);
    await renderAndCheckPost(post, { regenerateBackground: true });
    post.contentSource = 'ai';
    await post.save();
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
    ensureEditablePost(post);
    if (isReel(post)) return res.status(400).json({ success: false, message: 'Uploaded Reels cannot be rendered as a static image' });
    returnPostToReview(post);
    await renderAndCheckPost(post);
    post.contentSource = 'ai';
    await post.save();
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
    if (!['draft', 'needs_review'].includes(post.status)) {
      return res.status(400).json({ success: false, message: 'Only posts awaiting review can be approved' });
    }
    if (isReel(post)) validateMediaForApproval(post);
    else if (!post.finalImageUrl) await renderAndCheckPost(post);
    validateMediaForApproval(post);
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
    const post = await SocialPost.findOneAndUpdate({
      _id: req.params.id,
      status: { $in: ['draft', 'needs_review', 'approved', 'scheduled', 'rejected', 'failed_generation', 'failed_publish', 'expired_token'] }
    }, {
      status: 'rejected',
      rejectedBy: req.user._id,
      reviewedBy: req.user._id,
      rejectionReason: toPlainText(req.body.reason || ''),
      scheduledAt: null
    }, { new: true }).lean();
    if (!post) {
      const existing = await SocialPost.findById(req.params.id).lean();
      if (!existing) return res.status(404).json({ success: false, message: 'Social post not found' });
      return res.status(409).json({ success: false, message: 'Published or publishing posts cannot be rejected' });
    }
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

router.post('/posts/:id/publish-now', [
  param('id').isMongoId(),
  body('confirmation').equals('publish').withMessage('A publish confirmation is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return validationErrorResponse(res, errors.array());
    const post = await publishApprovedPost(req.params.id);
    res.json({ success: true, data: { post: formatModel(post) } });
  } catch (error) {
    console.error('Publish Social Studio post error:', error.message);
    res.status(400).json({ success: false, message: error.message || 'Unable to publish post' });
  }
});

router.post('/posts/:id/retry', [
  param('id').isMongoId(),
  body('confirmation').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return validationErrorResponse(res, errors.array());

    const post = await SocialPost.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Social post not found' });

    if (['failed_publish', 'expired_token'].includes(post.status)) {
      if (req.body.confirmation !== 'publish') {
        return res.status(400).json({ success: false, message: 'A publish confirmation is required to retry publishing' });
      }
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
