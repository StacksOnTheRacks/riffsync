import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { projectAdminEpisode, sortEpisodes } from './admin-catalog-shared';
import { requireStaffAccess } from './admin-staff-access';
import { jsonResponse } from './giphy-search-shared';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const denied = await requireStaffAccess(event);
  if (denied) {
    return denied;
  }

  const tableName = process.env.CATALOG_TABLE_NAME;
  if (!tableName) {
    return jsonResponse(500, { error: 'Missing CATALOG_TABLE_NAME' });
  }

  const entries: ReturnType<typeof projectAdminEpisode>[] = [];
  let startKey: Record<string, unknown> | undefined;

  do {
    const out = await client.send(
      new ScanCommand({
        TableName: tableName,
        ...(startKey ? { ExclusiveStartKey: startKey } : {}),
      }),
    );
    for (const raw of out.Items ?? []) {
      entries.push(projectAdminEpisode(raw as Record<string, unknown>));
    }
    startKey = out.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);

  const sorted = sortEpisodes(entries);
  return jsonResponse(200, {
    version: 1,
    entries: sorted,
  });
};
