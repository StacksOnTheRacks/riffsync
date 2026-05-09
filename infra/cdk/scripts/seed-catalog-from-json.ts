/**
 * Idempotent-friendly seed: **PutRequest** per episode from **`data/catalog/episodes.json`**.
 *
 * Usage (from **`infra/cdk`** after deploy):
 *
 * ```bash
 * export AWS_PROFILE=me
 * export AWS_REGION=us-east-1
 * TABLE_NAME="$(aws cloudformation describe-stacks --region "$AWS_REGION" \
 *   --stack-name RiffSyncApi-prod \
 *   --query "Stacks[0].Outputs[?OutputKey=='CatalogTableName'].OutputValue" --output text)"
 * npm run seed:catalog -- "$TABLE_NAME"
 * ```
 *
 * Use **one line** for the npm command so the table name does not pick up a newline (zsh **`dquote>`** prompts are a sign the string broke across lines).
 *
 * Or: `npx ts-node --prefer-ts-exts scripts/seed-catalog-from-json.ts <tableName>`
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import {
  BatchWriteCommand,
  type BatchWriteCommandInput,
  DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const repoRoot = resolve(__dirname, '../../..');
const episodesPath = resolve(repoRoot, 'data/catalog/episodes.json');
const schemaPath = resolve(repoRoot, 'data/catalog/catalog.schema.json');

interface CatalogBundle {
  readonly version: number;
  readonly entries: Record<string, unknown>[];
}

function resolveDynamoRegion(): string {
  const r =
    process.env.AWS_REGION?.trim() ||
    process.env.AWS_DEFAULT_REGION?.trim();
  if (r) return r;
  console.warn(
    'seed:catalog: AWS_REGION / AWS_DEFAULT_REGION unset — defaulting to us-east-1 (set AWS_REGION if your table is elsewhere).',
  );
  return 'us-east-1';
}

async function main() {
  const tableNameRaw = process.argv[2] ?? process.env.CATALOG_TABLE_NAME;
  const tableName = typeof tableNameRaw === 'string' ? tableNameRaw.trim() : '';
  if (!tableName) {
    console.error('Usage: seed-catalog-from-json.ts <tableName>');
    console.error('Or set CATALOG_TABLE_NAME in the environment.');
    process.exit(1);
  }

  if (!/^[a-zA-Z0-9_.-]{3,255}$/.test(tableName)) {
    console.error(
      'seed:catalog: table name must match ^[a-zA-Z0-9_.-]{3,255}$ (check for accidental newlines in the shell).',
    );
    console.error(`Received (length ${tableName.length}): ${JSON.stringify(tableName)}`);
    process.exit(1);
  }

  const region = resolveDynamoRegion();

  const raw = readFileSync(episodesPath, 'utf8');
  const bundle = JSON.parse(raw) as CatalogBundle;

  const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (!validate(bundle)) {
    console.error(validate.errors);
    process.exit(1);
  }

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  const chunks: Record<string, unknown>[][] = [];
  for (let i = 0; i < bundle.entries.length; i += 25) {
    chunks.push(bundle.entries.slice(i, i + 25));
  }

  for (const group of chunks) {
    const RequestItems: NonNullable<BatchWriteCommandInput['RequestItems']> = {
      [tableName]: group.map((entry) => ({
        PutRequest: { Item: entry as Record<string, unknown> },
      })),
    };

    let unprocessed = await client.send(new BatchWriteCommand({ RequestItems }));
    let backoffMs = 200;
    while (
      unprocessed.UnprocessedItems &&
      Object.keys(unprocessed.UnprocessedItems).length > 0
    ) {
      await new Promise((r) => setTimeout(r, backoffMs));
      backoffMs = Math.min(backoffMs * 2, 10_000);
      unprocessed = await client.send(
        new BatchWriteCommand({ RequestItems: unprocessed.UnprocessedItems }),
      );
    }
  }

  console.log(`Wrote ${bundle.entries.length} catalog rows to ${tableName}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
