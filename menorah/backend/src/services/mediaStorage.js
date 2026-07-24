const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const {
  isExactRealServerStagingSyntheticRuntime,
} = require('../config/deploymentEnvironment');
const { uploadBuffer } = require('../utils/cloudinary');

const STORAGE_VERSION = 1;
const SUPPORTED_BACKENDS = new Set(['local', 'cloudinary']);
const PRODUCTION_BACKEND = 'local';
const SERVER_STAGING_CLOUDINARY_PREFIX =
  'menorah-staging/menorah-server-staging-v1';

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
    cloudinaryPrefix: String(env.CLOUDINARY_UPLOAD_PREFIX || '').trim(),
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

  const approvedServerStagingCloudinary = (
    config.backend === 'cloudinary'
    && isExactRealServerStagingSyntheticRuntime(env)
    && config.cloudinaryPrefix === SERVER_STAGING_CLOUDINARY_PREFIX
  );
  if (
    env.NODE_ENV === 'production'
    && config.backend !== PRODUCTION_BACKEND
    && !approvedServerStagingCloudinary
  ) {
    errors.push(
      'MEDIA_STORAGE_BACKEND must equal local in production except for the '
      + 'exact real synthetic server-staging Cloudinary contract'
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
      const value = String(env[key] || '').trim();
      if (
        !value
        || /^disabled-/i.test(value)
        || /(?:replace|placeholder|example|your[-_])/i.test(value)
      ) {
        errors.push(`${key} is required for Cloudinary media storage`);
      }
    });
    if (
      env.NODE_ENV === 'production'
      && config.cloudinaryPrefix !== SERVER_STAGING_CLOUDINARY_PREFIX
    ) {
      errors.push(
        `CLOUDINARY_UPLOAD_PREFIX must equal ${SERVER_STAGING_CLOUDINARY_PREFIX} `
        + 'for server-staging Cloudinary media'
      );
    }
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

const safeCloudinaryFolder = ({
  configuredPrefix,
  requestedFolder,
  service,
  category,
}) => {
  if (configuredPrefix !== SERVER_STAGING_CLOUDINARY_PREFIX) {
    throw new Error('Cloudinary staging prefix is not approved');
  }
  const requested = String(
    requestedFolder || `${service}/${category}`
  ).trim().replaceAll('\\', '/');
  const prefixWithSlash = `${configuredPrefix}/`;
  const relative = requested.startsWith(prefixWithSlash)
    ? requested.slice(prefixWithSlash.length)
    : (
      requested.startsWith('menorah/')
        ? requested.slice('menorah/'.length)
        : requested
    );
  const segments = relative.split('/');
  if (
    segments.length === 0
    || segments.some(
      (segment) => (
        !segment
        || segment === '.'
        || segment === '..'
        || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(segment)
      )
    )
  ) {
    throw new Error('Cloudinary folder must contain only safe relative segments');
  }
  return `${configuredPrefix}/${segments.join('/')}`;
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
    const approvedServerStagingCloudinary =
      isExactRealServerStagingSyntheticRuntime(process.env);
    const resolvedCloudinaryFolder = approvedServerStagingCloudinary
      ? safeCloudinaryFolder({
        configuredPrefix: config.cloudinaryPrefix,
        requestedFolder: cloudinaryFolder,
        service: safeService,
        category: safeCategory,
      })
      : (
        cloudinaryFolder
        || `menorah/${safeService}/${safeCategory}`
      );
    const result = await uploadBuffer(buffer, {
      folder: resolvedCloudinaryFolder,
      resource_type: cloudinaryResourceType,
      public_id: basename,
      overwrite: false,
      unique_filename: false,
      invalidate: false,
    });
    const publicId = String(
      result.public_id || `${resolvedCloudinaryFolder}/${basename}`
    );
    if (
      approvedServerStagingCloudinary
      && !publicId.startsWith(`${SERVER_STAGING_CLOUDINARY_PREFIX}/`)
    ) {
      throw new Error(
        'Cloudinary returned a public_id outside the approved server-staging prefix'
      );
    }
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
  SERVER_STAGING_CLOUDINARY_PREFIX,
  STORAGE_VERSION,
  normalizeBaseUrl,
  readMediaStorageConfig,
  safeCloudinaryFolder,
  storeMediaBuffer,
  validateMediaStorageConfig,
  writeImmutableFile,
};
