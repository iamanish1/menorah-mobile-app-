const hasDesiredPhoneIndex = (index) => (
  index?.unique === true
  && index?.partialFilterExpression?.phone?.$type === 'string'
);

const ensurePartialPhoneIndex = async (users) => {
  const existing = (await users.indexes()).find((index) => index.name === 'phone_1');
  if (hasDesiredPhoneIndex(existing)) return;

  // The legacy unique index indexes null too. It must be removed *before*
  // synthetic provider phone values become null, otherwise the second update
  // would fail with a duplicate-key error.
  if (existing) await users.dropIndex(existing.name);

  await users.createIndex(
    { phone: 1 },
    {
      name: 'phone_1',
      unique: true,
      partialFilterExpression: { phone: { $type: 'string' } },
    }
  );
};

/**
 * Provider subjects were previously written into the phone field. Remove those
 * identifiers, allow a nullable phone for social accounts, and retain a
 * unique partial index for real phone numbers.
 */
module.exports = {
  async up({ mongoose }) {
    const users = mongoose.connection.db.collection('users');

    // Rebuild the index before writing null values. `ensurePartialPhoneIndex`
    // is safe to re-run after an interrupted deploy.
    const existing = (await users.indexes()).find((index) => index.name === 'phone_1');
    if (existing && !hasDesiredPhoneIndex(existing)) await users.dropIndex(existing.name);

    await users.updateMany(
      { phone: { $type: 'string', $regex: /^(google|apple):/ } },
      { $set: { phone: null, profileCompleted: false, isPhoneVerified: false } }
    );
    await users.updateMany(
      { profileCompleted: { $exists: false } },
      { $set: { profileCompleted: true } }
    );

    await ensurePartialPhoneIndex(users);
  },
};
