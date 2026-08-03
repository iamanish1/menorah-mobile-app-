const mockCounsellorFind = jest.fn();
const mockCounsellorUpdateMany = jest.fn();
const mockUserUpdateMany = jest.fn();
const mockRecordSecurityEvent = jest.fn();
const mockBcryptHash = jest.fn();

jest.mock('../../models/Counsellor', () => ({
  find: (...args) => mockCounsellorFind(...args),
  updateMany: (...args) => mockCounsellorUpdateMany(...args),
}));

jest.mock('../../models/User', () => ({
  updateMany: (...args) => mockUserUpdateMany(...args),
}));

jest.mock('../securityAudit', () => ({
  recordSecurityEvent: (...args) => mockRecordSecurityEvent(...args),
}));

jest.mock('bcryptjs', () => ({
  hash: (...args) => mockBcryptHash(...args),
}));

const {
  DEFAULT_CLOCK_TOLERANCE_MINUTES,
  getCandidates,
  quarantineReviewedCandidates,
} = require('../../../scripts/audit-unsafe-counsellor-approvals');

const objectId = (value) => ({ toString: () => value });

const counsellorQuery = (value) => {
  const query = {
    select: jest.fn(() => query),
    populate: jest.fn(() => query),
    lean: jest.fn(async () => value),
  };
  return query;
};

describe('unsafe counsellor approval audit', () => {
  const originalArgv = process.argv;
  let consoleLogSpy;

  beforeEach(() => {
    process.argv = ['node', 'audit'];
    mockCounsellorFind.mockReset();
    mockCounsellorUpdateMany.mockReset();
    mockUserUpdateMany.mockReset();
    mockRecordSecurityEvent.mockReset();
    mockBcryptHash.mockReset();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  afterAll(() => {
    process.argv = originalArgv;
  });

  test('reports every meaningfully pre-existing account by default rather than requiring a day-old account', async () => {
    const now = Date.now();
    mockCounsellorFind.mockReturnValue(counsellorQuery([
      {
        _id: objectId('64f000000000000000000081'),
        approvedAt: new Date(now),
        user: {
          _id: objectId('64f000000000000000000001'),
          createdAt: new Date(now - (DEFAULT_CLOCK_TOLERANCE_MINUTES + 1) * 60 * 1000),
          role: 'counsellor',
          isActive: true,
        },
      },
      {
        _id: objectId('64f000000000000000000082'),
        approvedAt: new Date(now),
        user: {
          _id: objectId('64f000000000000000000002'),
          createdAt: new Date(now - 60 * 1000),
          role: 'counsellor',
          isActive: true,
        },
      },
    ]));

    const candidates = await getCandidates(DEFAULT_CLOCK_TOLERANCE_MINUTES);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      counsellorId: '64f000000000000000000081',
      userId: '64f000000000000000000001',
    });
  });

  test('confirmed quarantine deactivates accounts, revokes sessions, and emits an audit event without email reset', async () => {
    process.argv = ['node', 'audit', '--confirm-quarantine'];
    mockBcryptHash.mockResolvedValue('$2b$quarantine-password-hash');
    mockUserUpdateMany.mockResolvedValue({ modifiedCount: 1 });
    mockCounsellorUpdateMany.mockResolvedValue({ modifiedCount: 1 });
    const candidate = {
      counsellorId: '64f000000000000000000081',
      userId: '64f000000000000000000001',
      currentRole: 'counsellor',
    };

    await quarantineReviewedCandidates([candidate], new Set([candidate.counsellorId]));

    expect(mockUserUpdateMany).toHaveBeenCalledWith(
      { _id: { $in: [candidate.userId] } },
      expect.objectContaining({
        $inc: { sessionVersion: 1 },
        $set: expect.objectContaining({ isActive: false, password: '$2b$quarantine-password-hash' }),
      })
    );
    expect(mockCounsellorUpdateMany).toHaveBeenCalledWith(
      { _id: { $in: [candidate.counsellorId] } },
      expect.objectContaining({
        $set: expect.objectContaining({ isActive: false, isAvailable: false }),
      })
    );
    expect(mockRecordSecurityEvent).toHaveBeenCalledWith(
      'unsafe_counsellor_approval_quarantined',
      expect.objectContaining({ details: { action: 'legacy_approval_quarantine', targetId: candidate.counsellorId } })
    );
  });
});
