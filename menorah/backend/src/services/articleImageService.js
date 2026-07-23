const axios = require('axios');
const sharp = require('sharp');
const { storeMediaBuffer } = require('./mediaStorage');

const PLACEHOLDER_IMAGE_URL = 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?q=80&w=1600&auto=format&fit=crop';

const isPlaceholderValue = (value) => /REPLACE_WITH|placeholder|your-|your_/i.test(value || '');

const isProduction = () => process.env.NODE_ENV === 'production';

const getUsableEnv = (...names) => {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value && !isPlaceholderValue(value)) return value;
  }
  return '';
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

const generateOpenAiImage = async (prompt, options = {}) => {
  const apiKey = getUsableEnv(...(options.apiKeyEnvNames || ['OPENAI_API_KEY']));

  if (!apiKey) {
    if (isProduction()) {
      throw new Error(options.missingKeyMessage || 'OPENAI_API_KEY is required for production image generation');
    }
    return null;
  }

  const model = options.model || getUsableEnv(...(options.modelEnvNames || ['OPENAI_IMAGE_MODEL'])) || 'gpt-image-2';
  const size = options.size || getUsableEnv(...(options.sizeEnvNames || ['OPENAI_IMAGE_SIZE'])) || '1536x1024';
  const quality = options.quality || getUsableEnv(...(options.qualityEnvNames || ['OPENAI_IMAGE_QUALITY'])) || 'medium';
  const outputFormat = options.outputFormat || getUsableEnv(...(options.outputFormatEnvNames || ['OPENAI_IMAGE_FORMAT'])) || 'jpeg';
  const timeout = Number(options.timeoutMs || getUsableEnv(...(options.timeoutEnvNames || ['OPENAI_IMAGE_TIMEOUT_MS'])) || 120000);

  const response = await axios.post(
    'https://api.openai.com/v1/images/generations',
    {
      model,
      prompt,
      size,
      quality,
      output_format: outputFormat,
      n: 1
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout
    }
  );

  const image = response.data?.data?.[0];
  if (!image?.b64_json) {
    throw new Error('OpenAI image response did not include base64 image data');
  }

  return Buffer.from(image.b64_json, 'base64');
};

const uploadArticleCover = async ({ buffer }) => {
  const folder = process.env.CLOUDINARY_ARTICLE_FOLDER || 'menorah/articles';
  const safeCover = await sharp(buffer, {
    failOn: 'warning',
    limitInputPixels: 24_000_000,
  })
    .rotate()
    .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
  const result = await storeMediaBuffer(safeCover, {
    service: 'articles',
    category: 'cover-images',
    extension: '.jpg',
    contentType: 'image/jpeg',
    cloudinaryFolder: folder,
    cloudinaryResourceType: 'image',
  });

  return {
    url: result.url,
    publicId: result.metadata.publicId,
    metadata: result.metadata,
  };
};

const resolveCoverImage = async ({ coverImageUrl, coverImagePublicId, article, ...input } = {}) => {
  const providedUrl = String(coverImageUrl || '').trim();
  const providedPublicId = String(coverImagePublicId || '').trim();

  if (providedUrl) {
    return {
      url: providedUrl,
      publicId: providedPublicId || null,
      metadata: null,
    };
  }

  try {
    const prompt = buildImagePrompt({ article, input });
    const buffer = await generateOpenAiImage(prompt);

    if (!buffer) {
      return {
        url: PLACEHOLDER_IMAGE_URL,
        publicId: null,
        metadata: null,
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
      publicId: null,
      metadata: null,
    };
  }
};

module.exports = {
  buildImagePrompt,
  generateOpenAiImage,
  resolveCoverImage
};
