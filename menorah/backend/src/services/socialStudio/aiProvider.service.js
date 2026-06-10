const axios = require('axios');
const { generateOpenAiImage } = require('../articleImageService');
const { normalizeHashtags, toPlainText } = require('./textUtils');

const CONCEPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    hookText: { type: 'string' },
    bodyText: { type: 'string' },
    ctaText: { type: 'string' },
    designBrief: { type: 'string' },
    templateKey: { type: 'string', enum: ['thought_leadership', 'educational_tip', 'announcement'] },
    bulletPoints: { type: 'array', items: { type: 'string' } }
  },
  required: ['hookText', 'bodyText', 'ctaText', 'designBrief', 'templateKey', 'bulletPoints']
};

const CAPTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    caption: { type: 'string' },
    hashtags: { type: 'array', items: { type: 'string' } }
  },
  required: ['caption', 'hashtags']
};

const IMAGE_PROMPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    imagePrompt: { type: 'string' },
    backgroundDirection: { type: 'string' }
  },
  required: ['imagePrompt', 'backgroundDirection']
};

const isProduction = () => process.env.NODE_ENV === 'production';

const isPlaceholderValue = (value) => /REPLACE_WITH|placeholder|your-|your_/i.test(value || '');

const getUsableEnv = (...keys) => {
  for (const key of keys) {
    const value = String(process.env[key] || '').trim();
    if (value && !isPlaceholderValue(value)) {
      return value;
    }
  }
  return '';
};

const getOpenAiApiKey = () => getUsableEnv('SOCIAL_STUDIO_OPENAI_API_KEY', 'OPENAI_API_KEY');

const getTextModel = () =>
  getUsableEnv(
    'SOCIAL_STUDIO_AI_TEXT_MODEL',
    'SOCIAL_STUDIO_OPENAI_MODEL',
    'AI_TEXT_MODEL',
    'OPENAI_ARTICLE_MODEL',
    'OPENAI_MODEL'
  ) ||
  'gpt-4o-mini';

const getProviderName = () => getUsableEnv('SOCIAL_STUDIO_AI_PROVIDER', 'AI_PROVIDER') || 'openai';

const getImageModel = () =>
  getUsableEnv(
    'SOCIAL_STUDIO_AI_IMAGE_MODEL',
    'OPENAI_IMAGE_MODEL',
    'AI_IMAGE_MODEL'
  ) ||
  'gpt-image-2';

const canUseMockMode = () => {
  if (process.env.AI_MOCK_MODE === 'true' && !isProduction()) {
    return true;
  }
  return !getOpenAiApiKey() && !isProduction();
};

const extractOutputText = (responseData) => {
  if (typeof responseData?.output_text === 'string') {
    return responseData.output_text;
  }

  const content = responseData?.output
    ?.flatMap((item) => item.content || [])
    ?.find((part) => part.type === 'output_text' && typeof part.text === 'string');

  return content?.text;
};

const callOpenAiResponses = async ({ schema, name, task, input }) => {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new Error('SOCIAL_STUDIO_OPENAI_API_KEY or OPENAI_API_KEY is required for AI Social Studio generation outside mock mode');
  }

  const response = await axios.post(
    'https://api.openai.com/v1/responses',
    {
      model: getTextModel(),
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: [
                'You create safe, premium Instagram content for Menorah Health.',
                'Return structured JSON only.',
                'Use warm, human, plain text.',
                'No Markdown, asterisks, decorative symbols, link syntax, diagnosis, or medical promises.',
                'Keep image text concise enough for a polished Instagram static post.',
                'The visual style is editorial and illustrated: a painterly image panel on top, cream copy space below, oversized condensed serif headline, Menorah green and olive brand colors, and logo top-right.',
                'Write hookText like a short magazine headline, ideally 6 to 10 words.',
                'Write bodyText as one warm sentence, ideally 12 to 22 words, with no bullet symbols.',
                'Do not write text that encourages shame, panic, or stereotypes.'
              ].join(' ')
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify({ task, input })
            }
          ]
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name,
          strict: true,
          schema
        }
      }
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 45000
    }
  );

  const outputText = extractOutputText(response.data);
  if (!outputText) {
    throw new Error('OpenAI response did not include structured output text');
  }

  return JSON.parse(outputText);
};

const mockConcept = (input = {}) => {
  const topic = toPlainText(input.topic || 'Building steadier mental health');
  const objective = toPlainText(input.objective || 'Encourage a calm first step toward support');
  return {
    hookText: topic.length > 58 ? topic.slice(0, 55).trim() : topic,
    bodyText: `A grounded reminder that support can start with one honest conversation, one calmer routine, and one practical next step. ${objective}`,
    ctaText: 'Start with one honest check-in.',
    designBrief: 'Editorial illustrated wellness post with painterly photo-style top scene, warm cream copy field, oversized condensed serif headline, Menorah logo green, olive accent, and logo locked top-right.',
    templateKey: 'educational_tip',
    bulletPoints: [
      'Name what feels heavy',
      'Choose one next step',
      'Reach out before crisis'
    ]
  };
};

const mockCaption = (input = {}) => {
  const topic = toPlainText(input.topic || 'men mental health');
  return {
    caption: `Mental health support does not have to begin with a perfect explanation. It can begin with noticing what feels heavy, naming it honestly, and choosing one practical next step. ${topic} matters because men deserve care that feels steady, human, and easy to reach.`,
    hashtags: normalizeHashtags([
      'MenorahHealth',
      'MensMentalHealth',
      'MentalHealthSupport',
      'EmotionalWellbeing',
      'SelfCare'
    ])
  };
};

const sanitizeConcept = (concept = {}, fallbackInput = {}) => {
  const fallback = mockConcept(fallbackInput);
  return {
    hookText: toPlainText(concept.hookText || fallback.hookText),
    bodyText: toPlainText(concept.bodyText || fallback.bodyText),
    ctaText: toPlainText(concept.ctaText || fallback.ctaText),
    designBrief: toPlainText(concept.designBrief || fallback.designBrief),
    templateKey: ['thought_leadership', 'educational_tip', 'announcement'].includes(concept.templateKey)
      ? concept.templateKey
      : fallback.templateKey,
    bulletPoints: Array.isArray(concept.bulletPoints)
      ? concept.bulletPoints.map(toPlainText).filter(Boolean).slice(0, 5)
      : fallback.bulletPoints
  };
};

const sanitizeCaption = (caption = {}, fallbackInput = {}) => {
  const fallback = mockCaption(fallbackInput);
  return {
    caption: toPlainText(caption.caption || fallback.caption),
    hashtags: normalizeHashtags(caption.hashtags || fallback.hashtags)
  };
};

const generatePostConcept = async (input = {}) => {
  if (canUseMockMode()) {
    return {
      ...mockConcept(input),
      modelUsed: 'mock'
    };
  }

  const concept = await callOpenAiResponses({
    schema: CONCEPT_SCHEMA,
    name: 'social_post_concept',
    task: 'Generate a static Instagram post concept',
    input
  });

  return {
    ...sanitizeConcept(concept, input),
    modelUsed: getTextModel()
  };
};

const generateCaption = async (input = {}) => {
  if (canUseMockMode()) {
    return mockCaption(input);
  }

  const caption = await callOpenAiResponses({
    schema: CAPTION_SCHEMA,
    name: 'social_post_caption',
    task: 'Generate a warm Instagram caption and optimal hashtags',
    input
  });

  return sanitizeCaption(caption, input);
};

const buildPremiumSocialImagePrompt = (input = {}) => {
  const topic = toPlainText(input.topic || input.imagePrompt || 'Menorah Health support');
  const hook = toPlainText(input.concept?.hookText || input.hookText || '');
  const body = toPlainText(input.concept?.bodyText || input.bodyText || '');
  const audience = toPlainText(input.audience || 'men looking for practical mental health support');
  const basePrompt = toPlainText(input.imagePrompt || input.prompt || '');

  return [
    basePrompt || `Create a premium editorial mental wellness image about ${topic}.`,
    hook ? `Post headline context: ${hook}.` : '',
    body ? `Post body context: ${body}.` : '',
    `Audience: ${audience}.`,
    'Visual style: premium animated editorial photo illustration, painterly but refined, cinematic light, quiet luxury mental-health brand aesthetic, unique scene composition, not generic stock.',
    'Layout requirement: leave clean space and calm composition because typography and the Menorah logo will be added by the app after generation.',
    'Color direction: Menorah deep green, olive, warm cream, soft peach, muted violet shadows, natural light.',
    'Subject direction: calm adult men in grounded everyday moments such as office, home, commute, journaling, therapy-adjacent conversation, or quiet reflection.',
    'Avoid: readable text, logos, UI, medical/hospital imagery, stereotypes, distressing crisis scenes, exaggerated sadness, extra limbs, deformed hands, blurry low-quality output.'
  ].filter(Boolean).join('\n');
};

const generateImagePrompt = async (input = {}) => {
  if (canUseMockMode()) {
    const topic = toPlainText(input.topic || 'Menorah Health support');
    return {
      imagePrompt: `Premium animated editorial mental wellness image for ${topic}. No readable text, no logos.`,
      backgroundDirection: 'Unique painterly photo-illustration with Menorah green, olive, warm cream, soft peach, muted violet shadows, and calm premium spacing.'
    };
  }

  const prompt = await callOpenAiResponses({
    schema: IMAGE_PROMPT_SCHEMA,
    name: 'social_post_image_prompt',
    task: 'Generate a premium image prompt for an Instagram post background',
    input
  });

  return {
    imagePrompt: toPlainText(prompt.imagePrompt),
    backgroundDirection: toPlainText(prompt.backgroundDirection)
  };
};

const generateBackgroundImage = async (input = {}) => {
  const prompt = buildPremiumSocialImagePrompt(input);
  const buffer = await generateOpenAiImage(prompt, {
    apiKeyEnvNames: ['SOCIAL_STUDIO_OPENAI_API_KEY', 'OPENAI_API_KEY'],
    model: getImageModel(),
    sizeEnvNames: ['SOCIAL_STUDIO_AI_IMAGE_SIZE', 'OPENAI_IMAGE_SIZE'],
    qualityEnvNames: ['SOCIAL_STUDIO_AI_IMAGE_QUALITY', 'OPENAI_IMAGE_QUALITY'],
    outputFormatEnvNames: ['SOCIAL_STUDIO_AI_IMAGE_FORMAT', 'OPENAI_IMAGE_FORMAT'],
    timeoutEnvNames: ['SOCIAL_STUDIO_AI_IMAGE_TIMEOUT_MS', 'OPENAI_IMAGE_TIMEOUT_MS'],
    missingKeyMessage: 'SOCIAL_STUDIO_OPENAI_API_KEY or OPENAI_API_KEY is required for Social Studio image generation'
  });

  return {
    imageBuffer: buffer,
    prompt,
    provider: getProviderName(),
    modelUsed: buffer ? getImageModel() : 'mock'
  };
};

module.exports = {
  generateBackgroundImage,
  generateCaption,
  generateImagePrompt,
  generatePostConcept,
  getImageModel,
  getProviderName
};
