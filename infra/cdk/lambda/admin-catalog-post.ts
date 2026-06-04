import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { projectAdminEpisode } from './admin-catalog-shared';
import { requireStaffAccess, resolveStaffSub } from './admin-staff-access';
import {
  validateCatalogEpisodePost,
  validationErrorResponse,
  type ValidationDetail,
} from './admin-catalog-validation';
import { bumpCatalogGeneration } from './catalog-meta';
import { jsonResponse } from './giphy-search-shared';
import {
  adminCatalogPostOutcomeFromStatus,
  logRiffsyncDiagError,
  recordAdminCatalogRoute,
  type AdminCatalogPostOutcome,
} from './riffsync-observability';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function fieldPathsFromDetails(details: ValidationDetail[]): string[] {
  return details.map((d) => d.instancePath).filter((p) => p.length > 0);
}

function finishPost(
  event: APIGatewayProxyEventV2,
  sub: string,
  episodeId: string,
  statusCode: number,
  body: Record<string, unknown>,
  validationFieldPaths?: string[],
) {
  const outcome = adminCatalogPostOutcomeFromStatus(statusCode);
  recordAdminCatalogRoute('AdminCatalogPost', outcome, {
    route: 'AdminCatalogPost',
    action: 'create',
    outcome,
    sub,
    episodeId,
    requestId: event.requestContext.requestId,
    statusCode,
    validationFieldPaths,
  });
  return jsonResponse(statusCode, body);
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const episodeId = event.pathParameters?.id ?? '';
  const sub = resolveStaffSub(event) ?? 'unknown';

  const denied = await requireStaffAccess(event);
  if (denied) {
    const statusCode = denied.statusCode ?? 403;
    const outcome = adminCatalogPostOutcomeFromStatus(statusCode) as AdminCatalogPostOutcome;
    recordAdminCatalogRoute('AdminCatalogPost', outcome, {
      route: 'AdminCatalogPost',
      action: 'create',
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
    return finishPost(event, sub, episodeId, 401, {
      error: 'Unauthorized',
      code: 'unauthorized',
    });
  }

  const tableName = process.env.CATALOG_TABLE_NAME;
  if (!tableName) {
    return finishPost(event, staffSub, episodeId, 500, { error: 'Internal server error' });
  }

  let parsedBody: Record<string, unknown>;
  try {
    parsedBody = event.body ? (JSON.parse(event.body) as Record<string, unknown>) : {};
  } catch {
    return finishPost(
      event,
      staffSub,
      episodeId,
      400,
      validationErrorResponse([{ instancePath: '/', message: 'Invalid JSON' }]),
      ['/'],
    );
  }

  const validated = validateCatalogEpisodePost(episodeId, parsedBody);
  if (!validated.ok) {
    return finishPost(
      event,
      staffSub,
      episodeId,
      400,
      validationErrorResponse(validated.details),
      fieldPathsFromDetails(validated.details),
    );
  }

  try {
    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: validated.item,
        ConditionExpression: 'attribute_not_exists(id)',
      }),
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      return finishPost(event, staffSub, episodeId, 409, {
        error: 'Conflict',
        code: 'catalog_episode_exists',
      });
    }
    logRiffsyncDiagError('admin_catalog_post_dynamo_failed', err);
    return finishPost(event, staffSub, episodeId, 500, { error: 'Internal server error' });
  }

  try {
    await bumpCatalogGeneration(client, tableName);
  } catch (err) {
    logRiffsyncDiagError('admin_catalog_post_bump_generation_failed', err);
    return finishPost(event, staffSub, episodeId, 500, { error: 'Internal server error' });
  }

  const entry = projectAdminEpisode(validated.item);
  return finishPost(event, staffSub, episodeId, 201, { entry });
};
