const express = require('express');
const request = require('supertest');

const mockSocialPostCreate = jest.fn();

jest.mock('../../middleware/auth', () => ({
  adminAuth: (req, _res, next) => {
    req.user = { _id: '64f000000000000000000001', role: 'admin' };
    next();
  }
}));

jest.mock('../../models/SocialPost', () => ({
  create: (...args) => mockSocialPostCreate(...args)
}));

const socialStudioRouter = require('../socialStudio');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/social-studio', socialStudioRouter);
  return app;
};

const buildPostDocument = (fields) => {
  const _id = { toString: () => '64f000000000000000000099' };
  return {
    ...fields,
    _id,
    toObject: () => ({ ...fields, _id })
  };
};

describe('manual Social Studio post creation', () => {
  beforeEach(() => {
    mockSocialPostCreate.mockReset();
    mockSocialPostCreate.mockImplementation(async (fields) => buildPostDocument(fields));
  });

  test('puts a manually restored post into admin review without calling AI generation', async () => {
    const response = await request(buildApp())
      .post('/api/admin/social-studio/posts')
      .send({
        topic: 'A practical reminder to ask for support',
        caption: 'You do not have to carry everything alone.',
        imageUrl: 'https://cdn.example.com/restored-post.jpg',
        hashtags: ['support', '#wellbeing']
      })
      .expect(201);

    expect(mockSocialPostCreate).toHaveBeenCalledWith(expect.objectContaining({
      contentSource: 'manual',
      status: 'needs_review',
      topic: 'A practical reminder to ask for support',
      caption: 'You do not have to carry everything alone.',
      hashtags: ['support', 'wellbeing'],
      imageUrl: 'https://cdn.example.com/restored-post.jpg',
      finalImageUrl: 'https://cdn.example.com/restored-post.jpg',
      thumbnailUrl: 'https://cdn.example.com/restored-post.jpg',
      createdBy: '64f000000000000000000001'
    }));
    expect(response.body.data.post.status).toBe('needs_review');
  });

  test('requires a hosted HTTPS image before creating a restored post', async () => {
    await request(buildApp())
      .post('/api/admin/social-studio/posts')
      .send({
        topic: 'A practical reminder to ask for support',
        caption: 'You do not have to carry everything alone.',
        imageUrl: 'http://cdn.example.com/restored-post.jpg'
      })
      .expect(400);

    expect(mockSocialPostCreate).not.toHaveBeenCalled();
  });
});
