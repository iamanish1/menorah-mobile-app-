// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readCallOrigins } = require('./call-origin-policy.cjs');

readCallOrigins(process.env.NEXT_PUBLIC_CALLS_URL, { required: true });
console.log('Public runtime call origin validated.');
