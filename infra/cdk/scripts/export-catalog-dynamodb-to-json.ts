/**
 * Exports the live DynamoDB catalog into `data/catalog/episodes.json`.
 *
 * Use after an in-place migration succeeds so the committed seed remains an
 * offline build/local-dev mirror of Dynamo. This script reads Dynamo and writes
 * local JSON; it does not write back to Dynamo.
 *
 *   npm run export:catalog-json -- <tableName> --profile me
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  type ScanCommandOutput,
} from '@aws-sdk/lib-dynamodb';

const repoRoot = resolve(__dirname, '../../..');
const episodesPath = resolve(repoRoot, 'data/catalog/episodes.json');

const SCHEMA_FIELDS = [
  'id',
  'experimentNumber',
  'title',
  'catalog',
  'tags',
  'labels',
  'youtubeVideoId',
  'youtubeWatchUrl',
  'tagline',
  'posterImageUrl',
  'backdropImageUrl',
  'tmdbMovieId',
  'tmdbArtworkSyncedAt',
  'carousel',
  'spotlight',
  'movieSearchTitle',
  'embedAllows',
  'playbackHost',
  'customPlaybackUrl',
] as const;

function resolveRegion(): string {
  return (
    process.env.AWS_REGION?.trim() ||
    process.env.AWS_DEFAULT_REGION?.trim() ||
    'us-east-1'
  );
}

function readOption(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? '').trim() || null : null;
}

function applyAwsProfile(): void {
  const selected = readOption('--profile') ?? process.env.AWS_PROFILE?.trim() ?? null;
  if (!selected) return;
  process.env.AWS_PROFILE = selected;
  process.env.AWS_SDK_LOAD_CONFIG = process.env.AWS_SDK_LOAD_CONFIG ?? '1';
  console.log(`export:catalog-json: using AWS profile ${selected}`);
}

function sanitizeEntry(item: Record<string, unknown>): Record<string, unknown> {
  const entry: Record<string, unknown> = {};
  for (const field of SCHEMA_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(item, field)) {
      entry[field] = item[field];
    }
  }
  if (!Array.isArray(entry.tags)) entry.tags = [];
  if (!Array.isArray(entry.labels)) entry.labels = [];
  return entry;
}

async function main(): Promise<void> {
  const tableName = (process.argv[2] ?? '').trim();
  if (!tableName) {
    console.error('Usage: export-catalog-dynamodb-to-json.ts <tableName>');
    process.exit(1);
  }
  if (!/^[a-zA-Z0-9_.-]{3,255}$/.test(tableName)) {
    console.error(`export:catalog-json: invalid table name ${JSON.stringify(tableName)}`);
    process.exit(1);
  }

  applyAwsProfile();
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: resolveRegion() }));
  const entries: Record<string, unknown>[] = [];
  let startKey: ScanCommandOutput['LastEvaluatedKey'];

  do {
    const page = await client.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: startKey,
      }),
    );
    entries.push(...((page.Items ?? []) as Record<string, unknown>[]).map(sanitizeEntry));
    startKey = page.LastEvaluatedKey;
  } while (startKey);

  entries.sort((a, b) => Number(a.experimentNumber) - Number(b.experimentNumber));
  const today = new Date().toISOString().slice(0, 10);
  const bundle = {
    $schema: './catalog.schema.json',
    version: 1,
    updated: today,
    entries,
  };
  writeFileSync(episodesPath, `${JSON.stringify(bundle, null, 2)}\n`);
  console.log(`export:catalog-json: wrote ${entries.length} rows to ${episodesPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
