import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  catalogCacheHeaders,
  etagMatches,
  notModifiedResponse,
  parseCatalogHttpMaxAgeSeconds,
} from './catalog-cache-headers';
import { CATALOG_META_ID, getCatalogGeneration } from './catalog-meta';
import { projectEpisode, sortEpisodes } from './catalog-shared';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const tableName = process.env.CATALOG_TABLE_NAME;
  if (!tableName) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing CATALOG_TABLE_NAME' }) };
  }

  const carouselParam = event.queryStringParameters?.carousel;
  const spotlightParam = event.queryStringParameters?.spotlight;
  const carouselOnly = carouselParam === 'true' || carouselParam === '1';
  const spotlightOnly = spotlightParam === 'true' || spotlightParam === '1';
  const variant = spotlightOnly ? 'spotlight' : carouselOnly ? 'carousel' : 'full';
  const maxAgeSeconds = parseCatalogHttpMaxAgeSeconds(process.env.CATALOG_HTTP_MAX_AGE_SECONDS);

  const generation = await getCatalogGeneration(client, tableName);
  const cacheHeaders = catalogCacheHeaders(generation, variant, maxAgeSeconds);
  const ifNoneMatch =
    event.headers?.['if-none-match'] ?? event.headers?.['If-None-Match'];

  if (etagMatches(ifNoneMatch, cacheHeaders.ETag)) {
    return notModifiedResponse(cacheHeaders);
  }

  const entries: ReturnType<typeof projectEpisode>[] = [];
  let startKey: Record<string, unknown> | undefined;

  do {
    const out = await client.send(
      new ScanCommand({
        TableName: tableName,
        ...(startKey ? { ExclusiveStartKey: startKey } : {}),
      }),
    );
    for (const raw of out.Items ?? []) {
      const item = raw as Record<string, unknown>;
      if (item.id === CATALOG_META_ID) {
        continue;
      }
      entries.push(projectEpisode(item));
    }
    startKey = out.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);

  let sorted = sortEpisodes(entries);
  if (spotlightOnly) {
    sorted = sorted.filter((e) => e.spotlight === true);
  } else if (carouselOnly) {
    sorted = sorted.filter((e) => e.carousel === true);
  }
  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...cacheHeaders,
    },
    body: JSON.stringify({
      version: 1,
      entries: sorted,
    }),
  };
};
