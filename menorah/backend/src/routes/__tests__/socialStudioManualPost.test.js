const express = require('express');
const request = require('supertest');

const mockSocialPostCreate = jest.fn();
const mockUploadBuffer = jest.fn();

jest.mock('../../middleware/auth', () => ({
  adminAuth: (req, _res, next) => {
    req.user = { _id: '64f000000000000000000001', role: 'admin' };
    next();
  }
}));

jest.mock('../../models/SocialPost', () => ({
  create: (...args) => mockSocialPostCreate(...args)
}));

jest.mock('../../utils/cloudinary', () => ({
  uploadBuffer: (...args) => mockUploadBuffer(...args)
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
  const originalEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    SOCIAL_STUDIO_STORAGE: process.env.SOCIAL_STUDIO_STORAGE,
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET
  };

  beforeEach(() => {
    mockSocialPostCreate.mockReset();
    mockUploadBuffer.mockReset();
    mockSocialPostCreate.mockImplementation(async (fields) => buildPostDocument(fields));
  });

  afterAll(() => {
    Object.entries(originalEnvironment).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
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

  test('requires an explicit confirmation before a publish request can reach the publisher', async () => {
    await request(buildApp())
      .post('/api/admin/social-studio/posts/64f000000000000000000099/publish-now')
      .send({})
      .expect(400);
  });

  test('uploads an MP4 Reel to configured Cloudinary storage and keeps it in review', async () => {
    process.env.NODE_ENV = 'test';
    process.env.SOCIAL_STUDIO_STORAGE = 'cloudinary';
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    process.env.CLOUDINARY_API_KEY = 'test-key';
    process.env.CLOUDINARY_API_SECRET = 'test-secret';
    mockUploadBuffer.mockResolvedValue({
      secure_url: 'https://res.cloudinary.com/test/video/upload/reel.mp4',
      public_id: 'menorah/social-studio-videos/reel'
    });

    const mp4Header = Buffer.from([
      0x00, 0x00, 0x00, 0x18,
      0x66, 0x74, 0x79, 0x70,
      0x69, 0x73, 0x6f, 0x6d,
      0x00, 0x00, 0x00, 0x00
    ]);
    const response = await request(buildApp())
      .post('/api/admin/social-studio/posts/video')
      .field('topic', 'A practical reminder to ask for support')
      .field('caption', 'You do not have to carry everything alone.')
      .field('hashtags', 'support, wellbeing')
      .attach('video', mp4Header, { filename: 'reel.mp4', contentType: 'video/mp4' })
      .expect(201);

    expect(mockUploadBuffer).toHaveBeenCalledWith(mp4Header, expect.objectContaining({
      resource_type: 'video',
      folder: 'menorah/social-studio-videos'
    }));
    expect(mockSocialPostCreate).toHaveBeenCalledWith(expect.objectContaining({
      contentSource: 'manual',
      postType: 'reel',
      status: 'needs_review',
      videoUrl: 'https://res.cloudinary.com/test/video/upload/reel.mp4',
      videoMimeType: 'video/mp4',
      hashtags: ['support', 'wellbeing']
    }));
    expect(response.body.data.post.status).toBe('needs_review');
  });

  test('rejects a non-MP4/MOV Reel before storage or post creation', async () => {
    await request(buildApp())
      .post('/api/admin/social-studio/posts/video')
      .field('topic', 'A practical reminder to ask for support')
      .field('caption', 'You do not have to carry everything alone.')
      .attach('video', Buffer.from('not-a-video'), { filename: 'reel.webm', contentType: 'video/webm' })
      .expect(400);

    expect(mockUploadBuffer).not.toHaveBeenCalled();
    expect(mockSocialPostCreate).not.toHaveBeenCalled();
  });

  test('refuses a service-local Reel upload in production instead of creating an unpublishable record', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SOCIAL_STUDIO_STORAGE = 'local';
    const mp4Header = Buffer.from([
      0x00, 0x00, 0x00, 0x18,
      0x66, 0x74, 0x79, 0x70,
      0x69, 0x73, 0x6f, 0x6d,
      0x00, 0x00, 0x00, 0x00
    ]);

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await request(buildApp())
        .post('/api/admin/social-studio/posts/video')
        .field('topic', 'A practical reminder to ask for support')
        .field('caption', 'You do not have to carry everything alone.')
        .attach('video', mp4Header, { filename: 'reel.mp4', contentType: 'video/mp4' })
        .expect(503);
    } finally {
      errorSpy.mockRestore();
    }

    expect(mockSocialPostCreate).not.toHaveBeenCalled();
  });
});
