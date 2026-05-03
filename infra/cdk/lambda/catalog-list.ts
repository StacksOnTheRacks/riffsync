import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { projectEpisode, sortEpisodes } from './catalog-shared';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const tableName = process.env.CATALOG_TABLE_NAME;
  if (!tableName) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing CATALOG_TABLE_NAME' }) };
  }

  const carouselParam = event.queryStringParameters?.carousel;
  const carouselOnly = carouselParam === 'true' || carouselParam === '1';

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
      entries.push(projectEpisode(raw as Record<string, unknown>));
    }
    startKey = out.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);

  let sorted = sortEpisodes(entries);
  if (carouselOnly) {
    sorted = sorted.filter((e) => e.carousel === true);
  }
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      version: 1,
      entries: sorted,
    }),
  };
};
