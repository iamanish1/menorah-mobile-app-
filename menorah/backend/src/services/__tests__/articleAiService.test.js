jest.mock('axios', () => ({ post: jest.fn() }));

const axios = require('axios');
const { generateArticleDraft } = require('../articleAiService');

describe('AI article draft sanitization', () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-api-key';
    process.env.NODE_ENV = 'test';
    axios.post.mockReset();
  });

  afterAll(() => {
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  test('falls back to clean, valid content when AI formatting cleanup empties required fields', async () => {
    axios.post.mockResolvedValue({
      data: {
        output_text: JSON.stringify({
          title: '***',
          excerpt: '***',
          category: '***',
          tags: ['***'],
          contentBlocks: [{ type: 'bullet_list', items: ['***'] }],
          seoTitle: '***',
          seoDescription: '***',
          imagePrompt: '***'
        })
      }
    });

    const draft = await generateArticleDraft({
      topic: '**Finding Connection**',
      category: '***'
    });

    expect(draft.title).toBe('Finding Connection');
    expect(draft.category).toBe('Mental Health');
    expect(draft.tags).toEqual(expect.arrayContaining(['mental health']));
    expect(draft.contentBlocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'heading', text: 'A practical place to begin' }),
      expect.objectContaining({ type: 'bullet_list' })
    ]));
    expect(JSON.stringify(draft)).not.toContain('**');
    expect(JSON.stringify(draft)).not.toContain('***');
  });
});
