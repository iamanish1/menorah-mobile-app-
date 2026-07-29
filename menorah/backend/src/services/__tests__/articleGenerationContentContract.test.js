const mockArticleCreate = jest.fn();
const mockArticleExists = jest.fn();
const mockGenerateArticleDraft = jest.fn();
const mockCountArticleWords = jest.fn();
const mockResolveCoverImage = jest.fn();

jest.mock('../../models/Article', () => ({
  exists: (...args) => mockArticleExists(...args),
  create: (...args) => mockArticleCreate(...args)
}));

jest.mock('../articleAiService', () => ({
  countArticleWords: (...args) => mockCountArticleWords(...args),
  generateArticleDraft: (...args) => mockGenerateArticleDraft(...args),
  generateArticleTopics: jest.fn(),
  getWordRange: () => ({ min: 600, max: 800, target: 700 })
}));

jest.mock('../articleImageService', () => ({
  resolveCoverImage: (...args) => mockResolveCoverImage(...args)
}));

const { createReviewArticle } = require('../articleGenerationService');

describe('AI article content persistence', () => {
  beforeEach(() => {
    mockArticleCreate.mockReset();
    mockArticleExists.mockReset().mockResolvedValue(false);
    mockGenerateArticleDraft.mockReset().mockResolvedValue({
      title: '**A generated article**',
      excerpt: 'A generated **article summary** that is long enough for the CMS.',
      category: '**Wellbeing**',
      tags: ['**support**'],
      contentBlocks: [
        { type: 'heading', text: '**A clear place to start**', level: 2 },
        { type: 'paragraph', text: 'A practical generated paragraph that is safe for readers.' },
        { type: 'bullet_list', items: ['**Engage in hobbies:** Find a shared interest.'] },
        // The model schema permits a null URL. It should not prevent a
        // review draft, because resolveCoverImage supplies the cover image.
        { type: 'image', url: null, alt: '', caption: '' }
      ],
      seoTitle: '**A generated article** | Menorah',
      seoDescription: 'A useful **description** for readers.',
      imagePrompt: '**A calm editorial image**'
    });
    mockCountArticleWords.mockReturnValue(700);
    mockResolveCoverImage.mockReset().mockResolvedValue({
      url: 'https://res.cloudinary.com/menorah/image/upload/generated.jpg',
      publicId: 'menorah/articles/generated'
    });
    mockArticleCreate.mockImplementation(async (fields) => ({
      ...fields,
      _id: { toString: () => '64f000000000000000000099' },
      toObject: () => ({
        ...fields,
        _id: { toString: () => '64f000000000000000000099' }
      })
    }));
  });

  test('creates a reviewable AI draft using the same valid content contract as manual articles', async () => {
    const article = await createReviewArticle({
      input: {
        topic: 'A generated article',
        category: 'Wellbeing',
        imagePrompt: '**A private, calm image direction**'
      }
    });

    expect(mockArticleCreate).toHaveBeenCalledWith(expect.objectContaining({
      status: 'review',
      generatedByAi: true,
      reviewedByHuman: false,
      title: 'A generated article',
      excerpt: 'A generated article summary that is long enough for the CMS.',
      category: 'Wellbeing',
      tags: ['support'],
      seoTitle: 'A generated article | Menorah',
      seoDescription: 'A useful description for readers.',
      imagePrompt: 'A private, calm image direction',
      contentBlocks: [
        expect.objectContaining({ type: 'heading', text: 'A clear place to start', level: 2 }),
        expect.objectContaining({ type: 'paragraph', text: 'A practical generated paragraph that is safe for readers.' }),
        expect.objectContaining({ type: 'bullet_list', items: ['Engage in hobbies: Find a shared interest.'] })
      ]
    }));
    expect(mockArticleCreate.mock.calls[0][0].contentBlocks).toHaveLength(3);
    expect(mockResolveCoverImage).toHaveBeenCalledWith(expect.objectContaining({
      imagePrompt: 'A private, calm image direction',
      article: expect.objectContaining({
        title: 'A generated article',
        imagePrompt: 'A private, calm image direction'
      })
    }));
    expect(article.status).toBe('review');
  });
});
