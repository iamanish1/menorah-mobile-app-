const Booking = require('../models/Booking');
const ChatRoom = require('../models/ChatRoom');

const identifierString = (value) => {
  if (typeof value === 'string') return value.trim() || null;
  if (value && typeof value.toHexString === 'function') return value.toHexString();
  if (value?._id && value._id !== value) return identifierString(value._id);
  return null;
};

/**
 * A user/counsellor conversation is intentionally stable across bookings and
 * devices. Bookings point at that durable room; the room itself is not scoped
 * to a single session, otherwise completing one booking would hide the shared
 * history from the next device or session.
 */
const ensureBookingChatRoom = async (
  booking,
  { BookingModel = Booking, ChatRoomModel = ChatRoom } = {}
) => {
  const bookingId = identifierString(booking);
  const userId = identifierString(booking?.user);
  const counsellorId = identifierString(booking?.counsellor);
  if (!bookingId || !userId || !counsellorId) return null;

  const room = await ChatRoomModel.findOrCreate(userId, counsellorId);
  const roomId = identifierString(room);
  if (!roomId) return null;

  if (identifierString(booking?.chat?.roomId) !== roomId) {
    await BookingModel.updateOne(
      { _id: bookingId },
      { $set: { 'chat.roomId': roomId } }
    );
  }

  return roomId;
};

module.exports = {
  ensureBookingChatRoom,
  identifierString,
};
