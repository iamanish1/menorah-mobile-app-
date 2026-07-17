const crypto = require('crypto');
const axios = require('axios');
const SocialPost = require('../../models/SocialPost');
const InstagramAccount = require('../../models/InstagramAccount');
const { buildInstagramCaption } = require('./textUtils');

const getGraphVersion = () => process.env.META_GRAPH_API_VERSION || 'v23.0';

const getEncryptionKey = () => {
  const raw = String(process.env.SOCIAL_TOKEN_ENCRYPTION_KEY || '').trim();
  if (!raw) {
    throw new Error('SOCIAL_TOKEN_ENCRYPTION_KEY is required');
  }
  return crypto.createHash('sha256').update(raw).digest();
};

const encryptToken = (token) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv, { authTagLength: 16 });
  const encrypted = Buffer.concat([cipher.update(String(token), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
};

const decryptToken = (encryptedValue) => {
  const [ivRaw, tagRaw, encryptedRaw] = String(encryptedValue || '').split(':');
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error('Stored Instagram token is invalid');
  }
  const iv = Buffer.from(ivRaw, 'base64');
  const tag = Buffer.from(tagRaw, 'base64');
  if (iv.length !== 12 || tag.length !== 16) {
    throw new Error('Stored Instagram token is invalid');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64')),
    decipher.final()
  ]);
  return decrypted.toString('utf8');
};

const safeErrorMessage = (error) => {
  const message =
    error.response?.data?.error?.message ||
    error.response?.data?.message ||
    error.message ||
    'Instagram API request failed';
  return String(message).replace(/access_token=[^&\s]+/gi, 'access_token=REDACTED').slice(0, 600);
};

const createMediaContainer = async ({ igUserId, accessToken, imageUrl, caption }) => {
  const params = new URLSearchParams();
  params.set('image_url', imageUrl);
  params.set('caption', caption);
  params.set('access_token', accessToken);

  const response = await axios.post(
    `https://graph.facebook.com/${getGraphVersion()}/${igUserId}/media`,
    params,
    { timeout: 30000 }
  );

  return response.data?.id;
};

const publishMediaContainer = async ({ igUserId, accessToken, creationId }) => {
  const params = new URLSearchParams();
  params.set('creation_id', creationId);
  params.set('access_token', accessToken);

  const response = await axios.post(
    `https://graph.facebook.com/${getGraphVersion()}/${igUserId}/media_publish`,
    params,
    { timeout: 30000 }
  );

  return response.data;
};

const verifyInstagramAccount = async (instagramAccountId) => {
  const account = await InstagramAccount.findById(instagramAccountId).select('+accessTokenEncrypted');
  if (!account) {
    throw new Error('Instagram account not found');
  }

  try {
    const accessToken = decryptToken(account.accessTokenEncrypted);
    const response = await axios.get(
      `https://graph.facebook.com/${getGraphVersion()}/${account.igUserId}`,
      {
        params: {
          fields: 'id,username,account_type',
          access_token: accessToken
        },
        timeout: 20000
      }
    );

    account.username = response.data?.username || account.username;
    account.accountType = response.data?.account_type || account.accountType;
    account.status = 'connected';
    account.lastVerifiedAt = new Date();
    await account.save();

    return account;
  } catch (error) {
    account.status = error.response?.status === 400 ? 'expired' : 'error';
    account.lastVerifiedAt = new Date();
    await account.save();
    throw new Error(safeErrorMessage(error));
  }
};

const publishApprovedPost = async (socialPostId) => {
  const post = await SocialPost.findById(socialPostId);
  if (!post) {
    throw new Error('Social post not found');
  }

  if (!['approved', 'scheduled'].includes(post.status)) {
    throw new Error('Only approved or scheduled posts can be published');
  }

  if (!post.finalImageUrl) {
    throw new Error('Final image URL is required before publishing');
  }

  const accountQuery = post.instagramAccount
    ? { _id: post.instagramAccount, status: 'connected' }
    : { status: 'connected' };
  const account = await InstagramAccount.findOne(accountQuery).select('+accessTokenEncrypted').sort({ updatedAt: -1 });

  if (!account) {
    throw new Error('No connected Instagram account is configured');
  }

  try {
    post.status = 'publishing';
    post.instagramAccount = account._id;
    post.errorLog = null;
    await post.save();

    const accessToken = decryptToken(account.accessTokenEncrypted);
    const caption = buildInstagramCaption(post.caption, post.hashtags);
    const creationId = await createMediaContainer({
      igUserId: account.igUserId,
      accessToken,
      imageUrl: post.finalImageUrl,
      caption
    });

    if (!creationId) {
      throw new Error('Instagram did not return a media container ID');
    }

    const published = await publishMediaContainer({
      igUserId: account.igUserId,
      accessToken,
      creationId
    });

    post.status = 'published';
    post.publishedAt = new Date();
    post.instagramMediaId = published?.id || '';
    post.errorLog = null;
    await post.save();

    return post;
  } catch (error) {
    const message = safeErrorMessage(error);
    const expired = /token|expired|session/i.test(message);
    post.status = expired ? 'expired_token' : 'failed_publish';
    post.errorLog = { message, code: error.response?.data?.error?.code ? String(error.response.data.error.code) : '', at: new Date() };
    await post.save();
    if (expired) {
      account.status = 'expired';
      await account.save();
    }
    throw new Error(message);
  }
};

module.exports = {
  createMediaContainer,
  decryptToken,
  encryptToken,
  publishApprovedPost,
  publishMediaContainer,
  verifyInstagramAccount
};
