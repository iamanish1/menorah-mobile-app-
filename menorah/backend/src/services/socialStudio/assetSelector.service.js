const BrandAsset = require('../../models/BrandAsset');
const BrandGuideline = require('../../models/BrandGuideline');
const { normalizeHashtags, parseList } = require('./textUtils');

const defaultGuidelinePayload = {
  brandName: 'Menorah Health',
  tone: 'Warm, grounded, professional, practical, and hopeful.',
  audience: 'Men looking for accessible mental health education and support.',
  primaryColors: ['#2B4F32', '#706E43'],
  secondaryColors: ['#F8EADA', '#FFFFFF', '#321533'],
  fonts: ['DejaVu Serif Condensed', 'DejaVu Sans', 'sans-serif'],
  logoRules: {
    allowedPositions: ['top_right'],
    minWidth: 120,
    clearSpace: 48
  },
  postRules: {
    maxWordsOnImage: 24,
    allowedAspectRatios: ['1:1', '4:5', '9:16'],
    defaultAspectRatio: '4:5',
    forbiddenWords: [],
    ctaStyle: 'Soft, direct, and non-salesy.'
  },
  instagramRules: {
    defaultHashtags: ['MenorahHealth', 'MensMentalHealth', 'MentalHealthSupport', 'SelfCare', 'EmotionalWellbeing'],
    bannedHashtags: [],
    captionMaxLength: 2200
  },
  status: 'active'
};

const normalizeGuidelinePayload = (payload = {}, { partial = false } = {}) => {
  const next = { ...payload };

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'primaryColors')) {
    next.primaryColors = parseList(payload.primaryColors);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'secondaryColors')) {
    next.secondaryColors = parseList(payload.secondaryColors);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'fonts')) {
    next.fonts = parseList(payload.fonts);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'logoRules')) {
    next.logoRules = {
      ...(payload.logoRules || {}),
      allowedPositions: parseList(payload.logoRules?.allowedPositions)
    };
  }
  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'postRules')) {
    next.postRules = {
      ...(payload.postRules || {}),
      allowedAspectRatios: parseList(payload.postRules?.allowedAspectRatios),
      forbiddenWords: parseList(payload.postRules?.forbiddenWords).map((word) => word.toLowerCase())
    };
  }
  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'instagramRules')) {
    next.instagramRules = {
      ...(payload.instagramRules || {}),
      defaultHashtags: normalizeHashtags(payload.instagramRules?.defaultHashtags || payload.defaultHashtags || []),
      bannedHashtags: normalizeHashtags(payload.instagramRules?.bannedHashtags || payload.bannedHashtags || []).map((tag) => tag.toLowerCase())
    };
  }

  return next;
};

const getActiveBrandGuidelines = async () => {
  let guideline = await BrandGuideline.findOne({ status: 'active' }).sort({ updatedAt: -1 });
  if (!guideline) {
    guideline = await BrandGuideline.create(defaultGuidelinePayload);
  }
  return guideline;
};

const selectAssetsForPost = async ({ topic, audience, postType, aspectRatio } = {}) => {
  const terms = [
    topic,
    audience,
    postType,
    aspectRatio,
    'social',
    'instagram',
    'menorah'
  ]
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((term) => term.length > 2);

  const tagMatch = terms.length > 0 ? { tags: { $in: terms } } : {};

  const [taggedAssets, logos, backgrounds] = await Promise.all([
    BrandAsset.find({ status: 'active', ...tagMatch }).limit(8),
    BrandAsset.find({ status: 'active', type: 'logo' }).limit(2),
    BrandAsset.find({ status: 'active', type: { $in: ['background', 'image', 'template'] } }).limit(4)
  ]);

  const byId = new Map();
  [...taggedAssets, ...logos, ...backgrounds].forEach((asset) => byId.set(asset._id.toString(), asset));
  return Array.from(byId.values()).slice(0, 10);
};

module.exports = {
  defaultGuidelinePayload,
  getActiveBrandGuidelines,
  normalizeGuidelinePayload,
  selectAssetsForPost
};
