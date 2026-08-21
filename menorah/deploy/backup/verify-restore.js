const { execFileSync } = require('child_process');

const uri = process.env.MONGODB_RESTORE_TEST_URI;

if (!uri) {
  console.error('MONGODB_RESTORE_TEST_URI is required');
  process.exit(2);
}

const script = `
const required = ['users', 'bookings', 'counsellors', 'messages', 'chatrooms', 'articles'];
const collections = db.getCollectionNames();
const lower = collections.map((name) => name.toLowerCase());
const missing = required.filter((name) => !lower.includes(name));
const counts = {};
for (const name of collections) {
  counts[name] = db.getCollection(name).estimatedDocumentCount();
}
print(JSON.stringify({
  checkedAt: new Date().toISOString(),
  missingRequiredCollections: missing,
  counts
}, null, 2));
if (missing.length > 0) quit(1);
`;

try {
  execFileSync('mongosh', [uri, '--quiet', '--eval', script], { stdio: 'inherit' });
} catch (error) {
  process.exit(error.status || 1);
}
