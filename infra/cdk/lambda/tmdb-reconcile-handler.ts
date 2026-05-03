import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { Handler } from 'aws-lambda';
import {
  fetchTmdbImageConfig,
  itemNeedsReconcile,
  reconcileOneItemForPatch,
} from './tmdb-reconcile-core';

function parseSecretPayload(raw: string): string {
  const t = raw.trim();
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t) as { token?: string; TMDB_API_TOKEN?: string };
      const v = j.token ?? j.TMDB_API_TOKEN;
      if (typeof v === 'string' && v.length > 0) return v;
    } catch {
      /* plain text */
    }
  }
  return t;
}

function buildUpdateParts(patch: Record<string, unknown>): {
  UpdateExpression: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues: Record<string, unknown>;
} {
  const ExpressionAttributeNames: Record<string, string> = {};
  const ExpressionAttributeValues: Record<string, unknown> = {};
  const fragments: string[] = [];
  let i = 0;
  for (const [key, val] of Object.entries(patch)) {
    const nk = `#f${i}`;
    const vk = `:f${i}`;
    ExpressionAttributeNames[nk] = key;
    ExpressionAttributeValues[vk] = val;
    fragments.push(`${nk} = ${vk}`);
    i++;
  }
  return {
    UpdateExpression: `SET ${fragments.join(', ')}`,
    ExpressionAttributeNames,
    ExpressionAttributeValues,
  };
}

function logEmf(env: string, processed: number, failed: number, skipped: number): void {
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: 'RiffSync/Reconcile',
            Dimensions: [['Environment']],
            Metrics: [
              { Name: 'Processed', Unit: 'Count' },
              { Name: 'Failed', Unit: 'Count' },
              { Name: 'Skipped', Unit: 'Count' },
            ],
          },
        ],
      },
      Environment: env,
      Processed: processed,
      Failed: failed,
      Skipped: skipped,
    }),
  );
}

export const handler: Handler = async () => {
  const tableName = process.env.CATALOG_TABLE_NAME;
  const secretArn = process.env.TMDB_SECRET_ARN;
  const tier = process.env.RIFFSYNC_ENVIRONMENT ?? 'unknown';
  const batchSize = Math.min(
    50,
    Math.max(1, Number.parseInt(process.env.RECONCILE_BATCH_SIZE ?? '15', 10) || 15),
  );

  if (process.env.RECONCILE_DISABLED === 'true') {
    console.log(JSON.stringify({ level: 'INFO', msg: 'reconcile_skipped', reason: 'RECONCILE_DISABLED' }));
    logEmf(tier, 0, 0, 0);
    return;
  }

  if (!tableName || !secretArn) {
    console.log(JSON.stringify({ level: 'ERROR', msg: 'reconcile_config_missing' }));
    logEmf(tier, 0, 1, 0);
    throw new Error('Missing CATALOG_TABLE_NAME or TMDB_SECRET_ARN');
  }

  const secrets = new SecretsManagerClient({});
  const secretOut = await secrets.send(
    new GetSecretValueCommand({ SecretId: secretArn }),
  );
  const raw = secretOut.SecretString;
  if (!raw || raw.trim() === 'REPLACE_WITH_TMDB_BEARER_TOKEN') {
    console.log(
      JSON.stringify({
        level: 'WARN',
        msg: 'tmdb_secret_not_configured',
        hint: 'Put a real TMDB bearer token with aws secretsmanager put-secret-value',
      }),
    );
    logEmf(tier, 0, 0, 0);
    return;
  }

  const tmdbToken = parseSecretPayload(raw);
  if (!tmdbToken || tmdbToken.length < 8) {
    console.log(JSON.stringify({ level: 'ERROR', msg: 'tmdb_token_invalid' }));
    logEmf(tier, 0, 1, 0);
    return;
  }

  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const imageConfig = await fetchTmdbImageConfig(tmdbToken, globalThis.fetch);
  const nowIso = new Date().toISOString();

  const candidates: Record<string, unknown>[] = [];
  let startKey: Record<string, unknown> | undefined;
  scan: while (candidates.length < batchSize) {
    const out = await doc.send(
      new ScanCommand({
        TableName: tableName,
        Limit: 40,
        ExclusiveStartKey: startKey,
      }),
    );
    for (const rawItem of out.Items ?? []) {
      const it = rawItem as Record<string, unknown>;
      if (itemNeedsReconcile(it)) {
        candidates.push(it);
        if (candidates.length >= batchSize) break;
      }
    }
    startKey = out.LastEvaluatedKey as Record<string, unknown> | undefined;
    if (!startKey) break;
  }

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const item of candidates) {
    const result = await reconcileOneItemForPatch(item, tmdbToken, imageConfig, globalThis.fetch, nowIso);
    if (!result.ok) {
      if (result.status === 'skipped') skipped++;
      else failed++;
      if (result.catalogId) {
        console.log(
          JSON.stringify({
            level: 'INFO',
            event: 'reconcile_row_outcome',
            catalogId: result.catalogId,
            outcome: result.status,
            reason: result.reason,
          }),
        );
      }
      continue;
    }

    try {
      const { UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues } =
        buildUpdateParts(result.patch);
      await doc.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { id: result.catalogId },
          UpdateExpression,
          ExpressionAttributeNames,
          ExpressionAttributeValues,
        }),
      );
      processed++;
      console.log(
        JSON.stringify({
          level: 'INFO',
          event: 'reconcile_row_outcome',
          catalogId: result.catalogId,
          outcome: 'processed',
        }),
      );
    } catch (e) {
      failed++;
      console.log(
        JSON.stringify({
          level: 'ERROR',
          event: 'dynamo_update_failed',
          catalogId: result.catalogId,
          message: e instanceof Error ? e.message : 'unknown',
        }),
      );
    }
  }

  console.log(
    JSON.stringify({
      level: 'INFO',
      msg: 'reconcile_run_complete',
      processed,
      failed,
      skipped,
      scannedBatch: candidates.length,
    }),
  );
  logEmf(tier, processed, failed, skipped);
};
