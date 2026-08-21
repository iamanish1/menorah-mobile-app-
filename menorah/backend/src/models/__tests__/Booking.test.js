const Booking = require('../Booking');

describe('Booking model indexes', () => {
  test('enforces one active assigned booking per counsellor slot', () => {
    const slotIndex = Booking.schema.indexes().find(([fields, options]) =>
      fields.counsellor === 1 &&
      fields.scheduledAt === 1 &&
      options?.unique === true
    );

    expect(slotIndex).toBeTruthy();
    expect(slotIndex[1].partialFilterExpression.status.$in).toEqual([
      'pending',
      'confirmed',
      'in-progress',
    ]);
  });
});
