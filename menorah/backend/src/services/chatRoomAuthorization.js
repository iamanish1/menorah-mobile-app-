const ChatRoom = require('../models/ChatRoom');
const {
  evaluateChatRoomAccess,
} = require('./sessionAuthorizationPolicy');

const CHAT_USER_FIELDS =
  'firstName lastName profileImage role isActive';
const CHAT_COUNSELLOR_AUTHORIZATION_FIELDS =
  '_id user status isActive professionalVerification';
const CHAT_BOOKING_AUTHORIZATION_FIELDS = [
  '_id',
  'user',
  'counsellor',
  'status',
  'paymentStatus',
  'paymentMethod',
  'isSubscriptionBooking',
  'paymentId',
  'razorpayOrderId',
  'transactionId',
  'orderStatus',
  'amountMinor',
  'currency',
  'pricing',
  'bookingAuthorization',
].join(' ');

const populateChatRoomAuthorizationQuery = (query) =>
  query
    .populate({
      path: 'user',
      select: CHAT_USER_FIELDS,
    })
    .populate({
      path: 'counsellor',
      select: CHAT_COUNSELLOR_AUTHORIZATION_FIELDS,
      populate: {
        path: 'user',
        select: CHAT_USER_FIELDS,
      },
    })
    .populate({
      path: 'booking',
      select: CHAT_BOOKING_AUTHORIZATION_FIELDS,
      transform: (booking, originalId) => (
        booking
        || (originalId ? { _id: originalId, authorizationRecordMissing: true } : null)
      ),
    });

const loadChatRoomAuthorization = async ({
  roomId,
  requesterUserId,
  now = new Date(),
  lean = false,
  ChatRoomModel = ChatRoom,
} = {}) => {
  let query = populateChatRoomAuthorizationQuery(
    ChatRoomModel.findById(roomId)
  );
  if (lean) query = query.lean();
  const room = await query;
  const access = evaluateChatRoomAccess({
    room,
    requesterUserId,
    now,
  });

  return { room, access };
};

const filterAuthorizedChatRooms = ({
  rooms,
  requesterUserId,
  now = new Date(),
} = {}) => (
  Array.isArray(rooms)
    ? rooms.filter((room) => evaluateChatRoomAccess({
      room,
      requesterUserId,
      now,
    }).allowed)
    : []
);

module.exports = {
  CHAT_USER_FIELDS,
  CHAT_BOOKING_AUTHORIZATION_FIELDS,
  CHAT_COUNSELLOR_AUTHORIZATION_FIELDS,
  filterAuthorizedChatRooms,
  loadChatRoomAuthorization,
  populateChatRoomAuthorizationQuery,
};
