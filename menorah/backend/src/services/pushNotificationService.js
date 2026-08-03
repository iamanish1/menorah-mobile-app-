const Booking = require('../models/Booking');
const PushNotification = require('../models/PushNotification');
const PushReceipt = require('../models/PushReceipt');
const User = require('../models/User');
const {
  disablePushDeviceById,
  listActivePushDevices,
} = require('./pushDeviceService');
const {
  getExpoPushReceipts,
  sendExpoPushMessages,
} = require('./expoPushClient');

const SESSION_REMINDER_LEAD_MS = 30 * 60 * 1000;
const PUSH_LEASE_MS = 2 * 60 * 1000;
const RECEIPT_DELAY_MS = 15 * 60 * 1000;
const MAX_DELIVERY_ATTEMPTS = 5;
const DEFAULT_BATCH_SIZE = 50;

const safeProviderCode = (value, fallback = 'PUSH_PROVIDER_ERROR') => (
  typeof value === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(value)
    ? value
    : fallback
);

const notificationData = (data = {}) => ({
  ...(typeof data.articleSlug === 'string' ? { articleSlug: data.articleSlug } : {}),
  ...(typeof data.bookingId === 'string' ? { bookingId: data.bookingId } : {}),
  ...(typeof data.roomId === 'string' ? { roomId: data.roomId } : {}),
  ...(['video', 'audio', 'chat'].includes(data.sessionType)
    ? { sessionType: data.sessionType }
    : {}),
});

const enqueueUserPushNotification = async (payload, {
  PushNotificationModel = PushNotification,
} = {}) => {
  const scheduledFor = payload.scheduledFor || new Date();
  return PushNotificationModel.findOneAndUpdate(
    { user: payload.user, eventKey: payload.eventKey },
    {
      $setOnInsert: {
        user: payload.user,
        eventKey: payload.eventKey,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        channelId: payload.channelId,
        data: notificationData(payload.data),
        status: 'queued',
        scheduledFor,
        nextAttemptAt: scheduledFor,
      },
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    }
  );
};

const enqueueArticlePublishedNotifications = async (article, {
  UserModel = User,
  PushNotificationModel = PushNotification,
} = {}) => {
  if (!article?._id || !article?.slug || article?.status !== 'published') return 0;

  const users = await UserModel.find({
    role: 'user',
    isActive: true,
    'notificationPreferences.push': { $ne: false },
  }).select('_id').lean();

  if (!users.length) return 0;
  const eventKey = `article:${article._id}:published`;
  const title = 'New article available';
  const body = String(article.title || 'A new Menorah article is ready to read.')
    .trim()
    .slice(0, 240);
  const scheduledFor = new Date();

  for (let offset = 0; offset < users.length; offset += 500) {
    const operations = users.slice(offset, offset + 500).map(({ _id }) => ({
      updateOne: {
        filter: { user: _id, eventKey },
        update: {
          $setOnInsert: {
            user: _id,
            eventKey,
            type: 'article',
            title,
            body,
            channelId: 'articles',
            data: { articleSlug: article.slug },
            status: 'queued',
            scheduledFor,
            nextAttemptAt: scheduledFor,
          },
        },
        upsert: true,
      },
    }));
    await PushNotificationModel.bulkWrite(operations, { ordered: false });
  }

  return users.length;
};

const enqueueUpcomingSessionReminders = async ({ now = new Date() } = {}, {
  BookingModel = Booking,
  PushNotificationModel = PushNotification,
} = {}) => {
  const reminderCutoff = new Date(now.getTime() + SESSION_REMINDER_LEAD_MS);
  const bookings = await BookingModel.find({
    status: 'confirmed',
    scheduledAt: { $gt: now, $lte: reminderCutoff },
  }).select('_id user sessionType scheduledAt').lean();

  for (const booking of bookings) {
    const scheduledAtKey = new Date(booking.scheduledAt).toISOString();
    await enqueueUserPushNotification({
      user: booking.user,
      eventKey: `booking:${booking._id}:reminder:30m:${scheduledAtKey}`,
      type: 'session',
      title: 'Session starting soon',
      body: 'Your booked session starts soon.',
      channelId: 'sessions',
      data: {
        bookingId: String(booking._id),
        sessionType: booking.sessionType,
      },
    }, { PushNotificationModel });
  }

  return bookings.length;
};

const retryDelayMs = (attempts) => Math.min(30, 2 ** Math.max(0, attempts - 1)) * 60 * 1000;

const markForRetry = async (notification, code, now, PushNotificationModel) => {
  const exhausted = notification.attempts >= MAX_DELIVERY_ATTEMPTS;
  await PushNotificationModel.updateOne(
    { _id: notification._id, status: 'processing' },
    {
      $set: {
        status: exhausted ? 'failed' : 'queued',
        leaseUntil: null,
        processedAt: exhausted ? now : null,
        nextAttemptAt: exhausted
          ? now
          : new Date(now.getTime() + retryDelayMs(notification.attempts)),
        lastErrorCode: safeProviderCode(code),
      },
    }
  );
};

const claimNotification = (now, PushNotificationModel) => PushNotificationModel
  .findOneAndUpdate(
    {
      status: 'queued',
      scheduledFor: { $lte: now },
      nextAttemptAt: { $lte: now },
    },
    {
      $set: {
        status: 'processing',
        leaseUntil: new Date(now.getTime() + PUSH_LEASE_MS),
      },
      $inc: { attempts: 1 },
    },
    { new: true, sort: { scheduledFor: 1, _id: 1 } }
  )
  .lean();

const processPushNotificationQueue = async ({
  now = new Date(),
  batchSize = DEFAULT_BATCH_SIZE,
} = {}, {
  PushNotificationModel = PushNotification,
  PushReceiptModel = PushReceipt,
  UserModel = User,
  listDevices = listActivePushDevices,
  disableDevice = disablePushDeviceById,
  sendMessages = sendExpoPushMessages,
} = {}) => {
  await PushNotificationModel.updateMany(
    {
      status: 'processing',
      leaseUntil: { $lte: now },
      attempts: { $gte: MAX_DELIVERY_ATTEMPTS },
    },
    {
      $set: {
        status: 'failed',
        leaseUntil: null,
        processedAt: now,
        lastErrorCode: 'PUSH_LEASE_EXHAUSTED',
      },
    }
  );
  await PushNotificationModel.updateMany(
    {
      status: 'processing',
      leaseUntil: { $lte: now },
      attempts: { $lt: MAX_DELIVERY_ATTEMPTS },
    },
    {
      $set: {
        status: 'queued',
        leaseUntil: null,
        nextAttemptAt: now,
        lastErrorCode: 'PUSH_LEASE_EXPIRED',
      },
    }
  );

  let processed = 0;
  for (; processed < batchSize; processed += 1) {
    const notification = await claimNotification(now, PushNotificationModel);
    if (!notification) break;

    const user = await UserModel.findOne({
      _id: notification.user,
      role: 'user',
      isActive: true,
      'notificationPreferences.push': { $ne: false },
    }).select('_id').lean();

    if (!user) {
      await PushNotificationModel.updateOne(
        { _id: notification._id, status: 'processing' },
        { $set: { status: 'skipped', leaseUntil: null, processedAt: now } }
      );
      continue;
    }

    const devices = await listDevices({ userId: notification.user });
    if (!devices.length) {
      await PushNotificationModel.updateOne(
        { _id: notification._id, status: 'processing' },
        { $set: { status: 'skipped', leaseUntil: null, processedAt: now } }
      );
      continue;
    }

    const messages = devices.map((device) => ({
      to: device.expoPushToken,
      sound: 'default',
      title: notification.title,
      body: notification.body,
      channelId: notification.channelId,
      priority: 'high',
      data: {
        notificationType: notification.type,
        eventId: String(notification._id),
        ...notificationData(notification.data),
      },
    }));

    let tickets;
    try {
      tickets = await sendMessages(messages);
    } catch (error) {
      await markForRetry(notification, error?.code, now, PushNotificationModel);
      continue;
    }

    let accepted = 0;
    let retryableFailure = false;
    for (let index = 0; index < tickets.length; index += 1) {
      const ticket = tickets[index];
      const device = devices[index];
      if (ticket?.status === 'ok' && ticket.id) {
        accepted += 1;
        await PushReceiptModel.updateOne(
          { receiptId: ticket.id },
          {
            $setOnInsert: {
              receiptId: ticket.id,
              notification: notification._id,
              device: device._id,
              status: 'pending',
              availableAt: new Date(now.getTime() + RECEIPT_DELAY_MS),
            },
          },
          { upsert: true, runValidators: true, setDefaultsOnInsert: true }
        );
        continue;
      }

      const providerCode = safeProviderCode(ticket?.details?.error);
      if (providerCode === 'DeviceNotRegistered') {
        await disableDevice({ deviceId: device._id });
      } else {
        retryableFailure = true;
      }
    }

    if (!accepted && retryableFailure) {
      await markForRetry(notification, 'PUSH_TICKETS_REJECTED', now, PushNotificationModel);
      continue;
    }

    await PushNotificationModel.updateOne(
      { _id: notification._id, status: 'processing' },
      {
        $set: {
          status: accepted ? 'sent' : 'skipped',
          leaseUntil: null,
          processedAt: now,
          lastErrorCode: null,
        },
      }
    );
  }

  return processed;
};

const processPushReceipts = async ({
  now = new Date(),
  batchSize = DEFAULT_BATCH_SIZE,
} = {}, {
  PushReceiptModel = PushReceipt,
  disableDevice = disablePushDeviceById,
  getReceipts = getExpoPushReceipts,
} = {}) => {
  await PushReceiptModel.updateMany(
    { status: 'pending', attempts: { $gte: MAX_DELIVERY_ATTEMPTS } },
    {
      $set: {
        status: 'failed',
        checkedAt: now,
        lastErrorCode: 'PUSH_RECEIPT_ATTEMPTS_EXHAUSTED',
      },
    }
  );
  const pending = await PushReceiptModel.find({
    status: 'pending',
    availableAt: { $lte: now },
    attempts: { $lt: MAX_DELIVERY_ATTEMPTS },
  })
    .select('+receiptId')
    .sort({ availableAt: 1 })
    .limit(batchSize)
    .lean();

  if (!pending.length) return 0;

  let receipts;
  try {
    receipts = await getReceipts(pending.map(({ receiptId }) => receiptId));
  } catch {
    await PushReceiptModel.updateMany(
      { _id: { $in: pending.map(({ _id }) => _id) } },
      {
        $inc: { attempts: 1 },
        $set: {
          availableAt: new Date(now.getTime() + 5 * 60 * 1000),
          lastErrorCode: 'PUSH_RECEIPT_TRANSPORT_FAILED',
        },
      }
    );
    return 0;
  }

  for (const pendingReceipt of pending) {
    const receipt = receipts[pendingReceipt.receiptId];
    if (!receipt) {
      await PushReceiptModel.updateOne(
        { _id: pendingReceipt._id, status: 'pending' },
        {
          $inc: { attempts: 1 },
          $set: { availableAt: new Date(now.getTime() + 5 * 60 * 1000) },
        }
      );
      continue;
    }

    const delivered = receipt.status === 'ok';
    const providerCode = delivered ? null : safeProviderCode(receipt?.details?.error);
    await PushReceiptModel.updateOne(
      { _id: pendingReceipt._id, status: 'pending' },
      {
        $inc: { attempts: 1 },
        $set: {
          status: delivered ? 'delivered' : 'failed',
          checkedAt: now,
          lastErrorCode: providerCode,
        },
      }
    );

    if (providerCode === 'DeviceNotRegistered') {
      await disableDevice({ deviceId: pendingReceipt.device });
    }
  }

  return pending.length;
};

module.exports = {
  DEFAULT_BATCH_SIZE,
  MAX_DELIVERY_ATTEMPTS,
  RECEIPT_DELAY_MS,
  SESSION_REMINDER_LEAD_MS,
  enqueueArticlePublishedNotifications,
  enqueueUpcomingSessionReminders,
  enqueueUserPushNotification,
  processPushNotificationQueue,
  processPushReceipts,
  safeProviderCode,
};
