const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const {
  createMediaManifest,
  verifyMediaManifest,
} = require('../mediaManifest');
const {
  verifyMediaReferences,
} = require('../mediaReferenceVerifier');

describe('media backup and database-reference contract', () => {
  let root;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'menorah-media-recovery-'));
    await fs.mkdir(path.join(root, 'user-profile', 'images'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const createFixture = async () => {
    const relativePath = 'user-profile/images/fixture.jpg';
    const bytes = Buffer.from('immutable-profile-image');
    await fs.writeFile(path.join(root, ...relativePath.split('/')), bytes);
    const manifest = await createMediaManifest(root, {
      createdAt: '2026-07-23T00:00:00.000Z',
    });
    const entry = manifest.entries[0];
    return {
      relativePath,
      manifest,
      metadata: {
        storageVersion: 1,
        backend: 'local',
        service: 'user-profile',
        objectKey: relativePath,
        sha256: entry.sha256,
        sizeBytes: entry.sizeBytes,
        contentType: 'image/jpeg',
        localPath: relativePath,
        publicId: null,
      },
    };
  };

  test('verifies every manifest byte and linked database reference', async () => {
    const fixture = await createFixture();
    const report = await verifyMediaReferences({
      root,
      manifest: fixture.manifest,
      requireLocalManaged: true,
      documents: {
        users: [{
          _id: 'user-1',
          profileImage: `https://media.example.test/uploads/${fixture.relativePath}`,
          profileImageStorage: fixture.metadata,
        }],
      },
    });

    expect(report).toEqual(expect.objectContaining({
      valid: true,
      referenceCount: 1,
      localReferenceCount: 1,
      cloudinaryReferenceCount: 0,
      manifestFileCount: 1,
    }));
    expect(report.referenceDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  test('fails closed when bytes are changed after the manifest is created', async () => {
    const fixture = await createFixture();
    await fs.writeFile(
      path.join(root, ...fixture.relativePath.split('/')),
      Buffer.from('tampered-profile-image')
    );

    await expect(verifyMediaManifest(root, fixture.manifest))
      .rejects.toThrow(/bytes differ/);
  });

  test('inventories legacy credential and recording URLs and rejects managed ones without metadata', async () => {
    const fixture = await createFixture();
    const report = await verifyMediaReferences({
      root,
      manifest: fixture.manifest,
      requireLocalManaged: true,
      documents: {
        counsellors: [{
          _id: 'counsellor-1',
          verificationDocuments: [{
            url: 'https://media.example.test/uploads/credentials/license.pdf',
          }],
        }],
        pendingApplications: [{
          _id: 'application-1',
          credentialEvidence: [
            { reference: 'opaque-provider-reference' },
            { reference: 'https://evidence.example.test/license.pdf' },
          ],
        }],
        bookings: [{
          _id: 'booking-1',
          videoCall: {
            recordingUrl: 'https://recordings.example.test/session.webm',
          },
        }],
      },
    });

    expect(report.referenceCount).toBe(3);
    expect(report.externalReferenceCount).toBe(2);
    expect(report.valid).toBe(false);
    expect(report.violations.join('; ')).toMatch(
      /verificationDocuments\.0\.url.*without immutable storage metadata/
    );
  });

  test.each([
    {
      name: 'missing metadata',
      url: 'https://media.example.test/uploads/user-profile/images/legacy.jpg',
      storage: null,
      expected: /without immutable storage metadata/,
    },
    {
      name: 'loopback URL',
      url: 'http://localhost:8080/uploads/user-profile/images/fixture.jpg',
      storage: 'fixture',
      expected: /loopback media URL/,
    },
    {
      name: 'Cloudinary-managed media',
      url: 'https://res.cloudinary.com/unit/image/upload/object.jpg',
      storage: {
        storageVersion: 1,
        backend: 'cloudinary',
        service: 'user-profile',
        objectKey: 'menorah/unit/object',
        sha256: 'a'.repeat(64),
        sizeBytes: 10,
        contentType: 'image/jpeg',
        publicId: 'menorah/unit/object',
      },
      expected: /absent from the production uploads recovery artifact/,
    },
  ])('rejects $name in a production recovery verification', async ({
    url,
    storage,
    expected,
  }) => {
    const fixture = await createFixture();
    const resolvedStorage = storage === 'fixture' ? fixture.metadata : storage;
    const report = await verifyMediaReferences({
      root,
      manifest: fixture.manifest,
      requireLocalManaged: true,
      documents: {
        users: [{
          _id: 'user-1',
          profileImage: url,
          profileImageStorage: resolvedStorage,
        }],
      },
    });

    expect(report.valid).toBe(false);
    expect(report.violations.join('; ')).toMatch(expected);
  });
});
