import nodemailer from 'nodemailer';

type SubmissionEmailInput = {
  subject: string;
  source: string;
  name: string;
  email: string;
  message?: string;
  fields?: Record<string, string | undefined>;
};

export type EmailDeliveryResult =
  | { sent: true; recipient: string; messageId?: string }
  | { sent: false; recipient: string; skippedReason: string };

const defaultRecipient = 'menorahenquiries@gmail.com';

function optionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
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

export async function sendSubmissionEmail(input: SubmissionEmailInput): Promise<EmailDeliveryResult> {
  const recipient = optionalEnv('CONTACT_TO_EMAIL') || defaultRecipient;
  const host = optionalEnv('SMTP_HOST');
  const user = optionalEnv('SMTP_USER');
  const pass = optionalEnv('SMTP_PASS');

  if (!host || !user || !pass) {
    return { sent: false, recipient, skippedReason: 'SMTP not configured.' };
  }

  const port = Number(optionalEnv('SMTP_PORT') || '587');
  const secure = (optionalEnv('SMTP_SECURE') || 'false').toLowerCase() === 'true';
  const from = optionalEnv('SMTP_FROM_EMAIL') || user;
  const rows = formatFields(input);
  const text = rows.map((r) => `${r.label}: ${r.value}`).join('\n');
  const htmlRows = rows
    .map(
      (r) =>
        `<tr><th align="left" style="padding:8px 12px;border-bottom:1px solid #eee;">${escapeHtml(r.label)}</th><td style="padding:8px 12px;border-bottom:1px solid #eee;">${escapeHtml(r.value).replaceAll('\n', '<br />')}</td></tr>`
    )
    .join('');

  const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  const result = await transporter.sendMail({
    from,
    to: recipient,
    replyTo: input.email,
    subject: input.subject,
    text,
    html: `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">${htmlRows}</table>`,
  });

  return { sent: true, recipient, messageId: result.messageId };
}
