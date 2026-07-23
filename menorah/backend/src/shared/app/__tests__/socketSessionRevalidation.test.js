const {
  _private: {
    createSocketSessionRevalidator,
    readSocketSessionRevalidationInterval,
    revalidateConnectedSockets,
  },
} = require('../createSocketServer');

const USER_ID = '64f000000000000000000071';

const userQuery = (user) => {
  const query = {
    select: jest.fn(() => query),
    lean: jest.fn(async () => user),
  };
  return query;
};

describe('Socket.IO live session revalidation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.SOCKET_SESSION_REVALIDATION_INTERVAL_MS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('disconnects a socket after session revocation', async () => {
    const revalidate = createSocketSessionRevalidator({
      UserModel: {
        findById: jest.fn(() => userQuery({
          _id: USER_ID,
          role: 'counsellor',
          isActive: false,
          sessionVersion: 4,
        })),
      },
      evaluateCounsellorAccess: jest.fn(),
    });

    await expect(revalidate({
      userId: USER_ID,
      userRole: 'counsellor',
      sessionVersion: 3,
    })).resolves.toBe(false);
  });

  test('checks current professional eligibility before accepting another event', async () => {
    const account = {
      _id: USER_ID,
      role: 'counsellor',
      isActive: true,
      sessionVersion: 3,
    };
    const evaluateCounsellorAccess = jest.fn(async () => ({
      allowed: false,
      reason: 'COUNSELLOR_VERIFICATION_EXPIRED',
    }));
    const revalidate = createSocketSessionRevalidator({
      UserModel: {
        findById: jest.fn(() => userQuery(account)),
      },
      evaluateCounsellorAccess,
    });

    await expect(revalidate({
      userId: USER_ID,
      userRole: 'counsellor',
      sessionVersion: 3,
    })).resolves.toBe(false);
    expect(evaluateCounsellorAccess).toHaveBeenCalledWith({ account });
  });

  test('keeps a current user socket without invoking counsellor policy', async () => {
    const account = {
      _id: USER_ID,
      role: 'user',
      isActive: true,
      sessionVersion: 2,
    };
    const evaluateCounsellorAccess = jest.fn();
    const revalidate = createSocketSessionRevalidator({
      UserModel: {
        findById: jest.fn(() => userQuery(account)),
      },
      evaluateCounsellorAccess,
    });

    await expect(revalidate({
      userId: USER_ID,
      userRole: 'user',
      sessionVersion: 2,
    })).resolves.toBe(true);
    expect(evaluateCounsellorAccess).not.toHaveBeenCalled();
  });

  test('a bounded-concurrency sweep disconnects invalid and errored sockets', async () => {
    const sockets = [
      { id: 'valid', disconnect: jest.fn() },
      { id: 'invalid', disconnect: jest.fn() },
      { id: 'error', disconnect: jest.fn() },
    ];
    const io = {
      sockets: {
        sockets: new Map(sockets.map((socket) => [socket.id, socket])),
      },
    };
    const errorSpy = jest.spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const revalidateSocket = jest.fn(async (socket) => {
      if (socket.id === 'error') throw new Error('database unavailable');
      return socket.id === 'valid';
    });

    try {
      await expect(revalidateConnectedSockets({
        io,
        revalidateSocket,
        concurrency: 2,
      })).resolves.toBe(3);
    } finally {
      errorSpy.mockRestore();
    }

    expect(sockets[0].disconnect).not.toHaveBeenCalled();
    expect(sockets[1].disconnect).toHaveBeenCalledWith(true);
    expect(sockets[2].disconnect).toHaveBeenCalledWith(true);
  });

  test('clamps a configurable periodic revalidation interval', () => {
    expect(readSocketSessionRevalidationInterval()).toBe(30000);
    process.env.SOCKET_SESSION_REVALIDATION_INTERVAL_MS = '1';
    expect(readSocketSessionRevalidationInterval()).toBe(5000);
    process.env.SOCKET_SESSION_REVALIDATION_INTERVAL_MS = '9999999';
    expect(readSocketSessionRevalidationInterval()).toBe(300000);
  });
});
