const SocialGenerationRun = require('../../models/SocialGenerationRun');
const SocialWorkflow = require('../../models/SocialWorkflow');
const SocialPost = require('../../models/SocialPost');
const { createSocialPostDraft } = require('./socialStudio.service');
const { toPlainText } = require('./textUtils');

const getMaxPostsPerRun = () => {
  const configured = parseInt(process.env.SOCIAL_STUDIO_MAX_POSTS_PER_RUN, 10);
  return Number.isFinite(configured) && configured > 0 ? Math.min(configured, 100) : 20;
};

const normalizeCampaignBrief = (campaign = {}) => ({
  campaignId: campaign._id?.toString?.() || campaign.id || '',
  topic: toPlainText(campaign.topic),
  campaignName: toPlainText(campaign.campaignName),
  audience: toPlainText(campaign.audience || 'Men looking for practical mental health support'),
  objective: toPlainText(campaign.objective || 'Encourage one honest next step toward support'),
  tone: toPlainText(campaign.tone || 'Warm, grounded, premium, and practical'),
  postType: campaign.postType || 'single_image',
  aspectRatio: campaign.aspectRatio || '4:5',
  postCount: Math.max(1, Math.min(50, Number(campaign.postCount) || 1)),
  textSystemPromptOverride: toPlainText(campaign.textSystemPromptOverride || ''),
  imageSystemPromptOverride: toPlainText(campaign.imageSystemPromptOverride || '')
});

const countCampaignPosts = (campaigns = []) =>
  campaigns.reduce((total, campaign) => total + (Number(campaign.postCount) || 0), 0);

const validateWorkflowRunSize = ({ workflow, campaigns }) => {
  const requestedCount = countCampaignPosts(campaigns);
  const maxPosts = Math.min(getMaxPostsPerRun(), Number(workflow.customMaxPosts) || getMaxPostsPerRun());

  if (requestedCount < 1) {
    throw new Error('Workflow must include at least one post');
  }
  if (requestedCount > maxPosts) {
    throw new Error(`Workflow requests ${requestedCount} posts, but the limit is ${maxPosts}`);
  }

  return { requestedCount, maxPosts };
};

const processGenerationRun = async (runId) => {
  const run = await SocialGenerationRun.findById(runId);
  if (!run || run.status !== 'queued') return null;

  run.status = 'running';
  run.startedAt = new Date();
  await run.save();

  let sequenceNumber = 1;

  for (const campaign of run.campaigns) {
    for (let index = 0; index < campaign.postCount; index += 1) {
      try {
        const { post } = await createSocialPostDraft({
          input: {
            topic: campaign.topic,
            campaignName: campaign.campaignName,
            audience: campaign.audience,
            objective: campaign.objective,
            tone: campaign.tone,
            postType: campaign.postType,
            aspectRatio: campaign.aspectRatio,
            textSystemPrompt: campaign.textSystemPromptOverride || run.textSystemPrompt,
            imageSystemPrompt: campaign.imageSystemPromptOverride || run.imageSystemPrompt,
            sequenceNumber,
            totalCount: run.requestedCount
          },
          createdBy: run.requestedBy
        });

        run.postIds.push(post._id);
        run.completedCount += 1;
      } catch (error) {
        run.failedCount += 1;
        run.errors.push({
          campaignName: campaign.campaignName,
          stage: 'generation',
          message: error.message || 'Post generation failed',
          at: new Date()
        });
      }

      sequenceNumber += 1;
      await run.save();
    }
  }

  run.finishedAt = new Date();
  run.status = run.completedCount === run.requestedCount
    ? 'completed'
    : run.completedCount > 0
      ? 'partial'
      : 'failed';
  await run.save();
  return run;
};

const queueGenerationRun = (runId) => {
  setImmediate(() => {
    processGenerationRun(runId).catch((error) => {
      console.error('Social Studio workflow run failed:', runId.toString(), error.message);
    });
  });
};

const createWorkflowRun = async ({ workflow, requestedBy = null, source = 'manual', scheduleKey = null, textSystemPrompt = '', imageSystemPrompt = '' }) => {
  const campaigns = (workflow.campaigns || []).map(normalizeCampaignBrief);
  const { requestedCount } = validateWorkflowRunSize({ workflow, campaigns });

  const run = await SocialGenerationRun.create({
    source,
    status: 'queued',
    requestedCount,
    completedCount: 0,
    failedCount: 0,
    workflow: workflow._id,
    workflowName: workflow.name,
    campaigns,
    textSystemPrompt: toPlainText(textSystemPrompt),
    imageSystemPrompt: toPlainText(imageSystemPrompt),
    timezone: workflow.schedule?.timezone || 'Asia/Dubai',
    scheduleKey,
    requestedBy,
    startedAt: null,
    finishedAt: null
  });

  queueGenerationRun(run._id);
  return run;
};

const getLocalParts = (date, timezone) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23'
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    dayOfWeek: weekdayIndex,
    dayOfMonth: Number(parts.day)
  };
};

const minutesFromTime = (value = '09:00') => {
  const [hour, minute] = String(value).split(':').map((part) => Number(part));
  return (Number.isFinite(hour) ? hour : 9) * 60 + (Number.isFinite(minute) ? minute : 0);
};

const getDueScheduleKey = (workflow, now = new Date()) => {
  const schedule = workflow.schedule || {};
  if (!schedule.enabled || schedule.type === 'none') return null;

  if (schedule.type === 'once') {
    if (!schedule.runAt || new Date(schedule.runAt).getTime() > now.getTime()) return null;
    return `${workflow._id}:once:${new Date(schedule.runAt).toISOString()}`;
  }

  const local = getLocalParts(now, schedule.timezone);
  const currentMinutes = local.hour * 60 + local.minute;
  const scheduledMinutes = minutesFromTime(schedule.timeOfDay);
  if (currentMinutes < scheduledMinutes) return null;

  if (schedule.type === 'weekly' && local.dayOfWeek !== Number(schedule.dayOfWeek || 0)) return null;
  if (schedule.type === 'monthly' && local.dayOfMonth !== Number(schedule.dayOfMonth || 1)) return null;

  return `${workflow._id}:${schedule.type}:${local.dateKey}:${schedule.timeOfDay || '09:00'}`;
};

const processDueWorkflows = async () => {
  const workflows = await SocialWorkflow.find({
    status: 'active',
    'schedule.enabled': true,
    'schedule.type': { $ne: 'none' }
  }).limit(10);

  for (const workflow of workflows) {
    const scheduleKey = getDueScheduleKey(workflow);
    if (!scheduleKey || workflow.schedule?.lastScheduledKey === scheduleKey) continue;

    try {
      const existingRun = await SocialGenerationRun.findOne({ scheduleKey }).lean();
      if (existingRun) {
        workflow.schedule.lastScheduledKey = scheduleKey;
        await workflow.save();
        continue;
      }

      await createWorkflowRun({ workflow, source: 'scheduled', scheduleKey });
      workflow.schedule.lastScheduledKey = scheduleKey;
      await workflow.save();
    } catch (error) {
      console.error('Social Studio scheduled workflow failed:', workflow._id.toString(), error.message);
    }
  }
};

const getRunPosts = async (run) => {
  if (!run?.postIds?.length) return [];
  return SocialPost.find({ _id: { $in: run.postIds } }).sort({ createdAt: -1 }).lean();
};

module.exports = {
  countCampaignPosts,
  createWorkflowRun,
  getMaxPostsPerRun,
  getRunPosts,
  normalizeCampaignBrief,
  processDueWorkflows,
  processGenerationRun,
  validateWorkflowRunSize
};
