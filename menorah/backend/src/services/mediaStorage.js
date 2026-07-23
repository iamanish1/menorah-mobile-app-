const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { uploadBuffer } = require('../utils/cloudinary');

const STORAGE_VERSION = 1;
const SUPPORTED_BACKENDS = new Set(['local', 'cloudinary']);
const PRODUCTION_BACKEND = 'local';

const normalizeBaseUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    parsed.pathname = parsed.pathname.replace(/\/api\/?$/, '') || '/';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
};

const isLoopbackHostname = (hostname) => (
  hostname === 'localhost'
  || hostname === '0.0.0.0'
  || hostname === '::1'
  || hostname === '[::1]'
  || /^127(?:\.\d{1,3}){3}$/.test(hostname)
);

const readMediaStorageConfig = (env = process.env) => {
  const backend = String(env.MEDIA_STORAGE_BACKEND || '').trim().toLowerCase();
  const publicBaseUrl = normalizeBaseUrl(env.MEDIA_PUBLIC_BASE_URL);
  return {
    backend: backend || (env.NODE_ENV === 'production' ? '' : 'local'),
    publicBaseUrl,
    uploadRoot: path.resolve(process.cwd(), env.UPLOAD_PATH || './uploads'),
  };
};

const validateMediaStorageConfig = (env = process.env) => {
  const errors = [];
  const config = readMediaStorageConfig(env);

  if (!SUPPORTED_BACKENDS.has(config.backend)) {
    errors.push('MEDIA_STORAGE_BACKEND must be exactly local or cloudinary');
  }

  if (env.NODE_ENV === 'production' && config.backend !== PRODUCTION_BACKEND) {
    errors.push(
      'MEDIA_STORAGE_BACKEND must equal local in production so managed media is included in the signed backup and restore contract'
    );
  }

  if (config.backend === 'local') {
    if (!config.publicBaseUrl) {
      errors.push('MEDIA_PUBLIC_BASE_URL must be an absolute URL for local media storage');
    } else {
      const parsed = new URL(config.publicBaseUrl);
      if (
        env.NODE_ENV === 'production'
        && (parsed.protocol !== 'https:' || isLoopbackHostname(parsed.hostname))
      ) {
        errors.push(
          'MEDIA_PUBLIC_BASE_URL must use a non-loopback HTTPS origin in production'
        );
      }
    }
  }

  if (config.backend === 'cloudinary') {
    ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].forEach((key) => {
      if (!String(env[key] || '').trim()) {
        errors.push(`${key} is required for Cloudinary media storage`);
      }
    });
  }

  return { config, errors };
};

const safeSegment = (value, label) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!normalized || normalized.length > 80) {
    throw new Error(`${label} must contain 1-80 safe characters`);
  }
  return normalized;
};

const safeExtension = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!/^\.[a-z0-9]{1,10}$/.test(normalized)) {
    throw new Error('Media extension must be an explicit safe extension');
  }
  return normalized;
};

const assertWithinRoot = (root, candidate) => {
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Media object path escaped the configured upload root');
  }
};

const syncDirectory = async (directory) => {
  let handle;
  try {
    handle = await fs.open(directory, 'r');
    await handle.sync();
  } catch (error) {
    // Windows does not permit fsync on a directory handle. Production runs
    // on Linux, where a failed directory fsync remains a hard write failure.
    if (process.platform !== 'win32' || error.code !== 'EPERM') throw error;
  } finally {
    await handle?.close();
  }
};

const writeImmutableFile = async ({ root, relativePath, buffer }) => {
  const target = path.resolve(root, relativePath);
  assertWithinRoot(root, target);
  const directory = path.dirname(target);
  await fs.mkdir(directory, { recursive: true, mode: 0o750 });

  const temporary = path.join(
    directory,
    `.${path.basename(relativePath)}.${crypto.randomBytes(8).toString('hex')}.tmp`
  );
  assertWithinRoot(root, temporary);

  let handle;
  try {
    handle = await fs.open(temporary, 'wx', 0o640);
    await handle.writeFile(buffer);
    await handle.sync();
    await handle.close();
    handle = null;

    // Publishing with link(2), rather than rename(2), makes the
    // never-overwrite guarantee atomic: link fails with EEXIST if an object
    // already occupies the immutable key. The temporary and target are in the
    // same directory/filesystem.
    try {
      await fs.link(temporary, target);
    } catch (error) {
      if (error.code === 'EEXIST') {
        throw new Error('Refusing to overwrite an existing immutable media object');
      }
      throw error;
    }
    await fs.unlink(temporary);
    await syncDirectory(directory);
  } catch (error) {
    await handle?.close().catch(() => {});
    await fs.unlink(temporary).catch(() => {});
    throw error;
  }
};

const buildStorageMetadata = ({
  backend,
  service,
  objectKey,
  sha256,
  sizeBytes,
  contentType,
  localPath = null,
  publicId = null,
}) => ({
  storageVersion: STORAGE_VERSION,
  backend,
  service,
  objectKey,
  sha256,
  sizeBytes,
  contentType,
  localPath,
  publicId,
});

const storeMediaBuffer = async (
  buffer,
  {
    service,
    category,
    extension,
    contentType = 'application/octet-stream',
    cloudinaryFolder,
    cloudinaryResourceType = 'auto',
  } = {}
) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Media storage requires a non-empty Buffer');
  }

  const { config, errors } = validateMediaStorageConfig(process.env);
  if (errors.length > 0) {
    throw new Error(`Media storage configuration is invalid: ${errors.join('; ')}`);
  }

  const safeService = safeSegment(service, 'Media service');
  const safeCategory = safeSegment(category, 'Media category');
  const safeSuffix = safeExtension(extension);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const immutableId = crypto.randomUUID();
  const basename = `${immutableId}-${sha256.slice(0, 16)}`;
  const objectKey = `${safeService}/${safeCategory}/${basename}${safeSuffix}`;

  if (config.backend === 'cloudinary') {
    const result = await uploadBuffer(buffer, {
      folder: cloudinaryFolder || `menorah/${safeService}/${safeCategory}`,
      resource_type: cloudinaryResourceType,
      public_id: basename,
      overwrite: false,
      unique_filename: false,
      invalidate: false,
    });
    const publicId = result.public_id
      || `${cloudinaryFolder || `menorah/${safeService}/${safeCategory}`}/${basename}`;
    return {
      url: result.secure_url,
      metadata: buildStorageMetadata({
        backend: 'cloudinary',
        service: safeService,
        objectKey: publicId,
        sha256,
        sizeBytes: buffer.length,
        contentType,
        publicId,
      }),
    };
  }

  await writeImmutableFile({
    root: config.uploadRoot,
    relativePath: objectKey,
    buffer,
  });

  return {
    url: `${config.publicBaseUrl}/uploads/${objectKey}`,
    metadata: buildStorageMetadata({
      backend: 'local',
      service: safeService,
      objectKey,
      sha256,
      sizeBytes: buffer.length,
      contentType,
      localPath: objectKey,
    }),
  };
};

module.exports = {
  PRODUCTION_BACKEND,
  STORAGE_VERSION,
  normalizeBaseUrl,
  readMediaStorageConfig,
  storeMediaBuffer,
  validateMediaStorageConfig,
  writeImmutableFile,
};
