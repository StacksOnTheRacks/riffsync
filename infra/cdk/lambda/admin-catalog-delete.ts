import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { requireAdminAccess, resolveStaffSub } from './admin-staff-access';
import {
  catalogEpisodeExists,
  countCatalogEpisodeReferences,
} from './admin-catalog-delete-shared';
import { jsonResponse } from './giphy-search-shared';
import {
  adminCatalogDeleteOutcomeFromStatus,
  logRiffsyncDiagError,
  recordAdminCatalogRoute,
  type AdminCatalogDeleteOutcome,
} from './riffsync-observability';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function emptyResponse(statusCode: 204) {
  return { statusCode, body: '' };
}

function finishDelete(
  event: APIGatewayProxyEventV2,
  sub: string,
  episodeId: string,
  statusCode: number,
  body?: Record<string, unknown>,
) {
  const outcome = adminCatalogDeleteOutcomeFromStatus(statusCode);
  recordAdminCatalogRoute('AdminCatalogDelete', outcome, {
    route: 'AdminCatalogDelete',
    action: 'delete',
    outcome,
    sub,
    episodeId,
    requestId: event.requestContext.requestId,
    statusCode,
  });
  if (statusCode === 204) {
    return emptyResponse(204);
  }
  return jsonResponse(statusCode, body ?? { error: 'Internal server error' });
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const episodeId = event.pathParameters?.id ?? '';
  const sub = resolveStaffSub(event) ?? 'unknown';

  const denied = await requireAdminAccess(event);
  if (denied) {
    const statusCode = denied.statusCode ?? 403;
    const outcome = adminCatalogDeleteOutcomeFromStatus(statusCode) as AdminCatalogDeleteOutcome;
    recordAdminCatalogRoute('AdminCatalogDelete', outcome, {
      route: 'AdminCatalogDelete',
      action: 'delete',
      outcome,
      sub,
      episodeId,
      requestId: event.requestContext.requestId,
      statusCode,
    });
    return denied;
  }

  const staffSub = resolveStaffSub(event);
  if (!staffSub) {
    return finishDelete(event, sub, episodeId, 401, {
      error: 'Unauthorized',
      code: 'unauthorized',
    });
  }

  const catalogTableName = process.env.CATALOG_TABLE_NAME;
  const roomsTableName = process.env.ROOMS_TABLE_NAME;
  if (!catalogTableName || !roomsTableName) {
    return finishDelete(event, staffSub, episodeId, 500, { error: 'Internal server error' });
  }

  if (!episodeId) {
    return finishDelete(event, staffSub, episodeId, 404, { error: 'Not found' });
  }

  try {
    const exists = await catalogEpisodeExists(catalogTableName, episodeId);
    if (!exists) {
      return finishDelete(event, staffSub, episodeId, 404, { error: 'Not found' });
    }

    const listsTableName = process.env.LISTS_TABLE_NAME?.trim();
    const references = await countCatalogEpisodeReferences(
      episodeId,
      roomsTableName,
      listsTableName,
    );
    if (references.rooms > 0 || references.lists > 0) {
      return finishDelete(event, staffSub, episodeId, 409, {
        error: 'Conflict',
        code: 'catalog_episode_in_use',
        references,
      });
    }

    await client.send(
      new DeleteCommand({
        TableName: catalogTableName,
        Key: { id: episodeId },
      }),
    );
  } catch (err) {
    logRiffsyncDiagError('admin_catalog_delete_failed', err);
    return finishDelete(event, staffSub, episodeId, 500, { error: 'Internal server error' });
  }

  return finishDelete(event, staffSub, episodeId, 204);
};
