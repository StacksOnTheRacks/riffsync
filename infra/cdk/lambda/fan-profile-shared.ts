import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';

export const FAN_DISPLAY_NAME_MAX_LEN = 48;

interface JwtClaims {
  sub?: string;
}

export function getJwtSub(event: Parameters<APIGatewayProxyHandlerV2>[0]): string | undefined {
  const claims = (
    event.requestContext as unknown as {
      authorizer?: { jwt?: { claims?: JwtClaims } };
    }
  ).authorizer?.jwt?.claims;
  return typeof claims?.sub === 'string' ? claims.sub : undefined;
}

export type FanProfileResponse = {
  displayName: string | null;
  updatedAt: number | null;
  avatarUrl: string | null;
  avatarUpdatedAt: number | null;
};

export function serializeFanProfile(item: Record<string, unknown> | undefined): FanProfileResponse {
  if (!item) {
    return {
      displayName: null,
      updatedAt: null,
      avatarUrl: null,
      avatarUpdatedAt: null,
    };
  }

  const dn = item.displayName;
  const ua = item.updatedAt;
  const displayName =
    typeof dn === 'string' && dn.trim() !== '' ? dn.trim().slice(0, FAN_DISPLAY_NAME_MAX_LEN) : null;
  const updatedAt = typeof ua === 'number' && Number.isFinite(ua) ? ua : null;

  const au = item.avatarUrl;
  const avatarUrl = typeof au === 'string' && au.trim() !== '' ? au.trim() : null;

  const aua = item.avatarUpdatedAt;
  const avatarUpdatedAt = typeof aua === 'number' && Number.isFinite(aua) ? aua : null;

  return { displayName, updatedAt, avatarUrl, avatarUpdatedAt };
}

export function headerValue(
  headers: Record<string, string | undefined> | undefined,
  name: string,
): string | undefined {
  if (!headers) {
    return undefined;
  }
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) {
      return value;
    }
  }
  return undefined;
}
