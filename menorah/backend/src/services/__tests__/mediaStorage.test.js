const fs = require('fs/promises');
const os = require('os');
const path = require('path');

jest.mock('../../utils/cloudinary', () => ({
  uploadBuffer: jest.fn(),
}));

const { uploadBuffer } = require('../../utils/cloudinary');
const {
  SERVER_STAGING_CLOUDINARY_PREFIX,
  safeCloudinaryFolder,
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

  const configureExactRealServerStagingCloudinary = () => {
    Object.assign(process.env, {
      NODE_ENV: 'production',
      DEPLOYMENT_ENVIRONMENT: 'staging',
      SERVICE_RUNTIME: 'server-staging',
      MENORAH_SYNTHETIC_DATA_ONLY: 'true',
      MENORAH_SERVER_STAGING_ENVIRONMENT_ID:
        'menorah-server-staging-v1',
      MENORAH_SERVER_STAGING_PROJECT_NAME: 'menorah-staging',
      MENORAH_SERVER_STAGING_HTTPS_PORT: '38443',
      MONGODB_URI:
        'mongodb://menorah-staging-app:synthetic@'
        + 'staging-mongo-primary:27017/menorah_staging'
        + '?replicaSet=menorah-staging-rs'
        + '&authSource=admin&retryWrites=true',
      MONGODB_REPLICA_SET_NAME: 'menorah-staging-rs',
      MONGODB_READ_PREFERENCE: 'primaryPreferred',
      MONGODB_RETRY_WRITES: 'true',
      MEDIA_STORAGE_BACKEND: 'cloudinary',
      MEDIA_PUBLIC_BASE_URL: 'https://api-web.staging.menorah.me',
      CLOUDINARY_UPLOAD_PREFIX: SERVER_STAGING_CLOUDINARY_PREFIX,
      CLOUDINARY_CLOUD_NAME: 'menorah-staging-cloud',
      CLOUDINARY_API_KEY: 'staging-cloudinary-key',
      CLOUDINARY_API_SECRET: 'staging-cloudinary-secret',
    });
  };

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

  test('allows Cloudinary only for the exact real synthetic staging runtime', () => {
    configureExactRealServerStagingCloudinary();

    expect(validateMediaStorageConfig(process.env).errors).toEqual([]);

    process.env.MENORAH_SERVER_STAGING_PROJECT_NAME =
      'menorah-server-staging-validation';
    expect(validateMediaStorageConfig(process.env).errors.join('; '))
      .toMatch(/must equal local in production/);

    process.env.MENORAH_SERVER_STAGING_PROJECT_NAME = 'menorah-staging';
    process.env.DEPLOYMENT_ENVIRONMENT = 'production';
    expect(validateMediaStorageConfig(process.env).errors.join('; '))
      .toMatch(/must equal local in production/);
  });

  test('requires the exact Cloudinary staging prefix and usable credentials', () => {
    configureExactRealServerStagingCloudinary();
    process.env.CLOUDINARY_UPLOAD_PREFIX =
      'menorah-staging/another-environment';
    process.env.CLOUDINARY_API_SECRET = 'REPLACE_WITH_CLOUDINARY_SECRET';

    const errors = validateMediaStorageConfig(process.env).errors.join('; ');

    expect(errors).toMatch(/CLOUDINARY_UPLOAD_PREFIX must equal/);
    expect(errors).toMatch(/CLOUDINARY_API_SECRET is required/);
  });

  test.each([
    [
      'menorah/profile-images',
      `${SERVER_STAGING_CLOUDINARY_PREFIX}/profile-images`,
    ],
    [
      `${SERVER_STAGING_CLOUDINARY_PREFIX}/profile-images`,
      `${SERVER_STAGING_CLOUDINARY_PREFIX}/profile-images`,
    ],
    [
      'social-studio/rendered-posts',
      `${SERVER_STAGING_CLOUDINARY_PREFIX}/social-studio/rendered-posts`,
    ],
  ])('normalizes %s below the exact staging prefix', (
    requestedFolder,
    expected
  ) => {
    expect(safeCloudinaryFolder({
      configuredPrefix: SERVER_STAGING_CLOUDINARY_PREFIX,
      requestedFolder,
      service: 'unused',
      category: 'unused',
    })).toBe(expected);
  });

  test.each([
    '../production',
    '/absolute',
    'menorah//profile-images',
    'menorah/Profile-Images',
    'menorah/profile_images',
  ])('rejects unsafe Cloudinary folder %s', (requestedFolder) => {
    expect(() => safeCloudinaryFolder({
      configuredPrefix: SERVER_STAGING_CLOUDINARY_PREFIX,
      requestedFolder,
      service: 'unused',
      category: 'unused',
    })).toThrow(/safe relative segments/);
  });

  test('uploads real staging media only under the exact prefix', async () => {
    configureExactRealServerStagingCloudinary();
    uploadBuffer.mockImplementation(async (_buffer, options) => ({
      secure_url:
        'https://res.cloudinary.com/menorah-staging/image/upload/object.jpg',
      public_id: `${options.folder}/${options.public_id}`,
    }));

    const stored = await storeMediaBuffer(Buffer.from('cloud-bytes'), {
      service: 'user-profile',
      category: 'images',
      extension: '.jpg',
      contentType: 'image/jpeg',
      cloudinaryFolder: 'menorah/profile-images',
    });

    expect(uploadBuffer).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        folder: `${SERVER_STAGING_CLOUDINARY_PREFIX}/profile-images`,
        overwrite: false,
        unique_filename: false,
      })
    );
    const uploadOptions = uploadBuffer.mock.calls[0][1];
    expect(stored.metadata.publicId)
      .toBe(`${uploadOptions.folder}/${uploadOptions.public_id}`);
    expect(stored.metadata.publicId)
      .toMatch(
        /^menorah-staging\/menorah-server-staging-v1\/profile-images\//
      );
  });

  test.each([
    'menorah/production/object',
    `${SERVER_STAGING_CLOUDINARY_PREFIX}/profile-images/unexpected`,
    `${SERVER_STAGING_CLOUDINARY_PREFIX}/profile-images/unexpected/object`,
    `${SERVER_STAGING_CLOUDINARY_PREFIX}/profile-images/../production/object`,
    '',
    undefined,
  ])('rejects unexpected Cloudinary public ID %p', async (publicId) => {
    configureExactRealServerStagingCloudinary();
    uploadBuffer.mockResolvedValue({
      secure_url:
        'https://res.cloudinary.com/production/image/upload/object.jpg',
      public_id: publicId,
    });

    await expect(storeMediaBuffer(Buffer.from('cloud-bytes'), {
      service: 'user-profile',
      category: 'images',
      extension: '.jpg',
      contentType: 'image/jpeg',
      cloudinaryFolder: 'menorah/profile-images',
    })).rejects.toThrow(/unexpected server-staging public_id/);
  });
});
