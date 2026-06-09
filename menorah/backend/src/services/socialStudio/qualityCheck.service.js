const { SIZE_BY_RATIO } = require('./postRenderer.service');
const { normalizeHashtags, toPlainText } = require('./textUtils');

const includesAny = (text, values = []) => {
  const normalized = toPlainText(text).toLowerCase();
  return values.find((value) => value && normalized.includes(String(value).toLowerCase()));
};

const runQualityCheck = ({ socialPost, brandGuideline, assets = [] }) => {
  let score = 0;
  const issues = [];
  const expected = SIZE_BY_RATIO[socialPost.aspectRatio] || SIZE_BY_RATIO['4:5'];
  const captionMaxLength = brandGuideline.instagramRules?.captionMaxLength || 2200;
  const forbiddenWords = brandGuideline.postRules?.forbiddenWords || [];
  const bannedHashtags = (brandGuideline.instagramRules?.bannedHashtags || []).map((tag) => tag.toLowerCase());
  const tags = normalizeHashtags(socialPost.hashtags || []);

  if (socialPost.finalImageUrl) score += 20;
  else issues.push('Final image is missing.');

  if (socialPost.width === expected.width && socialPost.height === expected.height) score += 15;
  else issues.push(`Image dimensions should be ${expected.width}x${expected.height}.`);

  if (socialPost.caption && socialPost.caption.length <= captionMaxLength) score += 15;
  else issues.push(`Caption is missing or longer than ${captionMaxLength} characters.`);

  if ((assets || []).length > 0 || brandGuideline.brandName) score += 15;
  else issues.push('No brand assets or guideline context was used.');

  if (toPlainText(socialPost.hookText).split(/\s+/).filter(Boolean).length <= (brandGuideline.postRules?.maxWordsOnImage || 24)) {
    score += 10;
  } else {
    issues.push('Hook text is too long for the selected template.');
  }

  const forbidden = includesAny(`${socialPost.hookText} ${socialPost.bodyText} ${socialPost.caption}`, forbiddenWords);
  if (!forbidden) score += 10;
  else issues.push(`Forbidden word found: ${forbidden}.`);

  const banned = tags.find((tag) => bannedHashtags.includes(tag.toLowerCase()));
  if (!banned) score += 10;
  else issues.push(`Banned hashtag found: ${banned}.`);

  if (socialPost.ctaText) score += 5;
  else issues.push('CTA text is missing.');

  return {
    qualityScore: Math.max(0, Math.min(100, score)),
    qualityIssues: issues
  };
};

module.exports = {
  runQualityCheck
};
