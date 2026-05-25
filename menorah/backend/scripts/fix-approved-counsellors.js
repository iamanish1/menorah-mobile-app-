/**
 * One-time fix: marks all approved counsellors' User accounts as verified.
 *
 * Run from the backend folder:
 *   node scripts/fix-approved-counsellors.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Counsellor = require('../src/models/Counsellor');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/menorah');
  console.log('Connected.\n');

  const approved = await Counsellor.find({ status: 'approved' }).populate('user').lean();
  console.log(`Found ${approved.length} approved counsellor(s).`);

  let fixed = 0;
  for (const c of approved) {
    const user = await User.findById(c.user._id);
    if (!user) continue;
    let changed = false;
    if (!user.isEmailVerified) { user.isEmailVerified = true; changed = true; }
    if (!user.isPhoneVerified) { user.isPhoneVerified = true; changed = true; }
    if (changed) {
      await user.save();
      console.log(`  ✅ Fixed: ${user.email}`);
      fixed++;
    } else {
      console.log(`  ✓  Already OK: ${user.email}`);
    }
  }

  console.log(`\nDone. Fixed ${fixed} account(s).`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Script failed:', err.message);
  mongoose.disconnect();
  process.exit(1);
});
