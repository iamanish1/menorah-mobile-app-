const cron = require('node-cron');
const SocialPost = require('../../models/SocialPost');
const { publishApprovedPost } = require('./instagramPublisher.service');
const { processDueWorkflows } = require('./workflowRunner.service');

let scheduledTask = null;

const scheduleApprovedPost = async (socialPostId, scheduledAt) => {
  const post = await SocialPost.findById(socialPostId);
  if (!post) {
    throw new Error('Social post not found');
  }
  if (post.status !== 'approved') {
    throw new Error('Only approved posts can be scheduled');
  }

  post.status = 'scheduled';
  post.scheduledAt = scheduledAt;
  await post.save();
  return post;
};

const processDueScheduledPosts = async () => {
  const duePosts = await SocialPost.find({
    status: 'scheduled',
    scheduledAt: { $lte: new Date() }
  }).limit(5);

  for (const post of duePosts) {
    try {
      await publishApprovedPost(post._id);
    } catch (error) {
      console.error('Social Studio scheduled publish failed:', post._id.toString(), error.message);
    }
  }

  await processDueWorkflows();
};

const startSocialScheduler = () => {
  if (scheduledTask || process.env.SOCIAL_STUDIO_ENABLED === 'false') {
    return;
  }

  scheduledTask = cron.schedule('*/10 * * * *', processDueScheduledPosts, {
    timezone: process.env.SERVER_TZ || 'Asia/Dubai'
  });
};

module.exports = {
  processDueScheduledPosts,
  scheduleApprovedPost,
  startSocialScheduler
};
