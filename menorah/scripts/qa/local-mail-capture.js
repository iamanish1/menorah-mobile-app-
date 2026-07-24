const { execFileSync } = require('node:child_process');

const PROJECT = 'menorah-local-staging';
const SERVICE = 'mail-capture';
const CONFIRMATION = 'USE_INTERNAL_SYNTHETIC_OTP_CAPTURE';
const SYNTHETIC_EMAIL_SUFFIX = '@mail.staging.localhost';

const requireConfirmation = (env = process.env) => {
  if (env.QA_LOCAL_STAGING_MAIL_CAPTURE_CONFIRM !== CONFIRMATION) {
    throw new Error(
      'Local mail capture requires the exact synthetic OTP confirmation'
    );
  }
};

const findContainer = ({ execute = execFileSync } = {}) => {
  const output = execute('docker', [
    'ps',
    '--filter',
    `label=com.docker.compose.project=${PROJECT}`,
    '--filter',
    `label=com.docker.compose.service=${SERVICE}`,
    '--format',
    '{{.ID}}',
  ], {
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
  const containerIds = output.split(/\r?\n/).filter(Boolean);
  if (containerIds.length !== 1) {
    throw new Error('Expected exactly one isolated local mail-capture container');
  }
  return containerIds[0];
};

const executeCaptureAction = (
  action,
  recipient = '',
  {
    env = process.env,
    execute = execFileSync,
  } = {}
) => {
  requireConfirmation(env);
  if (
    recipient
    && (
      recipient !== recipient.trim().toLowerCase()
      || !recipient.endsWith(SYNTHETIC_EMAIL_SUFFIX)
    )
  ) {
    throw new Error('Mail capture accepts only an exact synthetic recipient');
  }

  const source = `
    const [action, recipient] = process.argv.slice(1);
    const headers = {
      Authorization: \`Bearer \${process.env.MAIL_CAPTURE_API_KEY}\`,
    };
    const endpoint = 'http://127.0.0.1:8025/control/messages';
    if (action === 'clear') {
      const response = await fetch(endpoint, { method: 'DELETE', headers });
      if (response.status !== 204) process.exit(2);
      process.exit(0);
    }
    const response = await fetch(
      \`\${endpoint}?recipient=\${encodeURIComponent(recipient)}\`,
      { headers },
    );
    if (!response.ok) process.exit(3);
    const payload = await response.json();
    const message = payload?.data?.at(-1);
    const matches = String(message?.html || message?.text || '')
      .match(/(?:^|\\D)(\\d{6})(?!\\d)/g);
    const otp = matches?.at(-1)?.match(/\\d{6}/)?.[0];
    if (!otp) process.exit(4);
    process.stdout.write(otp);
  `;
  return execute('docker', [
    'exec',
    '-i',
    findContainer({ execute }),
    'node',
    '--input-type=module',
    '--eval',
    source,
    action,
    recipient,
  ], {
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
};

const clearSyntheticMessages = (options) => {
  executeCaptureAction('clear', '', options);
};

const readLatestSyntheticOtp = (recipient, options) => {
  const otp = executeCaptureAction('read', recipient, options);
  if (!/^\d{6}$/.test(otp)) {
    throw new Error('Mail capture did not return a bounded synthetic OTP');
  }
  return otp;
};

module.exports = {
  CONFIRMATION,
  PROJECT,
  SERVICE,
  clearSyntheticMessages,
  findContainer,
  readLatestSyntheticOtp,
  requireConfirmation,
};
