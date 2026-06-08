const axios = require('axios');

const ARTICLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    excerpt: { type: 'string' },
    category: { type: 'string' },
    tags: {
      type: 'array',
      items: { type: 'string' }
    },
    contentBlocks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: {
            type: 'string',
            enum: ['heading', 'paragraph', 'quote', 'bullet_list', 'image', 'callout']
          },
          text: { type: ['string', 'null'] },
          level: { type: ['number', 'null'] },
          items: {
            type: 'array',
            items: { type: 'string' }
          },
          url: { type: ['string', 'null'] },
          alt: { type: ['string', 'null'] },
          caption: { type: ['string', 'null'] }
        },
        required: ['type', 'text', 'level', 'items', 'url', 'alt', 'caption']
      }
    },
    seoTitle: { type: 'string' },
    seoDescription: { type: 'string' },
    imagePrompt: { type: 'string' }
  },
  required: [
    'title',
    'excerpt',
    'category',
    'tags',
    'contentBlocks',
    'seoTitle',
    'seoDescription',
    'imagePrompt'
  ]
};

const normalizeInput = (input = {}) => ({
  topic: String(input.topic || '').trim(),
  category: String(input.category || 'Mental Health').trim(),
  audience: String(input.audience || 'People looking for accessible mental health education').trim(),
  tone: String(input.tone || 'warm, grounded, practical, and non-clinical').trim(),
  length: String(input.length || 'medium').trim()
});

const buildMockDraft = (input = {}) => {
  const normalized = normalizeInput(input);
  const topic = normalized.topic || 'Building a gentle mental health routine';

  return {
    title: topic,
    excerpt: 'A practical, supportive guide with gentle mental health education and clear reminders to seek professional or emergency support when needed.',
    category: normalized.category,
    tags: ['mental health', 'wellbeing', 'self care'],
    contentBlocks: [
      {
        type: 'heading',
        text: 'A gentle place to begin',
        level: 2,
        items: [],
        url: null,
        alt: null,
        caption: null
      },
      {
        type: 'paragraph',
        text: 'Mental health can change from day to day. This article offers general education and reflection prompts, not a diagnosis or a substitute for care from a qualified professional.',
        level: null,
        items: [],
        url: null,
        alt: null,
        caption: null
      },
      {
        type: 'bullet_list',
        text: null,
        level: null,
        items: [
          'Notice what feels manageable today.',
          'Choose one small supportive action, such as drinking water, resting, journaling, or contacting someone you trust.',
          'If your feelings become overwhelming or you may be in danger, contact local emergency services or a crisis support line right away.'
        ],
        url: null,
        alt: null,
        caption: null
      },
      {
        type: 'callout',
        text: 'If you are worried about your safety or someone else\'s safety, seek urgent help now through local emergency services or a trusted crisis helpline.',
        level: null,
        items: [],
        url: null,
        alt: null,
        caption: null
      }
    ],
    seoTitle: `${topic} | Menorah Health`,
    seoDescription: 'A safe, supportive mental health article for education and reflection.',
    imagePrompt: `A calm, inclusive wellness illustration for an article about ${topic}, soft natural light, peaceful and hopeful, no medical imagery.`
  };
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

const sanitizeDraft = (draft, input) => {
  const fallback = buildMockDraft(input);

  return {
    title: String(draft?.title || fallback.title).trim(),
    excerpt: String(draft?.excerpt || fallback.excerpt).trim(),
    category: String(draft?.category || fallback.category).trim(),
    tags: Array.isArray(draft?.tags)
      ? draft.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 12)
      : fallback.tags,
    contentBlocks: Array.isArray(draft?.contentBlocks) && draft.contentBlocks.length > 0
      ? draft.contentBlocks
        .filter((block) => ['heading', 'paragraph', 'quote', 'bullet_list', 'image', 'callout'].includes(block?.type))
        .map((block) => ({
          type: block.type,
          text: block.text ? String(block.text).trim() : '',
          level: block.level || null,
          items: Array.isArray(block.items) ? block.items.map((item) => String(item).trim()).filter(Boolean) : [],
          url: block.url || null,
          alt: block.alt || '',
          caption: block.caption || ''
        }))
      : fallback.contentBlocks,
    seoTitle: String(draft?.seoTitle || fallback.seoTitle).trim(),
    seoDescription: String(draft?.seoDescription || fallback.seoDescription).trim(),
    imagePrompt: String(draft?.imagePrompt || fallback.imagePrompt).trim()
  };
};

const generateArticleDraft = async (input = {}) => {
  const normalized = normalizeInput(input);

  if (!process.env.OPENAI_API_KEY) {
    return buildMockDraft(normalized);
  }

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/responses',
      {
        model: process.env.OPENAI_ARTICLE_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text: [
                  'You create safe mental-health education articles for Menorah Health.',
                  'Return structured JSON only.',
                  'Do not diagnose, do not promise medical outcomes, and do not give harmful advice.',
                  'Use supportive, non-alarmist wording.',
                  'Mention professional support when appropriate.',
                  'Include crisis-safe wording when the topic could involve overwhelming distress, self-harm, or urgent safety concerns.'
                ].join(' ')
              }
            ]
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: JSON.stringify({
                  task: 'Generate an article draft',
                  constraints: {
                    contentBlockTypes: ['heading', 'paragraph', 'quote', 'bullet_list', 'image', 'callout'],
                    noDiagnosis: true,
                    noMedicalPromises: true,
                    noHarmfulAdvice: true,
                    structuredJsonOnly: true
                  },
                  input: normalized
                })
              }
            ]
          }
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'article_draft',
            strict: true,
            schema: ARTICLE_SCHEMA
          }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const outputText = extractOutputText(response.data);
    const draft = outputText ? JSON.parse(outputText) : null;
    return sanitizeDraft(draft, normalized);
  } catch (error) {
    console.warn('AI article generation failed, returning local safe draft:', error.response?.data || error.message);
    return buildMockDraft(normalized);
  }
};

module.exports = {
  generateArticleDraft
};
