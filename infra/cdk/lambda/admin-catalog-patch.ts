import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { projectAdminEpisode } from './admin-catalog-shared';
import { requireStaffAccess, resolveStaffSub } from './admin-staff-access';
import {
  validateCatalogEpisodePatch,
  validationErrorResponse,
  type ValidationDetail,
} from './admin-catalog-validation';
import { jsonResponse } from './giphy-search-shared';
import {
  adminCatalogPatchOutcomeFromStatus,
  logRiffsyncDiagError,
  recordAdminCatalogRoute,
  type AdminCatalogPatchOutcome,
} from './riffsync-observability';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function fieldPathsFromDetails(details: ValidationDetail[]): string[] {
  return details.map((d) => d.instancePath).filter((p) => p.length > 0);
}

function finishPatch(
  event: APIGatewayProxyEventV2,
  sub: string,
  episodeId: string,
  statusCode: number,
  body: Record<string, unknown>,
  validationFieldPaths?: string[],
) {
  const outcome = adminCatalogPatchOutcomeFromStatus(statusCode);
  recordAdminCatalogRoute('AdminCatalogPatch', outcome, {
    route: 'AdminCatalogPatch',
    action: 'update',
    outcome,
    sub,
    episodeId,
    requestId: event.requestContext.requestId,
    statusCode,
    validationFieldPaths,
  });
  return jsonResponse(statusCode, body);
}

function buildUpdateExpression(item: Record<string, unknown>): {
  UpdateExpression: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues: Record<string, unknown>;
} {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const sets: string[] = [];
  for (const [key, value] of Object.entries(item)) {
    if (key === 'id') continue;
    const nameKey = `#${key}`;
    const valueKey = `:${key}`;
    names[nameKey] = key;
    values[valueKey] = value;
    sets.push(`${nameKey} = ${valueKey}`);
  }
  return {
    UpdateExpression: `SET ${sets.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  };
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const episodeId = event.pathParameters?.id ?? '';
  const sub = resolveStaffSub(event) ?? 'unknown';

  const denied = await requireStaffAccess(event);
  if (denied) {
    const statusCode = denied.statusCode ?? 403;
    const outcome = adminCatalogPatchOutcomeFromStatus(statusCode) as AdminCatalogPatchOutcome;
    recordAdminCatalogRoute('AdminCatalogPatch', outcome, {
      route: 'AdminCatalogPatch',
      action: 'update',
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
    return finishPatch(event, sub, episodeId, 401, {
      error: 'Unauthorized',
      code: 'unauthorized',
    });
  }

  const tableName = process.env.CATALOG_TABLE_NAME;
  if (!tableName) {
    return finishPatch(event, staffSub, episodeId, 500, { error: 'Internal server error' });
  }

  let parsedBody: Record<string, unknown>;
  try {
    parsedBody = event.body ? (JSON.parse(event.body) as Record<string, unknown>) : {};
  } catch {
    return finishPatch(
      event,
      staffSub,
      episodeId,
      400,
      validationErrorResponse([{ instancePath: '/', message: 'Invalid JSON' }]),
      ['/'],
    );
  }

  let existing: Record<string, unknown>;
  try {
    const out = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: { id: episodeId },
      }),
    );
    if (!out.Item) {
      return finishPatch(event, staffSub, episodeId, 404, { error: 'Not found' });
    }
    existing = out.Item as Record<string, unknown>;
  } catch (err) {
    logRiffsyncDiagError('admin_catalog_patch_get_failed', err);
    return finishPatch(event, staffSub, episodeId, 500, { error: 'Internal server error' });
  }

  const validated = validateCatalogEpisodePatch(episodeId, parsedBody, existing);
  if (!validated.ok) {
    return finishPatch(
      event,
      staffSub,
      episodeId,
      400,
      validationErrorResponse(validated.details),
      fieldPathsFromDetails(validated.details),
    );
  }

  const update = buildUpdateExpression(validated.item);
  try {
    await client.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id: episodeId },
        ...update,
      }),
    );
  } catch (err) {
    logRiffsyncDiagError('admin_catalog_patch_update_failed', err);
    return finishPatch(event, staffSub, episodeId, 500, { error: 'Internal server error' });
  }

  const entry = projectAdminEpisode(validated.item);
  return finishPatch(event, staffSub, episodeId, 200, { entry });
};
