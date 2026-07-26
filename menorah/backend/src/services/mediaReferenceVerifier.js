const crypto = require('crypto');
const {
  validateMediaManifest,
  verifyMediaManifest,
} = require('./mediaManifest');

const isLoopbackHostname = (hostname) => (
  hostname === 'localhost'
  || hostname === '0.0.0.0'
  || hostname === '::1'
  || hostname === '[::1]'
  || /^127(?:\.\d{1,3}){3}$/.test(hostname)
);

const compactReference = ({
  collection,
  id,
  field,
  url,
  storage = null,
}) => {
  const normalizedUrl = String(url || '').trim();
  if (!normalizedUrl) return null;
  return {
    collection,
    id: String(id || ''),
    field,
    url: normalizedUrl,
    storage: storage && typeof storage === 'object' ? storage : null,
  };
};

const collectMediaReferences = ({
  users = [],
  counsellors = [],
  brandAssets = [],
  socialPosts = [],
  articles = [],
  messages = [],
  pendingApplications = [],
  bookings = [],
} = {}) => {
  const references = [];
  const add = (reference) => {
    const compact = compactReference(reference);
    if (compact) references.push(compact);
  };

  users.forEach((document) => add({
    collection: 'users',
    id: document._id,
    field: 'profileImage',
    url: document.profileImage,
    storage: document.profileImageStorage,
  }));

  counsellors.forEach((document) => {
    add({
      collection: 'counsellors',
      id: document._id,
      field: 'profileImage',
      url: document.profileImage,
      storage: document.profileImageStorage,
    });
    add({
      collection: 'counsellors',
      id: document._id,
      field: 'voiceIntroUrl',
      url: document.voiceIntroUrl,
      storage: document.voiceIntroStorage,
    });
    (document.gallery || []).forEach((item, index) => add({
      collection: 'counsellors',
      id: document._id,
      field: `gallery.${index}.url`,
      url: item?.url,
      storage: item?.storage,
    }));
    (document.verificationDocuments || []).forEach((item, index) => add({
      collection: 'counsellors',
      id: document._id,
      field: `verificationDocuments.${index}.url`,
      url: item?.url,
      storage: item?.storage,
    }));
  });

  brandAssets.forEach((document) => add({
    collection: 'brandassets',
    id: document._id,
    field: 'url',
    url: document.url,
    storage: document.storage,
  }));

  socialPosts.forEach((document) => {
    add({
      collection: 'socialposts',
      id: document._id,
      field: 'imageUrl',
      url: document.imageUrl,
      storage: document.sourceImageStorage,
    });
    add({
      collection: 'socialposts',
      id: document._id,
      field: 'finalImageUrl',
      url: document.finalImageUrl,
      storage: document.finalImageStorage,
    });
    add({
      collection: 'socialposts',
      id: document._id,
      field: 'thumbnailUrl',
      url: document.thumbnailUrl,
      storage: document.thumbnailStorage,
    });
  });

  articles.forEach((document) => {
    add({
      collection: 'articles',
      id: document._id,
      field: 'coverImageUrl',
      url: document.coverImageUrl,
      storage: document.coverImageStorage,
    });
    (document.contentBlocks || []).forEach((block, index) => {
      if (block?.type !== 'image') return;
      add({
        collection: 'articles',
        id: document._id,
        field: `contentBlocks.${index}.url`,
        url: block.url,
        storage: block.storage,
      });
    });
  });

  messages.forEach((document) => add({
    collection: 'messages',
    id: document._id,
    field: 'attachment.url',
    url: document.attachment?.url,
    storage: document.attachment?.storage,
  }));

  pendingApplications.forEach((document) => {
    (document.credentialEvidence || []).forEach((item, index) => {
      if (!/^https?:\/\//i.test(String(item?.reference || '').trim())) return;
      add({
        collection: 'pendingapplications',
        id: document._id,
        field: `credentialEvidence.${index}.reference`,
        url: item.reference,
      });
    });
  });

  bookings.forEach((document) => add({
    collection: 'bookings',
    id: document._id,
    field: 'videoCall.recordingUrl',
    url: document.videoCall?.recordingUrl,
  }));

  references.sort((left, right) => (
    `${left.collection}:${left.id}:${left.field}`
      .localeCompare(`${right.collection}:${right.id}:${right.field}`)
  ));
  return references;
};

const parseUrl = (value) => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const referenceLabel = (reference) => (
  `${reference.collection}/${reference.id || '<missing-id>'}.${reference.field}`
);

const validateLocalReference = ({ reference, manifestEntries, violations }) => {
  const label = referenceLabel(reference);
  const metadata = reference.storage;
  const objectKey = String(metadata.objectKey || '');
  const parsed = parseUrl(reference.url);

  if (
    metadata.storageVersion !== 1
    || metadata.backend !== 'local'
    || !/^[a-z0-9-]+$/.test(String(metadata.service || ''))
    || !objectKey
    || objectKey.startsWith('/')
    || objectKey.includes('\\')
    || objectKey.split('/').some((segment) => !segment || segment === '.' || segment === '..')
    || metadata.localPath !== objectKey
    || !/^[0-9a-f]{64}$/.test(String(metadata.sha256 || ''))
    || !Number.isSafeInteger(metadata.sizeBytes)
    || metadata.sizeBytes < 1
  ) {
    violations.push(`${label} has invalid immutable local-storage metadata`);
    return;
  }

  if (!parsed || parsed.pathname !== `/uploads/${objectKey}`) {
    violations.push(`${label} URL does not match its immutable local object key`);
  }

  const entry = manifestEntries.get(objectKey);
  if (!entry) {
    violations.push(`${label} references ${objectKey}, which is absent from the uploads manifest`);
    return;
  }
  if (entry.sha256 !== metadata.sha256 || entry.sizeBytes !== metadata.sizeBytes) {
    violations.push(`${label} storage metadata does not match the uploads manifest bytes`);
  }
};

const verifyMediaReferences = async ({
  root,
  manifest,
  documents,
  requireLocalManaged = false,
}) => {
  validateMediaManifest(manifest);
  const manifestVerification = await verifyMediaManifest(root, manifest);
  const manifestEntries = new Map(manifest.entries.map((entry) => [entry.path, entry]));
  const references = collectMediaReferences(documents);
  const violations = [];
  const externalOrigins = new Set();
  let localReferenceCount = 0;
  let cloudinaryReferenceCount = 0;
  let externalReferenceCount = 0;

  for (const reference of references) {
    const label = referenceLabel(reference);
    const parsed = parseUrl(reference.url);
    if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) {
      violations.push(`${label} is not an absolute HTTP(S) URL`);
      continue;
    }
    if (isLoopbackHostname(parsed.hostname)) {
      violations.push(`${label} persists a loopback media URL`);
    }

    const isUploadsUrl = parsed.pathname.startsWith('/uploads/');
    if (reference.storage?.backend === 'local') {
      localReferenceCount += 1;
      validateLocalReference({ reference, manifestEntries, violations });
      continue;
    }

    if (reference.storage?.backend === 'cloudinary') {
      cloudinaryReferenceCount += 1;
      if (
        reference.storage.storageVersion !== 1
        || !/^[0-9a-f]{64}$/.test(String(reference.storage.sha256 || ''))
        || !Number.isSafeInteger(reference.storage.sizeBytes)
        || !reference.storage.publicId
      ) {
        violations.push(`${label} has invalid immutable Cloudinary metadata`);
      }
      if (requireLocalManaged) {
        violations.push(
          `${label} is Cloudinary-managed and is absent from the production uploads recovery artifact`
        );
      }
      continue;
    }

    if (reference.storage) {
      violations.push(`${label} names an unsupported media storage backend`);
      continue;
    }

    if (isUploadsUrl || parsed.hostname.endsWith('.cloudinary.com')) {
      violations.push(`${label} is managed media without immutable storage metadata`);
      continue;
    }

    externalReferenceCount += 1;
    externalOrigins.add(parsed.origin);
  }

  const normalizedViolations = Array.from(new Set(violations)).sort();
  const referenceDigest = crypto
    .createHash('sha256')
    .update(JSON.stringify(references.map((reference) => ({
      collection: reference.collection,
      id: reference.id,
      field: reference.field,
      url: reference.url,
      storage: reference.storage,
    }))))
    .digest('hex');

  return {
    schemaVersion: 1,
    verificationType: 'menorah-media-database-references',
    valid: normalizedViolations.length === 0,
    referenceCount: references.length,
    localReferenceCount,
    cloudinaryReferenceCount,
    externalReferenceCount,
    externalOrigins: Array.from(externalOrigins).sort(),
    referenceDigest,
    manifestEntriesSha256: manifest.entriesSha256,
    manifestFileCount: manifestVerification.fileCount,
    manifestTotalBytes: manifestVerification.totalBytes,
    violations: normalizedViolations,
  };
};

module.exports = {
  collectMediaReferences,
  verifyMediaReferences,
};
