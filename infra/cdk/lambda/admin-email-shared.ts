import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import sanitizeHtml from 'sanitize-html';
import { getStaffJwtClaims, decodeJwtPayload } from './admin-session-shared';

export const EMAIL_CONTENT_VERSION = 2 as const;
export const BROADCAST_CONFIRMATION_PHRASE = 'SEND TO CUSTOMERS';
export const TEST_PROOF_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HTTPS_LINK_RE = /^https:\/\/.+/i;
const MERGE_TOKEN_RE = /\{\{\s*first_name\s*\}\}/g;
const BODY_RE = /<body\b[^>]*>([\s\S]*?)<\/body>/i;

const MAX_SUBJECT_LENGTH = 200;
const MAX_HTML_LENGTH = 100_000;

export type EmailContent = {
  version: typeof EMAIL_CONTENT_VERSION;
  html: string;
};

export type ParsedEmailDraft = {
  subject: string;
  content: EmailContent;
  contentHash: string;
};

export type EmailMergeContext = {
  firstName: string;
};

export type FanEmailRecipient = EmailMergeContext & {
  email: string;
};

const cognito = new CognitoIdentityProviderClient({});
const ses = new SESClient({});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractBodyHtml(html: string): string {
  const match = BODY_RE.exec(html);
  return match?.[1] ?? html;
}

function sanitizeEmailHtml(rawHtml: string): string {
  const bodyHtml = extractBodyHtml(rawHtml);
  return sanitizeHtml(bodyHtml, {
    allowedTags: [
      'a',
      'b',
      'blockquote',
      'br',
      'div',
      'em',
      'h1',
      'h2',
      'h3',
      'hr',
      'i',
      'img',
      'li',
      'ol',
      'p',
      'span',
      'strong',
      'table',
      'tbody',
      'td',
      'th',
      'thead',
      'tr',
      'u',
      'ul',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel', 'title'],
      img: ['src', 'alt', 'width', 'height'],
      td: ['align', 'colspan', 'rowspan'],
      th: ['align', 'colspan', 'rowspan'],
      p: ['align'],
      div: ['align'],
      table: ['align', 'cellpadding', 'cellspacing', 'width'],
      '*': ['style'],
    },
    allowedSchemes: ['https'],
    allowedSchemesByTag: {
      img: ['https'],
    },
    allowedStyles: {
      '*': {
        color: [/^#[0-9a-f]{3,8}$/i, /^rgb\(/i, /^rgba\(/i, /^[a-z]+$/i],
        'background-color': [/^#[0-9a-f]{3,8}$/i, /^rgb\(/i, /^rgba\(/i, /^[a-z]+$/i],
        'font-size': [/^\d+(\.\d+)?(px|em|rem|%)$/i],
        'font-weight': [/^(normal|bold|[1-9]00)$/i],
        'line-height': [/^\d+(\.\d+)?(px|em|rem|%)?$/i],
        'margin-bottom': [/^\d+(\.\d+)?(px|em|rem|%)$/i],
        'margin-top': [/^\d+(\.\d+)?(px|em|rem|%)$/i],
        'text-align': [/^(left|right|center)$/i],
        'text-decoration': [/^(none|underline)$/i],
      },
    },
    transformTags: {
      a: (tagName, attribs) => {
        const href = attribs.href?.trim() ?? '';
        if (!HTTPS_LINK_RE.test(href)) {
          return { tagName: 'span', attribs: {} };
        }
        return {
          tagName,
          attribs: {
            ...attribs,
            href,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
        };
      },
      img: (tagName, attribs) => {
        const src = attribs.src?.trim() ?? '';
        if (!HTTPS_LINK_RE.test(src)) {
          return { tagName: 'span', attribs: {} };
        }
        return { tagName, attribs: { ...attribs, src } };
      },
    },
  }).trim();
}

function htmlHasText(html: string): boolean {
  const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 0;
}

function getAttribute(user: UserType, name: string): string | null {
  const value = user.Attributes?.find((attr) => attr.Name === name)?.Value;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function localPart(email: string): string {
  const [local] = email.split('@');
  return local?.trim() || 'there';
}

function firstWord(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const [first] = value.trim().split(/\s+/);
  return first || null;
}

export function applyMergeTokens(
  value: string,
  context: EmailMergeContext,
  mode: 'html' | 'text' = 'text',
): string {
  const firstName = mode === 'html' ? escapeHtml(context.firstName) : context.firstName;
  return value.replace(MERGE_TOKEN_RE, firstName);
}

export function resolveFirstNameFromEmail(email: string): string {
  return firstWord(localPart(email)) ?? 'there';
}

function resolveFanFirstName(user: UserType, email: string): string {
  return (
    firstWord(getAttribute(user, 'given_name')) ??
    firstWord(getAttribute(user, 'name')) ??
    resolveFirstNameFromEmail(email)
  );
}

export function resolveStaffMergeContext(event: APIGatewayProxyEventV2, staffEmail: string): EmailMergeContext {
  const claims = getStaffJwtClaims(event);
  const givenName = typeof claims?.given_name === 'string' ? claims.given_name : null;
  const name = typeof claims?.name === 'string' ? claims.name : null;
  return {
    firstName: firstWord(givenName) ?? firstWord(name) ?? resolveFirstNameFromEmail(staffEmail),
  };
}

function htmlToPlainText(html: string): string {
  const normalized = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|li|tr)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ');
  return sanitizeHtml(normalized, { allowedTags: [], allowedAttributes: {} })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function validateEmailContent(raw: unknown): EmailContent | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  if (o.version !== EMAIL_CONTENT_VERSION || typeof o.html !== 'string') {
    return null;
  }

  const rawHtml = o.html.trim();
  if (rawHtml.length === 0 || rawHtml.length > MAX_HTML_LENGTH) {
    return null;
  }

  const html = sanitizeEmailHtml(rawHtml);
  if (html.length === 0 || html.length > MAX_HTML_LENGTH || !htmlHasText(html)) {
    return null;
  }

  return { version: EMAIL_CONTENT_VERSION, html };
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

export function renderEmailHtml(
  subject: string,
  content: EmailContent,
  mergeContext: EmailMergeContext = { firstName: 'there' },
): string {
  const renderedSubject = applyMergeTokens(subject, mergeContext, 'text');
  const renderedBody = applyMergeTokens(content.html, mergeContext, 'html');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(renderedSubject)}</title></head>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111; max-width: 640px; margin: 0 auto; padding: 24px;">
  <header style="margin-bottom: 24px;">
    <p style="font-size: 14px; color: #666; margin: 0;">RiffSync</p>
    <h1 style="font-size: 20px; margin: 8px 0 0;">${escapeHtml(renderedSubject)}</h1>
  </header>
  <main>${renderedBody}</main>
  <footer style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
    <p>You received this message because you have a RiffSync account. Visit <a href="https://riffsync.tv/account">riffsync.tv/account</a> to manage your profile.</p>
  </footer>
</body>
</html>`;
}

export function renderEmailPlainText(
  subject: string,
  content: EmailContent,
  mergeContext: EmailMergeContext = { firstName: 'there' },
): string {
  const renderedSubject = applyMergeTokens(subject, mergeContext, 'text');
  const renderedBody = applyMergeTokens(htmlToPlainText(content.html), mergeContext, 'text');
  const lines: string[] = ['RiffSync', renderedSubject, '', renderedBody, ''];
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
  return getAttribute(user, 'email');
}

export function extractFanRecipient(user: UserType): FanEmailRecipient | null {
  const email = extractFanEmail(user);
  if (!email) {
    return null;
  }
  return {
    email,
    firstName: resolveFanFirstName(user, email),
  };
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

export async function listEligibleFanRecipients(): Promise<FanEmailRecipient[]> {
  const userPoolId = process.env.FAN_USER_POOL_ID?.trim();
  if (!userPoolId) {
    throw new Error('FAN_USER_POOL_ID not configured');
  }

  const recipients = new Map<string, FanEmailRecipient>();
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
      const recipient = extractFanRecipient(user);
      if (recipient && !recipients.has(recipient.email)) {
        recipients.set(recipient.email, recipient);
      }
    }
    paginationToken = out.PaginationToken;
  } while (paginationToken);

  return [...recipients.values()];
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
