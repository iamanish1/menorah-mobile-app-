const SocialPost = require('../../models/SocialPost');
const GenerationJob = require('../../models/GenerationJob');
const {
  generateCaption,
  generateImagePrompt,
  generatePostConcept,
  getProviderName
} = require('./aiProvider.service');
const { getActiveBrandGuidelines, selectAssetsForPost } = require('./assetSelector.service');
const { renderStaticPost } = require('./postRenderer.service');
const { runQualityCheck } = require('./qualityCheck.service');
const { normalizeHashtags, toPlainText } = require('./textUtils');

const updateJob = async (job, status, progress, message) => {
  job.status = status;
  job.step = message;
  job.progress = progress;
  job.provider = getProviderName();
  job.logs.push({ step: status, message, at: new Date() });
  await job.save();
};

const createSocialPostDraft = async ({ input, createdBy }) => {
  const job = await GenerationJob.create({
    status: 'queued',
    progress: 0,
    provider: getProviderName(),
    logs: [{ step: 'queued', message: 'Generation queued.', at: new Date() }]
  });

  let post;

  try {
    const normalizedInput = {
      topic: toPlainText(input.topic),
      campaignName: toPlainText(input.campaignName),
      audience: toPlainText(input.audience || 'Men looking for practical mental health support'),
      objective: toPlainText(input.objective || 'Encourage a practical next step'),
      tone: toPlainText(input.tone || 'Warm, grounded, premium, and practical'),
      postType: input.postType || 'single_image',
      aspectRatio: input.aspectRatio || '4:5'
    };

    await updateJob(job, 'generating_concept', 15, 'Generating post concept.');
    const brandGuideline = await getActiveBrandGuidelines();
    const assets = await selectAssetsForPost(normalizedInput);
    const concept = await generatePostConcept({ ...normalizedInput, brandGuideline });

    await updateJob(job, 'generating_caption', 35, 'Generating caption and hashtags.');
    const caption = await generateCaption({ ...normalizedInput, concept, brandGuideline });

    await updateJob(job, 'generating_image', 50, 'Preparing visual direction.');
    const imagePrompt = await generateImagePrompt({ ...normalizedInput, concept, caption, brandGuideline });

    post = await SocialPost.create({
      ...normalizedInput,
      status: 'draft',
      hookText: concept.hookText,
      bodyText: concept.bodyText || (concept.bulletPoints?.length ? concept.bulletPoints.join(' | ') : ''),
      ctaText: concept.ctaText,
      caption: caption.caption,
      hashtags: normalizeHashtags([
        ...(caption.hashtags || []),
        ...(brandGuideline.instagramRules?.defaultHashtags || [])
      ]),
      aiPrompt: imagePrompt.imagePrompt,
      designBrief: `${concept.designBrief} ${imagePrompt.backgroundDirection}`.trim(),
      templateKey: concept.templateKey,
      selectedAssetIds: assets.map((asset) => asset._id),
      modelUsed: concept.modelUsed || '',
      createdBy
    });

    job.socialPostId = post._id;
    await updateJob(job, 'rendering', 70, 'Rendering final static image.');
    const rendered = await renderStaticPost({ socialPost: post, brandGuideline, assets });
    Object.assign(post, rendered);

    await updateJob(job, 'quality_checking', 88, 'Running quality checks.');
    const quality = runQualityCheck({ socialPost: post, brandGuideline, assets });
    post.qualityScore = quality.qualityScore;
    post.qualityIssues = quality.qualityIssues;
    post.status = 'needs_review';
    await post.save();

    await updateJob(job, 'completed', 100, 'Generated post is ready for admin review.');

    return { post, job };
  } catch (error) {
    if (post) {
      post.status = 'failed_generation';
      post.errorLog = { message: error.message, at: new Date() };
      await post.save();
      job.socialPostId = post._id;
    }

    job.status = 'failed';
    job.error = error.message;
    job.progress = Math.max(job.progress || 0, 1);
    job.logs.push({ step: 'failed', message: error.message, at: new Date() });
    await job.save();
    throw error;
  }
};

module.exports = {
  createSocialPostDraft
};
