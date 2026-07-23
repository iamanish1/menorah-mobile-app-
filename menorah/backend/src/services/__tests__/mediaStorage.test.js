const fs = require('fs/promises');
const os = require('os');
const path = require('path');

jest.mock('../../utils/cloudinary', () => ({
  uploadBuffer: jest.fn(),
}));

const { uploadBuffer } = require('../../utils/cloudinary');
const {
  storeMediaBuffer,
  validateMediaStorageConfig,
  writeImmutableFile,
} = require('../mediaStorage');

describe('immutable media storage', () => {
  const originalEnv = process.env;
  let root;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'menorah-media-storage-'));
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      MEDIA_STORAGE_BACKEND: 'local',
      MEDIA_PUBLIC_BASE_URL: 'https://media.example.test',
      UPLOAD_PATH: root,
    };
    uploadBuffer.mockReset();
  });

  afterEach(async () => {
    process.env = originalEnv;
    await fs.rm(root, { recursive: true, force: true });
  });

  test('writes immutable uniquely named objects with byte metadata', async () => {
    const bytes = Buffer.from('same-media-bytes');
    const first = await storeMediaBuffer(bytes, {
      service: 'user-profile',
      category: 'images',
      extension: '.jpg',
      contentType: 'image/jpeg',
    });
    const second = await storeMediaBuffer(bytes, {
      service: 'user-profile',
      category: 'images',
      extension: '.jpg',
      contentType: 'image/jpeg',
    });

    expect(first.metadata.objectKey).not.toBe(second.metadata.objectKey);
    expect(first.metadata).toEqual(expect.objectContaining({
      storageVersion: 1,
      backend: 'local',
      service: 'user-profile',
      sizeBytes: bytes.length,
      contentType: 'image/jpeg',
      localPath: first.metadata.objectKey,
    }));
    expect(first.metadata.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(first.url).toBe(
      `https://media.example.test/uploads/${first.metadata.objectKey}`
    );
    await expect(fs.readFile(path.join(root, ...first.metadata.objectKey.split('/'))))
      .resolves.toEqual(bytes);
  });

  test('atomically refuses to replace an existing immutable object key', async () => {
    const relativePath = 'user-profile/images/fixed-object.jpg';
    await writeImmutableFile({
      root,
      relativePath,
      buffer: Buffer.from('original-bytes'),
    });

    await expect(writeImmutableFile({
      root,
      relativePath,
      buffer: Buffer.from('replacement-bytes'),
    })).rejects.toThrow(/Refusing to overwrite/);

    await expect(fs.readFile(path.join(root, ...relativePath.split('/'))))
      .resolves.toEqual(Buffer.from('original-bytes'));
  });

  test.each([
    [{ NODE_ENV: 'production', MEDIA_STORAGE_BACKEND: '' }, /MEDIA_STORAGE_BACKEND/],
    [{
      NODE_ENV: 'production',
      MEDIA_STORAGE_BACKEND: 'local',
      MEDIA_PUBLIC_BASE_URL: 'http://media.example.test',
    }, /non-loopback HTTPS/],
    [{
      NODE_ENV: 'production',
      MEDIA_STORAGE_BACKEND: 'cloudinary',
      MEDIA_PUBLIC_BASE_URL: 'https://media.example.test',
      CLOUDINARY_CLOUD_NAME: 'cloud',
      CLOUDINARY_API_KEY: 'key',
      CLOUDINARY_API_SECRET: 'secret',
    }, /must equal local in production/],
  ])('rejects an unsafe production configuration', (environment, expected) => {
    const { errors } = validateMediaStorageConfig(environment);
    expect(errors.join('; ')).toMatch(expected);
  });

  test('uses non-overwriting unique Cloudinary object IDs outside production', async () => {
    process.env.MEDIA_STORAGE_BACKEND = 'cloudinary';
    process.env.CLOUDINARY_CLOUD_NAME = 'cloud';
    process.env.CLOUDINARY_API_KEY = 'key';
    process.env.CLOUDINARY_API_SECRET = 'secret';
    uploadBuffer.mockResolvedValue({
      secure_url: 'https://res.cloudinary.com/unit/image/upload/object.jpg',
      public_id: 'menorah/unit/object',
    });

    const stored = await storeMediaBuffer(Buffer.from('cloud-bytes'), {
      service: 'social-studio',
      category: 'rendered-posts',
      extension: '.jpg',
      contentType: 'image/jpeg',
    });

    expect(uploadBuffer).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        overwrite: false,
        unique_filename: false,
        invalidate: false,
      })
    );
    expect(stored.metadata.backend).toBe('cloudinary');
    expect(stored.metadata.publicId).toBe('menorah/unit/object');
  });
});
