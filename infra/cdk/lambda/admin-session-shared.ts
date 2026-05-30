import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';

const STAFF_GROUPS = new Set(['admin', 'curator']);

interface StaffJwtClaims {
  sub?: string;
  email?: string;
  'cognito:groups'?: string | string[];
}

export type StaffSessionResponse = {
  sub: string;
  email: string | null;
  groups: string[];
};

export function getStaffJwtClaims(
  event: Parameters<APIGatewayProxyHandlerV2>[0],
): StaffJwtClaims | undefined {
  return (
    event.requestContext as unknown as {
      authorizer?: { jwt?: { claims?: StaffJwtClaims } };
    }
  ).authorizer?.jwt?.claims;
}

/** Decode JWT payload only — signature is validated by API Gateway before Lambda runs. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    return JSON.parse(Buffer.from(b64 + pad, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function bearerAccessToken(event: Parameters<APIGatewayProxyHandlerV2>[0]): string | undefined {
  const auth = event.headers?.authorization ?? event.headers?.Authorization;
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) {
    return undefined;
  }
  const token = auth.slice('Bearer '.length).trim();
  return token.length > 0 ? token : undefined;
}

function groupsFromClaimRecord(record: Record<string, unknown> | undefined): string[] {
  if (!record) {
    return [];
  }
  const direct = parseCognitoGroups(record as StaffJwtClaims);
  if (direct.length > 0) {
    return direct;
  }
  for (const [key, value] of Object.entries(record)) {
    if (!key.toLowerCase().includes('groups')) {
      continue;
    }
    const parsed = parseCognitoGroups({ 'cognito:groups': value as string | string[] });
    if (parsed.length > 0) {
      return parsed;
    }
  }
  return [];
}

/**
 * Resolve staff groups from authorizer claims, falling back to the Bearer access token payload.
 * HTTP API JWT authorizers validate the token but may omit `cognito:groups` from `authorizer.jwt.claims`.
 */
export function resolveStaffGroups(event: Parameters<APIGatewayProxyHandlerV2>[0]): string[] {
  const fromAuthorizer = groupsFromClaimRecord(getStaffJwtClaims(event) as Record<string, unknown>);
  if (fromAuthorizer.length > 0) {
    return fromAuthorizer;
  }
  const token = bearerAccessToken(event);
  if (!token) {
    return [];
  }
  return groupsFromClaimRecord(decodeJwtPayload(token) ?? undefined);
}

export function resolveStaffUsername(event: Parameters<APIGatewayProxyHandlerV2>[0]): string | undefined {
  const fromRecord = (record: Record<string, unknown> | undefined): string | undefined => {
    if (!record) {
      return undefined;
    }
    for (const key of ['username', 'cognito:username', 'sub'] as const) {
      const value = record[key];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
    return undefined;
  };
  const fromAuthorizer = fromRecord(getStaffJwtClaims(event) as Record<string, unknown>);
  if (fromAuthorizer) {
    return fromAuthorizer;
  }
  const token = bearerAccessToken(event);
  if (!token) {
    return undefined;
  }
  return fromRecord(decodeJwtPayload(token) ?? undefined);
}

function parseGroupsString(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return [];
  }
  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((g): g is string => typeof g === 'string' && g.length > 0);
      }
    } catch {
      /* fall through to delimiter parsing */
    }
  }
  if (trimmed.includes(',')) {
    return trimmed
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean);
  }
  if (trimmed.includes(' ')) {
    return trimmed.split(/\s+/).filter(Boolean);
  }
  return [trimmed];
}

/** Normalize `cognito:groups` from API Gateway JWT authorizer context (string or array). */
export function parseCognitoGroups(claims: StaffJwtClaims | undefined): string[] {
  if (!claims) {
    return [];
  }
  const raw = claims['cognito:groups'];
  if (Array.isArray(raw)) {
    return raw.filter((g): g is string => typeof g === 'string' && g.length > 0);
  }
  if (typeof raw === 'string' && raw.length > 0) {
    return parseGroupsString(raw);
  }
  return [];
}

export function hasStaffRole(groups: readonly string[]): boolean {
  return groups.some((g) => STAFF_GROUPS.has(g));
}
