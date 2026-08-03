const {
  enqueueArticlePublishedNotifications,
  enqueueUpcomingSessionReminders,
  enqueueUserPushNotification,
  processPushNotificationQueue,
} = require('../pushNotificationService');

const leanQuery = (value) => ({
  select: () => ({ lean: async () => value }),
});

describe('pushNotificationService', () => {
  test('fan-outs a newly published article once per eligible user', async () => {
    const bulkWrite = jest.fn().mockResolvedValue({});
    const UserModel = { find: jest.fn(() => leanQuery([{ _id: 'u1' }, { _id: 'u2' }])) };

    await expect(enqueueArticlePublishedNotifications({
      _id: 'article-1',
      slug: 'healthy-boundaries',
      title: 'Healthy boundaries',
      status: 'published',
    }, { UserModel, PushNotificationModel: { bulkWrite } })).resolves.toBe(2);

    const operations = bulkWrite.mock.calls[0][0];
    expect(operations).toHaveLength(2);
    expect(operations[0].updateOne.filter.eventKey).toBe('article:article-1:published');
    expect(operations[0].updateOne.update.$setOnInsert.data).toEqual({
      articleSlug: 'healthy-boundaries',
    });
  });

  test('queues only confirmed sessions inside the next 30 minutes', async () => {
    const now = new Date('2026-08-03T12:00:00.000Z');
    const BookingModel = {
      find: jest.fn(() => leanQuery([{
        _id: '507f1f77bcf86cd799439011',
        user: 'user-1',
        sessionType: 'video',
        scheduledAt: new Date('2026-08-03T12:20:00.000Z'),
      }])),
    };
    const findOneAndUpdate = jest.fn().mockResolvedValue({});

    await enqueueUpcomingSessionReminders({ now }, {
      BookingModel,
      PushNotificationModel: { findOneAndUpdate },
    });

    expect(BookingModel.find.mock.calls[0][0]).toEqual({
      status: 'confirmed',
      scheduledAt: {
        $gt: now,
        $lte: new Date('2026-08-03T12:30:00.000Z'),
      },
    });
    expect(findOneAndUpdate.mock.calls[0][0]).toEqual({
      user: 'user-1',
      eventKey: 'booking:507f1f77bcf86cd799439011:reminder:30m:2026-08-03T12:20:00.000Z',
    });
  });

  test('uses the user/event key upsert to prevent duplicate queued events', async () => {
    const findOneAndUpdate = jest.fn().mockResolvedValue({});
    await enqueueUserPushNotification({
      user: 'user-1',
      eventKey: 'chat-message:message-1',
      type: 'message',
      title: 'New message',
      body: 'Open Menorah to view your message.',
      channelId: 'messages',
      data: { roomId: '507f1f77bcf86cd799439011', ignored: 'private' },
    }, { PushNotificationModel: { findOneAndUpdate } });

    const [filter, update, options] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ user: 'user-1', eventKey: 'chat-message:message-1' });
    expect(update.$setOnInsert.data).toEqual({ roomId: '507f1f77bcf86cd799439011' });
    expect(options.upsert).toBe(true);
  });

  test('sends a generic message push and records its receipt', async () => {
    const now = new Date('2026-08-03T12:00:00.000Z');
    const notification = {
      _id: 'notification-1',
      user: 'user-1',
      type: 'message',
      title: 'New message',
      body: 'Open Menorah to view your message.',
      channelId: 'messages',
      data: { roomId: '507f1f77bcf86cd799439011' },
      attempts: 1,
    };
    let claimed = false;
    const PushNotificationModel = {
      updateMany: jest.fn().mockResolvedValue({}),
      updateOne: jest.fn().mockResolvedValue({}),
      findOneAndUpdate: jest.fn(() => ({
        lean: async () => {
          if (claimed) return null;
          claimed = true;
          return notification;
        },
      })),
    };
    const PushReceiptModel = { updateOne: jest.fn().mockResolvedValue({}) };
    const UserModel = { findOne: jest.fn(() => leanQuery({ _id: 'user-1' })) };
    const sendMessages = jest.fn().mockResolvedValue([{ status: 'ok', id: 'receipt-1' }]);

    await processPushNotificationQueue({ now }, {
      PushNotificationModel,
      PushReceiptModel,
      UserModel,
      listDevices: jest.fn().mockResolvedValue([{
        _id: 'device-1',
        expoPushToken: 'ExponentPushToken[redacted-in-production]',
      }]),
      disableDevice: jest.fn(),
      sendMessages,
    });

    expect(sendMessages.mock.calls[0][0][0]).toMatchObject({
      title: 'New message',
      body: 'Open Menorah to view your message.',
      channelId: 'messages',
      data: {
        notificationType: 'message',
        roomId: '507f1f77bcf86cd799439011',
      },
    });
    expect(PushReceiptModel.updateOne).toHaveBeenCalledWith(
      { receiptId: 'receipt-1' },
      expect.any(Object),
      expect.objectContaining({ upsert: true })
    );
  });
});
