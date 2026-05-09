/**
 * Copies all items from **source** DynamoDB catalog table to **destination** (same primary key **`id`**).
 * Destination rows are **overwritten**. Use when refreshing the prod catalog from a backup or another table.
 *
 * ```bash
 * export AWS_PROFILE=prod-admin
 * export AWS_REGION=us-east-1
 * SOURCE="<source_catalog_table_name>"
 * DEST="$(aws cloudformation describe-stacks --stack-name RiffSyncApi-prod \
 *   --query "Stacks[0].Outputs[?OutputKey=='CatalogTableName'].OutputValue" --output text)"
 * npm run copy:catalog -- "$SOURCE" "$DEST"
 * ```
 */

import {
  BatchWriteCommand,
  type BatchWriteCommandInput,
  DynamoDBDocumentClient,
  ScanCommand,
  type ScanCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

function resolveRegion(): string {
  return (
    process.env.AWS_REGION?.trim() ||
    process.env.AWS_DEFAULT_REGION?.trim() ||
    'us-east-1'
  );
}

function assertTableArg(name: string, label: string): void {
  if (!name || !/^[a-zA-Z0-9_.-]{3,255}$/.test(name)) {
    console.error(`copy:catalog: invalid ${label} table name: ${JSON.stringify(name)}`);
    process.exit(1);
  }
}

async function batchWriteWithRetry(
  client: DynamoDBDocumentClient,
  tableName: string,
  items: Record<string, unknown>[],
): Promise<void> {
  const RequestItems: NonNullable<BatchWriteCommandInput['RequestItems']> = {
    [tableName]: items.map((Item) => ({ PutRequest: { Item } })),
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

async function main(): Promise<void> {
  const sourceName = (process.argv[2] ?? '').trim();
  const destName = (process.argv[3] ?? '').trim();
  if (!sourceName || !destName) {
    console.error('Usage: copy-catalog-dynamodb.ts <sourceCatalogTable> <destCatalogTable>');
    process.exit(1);
  }
  assertTableArg(sourceName, 'source');
  assertTableArg(destName, 'destination');
  if (sourceName === destName) {
    console.error('copy:catalog: source and destination must differ.');
    process.exit(1);
  }

  const region = resolveRegion();
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

  let startKey: ScanCommandOutput['LastEvaluatedKey'];
  let total = 0;

  do {
    const page = await client.send(
      new ScanCommand({
        TableName: sourceName,
        ExclusiveStartKey: startKey,
      }),
    );
    const items = (page.Items ?? []) as Record<string, unknown>[];
    for (let i = 0; i < items.length; i += 25) {
      const slice = items.slice(i, i + 25);
      await batchWriteWithRetry(client, destName, slice);
      total += slice.length;
      console.log(`copy:catalog: wrote ${total} rows…`);
    }
    startKey = page.LastEvaluatedKey;
  } while (startKey);

  console.log(`copy:catalog: done — ${total} rows from ${sourceName} → ${destName}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
