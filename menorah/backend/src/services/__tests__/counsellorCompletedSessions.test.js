const {
  countCompletedSessions,
  countCompletedSessionsByCounsellor,
} = require('../counsellorCompletedSessions');

const objectId = (value) => ({ toString: () => value });

describe('counsellor completed-session counts', () => {
  test('counts only completed bookings for one counsellor', async () => {
    const counsellorId = objectId('counsellor-1');
    const BookingModel = {
      countDocuments: jest.fn().mockResolvedValue(7),
    };

    await expect(
      countCompletedSessions(counsellorId, { BookingModel })
    ).resolves.toBe(7);
    expect(BookingModel.countDocuments).toHaveBeenCalledWith({
      counsellor: counsellorId,
      status: 'completed',
    });
  });

  test('groups completed bookings for a counsellor list', async () => {
    const first = objectId('counsellor-1');
    const second = objectId('counsellor-2');
    const BookingModel = {
      aggregate: jest.fn().mockResolvedValue([
        { _id: first, count: 3 },
        { _id: second, count: 5 },
      ]),
    };

    const result = await countCompletedSessionsByCounsellor(
      [first, second, first],
      { BookingModel }
    );

    expect(result).toEqual(
      new Map([
        ['counsellor-1', 3],
        ['counsellor-2', 5],
      ])
    );
    expect(BookingModel.aggregate).toHaveBeenCalledWith([
      {
        $match: {
          counsellor: { $in: [first, second] },
          status: 'completed',
        },
      },
      {
        $group: {
          _id: '$counsellor',
          count: { $sum: 1 },
        },
      },
    ]);
  });

  test('does not query when no counsellors are supplied', async () => {
    const BookingModel = { aggregate: jest.fn() };

    await expect(
      countCompletedSessionsByCounsellor([], { BookingModel })
    ).resolves.toEqual(new Map());
    expect(BookingModel.aggregate).not.toHaveBeenCalled();
  });
});
