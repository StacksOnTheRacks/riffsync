import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const secrets = new SecretsManagerClient({});
const ses = new SESClient({});

type Routing = { notifyEmail: string; fromEmail: string };

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}

async function loadRouting(secretArn: string): Promise<Routing | null> {
  let raw: string | undefined;
  try {
    const out = await secrets.send(new GetSecretValueCommand({ SecretId: secretArn }));
    raw = out.SecretString;
  } catch (e) {
    console.error('Secrets Manager read failed', e);
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  const notifyEmail = typeof o.notifyEmail === 'string' ? o.notifyEmail.trim() : '';
  const fromEmail = typeof o.fromEmail === 'string' ? o.fromEmail.trim() : '';
  if (!notifyEmail.includes('@') || !fromEmail.includes('@')) return null;
  if (notifyEmail.includes('REPLACE') || fromEmail.includes('REPLACE')) return null;
  return { notifyEmail, fromEmail };
}

/** Loose sanity check; SES will still validate deliverability. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const secretArn = process.env.PRIVACY_ROUTING_SECRET_ARN;
  if (!secretArn) {
    return jsonResponse(500, { error: 'Server misconfigured' });
  }

  if (event.requestContext.http.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? '{}') as Record<string, unknown>;
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }

  const honeypot = typeof body.website === 'string' ? body.website : '';
  if (honeypot.trim() !== '') {
    return jsonResponse(400, { error: 'Bad request' });
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const contactEmail = typeof body.contactEmail === 'string' ? body.contactEmail.trim() : '';

  if (message.length < 10 || message.length > 8000) {
    return jsonResponse(400, {
      error: 'Message must be between 10 and 8000 characters',
    });
  }
  if (!contactEmail || contactEmail.length > 254 || !EMAIL_RE.test(contactEmail)) {
    return jsonResponse(400, { error: 'A valid contact email is required' });
  }

  const routing = await loadRouting(secretArn);
  if (!routing) {
    return jsonResponse(503, { error: 'This form is temporarily unavailable' });
  }

  const reqId = event.requestContext.requestId;

  try {
    await ses.send(
      new SendEmailCommand({
        Source: routing.fromEmail,
        Destination: { ToAddresses: [routing.notifyEmail] },
        ReplyToAddresses: [contactEmail],
        Message: {
          Subject: {
            Charset: 'UTF-8',
            Data: '[RiffSync] Personal information / data removal request',
          },
          Body: {
            Text: {
              Charset: 'UTF-8',
              Data: [
                `Reply-To contact: ${contactEmail}`,
                '',
                'Message:',
                message,
                '',
                `API request ID: ${reqId}`,
              ].join('\n'),
            },
          },
        },
      }),
    );
  } catch (e) {
    console.error('SES SendEmail failed', e);
    return jsonResponse(502, { error: 'Could not submit request; try again later' });
  }

  return jsonResponse(200, { ok: true });
};
