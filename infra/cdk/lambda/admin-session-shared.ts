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
    if (raw.includes(' ')) {
      return raw.split(/\s+/).filter(Boolean);
    }
    return [raw];
  }
  return [];
}

export function hasStaffRole(groups: readonly string[]): boolean {
  return groups.some((g) => STAFF_GROUPS.has(g));
}
