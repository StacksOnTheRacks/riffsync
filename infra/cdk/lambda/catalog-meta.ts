import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

export const CATALOG_META_ID = '_meta';

/**
 * Read the monotonic catalog generation counter from the `_meta` row.
 * Returns `1` when the row is absent (tables seeded before M13).
 */
export async function getCatalogGeneration(
  docClient: DynamoDBDocumentClient,
  tableName: string,
): Promise<number> {
  const out = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { id: CATALOG_META_ID },
    }),
  );
  const gen = out.Item?.catalogGeneration;
  if (typeof gen === 'number' && Number.isFinite(gen) && gen >= 1) {
    return Math.floor(gen);
  }
  return 1;
}

/**
 * Increment `catalogGeneration` on the `_meta` row (creates the row on first bump).
 * TODO: invoke from reconcile/TMDB writers when those jobs mutate catalog rows.
 */
export async function bumpCatalogGeneration(
  docClient: DynamoDBDocumentClient,
  tableName: string,
): Promise<number> {
  const out = await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { id: CATALOG_META_ID },
      UpdateExpression: 'ADD catalogGeneration :one',
      ExpressionAttributeValues: { ':one': 1 },
      ReturnValues: 'UPDATED_NEW',
    }),
  );
  const gen = out.Attributes?.catalogGeneration;
  if (typeof gen === 'number' && Number.isFinite(gen) && gen >= 1) {
    return Math.floor(gen);
  }
  throw new Error('bumpCatalogGeneration: missing catalogGeneration in UpdateItem response');
}
