const express = require('express');
const request = require('supertest');

const userId = '64f000000000000000000001';
const mockFindById = jest.fn();

jest.mock('../../middleware/auth', () => ({
  auth: (req, _res, next) => {
    req.user = { _id: userId, role: 'user' };
    next();
  },
  patientAuth: (req, _res, next) => {
    req.user = { _id: userId, role: 'user' };
    next();
  },
  sharedParticipantAuth: (req, _res, next) => {
    req.user = { _id: userId, role: 'user' };
    next();
  },
}));

jest.mock('../../models/User', () => ({
  findById: (...args) => mockFindById(...args),
}));

jest.mock('../../models/Counsellor', () => ({
  findOne: jest.fn(),
}));

jest.mock('../../utils/cloudinary', () => ({
  uploadBuffer: jest.fn(),
}));

jest.mock('../../config/redis', () => ({
  getRedisClient: () => ({
    scan: jest.fn().mockResolvedValue({ cursor: '0', keys: [] }),
    del: jest.fn(),
  }),
}));

const usersRouter = require('../users');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/users', usersRouter);
  return app;
};

const makeUser = () => ({
  _id: userId,
  emergencyContact: {
    name: 'Old Contact',
    relationship: 'Friend',
    phone: '+971501111111',
  },
  save: jest.fn().mockResolvedValue(undefined),
});

describe('user emergency-contact replacement semantics', () => {
  beforeEach(() => {
    mockFindById.mockReset();
  });

  test('stores a complete contact with a trimmed E.164 phone number', async () => {
    const user = makeUser();
    mockFindById.mockResolvedValue(user);

    const response = await request(buildApp())
      .put('/api/users/emergency-contact')
      .send({
        name: '  Asha Rao  ',
        relationship: '  Sister ',
        phone: ' +971501234567 ',
      })
      .expect(200);

    expect(user.emergencyContact).toEqual({
      name: 'Asha Rao',
      relationship: 'Sister',
      phone: '+971501234567',
    });
    expect(user.save).toHaveBeenCalledTimes(1);
    expect(response.body.data.emergencyContact).toEqual(user.emergencyContact);
  });

  test.each([
    [{ name: '', relationship: '', phone: '' }],
    [{}],
  ])('clears an existing contact when every field is blank or omitted', async (payload) => {
    const user = makeUser();
    mockFindById.mockResolvedValue(user);

    const response = await request(buildApp())
      .put('/api/users/emergency-contact')
      .send(payload)
      .expect(200);

    expect(user.emergencyContact).toBeUndefined();
    expect(user.save).toHaveBeenCalledTimes(1);
    expect(response.body).toMatchObject({
      success: true,
      message: 'Emergency contact cleared successfully',
      data: { emergencyContact: null },
    });
  });

  test('rejects a partial contact instead of saving incomplete emergency data', async () => {
    const response = await request(buildApp())
      .put('/api/users/emergency-contact')
      .send({
        name: 'Asha Rao',
        relationship: '',
        phone: '+971501234567',
      })
      .expect(400);

    expect(response.body.errors[0].msg).toMatch(/name, relationship, and phone together/i);
    expect(mockFindById).not.toHaveBeenCalled();
  });

  test('rejects a complete contact whose phone is not E.164', async () => {
    const response = await request(buildApp())
      .put('/api/users/emergency-contact')
      .send({
        name: 'Asha Rao',
        relationship: 'Sister',
        phone: '0501234567',
      })
      .expect(400);

    expect(response.body.errors[0].msg).toMatch(/country code/i);
    expect(mockFindById).not.toHaveBeenCalled();
  });
});
