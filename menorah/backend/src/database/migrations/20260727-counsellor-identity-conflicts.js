/**
 * Move legacy pending applications that collide with an existing account into
 * manual review. The operation is deliberately idempotent: only applications
 * still marked `pending` are changed, so a human review decision is never
 * overwritten on subsequent deploys.
 */
module.exports = {
  async up({ mongoose }) {
    const db = mongoose.connection.db;
    const applications = db.collection('pendingapplications');
    const users = db.collection('users');
    const pending = await applications.find({ status: 'pending' }).toArray();
    const operations = [];

    for (const application of pending) {
      const clauses = [];
      if (application.email) clauses.push({ email: application.email });
      if (application.phone) clauses.push({ phone: application.phone });
      if (!clauses.length) continue;

      const matches = await users.find({ $or: clauses }, { projection: { email: 1, phone: 1 } }).toArray();
      if (!matches.length) continue;

      const emailConflict = Boolean(application.email && matches.some((user) => user.email === application.email));
      const phoneConflict = Boolean(application.phone && matches.some((user) => user.phone === application.phone));
      operations.push({
        updateOne: {
          filter: { _id: application._id, status: 'pending' },
          update: {
            $set: {
              status: 'manual_review',
              identityConflict: {
                hasConflict: true,
                email: emailConflict,
                phone: phoneConflict,
                detectedAt: new Date(),
              },
            },
          },
        },
      });
    }

    if (operations.length) await applications.bulkWrite(operations, { ordered: false });
    await applications.createIndex({ status: 1 });
  },
};
