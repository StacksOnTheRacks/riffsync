/**
 * In-place taxonomy migration for the live catalog table.
 *
 * This script never reads `data/catalog/episodes.json`, never inserts missing rows,
 * and never deletes rows. It scans the existing DynamoDB table and updates only
 * taxonomy fields on rows that are already present.
 *
 * Dry run:
 *   npm run migrate:catalog-taxonomy -- <tableName> --profile me --dry-run
 *
 * Write:
 *   npm run migrate:catalog-taxonomy -- <tableName> --profile me --write --require-confirm <tableName>
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  type ScanCommandOutput,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

type CatalogCategory = 'mst3k' | 'community' | 'riff_material' | 'movie_night' | 'other';

const CATALOGS = new Set<CatalogCategory>([
  'mst3k',
  'community',
  'riff_material',
  'movie_night',
  'other',
]);

const ERA_TO_TAXONOMY: Record<string, { catalog: CatalogCategory; tag?: string }> = {
  joel: { catalog: 'mst3k', tag: 'Era: Joel' },
  mike: { catalog: 'mst3k', tag: 'Era: Mike' },
  jonah: { catalog: 'mst3k', tag: 'Era: Jonah' },
  emily: { catalog: 'mst3k', tag: 'Era: Emily' },
  community: { catalog: 'community' },
  movie_night: { catalog: 'movie_night' },
  riffable: { catalog: 'riff_material' },
  riff_material: { catalog: 'riff_material' },
  other: { catalog: 'other' },
};

interface Args {
  readonly tableName: string;
  readonly dryRun: boolean;
  readonly write: boolean;
  readonly confirmTableName: string | null;
  readonly profile: string | null;
}

function resolveRegion(): string {
  return (
    process.env.AWS_REGION?.trim() ||
    process.env.AWS_DEFAULT_REGION?.trim() ||
    'us-east-1'
  );
}

function parseArgs(): Args {
  const tableName = (process.argv[2] ?? '').trim();
  const args = process.argv.slice(3);
  const requireConfirmIndex = args.indexOf('--require-confirm');
  const profileIndex = args.indexOf('--profile');
  const confirmTableName =
    requireConfirmIndex >= 0 ? (args[requireConfirmIndex + 1] ?? '').trim() : null;
  const profile = profileIndex >= 0 ? (args[profileIndex + 1] ?? '').trim() : null;

  if (!tableName) {
    console.error(
      'Usage: migrate-catalog-era-to-taxonomy.ts <tableName> [--profile <awsProfile>] [--dry-run | --write --require-confirm <tableName>]',
    );
    process.exit(1);
  }
  if (!/^[a-zA-Z0-9_.-]{3,255}$/.test(tableName)) {
    console.error(`migrate:catalog-taxonomy: invalid table name ${JSON.stringify(tableName)}`);
    process.exit(1);
  }

  const write = args.includes('--write');
  const dryRun = args.includes('--dry-run') || !write;
  if (write && confirmTableName !== tableName) {
    console.error(
      'migrate:catalog-taxonomy: writes require --require-confirm with the exact table name.',
    );
    process.exit(1);
  }

  return { tableName, dryRun, write, confirmTableName, profile };
}

function applyAwsProfile(profile: string | null): void {
  const selected = profile ?? process.env.AWS_PROFILE?.trim() ?? null;
  if (!selected) return;
  process.env.AWS_PROFILE = selected;
  process.env.AWS_SDK_LOAD_CONFIG = process.env.AWS_SDK_LOAD_CONFIG ?? '1';
  console.log(`migrate:catalog-taxonomy: using AWS profile ${selected}`);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function mergeUnique(values: string[]): string[] {
  return stringList(values);
}

function resolveCatalog(item: Record<string, unknown>): {
  catalog: CatalogCategory;
  tags: string[];
  labels: string[];
  warning: string | null;
} {
  const existingCatalog = typeof item.catalog === 'string' ? item.catalog : '';
  const era = typeof item.era === 'string' ? item.era : '';
  const mapped = ERA_TO_TAXONOMY[era];
  const catalog = mapped?.catalog ?? (CATALOGS.has(existingCatalog as CatalogCategory)
    ? (existingCatalog as CatalogCategory)
    : 'other');
  const tags = mergeUnique([
    ...stringList(item.tags),
    ...(mapped?.tag ? [mapped.tag] : []),
  ]);
  const labels = mergeUnique(stringList(item.labels));
  const warning = mapped || era === ''
    ? null
    : `unknown era ${JSON.stringify(era)} on ${String(item.id)}; catalog set to ${catalog}`;
  return { catalog, tags, labels, warning };
}

async function main(): Promise<void> {
  const { tableName, dryRun, profile } = parseArgs();
  applyAwsProfile(profile);
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: resolveRegion() }));
  let startKey: ScanCommandOutput['LastEvaluatedKey'];
  let scanned = 0;
  let changed = 0;
  let warnings = 0;

  do {
    const page = await client.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: startKey,
      }),
    );
    for (const item of (page.Items ?? []) as Record<string, unknown>[]) {
      scanned += 1;
      if (typeof item.id !== 'string') {
        warnings += 1;
        console.warn('migrate:catalog-taxonomy: skipping row without string id');
        continue;
      }
      const next = resolveCatalog(item);
      if (next.warning) {
        warnings += 1;
        console.warn(`migrate:catalog-taxonomy: ${next.warning}`);
      }
      const willChange =
        item.catalog !== next.catalog ||
        JSON.stringify(stringList(item.tags)) !== JSON.stringify(next.tags) ||
        JSON.stringify(stringList(item.labels)) !== JSON.stringify(next.labels) ||
        Object.prototype.hasOwnProperty.call(item, 'era');
      if (!willChange) continue;
      changed += 1;
      if (changed <= 10) {
        console.log(
          `migrate:catalog-taxonomy: ${dryRun ? 'would update' : 'updating'} ${item.id} -> ${next.catalog}`,
        );
      }
      if (!dryRun) {
        await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { id: item.id },
            ConditionExpression: 'attribute_exists(#id)',
            UpdateExpression: 'SET #catalog = :catalog, #tags = :tags, #labels = :labels REMOVE #era',
            ExpressionAttributeNames: {
              '#id': 'id',
              '#catalog': 'catalog',
              '#tags': 'tags',
              '#labels': 'labels',
              '#era': 'era',
            },
            ExpressionAttributeValues: {
              ':catalog': next.catalog,
              ':tags': next.tags,
              ':labels': next.labels,
            },
          }),
        );
      }
    }
    startKey = page.LastEvaluatedKey;
  } while (startKey);

  console.log(
    `migrate:catalog-taxonomy: ${dryRun ? 'dry run' : 'done'}; scanned=${scanned} changed=${changed} warnings=${warnings}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
