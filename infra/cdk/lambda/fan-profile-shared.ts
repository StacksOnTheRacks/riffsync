import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { BatchGetCommand } from '@aws-sdk/lib-dynamodb';

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

/** Trusted HTTPS avatar URL from a FanProfiles row (omitted when unset). */
export function avatarUrlFromStoredProfile(item: Record<string, unknown> | undefined): string | undefined {
  const au = item?.avatarUrl;
  return typeof au === 'string' && au.trim() !== '' ? au.trim() : undefined;
}

/** Batch-read `avatarUrl` for fan Cognito subs (DynamoDB keys: `{ sub }`). */
export async function batchAvatarUrlsByFanSub(
  doc: DynamoDBDocumentClient,
  table: string,
  fanSubs: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(fanSubs.filter((s) => s.length > 0))];
  const result = new Map<string, string>();
  if (unique.length === 0) {
    return result;
  }

  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const out = await doc.send(
      new BatchGetCommand({
        RequestItems: {
          [table]: {
            Keys: chunk.map((sub) => ({ sub })),
            ProjectionExpression: '#sub, avatarUrl',
            ExpressionAttributeNames: { '#sub': 'sub' },
          },
        },
      }),
    );
    const items = (out.Responses?.[table] ?? []) as Record<string, unknown>[];
    for (const item of items) {
      const sub = typeof item.sub === 'string' ? item.sub : '';
      const url = avatarUrlFromStoredProfile(item);
      if (sub && url) {
        result.set(sub, url);
      }
    }
  }

  return result;
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
