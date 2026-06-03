import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { projectAdminEpisode } from './admin-catalog-shared';
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

  const id = event.pathParameters?.id;
  if (!id) {
    return jsonResponse(400, { error: 'Missing path parameter id' });
  }

  const out = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: { id },
    }),
  );

  if (!out.Item) {
    return jsonResponse(404, { error: 'Not found' });
  }

  const entry = projectAdminEpisode(out.Item as Record<string, unknown>);
  return jsonResponse(200, { entry });
};
