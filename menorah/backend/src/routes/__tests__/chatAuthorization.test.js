const express = require('express');
const request = require('supertest');

let mockAuthUser;
const mockChatRoomFind = jest.fn();
const mockChatRoomFindById = jest.fn();
const mockMessageFindOne = jest.fn();
const mockRedisGet = jest.fn();
const mockSocketTo = jest.fn();
const mockSocketEmit = jest.fn();

jest.mock('../../middleware/auth', () => ({
  auth: (req, _res, next) => {
    req.user = mockAuthUser;
    next();
  },
}));

jest.mock('../../models/ChatRoom', () => ({
  find: (...args) => mockChatRoomFind(...args),
  findById: (...args) => mockChatRoomFindById(...args),
}));

jest.mock('../../models/Message', () => ({
  findOne: (...args) => mockMessageFindOne(...args),
}));

jest.mock('../../models/Counsellor', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
}));

jest.mock('../../config/redis', () => ({
  getRedisClient: () => ({
    get: mockRedisGet,
  }),
}));

const chatRouter = require('../chat');

const objectId = (value) => ({ toString: () => value });
const userId = '64f000000000000000000001';
const counsellorUserId = '64f000000000000000000002';
const outsiderId = '64f000000000000000000003';
const roomId = '64f000000000000000000010';
const messageId = '64f000000000000000000020';

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.set('io', { to: mockSocketTo });
  app.use('/api/chat', chatRouter);
  return app;
};

const roomForUserAndCounsellor = {
  _id: objectId(roomId),
  user: objectId(userId),
  counsellor: {
    user: objectId(counsellorUserId),
  },
};

describe('chat authorization hardening', () => {
  beforeEach(() => {
    mockAuthUser = { _id: objectId(userId), role: 'user', firstName: 'Asha', lastName: 'User' };
    mockChatRoomFind.mockReset();
    mockChatRoomFindById.mockReset();
    mockMessageFindOne.mockReset();
    mockRedisGet.mockReset();
    mockSocketTo.mockReset().mockReturnValue({ emit: mockSocketEmit });
    mockSocketEmit.mockReset();
    chatRouter.setSocketIO({ to: mockSocketTo });
  });

  test('online-status only returns people sharing an active room with the requester', async () => {
    mockChatRoomFind.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          roomForUserAndCounsellor,
        ]),
      }),
    });
    mockRedisGet.mockImplementation((key) =>
      Promise.resolve(key === `presence:${counsellorUserId}` ? 'Dr Rao' : null)
    );

    const res = await request(buildApp())
      .get('/api/chat/online-status')
      .expect(200);

    expect(res.body.data.onlineStatus).toEqual([
      { userId: counsellorUserId, userName: 'Dr Rao', isOnline: true },
    ]);
    expect(mockRedisGet).toHaveBeenCalledWith(`presence:${counsellorUserId}`);
    expect(mockRedisGet).not.toHaveBeenCalledWith(`presence:${outsiderId}`);
  });

  test('delete requires the requester to be a member of the supplied room', async () => {
    mockAuthUser = { _id: objectId(outsiderId), role: 'user', firstName: 'Out', lastName: 'Sider' };
    mockChatRoomFindById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(roomForUserAndCounsellor),
    });

    await request(buildApp())
      .delete(`/api/chat/rooms/${roomId}/messages/${messageId}`)
      .expect(403);

    expect(mockMessageFindOne).not.toHaveBeenCalled();
    expect(mockSocketEmit).not.toHaveBeenCalled();
  });

  test('delete requires the message to belong to the supplied room before emitting', async () => {
    mockChatRoomFindById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(roomForUserAndCounsellor),
    });
    mockMessageFindOne.mockResolvedValue(null);

    await request(buildApp())
      .delete(`/api/chat/rooms/${roomId}/messages/${messageId}`)
      .expect(404);

    expect(mockMessageFindOne).toHaveBeenCalledWith({ _id: messageId, room: roomId });
    expect(mockSocketEmit).not.toHaveBeenCalled();
  });

  test('delete emits only after membership, room ownership, and sender checks pass', async () => {
    const message = {
      _id: objectId(messageId),
      room: objectId(roomId),
      sender: objectId(userId),
      softDelete: jest.fn().mockResolvedValue(undefined),
    };
    mockChatRoomFindById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(roomForUserAndCounsellor),
    });
    mockMessageFindOne.mockResolvedValue(message);

    await request(buildApp())
      .delete(`/api/chat/rooms/${roomId}/messages/${messageId}`)
      .expect(200);

    expect(message.softDelete).toHaveBeenCalledWith(mockAuthUser._id);
    expect(mockSocketTo).toHaveBeenCalledWith(`chat_${roomId}`);
    expect(mockSocketEmit).toHaveBeenCalledWith('message_deleted', expect.objectContaining({ messageId }));
  });
});
