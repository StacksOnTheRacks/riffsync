import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { getJwtSub } from './fan-profile-shared';
import {
  fetchGiphySearch,
  giphyRateLimitKey,
  jsonResponse,
  minuteBucketEpochMs,
  parseGiphyApiKey,
  parseGiphySearchQuery,
} from './giphy-search-shared';

const secrets = new SecretsManagerClient({});
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

let cachedApiKey: { value: string; loadedAt: number } | undefined;
const API_KEY_CACHE_MS = 5 * 60_000;

function rateLimitPerMinute(): number {
  const raw = process.env.GIPHY_RATE_LIMIT_PER_MINUTE;
  const n = raw !== undefined ? Number.parseInt(raw, 10) : 30;
  return Number.isFinite(n) && n > 0 ? n : 30;
}

async function loadGiphyApiKey(secretArn: string): Promise<string | null> {
  const now = Date.now();
  if (cachedApiKey && now - cachedApiKey.loadedAt < API_KEY_CACHE_MS) {
    return cachedApiKey.value;
  }

  let raw: string | undefined;
  try {
    const out = await secrets.send(new GetSecretValueCommand({ SecretId: secretArn }));
    raw = out.SecretString;
  } catch (e) {
    console.error('Giphy secret read failed', e);
    return null;
  }

  const key = raw ? parseGiphyApiKey(raw) : null;
  if (!key) return null;
  cachedApiKey = { value: key, loadedAt: now };
  return key;
}

export async function enforceGiphyRateLimit(
  tableName: string,
  sub: string,
  limit: number,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const bucketMs = minuteBucketEpochMs(nowMs);
  const { pk, sk } = giphyRateLimitKey(sub, bucketMs);
  const expiresAt = Math.floor(nowMs / 1000) + 120;

  try {
    await doc.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { pk, sk },
        UpdateExpression: 'ADD requestCount :one SET expiresAt = :expiresAt',
        ConditionExpression: 'attribute_not_exists(requestCount) OR requestCount < :limit',
        ExpressionAttributeValues: {
          ':one': 1,
          ':limit': limit,
          ':expiresAt': expiresAt,
        },
      }),
    );
    return true;
  } catch (e) {
    const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: string }).name) : '';
    if (name === 'ConditionalCheckFailedException') {
      return false;
    }
    console.error('Giphy rate limit update failed', e);
    throw e;
  }
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const secretArn = process.env.GIPHY_SECRET_ARN;
  const rateTable = process.env.GIPHY_RATE_LIMIT_TABLE_NAME;
  if (!secretArn || !rateTable) {
    return jsonResponse(500, { error: 'Server misconfigured' });
  }

  const jwtSub = getJwtSub(event);
  if (!jwtSub) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  const parsed = parseGiphySearchQuery(event.queryStringParameters);
  if (!parsed.ok) {
    return jsonResponse(400, { error: 'Invalid query parameters' });
  }

  const allowed = await enforceGiphyRateLimit(rateTable, jwtSub, rateLimitPerMinute());
  if (!allowed) {
    return jsonResponse(429, { error: 'Giphy search rate limit exceeded' });
  }

  const apiKey = await loadGiphyApiKey(secretArn);
  if (!apiKey) {
    return jsonResponse(503, { error: 'Giphy search is temporarily unavailable' });
  }

  const upstream = await fetchGiphySearch(apiKey, parsed.query, fetch);
  if (!upstream.ok) {
    return jsonResponse(upstream.status, { error: 'Giphy search is temporarily unavailable' });
  }

  return jsonResponse(200, { results: upstream.results });
};
