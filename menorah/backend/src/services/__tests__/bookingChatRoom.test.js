const { ensureBookingChatRoom } = require('../bookingChatRoom');

describe('ensureBookingChatRoom', () => {
  const booking = (overrides = {}) => ({
    _id: 'booking-1',
    user: { _id: 'user-1' },
    counsellor: { _id: 'counsellor-1' },
    chat: {},
    ...overrides,
  });

  test('links a booking to the durable user/counsellor conversation', async () => {
    const ChatRoomModel = {
      findOrCreate: jest.fn().mockResolvedValue({ _id: 'room-1' }),
    };
    const BookingModel = {
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    };

    await expect(ensureBookingChatRoom(booking(), {
      BookingModel,
      ChatRoomModel,
    })).resolves.toBe('room-1');

    expect(ChatRoomModel.findOrCreate).toHaveBeenCalledWith('user-1', 'counsellor-1');
    expect(BookingModel.updateOne).toHaveBeenCalledWith(
      { _id: 'booking-1' },
      { $set: { 'chat.roomId': 'room-1' } }
    );
  });

  test('does not rewrite an already-correct booking link', async () => {
    const ChatRoomModel = {
      findOrCreate: jest.fn().mockResolvedValue({ _id: 'room-1' }),
    };
    const BookingModel = { updateOne: jest.fn() };

    await ensureBookingChatRoom(booking({ chat: { roomId: 'room-1' } }), {
      BookingModel,
      ChatRoomModel,
    });

    expect(BookingModel.updateOne).not.toHaveBeenCalled();
  });

  test('waits for counsellor assignment instead of creating an invalid room', async () => {
    const ChatRoomModel = { findOrCreate: jest.fn() };
    const BookingModel = { updateOne: jest.fn() };

    await expect(ensureBookingChatRoom(booking({ counsellor: null }), {
      BookingModel,
      ChatRoomModel,
    })).resolves.toBeNull();

    expect(ChatRoomModel.findOrCreate).not.toHaveBeenCalled();
    expect(BookingModel.updateOne).not.toHaveBeenCalled();
  });
});
