const {
  _private: {
    authenticateSocketHandshake,
    createSocketSessionRevalidator,
    readSocketSessionRevalidationInterval,
    revalidateConnectedSockets,
  },
} = require('../createSocketServer');
const {
  signAdminToken,
  signUserToken,
} = require('../../../utils/authTokens');

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
    process.env = {
      ...originalEnv,
      JWT_SECRET: 's'.repeat(64),
      JWT_ISSUER: 'menorah-socket-test',
      NODE_ENV: 'test',
    };
    delete process.env.SOCKET_SESSION_REVALIDATION_INTERVAL_MS;
    delete process.env.WEB_SESSION_ORIGINS;
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

  test('accepts a current counsellor bearer token after professional-access validation', async () => {
    const account = {
      _id: USER_ID,
      firstName: 'Current',
      lastName: 'Counsellor',
      role: 'counsellor',
      isActive: true,
      sessionVersion: 2,
    };
    const evaluateCounsellorAccess = jest.fn(async () => ({ allowed: true }));
    const token = signUserToken(account);

    const result = await authenticateSocketHandshake({
      handshake: {
        auth: { token },
        headers: {},
      },
    }, {
      UserModel: {
        findById: jest.fn(() => userQuery(account)),
      },
      checkTokenBlocked: jest.fn(async () => false),
      evaluateCounsellorAccess,
    });

    expect(result).toMatchObject({
      ok: true,
      transport: 'bearer',
      user: account,
    });
    expect(result.decoded).toMatchObject({
      userId: USER_ID,
      role: 'counsellor',
      sessionVersion: 2,
    });
    expect(evaluateCounsellorAccess).toHaveBeenCalledWith({ account });
  });

  test.each([
    ['stale role', { role: 'user', sessionVersion: 2 }],
    ['stale session', { role: 'counsellor', sessionVersion: 3 }],
  ])('rejects a socket token with a %s before joining rooms', async (_label, stored) => {
    const token = signUserToken({
      _id: USER_ID,
      role: 'counsellor',
      sessionVersion: 2,
    });
    const account = {
      _id: USER_ID,
      firstName: 'Current',
      lastName: 'Account',
      isActive: true,
      ...stored,
    };

    const result = await authenticateSocketHandshake({
      handshake: {
        auth: { token },
        headers: {},
      },
    }, {
      UserModel: {
        findById: jest.fn(() => userQuery(account)),
      },
      checkTokenBlocked: jest.fn(async () => false),
      evaluateCounsellorAccess: jest.fn(async () => ({ allowed: true })),
    });

    expect(result).toEqual({
      ok: false,
      reason: 'account_binding_invalid',
      transport: 'bearer',
    });
  });

  test('rejects an admin bearer token on user and counsellor socket services', async () => {
    const token = signAdminToken({
      _id: USER_ID,
      role: 'admin',
      sessionVersion: 0,
    });
    const UserModel = {
      findById: jest.fn(),
    };

    const result = await authenticateSocketHandshake({
      handshake: {
        auth: { token },
        headers: {},
      },
    }, {
      UserModel,
      checkTokenBlocked: jest.fn(async () => false),
    });

    expect(result).toEqual({
      ok: false,
      reason: 'invalid_or_expired_token',
      transport: 'bearer',
    });
    expect(UserModel.findById).not.toHaveBeenCalled();
  });

  test('rejects an admin-origin cookie before token verification or account lookup', async () => {
    process.env.WEB_SESSION_ORIGINS = 'https://admin.example.com=admin';
    const token = signAdminToken({
      _id: USER_ID,
      role: 'admin',
      sessionVersion: 0,
    });
    const UserModel = {
      findById: jest.fn(),
    };
    const checkTokenBlocked = jest.fn();

    const result = await authenticateSocketHandshake({
      handshake: {
        auth: {},
        headers: {
          origin: 'https://admin.example.com',
          cookie: `__Host-menorah-admin=${token}`,
        },
      },
    }, {
      UserModel,
      checkTokenBlocked,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'unsupported_socket_role',
      transport: 'cookie',
    });
    expect(checkTokenBlocked).not.toHaveBeenCalled();
    expect(UserModel.findById).not.toHaveBeenCalled();
  });

  test('binds a counsellor cookie to the exact counsellor origin role', async () => {
    process.env.WEB_SESSION_ORIGINS = [
      'https://app.example.com=user',
      'https://counsellor.example.com=counsellor',
    ].join(',');
    const account = {
      _id: USER_ID,
      firstName: 'Current',
      lastName: 'Counsellor',
      role: 'counsellor',
      isActive: true,
      sessionVersion: 2,
    };
    const token = signUserToken(account);
    const UserModel = {
      findById: jest.fn(() => userQuery(account)),
    };
    const dependencies = {
      UserModel,
      checkTokenBlocked: jest.fn(async () => false),
      evaluateCounsellorAccess: jest.fn(async () => ({ allowed: true })),
    };

    const wrongOrigin = await authenticateSocketHandshake({
      handshake: {
        auth: {},
        headers: {
          origin: 'https://app.example.com',
          cookie: `__Host-menorah-user=${token}`,
        },
      },
    }, dependencies);
    const correctOrigin = await authenticateSocketHandshake({
      handshake: {
        auth: {},
        headers: {
          origin: 'https://counsellor.example.com',
          cookie: `__Host-menorah-counsellor=${token}`,
        },
      },
    }, dependencies);

    expect(wrongOrigin).toEqual({
      ok: false,
      reason: 'session_origin_role_mismatch',
      transport: 'cookie',
    });
    expect(correctOrigin).toMatchObject({
      ok: true,
      transport: 'cookie',
      user: account,
    });
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
