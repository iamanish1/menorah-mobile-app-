const RESEND_EMAIL_URL = 'https://api.resend.com/emails';
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
    const response = await fetch(RESEND_EMAIL_URL, {
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
