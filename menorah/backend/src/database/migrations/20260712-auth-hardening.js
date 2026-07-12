const User = require('../../models/User');
const PaymentReceipt = require('../../models/PaymentReceipt');

module.exports = {
  async up() {
    await User.updateMany(
      { emailVerificationToken: { $exists: true, $ne: null } },
      { $unset: { emailVerificationToken: '' } }
    );

    await User.updateMany(
      { sessionVersion: { $exists: false } },
      { $set: { sessionVersion: 0 } }
    );

    await User.createIndexes();
    await PaymentReceipt.createIndexes();
  },
};
