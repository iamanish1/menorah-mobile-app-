const CANONICAL_RESEND_EMAIL_URL = 'https://api.resend.com/emails';
const LOCAL_STAGING_RESEND_EMAIL_URL =
  'http://mail-capture:8025/emails';
const SERVER_STAGING_RESEND_EMAIL_URL =
  'http://staging-mail-capture:8025/emails';
const LOCAL_STAGING_ENVIRONMENT_ID = 'menorah-local-staging-v1';
const SERVER_STAGING_ENVIRONMENT_ID = 'menorah-server-staging-v1';
const LOCAL_STAGING_HTTPS_PORT = '28443';
const SERVER_STAGING_PROJECTS = new Set([
  'menorah-staging',
  'menorah-server-staging-validation',
]);
const LOCAL_STAGING_RESEND_KEY_PATTERN =
  /^re_local_[A-Za-z0-9_-]{32,}$/;
const SERVER_STAGING_RESEND_KEY_PATTERN =
  /^re_server_staging_[A-Za-z0-9_-]{32,}$/;
const EXTERNAL_RESEND_KEY_PATTERN =
  /^re_[A-Za-z0-9_-]{32,}$/;
const dnsHostPattern =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

type SubmissionEmailInput = {
  subject: string;
  source: string;
  name: string;
  email: string;
  idempotencyKey: string;
  message?: string;
  fields?: Record<string, string | undefined>;
};

export type EmailDeliveryResult =
  | { sent: true; provider: 'resend'; recipient: string; messageId?: string }
  | { sent: false; provider: 'resend'; recipient: string; skippedReason: string };

function optionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function isPlaceholder(value: string) {
  const normalized = value.toLowerCase();
  return (
    normalized.startsWith('replace') ||
    normalized.includes('replace_with') ||
    normalized.startsWith('local_') ||
    normalized.includes('@localhost')
  );
}

function getBareEmailDomain(value: string) {
  const match = value.trim().match(/^([^@<>\s]+)@([^@<>\s]+)$/);
  if (!match || !dnsHostPattern.test(match[2])) return undefined;
  return match[2];
}

function getSenderEmailDomain(value: string) {
  const sender = value.trim();
  const displayNameMatch = sender.match(/^[^<>\r\n]+<([^<>\s]+)>$/);
  return getBareEmailDomain(displayNameMatch ? displayNameMatch[1] : sender);
}

function isExactRealServerStagingResendSandbox(
  apiKey: string,
  deploymentEnvironment: string
) {
  return (
    process.env.NODE_ENV === 'production'
    && deploymentEnvironment === 'staging'
    && optionalEnv('SERVICE_RUNTIME') === 'server-staging'
    && optionalEnv('MENORAH_SYNTHETIC_DATA_ONLY') === 'true'
    && !optionalEnv('MENORAH_LOCAL_STAGING_ENVIRONMENT_ID')
    && !optionalEnv('MENORAH_LOCAL_STAGING_HTTPS_PORT')
    && optionalEnv('MENORAH_SERVER_STAGING_ENVIRONMENT_ID')
      === SERVER_STAGING_ENVIRONMENT_ID
    && optionalEnv('MENORAH_SERVER_STAGING_PROJECT_NAME')
      === 'menorah-staging'
    && optionalEnv('MENORAH_SERVER_STAGING_HTTPS_PORT') === '38443'
    && optionalEnv('MENORAH_STAGING_EMAIL_DOMAIN')
      === 'mail.staging.menorah.me'
    && optionalEnv('RESEND_PROVIDER_ENABLED') === 'true'
    && optionalEnv('RESEND_MODE') === 'sandbox'
    && EXTERNAL_RESEND_KEY_PATTERN.test(apiKey)
    && !LOCAL_STAGING_RESEND_KEY_PATTERN.test(apiKey)
    && !SERVER_STAGING_RESEND_KEY_PATTERN.test(apiKey)
  );
}

function resolveResendEmailUrl(
  apiKey: string,
  deploymentEnvironment: string
) {
  const configured = optionalEnv('RESEND_API_URL');
  if (!configured) {
    if (
      optionalEnv('MENORAH_SERVER_STAGING_ENVIRONMENT_ID')
      || optionalEnv('MENORAH_SERVER_STAGING_PROJECT_NAME')
    ) {
      return undefined;
    }
    if (
      apiKey.startsWith('re_local_')
      || apiKey.startsWith('re_server_staging_')
    ) {
      return undefined;
    }
    return CANONICAL_RESEND_EMAIL_URL;
  }
  const exactLocalIdentity = (
    configured === LOCAL_STAGING_RESEND_EMAIL_URL
    && process.env.NODE_ENV === 'production'
    && deploymentEnvironment === 'staging'
    && !optionalEnv('MENORAH_SERVER_STAGING_ENVIRONMENT_ID')
    && !optionalEnv('MENORAH_SERVER_STAGING_PROJECT_NAME')
    && optionalEnv('MENORAH_LOCAL_STAGING_ENVIRONMENT_ID')
      === LOCAL_STAGING_ENVIRONMENT_ID
    && optionalEnv('MENORAH_LOCAL_STAGING_HTTPS_PORT')
      === LOCAL_STAGING_HTTPS_PORT
    && optionalEnv('MENORAH_STAGING_EMAIL_DOMAIN')
      === 'mail.staging.localhost'
    && LOCAL_STAGING_RESEND_KEY_PATTERN.test(apiKey)
  );
  const exactServerIdentity = (
    configured === SERVER_STAGING_RESEND_EMAIL_URL
    && process.env.NODE_ENV === 'production'
    && deploymentEnvironment === 'staging'
    && !optionalEnv('MENORAH_LOCAL_STAGING_ENVIRONMENT_ID')
    && !optionalEnv('MENORAH_LOCAL_STAGING_HTTPS_PORT')
    && optionalEnv('MENORAH_SERVER_STAGING_ENVIRONMENT_ID')
      === SERVER_STAGING_ENVIRONMENT_ID
    && SERVER_STAGING_PROJECTS.has(
      optionalEnv('MENORAH_SERVER_STAGING_PROJECT_NAME') || ''
    )
    && optionalEnv('MENORAH_STAGING_EMAIL_DOMAIN')
      === 'mail.staging.menorah.me'
    && SERVER_STAGING_RESEND_KEY_PATTERN.test(apiKey)
  );
  if (exactLocalIdentity) return LOCAL_STAGING_RESEND_EMAIL_URL;
  if (exactServerIdentity) return SERVER_STAGING_RESEND_EMAIL_URL;
  if (
    configured === CANONICAL_RESEND_EMAIL_URL
    && isExactRealServerStagingResendSandbox(
      apiKey,
      deploymentEnvironment
    )
  ) {
    return CANONICAL_RESEND_EMAIL_URL;
  }
  return undefined;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatFields(input: SubmissionEmailInput) {
  const rows: Record<string, string> = {
    Source: input.source,
    Name: input.name,
    Email: input.email,
    ...(input.fields || {}),
    Message: input.message || '',
  };
  return Object.entries(rows)
    .filter(([, value]) => value)
    .map(([label, value]) => ({ label, value: value || '' }));
}

function buildEmailHtml(input: SubmissionEmailInput) {
  const rows = formatFields(input)
    .map(
      ({ label, value }) =>
        `<tr><th align="left" style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#111827;">${escapeHtml(label)}</th><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151;">${escapeHtml(value).replaceAll('\n', '<br />')}</td></tr>`
    )
    .join('');

  return `
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;width:100%;max-width:680px;">
      <tbody>${rows}</tbody>
    </table>
  `;
}

function buildEmailText(input: SubmissionEmailInput) {
  return formatFields(input)
    .map(({ label, value }) => `${label}: ${value}`)
    .join('\n');
}

export async function sendSubmissionEmail(input: SubmissionEmailInput): Promise<EmailDeliveryResult> {
  const recipient = optionalEnv('CONTACT_TO_EMAIL');
  const apiKey = optionalEnv('RESEND_API_KEY');
  const from = optionalEnv('EMAIL_FROM');

  if (!recipient || isPlaceholder(recipient)) {
    return {
      sent: false,
      provider: 'resend',
      recipient: recipient || '',
      skippedReason: 'CONTACT_TO_EMAIL is not configured.',
    };
  }

  if (!apiKey || isPlaceholder(apiKey)) {
    return { sent: false, provider: 'resend', recipient, skippedReason: 'RESEND_API_KEY is not configured.' };
  }

  if (!from || isPlaceholder(from)) {
    return { sent: false, provider: 'resend', recipient, skippedReason: 'EMAIL_FROM is not configured.' };
  }

  const deploymentEnvironment =
    optionalEnv('DEPLOYMENT_ENVIRONMENT') || 'production';
  if (!['production', 'staging'].includes(deploymentEnvironment)) {
    return {
      sent: false,
      provider: 'resend',
      recipient,
      skippedReason: 'DEPLOYMENT_ENVIRONMENT is invalid.',
    };
  }
  const resendEmailUrl = resolveResendEmailUrl(
    apiKey,
    deploymentEnvironment
  );
  if (!resendEmailUrl) {
    return {
      sent: false,
      provider: 'resend',
      recipient,
      skippedReason: 'Email delivery endpoint is not approved.',
    };
  }

  if (deploymentEnvironment === 'staging') {
    const stagingEmailDomain = optionalEnv('MENORAH_STAGING_EMAIL_DOMAIN');
    const hasValidStagingDomain =
      stagingEmailDomain
      && dnsHostPattern.test(stagingEmailDomain)
      && stagingEmailDomain.split('.').includes('staging');
    if (
      !hasValidStagingDomain
      || getBareEmailDomain(recipient) !== stagingEmailDomain
      || getSenderEmailDomain(from) !== stagingEmailDomain
    ) {
      return {
        sent: false,
        provider: 'resend',
        recipient,
        skippedReason: 'Staging email routing is not isolated.',
      };
    }
  }

  try {
    const response = await fetch(resendEmailUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        reply_to: input.email,
        subject: input.subject,
        html: buildEmailHtml(input),
        text: buildEmailText(input),
      }),
    });

    const result = (await response.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };

    if (!response.ok) {
      return {
        sent: false,
        provider: 'resend',
        recipient,
        skippedReason: result.message || result.name || `Resend request failed with status ${response.status}.`,
      };
    }

    return { sent: true, provider: 'resend', recipient, messageId: result.id };
  } catch (error) {
    return {
      sent: false,
      provider: 'resend',
      recipient,
      skippedReason: error instanceof Error ? error.message : 'Resend request failed.',
    };
  }
}
