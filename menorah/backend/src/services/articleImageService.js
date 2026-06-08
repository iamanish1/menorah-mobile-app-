const axios = require('axios');
const { uploadBuffer } = require('../utils/cloudinary');

const PLACEHOLDER_IMAGE_URL = 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?q=80&w=1600&auto=format&fit=crop';

const isPlaceholderValue = (value) => /REPLACE_WITH|placeholder|your-|your_/i.test(value || '');

const isProduction = () => process.env.NODE_ENV === 'production';

const getUsableEnv = (name) => {
  const value = String(process.env[name] || '').trim();
  return value && !isPlaceholderValue(value) ? value : '';
};

const compact = (parts) => parts.map((part) => String(part || '').trim()).filter(Boolean);

const buildImagePrompt = ({ article = {}, input = {} } = {}) => {
  const prompt = input.imagePrompt || article.imagePrompt;
  const style = input.imageStyle || 'editorial mental health illustration';
  const mood = input.imageMood || 'calm, grounded, hopeful, masculine but inclusive';
  const colors = input.imageColors || 'Menorah brand feel: earthy greens, warm cream, soft natural light';
  const avoid = input.imageAvoid || 'no text, no logos, no clinical hospital imagery, no stereotypes, no distressing scenes';

  return compact([
    prompt || `Create a public article cover image for "${article.title || input.topic}".`,
    article.excerpt ? `Article excerpt: ${article.excerpt}` : '',
    `Visual style: ${style}.`,
    `Mood: ${mood}.`,
    `Color direction: ${colors}.`,
    `Avoid: ${avoid}.`,
    'Make it suitable for a men\'s mental health publication cover.',
    'No readable text inside the image.'
  ]).join('\n');
};

const buildCloudinaryPublicId = (article = {}) => {
  const title = String(article.slug || article.title || 'article-cover')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return `${title || 'article-cover'}-${Date.now()}`;
};

const generateOpenAiImage = async (prompt) => {
  const apiKey = getUsableEnv('OPENAI_API_KEY');

  if (!apiKey) {
    if (isProduction()) {
      throw new Error('OPENAI_API_KEY is required for production cover image generation');
    }
    return null;
  }

  const response = await axios.post(
    'https://api.openai.com/v1/images/generations',
    {
      model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
      prompt,
      size: process.env.OPENAI_IMAGE_SIZE || '1536x1024',
      quality: process.env.OPENAI_IMAGE_QUALITY || 'medium',
      output_format: process.env.OPENAI_IMAGE_FORMAT || 'jpeg',
      n: 1
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: Number(process.env.OPENAI_IMAGE_TIMEOUT_MS || 120000)
    }
  );

  const image = response.data?.data?.[0];
  if (!image?.b64_json) {
    throw new Error('OpenAI image response did not include base64 image data');
  }

  return Buffer.from(image.b64_json, 'base64');
};

const uploadArticleCover = async ({ buffer, article }) => {
  if (isProduction() && (
    !getUsableEnv('CLOUDINARY_CLOUD_NAME') ||
    !getUsableEnv('CLOUDINARY_API_KEY') ||
    !getUsableEnv('CLOUDINARY_API_SECRET')
  )) {
    throw new Error('Cloudinary configuration is required for production cover image uploads');
  }

  const folder = process.env.CLOUDINARY_ARTICLE_FOLDER || 'menorah/articles';
  const result = await uploadBuffer(buffer, {
    folder,
    public_id: buildCloudinaryPublicId(article),
    resource_type: 'image',
    overwrite: false
  });

  return {
    url: result.secure_url,
    publicId: result.public_id
  };
};

const resolveCoverImage = async ({ coverImageUrl, coverImagePublicId, article, ...input } = {}) => {
  const providedUrl = String(coverImageUrl || '').trim();
  const providedPublicId = String(coverImagePublicId || '').trim();

  if (providedUrl) {
    return {
      url: providedUrl,
      publicId: providedPublicId || null
    };
  }

  try {
    const prompt = buildImagePrompt({ article, input });
    const buffer = await generateOpenAiImage(prompt);

    if (!buffer) {
      return {
        url: PLACEHOLDER_IMAGE_URL,
        publicId: null
      };
    }

    return uploadArticleCover({ buffer, article });
  } catch (error) {
    if (isProduction()) {
      throw error;
    }
    console.warn('AI cover image generation failed, using placeholder:', error.response?.data || error.message);
    return {
      url: PLACEHOLDER_IMAGE_URL,
      publicId: null
    };
  }
};

module.exports = {
  resolveCoverImage
};
