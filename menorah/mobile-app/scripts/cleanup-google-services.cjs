const { existsSync, readFileSync, rmSync } = require('node:fs');
const { resolve } = require('node:path');
const {
  DESTINATION_RELATIVE_PATH,
  MARKER_CONTENT,
  MARKER_RELATIVE_PATH,
} = require('./prepare-google-services.cjs');

function cleanupGoogleServices({
  projectRoot = resolve(__dirname, '..'),
  environment = process.env,
} = {}) {
  if (environment.EAS_BUILD_PLATFORM && environment.EAS_BUILD_PLATFORM !== 'android') {
    return { skipped: true, removed: false };
  }

  const marker = resolve(projectRoot, MARKER_RELATIVE_PATH);
  if (!existsSync(marker)) return { skipped: false, removed: false };
  if (readFileSync(marker, 'utf8') !== MARKER_CONTENT) {
    throw new Error('Refusing to clean an unrecognized Google Services preparation marker.');
  }

  const destination = resolve(projectRoot, DESTINATION_RELATIVE_PATH);
  rmSync(destination, { force: true });
  rmSync(marker, { force: true });
  return { skipped: false, removed: true };
}

if (require.main === module) {
  try {
    const result = cleanupGoogleServices();
    if (result.removed) {
      console.log('Temporary Google Services configuration removed.');
    }
  } catch {
    console.error('Temporary Google Services configuration cleanup failed.');
    process.exitCode = 1;
  }
}

module.exports = { cleanupGoogleServices };
