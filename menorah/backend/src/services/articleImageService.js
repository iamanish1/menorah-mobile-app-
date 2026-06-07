const axios = require('axios');
const { uploadBuffer } = require('../utils/cloudinary');

const PLACEHOLDER_IMAGE_URL = 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?q=80&w=1600&auto=format&fit=crop';

const hasCloudinaryConfig = () =>
  Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

const getImageApiKey = () => process.env.AI_IMAGE_API_KEY || process.env.OPENAI_API_KEY;

const uploadImageBuffer = async (buffer, slug) => {
  if (!hasCloudinaryConfig()) {
    return { url: PLACEHOLDER_IMAGE_URL, publicId: null };
  }

  const result = await uploadBuffer(buffer, {
    folder: 'menorah/articles',
    public_id: slug,
    resource_type: 'image',
    overwrite: true
  });

  return {
    url: result.secure_url,
    publicId: result.public_id
  };
};

const downloadImage = async (url) => {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000
  });

  return Buffer.from(response.data);
};

const generateImage = async (imagePrompt) => {
  const apiKey = getImageApiKey();

  if (!apiKey || !imagePrompt) {
    return null;
  }

  const response = await axios.post(
    'https://api.openai.com/v1/images/generations',
    {
      model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5',
      prompt: imagePrompt,
      n: 1,
      size: process.env.OPENAI_IMAGE_SIZE || '1024x1024'
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    }
  );

  return response.data?.data?.[0] || null;
};

const generateAndUploadCoverImage = async (imagePrompt, slug) => {
  try {
    const generated = await generateImage(imagePrompt);

    if (!generated) {
      return {
        url: PLACEHOLDER_IMAGE_URL,
        publicId: null
      };
    }

    if (generated.b64_json) {
      return uploadImageBuffer(Buffer.from(generated.b64_json, 'base64'), slug);
    }

    if (generated.url) {
      if (!hasCloudinaryConfig()) {
        return {
          url: generated.url,
          publicId: null
        };
      }

      const buffer = await downloadImage(generated.url);
      return uploadImageBuffer(buffer, slug);
    }

    return {
      url: PLACEHOLDER_IMAGE_URL,
      publicId: null
    };
  } catch (error) {
    console.warn('Article image generation/upload failed:', error.response?.data || error.message);
    return {
      url: PLACEHOLDER_IMAGE_URL,
      publicId: null
    };
  }
};

module.exports = {
  generateAndUploadCoverImage
};
