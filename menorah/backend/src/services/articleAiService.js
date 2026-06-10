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

const TOPICS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    topics: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          topic: { type: 'string' },
          category: { type: 'string' },
          audience: { type: 'string' },
          tone: { type: 'string' },
          imagePrompt: { type: 'string' },
          imageStyle: { type: 'string' },
          imageMood: { type: 'string' },
          imageColors: { type: 'string' },
          imageAvoid: { type: 'string' }
        },
        required: [
          'topic',
          'category',
          'audience',
          'tone',
          'imagePrompt',
          'imageStyle',
          'imageMood',
          'imageColors',
          'imageAvoid'
        ]
      }
    }
  },
  required: ['topics']
};

const DEFAULT_TOPICS = [
  'How Indian men can name anxiety before it turns into shutdown',
  'How to deal with work stress as a man in India',
  'What burnout can look like in Indian professionals',
  'Why men avoid counselling and how to take a private first step',
  'How to talk about mental health with family without overexplaining',
  'Understanding anger as a signal instead of a personality flaw',
  'How sleep, food, and movement affect mood regulation',
  'Small grounding habits for men who feel constantly on edge',
  'How to rebuild confidence after a difficult season',
  'Why regular check-ins matter for men who seem fine',
  'How to manage loneliness without pretending it is not there',
  'Healthy boundaries for men balancing family and work pressure',
  'How students and early-career men can handle pressure',
  'Recognizing when stress needs professional support',
  'How to support another man without trying to fix everything'
];

const TOPIC_CLUSTERS = [
  'stress and burnout',
  'anxiety in men',
  'counselling stigma and private help-seeking',
  'relationships and family conversations',
  'anger and emotional regulation',
  'sleep and daily routines',
  'loneliness and friendship',
  'confidence after setbacks',
  'family pressure and work pressure',
  'student and early-career mental health'
];

const isProduction = () => process.env.NODE_ENV === 'production';

const isPlaceholderValue = (value) => /REPLACE_WITH|placeholder|your-|your_/i.test(value || '');

const getOpenAiApiKey = () => {
  const value = String(process.env.OPENAI_API_KEY || '').trim();
  return value && !isPlaceholderValue(value) ? value : '';
};

const getNumber = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getWordTarget = () => getNumber(process.env.ARTICLE_TARGET_WORD_COUNT, 700);

const getWordRange = (target = getWordTarget()) => ({
  target,
  min: getNumber(process.env.ARTICLE_MIN_WORD_COUNT, Math.max(1, target - 50)),
  max: getNumber(process.env.ARTICLE_MAX_WORD_COUNT, target + 100)
});

const normalizeInput = (input = {}) => {
  const targetWordCount = getNumber(input.targetWordCount, getWordTarget());
  const range = getWordRange(targetWordCount);

  return {
    topic: String(input.topic || '').trim(),
    category: String(input.category || 'Mental Health').trim(),
    audience: String(input.audience || 'Men in India looking for accessible mental health education').trim(),
    tone: String(input.tone || 'warm, direct, practical, non-clinical, and India-English').trim(),
    length: String(input.length || 'long').trim(),
    targetWordCount,
    minWordCount: getNumber(input.minWordCount, range.min),
    maxWordCount: getNumber(input.maxWordCount, range.max),
    strictWordCount: Boolean(input.strictWordCount),
    wordCountFeedback: String(input.wordCountFeedback || '').trim()
  };
};

const countWordsInText = (text) => {
  const matches = String(text || '').match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)?/g);
  return matches ? matches.length : 0;
};

const countArticleWords = (article = {}) => {
  if (!Array.isArray(article.contentBlocks)) {
    return 0;
  }

  return article.contentBlocks.reduce((total, block) => {
    const textWords = countWordsInText(block?.text);
    const itemWords = Array.isArray(block?.items)
      ? block.items.reduce((sum, item) => sum + countWordsInText(item), 0)
      : 0;
    return total + textWords + itemWords;
  }, 0);
};

const buildMockParagraphs = (topic) => [
  `Many men learn to keep pressure private, especially when the pressure feels difficult to explain. ${topic} is worth talking about because mental health often changes through ordinary moments: how a man sleeps, how he responds to stress, how much space he has to be honest, and whether he feels allowed to ask for support before things become overwhelming.`,
  'A practical starting point is to notice patterns without turning them into self-criticism. Pay attention to what happens before a difficult mood, a short temper, a long silence, or the urge to withdraw. These patterns are not proof that something is wrong with you. They are information that can help you respond earlier and more clearly.',
  'Small routines can make this easier. A short walk, a glass of water, a five-minute journal note, a calmer bedtime, or one honest message to someone trusted can create enough space to think. The goal is not to become perfectly disciplined. The goal is to create repeatable actions that make emotional pressure less confusing.',
  'It also helps to separate strength from silence. Strength can include naming what is happening, asking direct questions, and choosing support before a situation becomes a crisis. Men do not need to share everything with everyone, but having one or two safe people can reduce the feeling that every problem has to be handled alone.',
  'When stress shows up as anger, numbness, overworking, or avoidance, it can be useful to pause before reacting. Ask what the feeling is trying to protect, what boundary may have been crossed, and what action would help without causing more damage. This pause is simple, but it can change the direction of a difficult day.',
  'A useful check-in is to ask three direct questions: what am I feeling, what do I need, and what is one responsible next step. The answer does not have to be dramatic. It might be rest, a conversation, a boundary, a meal, a walk, or an appointment. Naming the next step makes the situation less abstract.',
  'Connection matters too. Many men wait until they have the perfect words before they reach out, but support can start with something simple. A message like "I have had a rough week and could use a normal conversation" can be enough. Honest contact does not require a full explanation of everything that is happening.',
  'Progress is usually easier to maintain when it is measured honestly. Instead of asking whether life feels fixed, ask whether today included one healthier response than yesterday. That might mean taking a breath before replying, sleeping earlier, stepping away from an argument, or admitting that something has been heavy. These small shifts count.',
  'It is also worth reducing the pressure to solve everything at once. A man can take care of his mental health in layers: one layer for physical basics, one for honest conversation, one for boundaries, and one for professional help when needed. Working in layers keeps the process realistic and makes change easier to repeat.',
  'Professional support can also be part of a healthy plan. A counsellor, therapist, doctor, or crisis service can offer structure when personal coping tools are not enough. Seeking help is not a failure of character. It is a practical step when the load has become too heavy to carry without support.',
  'If thoughts of self-harm, danger, or losing control appear, urgent support matters. Contact local emergency services, a crisis helpline, or a trusted person who can stay with you. Mental health education can help with reflection, but immediate safety should always come first when risk is present.'
];

const buildMockDraft = (input = {}) => {
  const normalized = normalizeInput(input);
  const topic = normalized.topic || 'Building a gentle mental health routine';

  return {
    title: topic,
    excerpt: 'A practical, supportive guide for men in India with grounded mental health education and clear reminders to seek professional or emergency support when needed.',
    category: normalized.category,
    tags: ['mental health', 'men', 'India', 'wellbeing', 'self care'],
    contentBlocks: [
      {
        type: 'heading',
        text: 'A practical place to begin',
        level: 2,
        items: [],
        url: null,
        alt: null,
        caption: null
      },
      ...buildMockParagraphs(topic).map((paragraph) => ({
        type: 'paragraph',
        text: paragraph,
        level: null,
        items: [],
        url: null,
        alt: null,
        caption: null
      })),
      {
        type: 'bullet_list',
        text: null,
        level: null,
        items: [
          'Notice the pattern before judging yourself for it.',
          'Choose one small action that makes the next hour easier.',
          'Ask for professional or urgent support when safety feels uncertain.'
        ],
        url: null,
        alt: null,
        caption: null
      },
      {
        type: 'callout',
        text: 'If you are worried about your safety or someone else\'s safety, contact local emergency services or a trusted crisis helpline now.',
        level: null,
        items: [],
        url: null,
        alt: null,
        caption: null
      }
    ],
    seoTitle: `${topic} | Menorah Health`,
    seoDescription: 'A safe, practical mental health article for men in India, built for education, reflection, and private next steps.',
    imagePrompt: `A calm editorial wellness cover image for an article about ${topic}, no readable text, no medical imagery.`
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

const callOpenAiResponses = async ({ schema, name, input, timeout = 45000 }) => {
  const apiKey = getOpenAiApiKey();

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for AI article generation');
  }

  const response = await axios.post(
    'https://api.openai.com/v1/responses',
    {
      model: process.env.OPENAI_ARTICLE_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      input,
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
      timeout
    }
  );

  const outputText = extractOutputText(response.data);
  if (!outputText) {
    throw new Error('OpenAI response did not include structured output text');
  }

  return JSON.parse(outputText);
};

const generateArticleDraft = async (input = {}) => {
  const normalized = normalizeInput(input);

  if (!getOpenAiApiKey()) {
    if (isProduction()) {
      throw new Error('OPENAI_API_KEY is required for production article generation');
    }
    return buildMockDraft(normalized);
  }

  try {
    const draft = await callOpenAiResponses({
      schema: ARTICLE_SCHEMA,
      name: 'article_draft',
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: [
                'You create safe mental-health education articles for Menorah Health.',
                'Return structured JSON only.',
                'Write for India-English readers and men in India without stereotypes, shame, or keyword stuffing.',
                'Use practical search-intent headlines and readable section headings.',
                'Do not diagnose, do not promise medical outcomes, and do not give harmful advice.',
                'Use supportive, non-alarmist wording.',
                'Mention professional support when appropriate.',
                'Add India-relevant context naturally when useful, such as work pressure, family pressure, counselling stigma, student pressure, privacy, or relationships.',
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
                  targetWordCount: normalized.targetWordCount,
                  acceptableWordCountRange: [normalized.minWordCount, normalized.maxWordCount],
                  strictWordCount: normalized.strictWordCount,
                  wordCountFeedback: normalized.wordCountFeedback,
                  wordCountScope: 'Only contentBlocks text and list items count. Title, excerpt, SEO fields, tags, and imagePrompt do not count.',
                  bodyLengthGuidance: 'For a 700-word target, write a complete article body with enough paragraph and list content to land inside the acceptable range.',
                  contentBlockTypes: ['heading', 'paragraph', 'quote', 'bullet_list', 'image', 'callout'],
                  noDiagnosis: true,
                  noMedicalPromises: true,
                  noHarmfulAdvice: true,
                  structuredJsonOnly: true,
                  targetMarket: 'India-English men looking for practical mental-health guidance',
                  topicClusters: TOPIC_CLUSTERS,
                  seoQuality: [
                    'Write one clear search-intent title, not a vague inspirational title.',
                    'Write a meta description that explains the specific problem and practical value.',
                    'Use natural phrases a reader might search for, but never repeat keywords unnaturally.',
                    'Include one short callout or closing paragraph that encourages readers to continue with Menorah support, counselling resources, or private next steps.'
                  ]
                },
                input: normalized
              })
            }
          ]
        }
      ]
    });

    return sanitizeDraft(draft, normalized);
  } catch (error) {
    if (isProduction()) {
      throw new Error(`AI article generation failed: ${error.response?.data?.error?.message || error.message}`);
    }
    console.warn('AI article generation failed, returning local safe draft:', error.response?.data || error.message);
    return buildMockDraft(normalized);
  }
};

const buildFallbackTopics = (count, recentArticles = []) => {
  const recentTitles = new Set(
    recentArticles.map((article) => String(article.title || '').trim().toLowerCase()).filter(Boolean)
  );

  return DEFAULT_TOPICS
    .filter((topic) => !recentTitles.has(topic.toLowerCase()))
    .slice(0, count)
    .map((topic) => ({
      topic,
      category: 'Mental Health',
      audience: 'Men in India looking for practical mental health support',
      tone: 'warm, direct, practical, non-clinical, and India-English',
      imagePrompt: `A calm editorial article cover about ${topic}, no readable text, hopeful and grounded.`,
      imageStyle: 'premium editorial mental health illustration',
      imageMood: 'calm, grounded, masculine but inclusive, hopeful',
      imageColors: 'earthy green, cream, soft shadows',
      imageAvoid: 'no text, no hospital, no doctors, no distressing stereotypes'
    }));
};

const sanitizeTopics = (topics, count, recentArticles = []) => {
  const recent = new Set(
    recentArticles.flatMap((article) => [article.title, article.slug])
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean)
  );
  const seen = new Set();

  return (Array.isArray(topics) ? topics : [])
    .map((topic) => ({
      topic: String(topic?.topic || '').trim(),
      category: String(topic?.category || 'Mental Health').trim(),
      audience: String(topic?.audience || 'Men in India looking for practical mental health support').trim(),
      tone: String(topic?.tone || 'warm, direct, practical, non-clinical, and India-English').trim(),
      imagePrompt: String(topic?.imagePrompt || '').trim(),
      imageStyle: String(topic?.imageStyle || 'premium editorial mental health illustration').trim(),
      imageMood: String(topic?.imageMood || 'calm, grounded, masculine but inclusive, hopeful').trim(),
      imageColors: String(topic?.imageColors || 'earthy green, cream, soft shadows').trim(),
      imageAvoid: String(topic?.imageAvoid || 'no text, no hospital, no doctors, no distressing stereotypes').trim()
    }))
    .filter((topic) => topic.topic.length >= 3)
    .filter((topic) => {
      const key = topic.topic.toLowerCase();
      if (seen.has(key) || recent.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, count);
};

const generateArticleTopics = async ({ count, recentArticles = [] } = {}) => {
  const requestedCount = Math.max(1, Number.parseInt(count, 10) || 1);

  if (!getOpenAiApiKey()) {
    if (isProduction()) {
      throw new Error('OPENAI_API_KEY is required for production topic generation');
    }
    return buildFallbackTopics(requestedCount, recentArticles);
  }

  try {
    const result = await callOpenAiResponses({
      schema: TOPICS_SCHEMA,
      name: 'article_topics',
      timeout: 30000,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: [
                'You plan safe, varied article topics for Menorah Health.',
                'All topics must relate to India-English men\'s mental health, wellbeing, emotional awareness, stress, burnout, anxiety, relationships, confidence, counselling stigma, help-seeking, or practical self-care.',
                'Avoid duplicates and avoid topics that sound too similar to recent articles.',
                'Prefer practical search-intent topics over vague inspirational topics.',
                'Avoid keyword stuffing and avoid promising medical outcomes.',
                'Return structured JSON only.'
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
                task: `Create ${requestedCount} distinct article topics`,
                recentArticles: recentArticles.map((article) => ({
                  title: article.title,
                  slug: article.slug,
                  category: article.category
                })),
                requirements: {
                  articleWordCount: getWordTarget(),
                  includeImageDirection: true,
                  targetMarket: 'India-English men and men in India',
                  topicClusters: TOPIC_CLUSTERS,
                  exampleSearchQuestions: [
                    'how to deal with work stress as a man',
                    'why men avoid counselling',
                    'anxiety symptoms in men',
                    'how to talk about mental health with family',
                    'burnout in Indian professionals'
                  ],
                  noDiagnosis: true,
                  noMedicalPromises: true
                }
              })
            }
          ]
        }
      ]
    });

    const topics = sanitizeTopics(result.topics, requestedCount, recentArticles);
    if (topics.length < requestedCount && isProduction()) {
      throw new Error(`OpenAI returned ${topics.length} usable topics, expected ${requestedCount}`);
    }

    return topics.length >= requestedCount
      ? topics
      : [...topics, ...buildFallbackTopics(requestedCount - topics.length, recentArticles)];
  } catch (error) {
    if (isProduction()) {
      throw new Error(`AI topic generation failed: ${error.response?.data?.error?.message || error.message}`);
    }
    console.warn('AI topic generation failed, returning local topics:', error.response?.data || error.message);
    return buildFallbackTopics(requestedCount, recentArticles);
  }
};

module.exports = {
  countArticleWords,
  generateArticleDraft,
  generateArticleTopics,
  getWordRange
};
