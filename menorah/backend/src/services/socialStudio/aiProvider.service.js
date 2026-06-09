const axios = require('axios');
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
    designBrief: 'Premium Menorah-style wellness post with deep green typography, calm cream space, soft layered shapes, and no visual clutter.',
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

const generateImagePrompt = async (input = {}) => {
  if (canUseMockMode()) {
    const topic = toPlainText(input.topic || 'Menorah Health support');
    return {
      imagePrompt: `Soft editorial mental wellness background for ${topic}. No readable text.`,
      backgroundDirection: 'Warm cream and green abstract shapes with calm, premium spacing.'
    };
  }

  const prompt = await callOpenAiResponses({
    schema: IMAGE_PROMPT_SCHEMA,
    name: 'social_post_image_prompt',
    task: 'Generate a background image prompt for a deterministic rendered static post',
    input
  });

  return {
    imagePrompt: toPlainText(prompt.imagePrompt),
    backgroundDirection: toPlainText(prompt.backgroundDirection)
  };
};

const generateBackgroundImage = async (input = {}) => ({
  imageUrl: '',
  prompt: toPlainText(input.imagePrompt || input.topic || ''),
  provider: getProviderName(),
  note: 'MVP uses deterministic Sharp rendering for final Instagram images.'
});

module.exports = {
  generateBackgroundImage,
  generateCaption,
  generateImagePrompt,
  generatePostConcept,
  getProviderName
};
