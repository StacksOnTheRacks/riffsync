import type { APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  CAST_DIAG_EVENTS,
  type CastDiagEvent,
  type CastDiagHop,
  recordCastDiag,
} from './riffsync-observability';

const ALLOWED_EVENTS = new Set<string>(CAST_DIAG_EVENTS);
const ATTEMPT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE_PATTERN = /^[A-Za-z0-9_.-]{1,40}$/;
const MAX_BODY_BYTES = 1024;
const MAX_DESCRIPTION = 80;
const MAX_DETAILS = 120;

const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

function gifResponse(): APIGatewayProxyResultV2 {
  return {
    statusCode: 200,
    headers: {
      'content-type': 'image/gif',
      'cache-control': 'no-store',
    },
    isBase64Encoded: true,
    body: TRANSPARENT_GIF.toString('base64'),
  };
}

function jsonResponse(statusCode: number, body: Record<string, unknown>): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}

function accepted(): APIGatewayProxyResultV2 {
  return {
    statusCode: 204,
    headers: { 'cache-control': 'no-store' },
    body: '',
  };
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function sanitizeToken(value: unknown, pattern: RegExp): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return pattern.test(trimmed) ? trimmed : undefined;
}

function sanitizeText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!cleaned) return undefined;
  return cleaned.slice(0, max);
}

function hopForEvent(event: CastDiagEvent, requested?: unknown): CastDiagHop {
  if (requested === 'sender' || requested === 'receiver') return requested;
  return event.startsWith('receiver_') ? 'receiver' : 'sender';
}

function acceptEvent(raw: Record<string, unknown>): APIGatewayProxyResultV2 {
  const event = typeof raw.event === 'string' ? raw.event.trim() : '';
  if (!ALLOWED_EVENTS.has(event)) {
    return jsonResponse(400, { error: 'Unknown event' });
  }
  const typedEvent = event as CastDiagEvent;
  recordCastDiag({
    event: typedEvent,
    hop: hopForEvent(typedEvent, raw.hop),
    attemptId: sanitizeToken(raw.attemptId, ATTEMPT_ID_PATTERN),
    code: sanitizeToken(raw.code, CODE_PATTERN),
    description: sanitizeText(raw.description, MAX_DESCRIPTION),
    details: sanitizeText(raw.details, MAX_DETAILS),
  });
  return accepted();
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const method = event.requestContext.http.method;
  if (method === 'GET') {
    const queryEvent = event.queryStringParameters?.e?.trim() ?? '';
    if (!ALLOWED_EVENTS.has(queryEvent)) {
      return gifResponse();
    }
    acceptEvent({ event: queryEvent, hop: 'receiver' });
    return gifResponse();
  }

  if (method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const raw = event.body ?? '';
  if (raw.length > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: 'Payload too large' });
  }
  const parsed = parseJsonObject(raw);
  if (!parsed) {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }
  const result = acceptEvent(parsed);
  return result.statusCode === 204 ? accepted() : result;
};
