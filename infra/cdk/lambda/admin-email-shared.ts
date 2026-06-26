import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { getStaffJwtClaims, decodeJwtPayload } from './admin-session-shared';

export const EMAIL_CONTENT_VERSION = 1 as const;
export const BROADCAST_CONFIRMATION_PHRASE = 'SEND TO CUSTOMERS';
export const TEST_PROOF_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HTTPS_LINK_RE = /^https:\/\/.+/i;
const RIFFSYNC_LINK_RE = /^https:\/\/(www\.)?riffsync\.tv(\/|$)/i;

const MAX_SUBJECT_LENGTH = 200;
const MAX_BLOCKS = 50;
const MAX_INLINE_TEXT = 4000;
const MAX_LIST_ITEMS = 30;

export type InlineSpan =
  | { type: 'text'; text: string; bold?: boolean; italic?: boolean }
  | { type: 'link'; text: string; href: string; bold?: boolean; italic?: boolean };

export type EmailBlock =
  | { type: 'paragraph'; children: InlineSpan[] }
  | { type: 'heading'; level: 1 | 2 | 3; children: InlineSpan[] }
  | { type: 'bulletedList'; items: InlineSpan[][] }
  | { type: 'numberedList'; items: InlineSpan[][] };

export type EmailContent = {
  version: typeof EMAIL_CONTENT_VERSION;
  blocks: EmailBlock[];
};

export type ParsedEmailDraft = {
  subject: string;
  content: EmailContent;
  contentHash: string;
};

const cognito = new CognitoIdentityProviderClient({});
const ses = new SESClient({});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isValidLinkHref(href: string): boolean {
  const trimmed = href.trim();
  if (!HTTPS_LINK_RE.test(trimmed)) {
    return false;
  }
  if (RIFFSYNC_LINK_RE.test(trimmed)) {
    return true;
  }
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateInlineSpan(span: unknown, path: string): string | null {
  if (!span || typeof span !== 'object') {
    return `${path}: invalid span`;
  }
  const s = span as Record<string, unknown>;
  const type = s.type;
  if (type === 'text') {
    if (typeof s.text !== 'string') {
      return `${path}: text span requires text`;
    }
    if (s.text.length === 0 || s.text.length > MAX_INLINE_TEXT) {
      return `${path}: text length out of range`;
    }
    return null;
  }
  if (type === 'link') {
    if (typeof s.text !== 'string' || s.text.length === 0 || s.text.length > 500) {
      return `${path}: link text invalid`;
    }
    if (typeof s.href !== 'string' || !isValidLinkHref(s.href)) {
      return `${path}: link href must be https`;
    }
    return null;
  }
  return `${path}: unsupported span type`;
}

function validateInlineSpans(spans: unknown, path: string): string | null {
  if (!Array.isArray(spans)) {
    return `${path}: children must be an array`;
  }
  for (let i = 0; i < spans.length; i += 1) {
    const err = validateInlineSpan(spans[i], `${path}[${i}]`);
    if (err) {
      return err;
    }
  }
  return null;
}

export function validateEmailContent(raw: unknown): EmailContent | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  if (o.version !== EMAIL_CONTENT_VERSION) {
    return null;
  }
  if (!Array.isArray(o.blocks) || o.blocks.length === 0 || o.blocks.length > MAX_BLOCKS) {
    return null;
  }

  const blocks: EmailBlock[] = [];
  for (let i = 0; i < o.blocks.length; i += 1) {
    const block = o.blocks[i];
    if (!block || typeof block !== 'object') {
      return null;
    }
    const b = block as Record<string, unknown>;
    if (b.type === 'paragraph' || b.type === 'heading') {
      if (b.type === 'heading') {
        const level = b.level;
        if (level !== 1 && level !== 2 && level !== 3) {
          return null;
        }
      }
      const err = validateInlineSpans(b.children, `blocks[${i}].children`);
      if (err) {
        return null;
      }
      blocks.push(block as EmailBlock);
      continue;
    }
    if (b.type === 'bulletedList' || b.type === 'numberedList') {
      if (!Array.isArray(b.items) || b.items.length === 0 || b.items.length > MAX_LIST_ITEMS) {
        return null;
      }
      for (let j = 0; j < b.items.length; j += 1) {
        const err = validateInlineSpans(b.items[j], `blocks[${i}].items[${j}]`);
        if (err) {
          return null;
        }
      }
      blocks.push(block as EmailBlock);
      continue;
    }
    return null;
  }

  return { version: EMAIL_CONTENT_VERSION, blocks };
}

export function parseEmailDraft(body: Record<string, unknown>): ParsedEmailDraft | null {
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  if (subject.length === 0 || subject.length > MAX_SUBJECT_LENGTH) {
    return null;
  }
  const content = validateEmailContent(body.content);
  if (!content) {
    return null;
  }
  return { subject, content, contentHash: computeContentHash(subject, content) };
}

export function computeContentHash(subject: string, content: EmailContent): string {
  const payload = JSON.stringify({ subject, content });
  return createHash('sha256').update(payload).digest('hex');
}

function renderInlineSpanHtml(span: InlineSpan): string {
  let inner: string;
  if (span.type === 'link') {
    inner = `<a href="${escapeHtml(span.href.trim())}">${escapeHtml(span.text)}</a>`;
  } else {
    inner = escapeHtml(span.text);
  }
  if (span.bold) {
    inner = `<strong>${inner}</strong>`;
  }
  if (span.italic) {
    inner = `<em>${inner}</em>`;
  }
  return inner;
}

function renderInlineSpansHtml(spans: InlineSpan[]): string {
  return spans.map(renderInlineSpanHtml).join('');
}

function renderInlineSpanText(span: InlineSpan): string {
  const text = span.type === 'link' ? `${span.text} (${span.href})` : span.text;
  return text;
}

function renderInlineSpansText(spans: InlineSpan[]): string {
  return spans.map(renderInlineSpanText).join('');
}

export function renderEmailHtml(subject: string, content: EmailContent): string {
  const bodyParts: string[] = [];
  for (const block of content.blocks) {
    if (block.type === 'paragraph') {
      bodyParts.push(`<p>${renderInlineSpansHtml(block.children)}</p>`);
    } else if (block.type === 'heading') {
      const tag = block.level === 1 ? 'h1' : block.level === 2 ? 'h2' : 'h3';
      bodyParts.push(`<${tag}>${renderInlineSpansHtml(block.children)}</${tag}>`);
    } else if (block.type === 'bulletedList') {
      bodyParts.push(
        `<ul>${block.items.map((item) => `<li>${renderInlineSpansHtml(item)}</li>`).join('')}</ul>`,
      );
    } else if (block.type === 'numberedList') {
      bodyParts.push(
        `<ol>${block.items.map((item) => `<li>${renderInlineSpansHtml(item)}</li>`).join('')}</ol>`,
      );
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111; max-width: 640px; margin: 0 auto; padding: 24px;">
  <header style="margin-bottom: 24px;">
    <p style="font-size: 14px; color: #666; margin: 0;">RiffSync</p>
    <h1 style="font-size: 20px; margin: 8px 0 0;">${escapeHtml(subject)}</h1>
  </header>
  <main>${bodyParts.join('\n')}</main>
  <footer style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
    <p>You received this message because you have a RiffSync account. Visit <a href="https://riffsync.tv/account">riffsync.tv/account</a> to manage your profile.</p>
  </footer>
</body>
</html>`;
}

export function renderEmailPlainText(subject: string, content: EmailContent): string {
  const lines: string[] = [`RiffSync`, subject, ''];
  for (const block of content.blocks) {
    if (block.type === 'paragraph') {
      lines.push(renderInlineSpansText(block.children), '');
    } else if (block.type === 'heading') {
      lines.push(renderInlineSpansText(block.children).toUpperCase(), '');
    } else if (block.type === 'bulletedList') {
      for (const item of block.items) {
        lines.push(`- ${renderInlineSpansText(item)}`);
      }
      lines.push('');
    } else if (block.type === 'numberedList') {
      block.items.forEach((item, idx) => {
        lines.push(`${idx + 1}. ${renderInlineSpansText(item)}`);
      });
      lines.push('');
    }
  }
  lines.push(
    '---',
    'You received this message because you have a RiffSync account.',
    'Visit https://riffsync.tv/account to manage your profile.',
  );
  return lines.join('\n');
}

export function resolveStaffEmail(event: APIGatewayProxyEventV2): string | null {
  const claims = getStaffJwtClaims(event);
  if (typeof claims?.email === 'string' && claims.email.length > 0) {
    return claims.email.trim();
  }
  const auth = event.headers?.authorization ?? event.headers?.Authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    const email = decodeJwtPayload(auth.slice('Bearer '.length).trim())?.email;
    if (typeof email === 'string' && email.length > 0) {
      return email.trim();
    }
  }
  return null;
}

function fanUserIsEligible(user: UserType): boolean {
  if (user.Enabled === false) {
    return false;
  }
  const attrs = user.Attributes ?? [];
  let email = '';
  let emailVerified = false;
  for (const attr of attrs) {
    if (attr.Name === 'email' && typeof attr.Value === 'string') {
      email = attr.Value.trim();
    }
    if (attr.Name === 'email_verified' && attr.Value === 'true') {
      emailVerified = true;
    }
  }
  return emailVerified && email.length > 0 && email.length <= 254 && EMAIL_RE.test(email);
}

export function extractFanEmail(user: UserType): string | null {
  if (!fanUserIsEligible(user)) {
    return null;
  }
  const emailAttr = user.Attributes?.find((a) => a.Name === 'email');
  return typeof emailAttr?.Value === 'string' ? emailAttr.Value.trim() : null;
}

export async function countEligibleFanRecipients(): Promise<number> {
  const userPoolId = process.env.FAN_USER_POOL_ID?.trim();
  if (!userPoolId) {
    throw new Error('FAN_USER_POOL_ID not configured');
  }

  let count = 0;
  let paginationToken: string | undefined;
  do {
    const out = await cognito.send(
      new ListUsersCommand({
        UserPoolId: userPoolId,
        Limit: 60,
        PaginationToken: paginationToken,
      }),
    );
    for (const user of out.Users ?? []) {
      if (fanUserIsEligible(user)) {
        count += 1;
      }
    }
    paginationToken = out.PaginationToken;
  } while (paginationToken);

  return count;
}

export async function listEligibleFanRecipientEmails(): Promise<string[]> {
  const userPoolId = process.env.FAN_USER_POOL_ID?.trim();
  if (!userPoolId) {
    throw new Error('FAN_USER_POOL_ID not configured');
  }

  const emails: string[] = [];
  let paginationToken: string | undefined;
  do {
    const out = await cognito.send(
      new ListUsersCommand({
        UserPoolId: userPoolId,
        Limit: 60,
        PaginationToken: paginationToken,
      }),
    );
    for (const user of out.Users ?? []) {
      const email = extractFanEmail(user);
      if (email) {
        emails.push(email);
      }
    }
    paginationToken = out.PaginationToken;
  } while (paginationToken);

  return [...new Set(emails)];
}

export function createTestProof(sub: string, contentHash: string, testSentAt: string, secret: string): string {
  return createHmac('sha256', secret).update(`${sub}|${contentHash}|${testSentAt}`).digest('hex');
}

export function verifyTestProof(
  sub: string,
  contentHash: string,
  testSentAt: string,
  testProof: string,
  secret: string,
): boolean {
  if (!testSentAt || !testProof) {
    return false;
  }
  const sentMs = Date.parse(testSentAt);
  if (!Number.isFinite(sentMs) || Date.now() - sentMs > TEST_PROOF_MAX_AGE_MS) {
    return false;
  }
  const expected = createTestProof(sub, contentHash, testSentAt, secret);
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(testProof, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function sendRenderedEmail(options: {
  toAddresses: string[];
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const from = process.env.EMAIL_FROM_ADDRESS?.trim();
  if (!from || !from.includes('@')) {
    throw new Error('EMAIL_FROM_ADDRESS not configured');
  }
  const configurationSetName = process.env.SES_CONFIGURATION_SET_NAME?.trim();

  await ses.send(
    new SendEmailCommand({
      ...(configurationSetName ? { ConfigurationSetName: configurationSetName } : {}),
      Source: from,
      Destination: { ToAddresses: options.toAddresses },
      Message: {
        Subject: { Charset: 'UTF-8', Data: options.subject },
        Body: {
          Html: { Charset: 'UTF-8', Data: options.html },
          Text: { Charset: 'UTF-8', Data: options.text },
        },
      },
    }),
  );
}

export function customerEmailSendEnabled(): boolean {
  return process.env.ENABLE_ADMIN_CUSTOMER_EMAIL_SEND === 'true';
}

export function maxBroadcastRecipients(): number | null {
  const raw = process.env.MAX_BROADCAST_RECIPIENTS?.trim();
  if (!raw) {
    return null;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function logAdminEmailEvent(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event: 'admin_email', ...fields }));
}
