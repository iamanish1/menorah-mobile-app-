const socialAuthIndexes = [
  {
    name: 'socialAuth.googleSub_1',
    key: { 'socialAuth.googleSub': 1 },
    partialFilterExpression: { 'socialAuth.googleSub': { $type: 'string' } },
  },
  {
    name: 'socialAuth.appleSub_1',
    key: { 'socialAuth.appleSub': 1 },
    partialFilterExpression: { 'socialAuth.appleSub': { $type: 'string' } },
  },
];

const dropIndexIfExists = async (collection, name) => {
  try {
    await collection.dropIndex(name);
  } catch (error) {
    if (error.codeName !== 'IndexNotFound' && error.code !== 27) {
      throw error;
    }
  }
};

module.exports = {
  async up({ mongoose }) {
    const users = mongoose.connection.db.collection('users');

    await users.updateMany(
      { 'socialAuth.googleSub': null },
      { $unset: { 'socialAuth.googleSub': '' } }
    );
    await users.updateMany(
      { 'socialAuth.appleSub': null },
      { $unset: { 'socialAuth.appleSub': '' } }
    );

    for (const index of socialAuthIndexes) {
      await dropIndexIfExists(users, index.name);
      await users.createIndex(index.key, {
        name: index.name,
        unique: true,
        partialFilterExpression: index.partialFilterExpression,
      });
    }
  },
};
