import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { TextEncoder } from 'node:util';
import { minuteBucketEpochMs } from './giphy-search-shared';
import {
  postToConnections,
  queryConnectionsForRoom,
  wsManagementClient,
} from './ws-shared';

const encoder = new TextEncoder();

/** Pairs per minute per sessionId — each start and stop counts toward the pair budget. */
export const TYPING_PAIR_LIMIT_PER_MINUTE = 30;
const TYPING_EVENTS_PER_MINUTE = TYPING_PAIR_LIMIT_PER_MINUTE * 2;
const TYPING_START_COALESCE_MS = 1000;

const lastTypingStartFanOutMs = new Map<string, number>();

function isConditionalCheckFailed(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'ConditionalCheckFailedException';
}

export function typingCoalesceKey(roomId: string, sessionId: string): string {
  return `${roomId}:${sessionId}`;
}

export function shouldCoalesceTypingStart(roomId: string, sessionId: string, nowMs: number): boolean {
  const prior = lastTypingStartFanOutMs.get(typingCoalesceKey(roomId, sessionId));
  return prior !== undefined && nowMs - prior < TYPING_START_COALESCE_MS;
}

export function recordTypingStartFanOut(roomId: string, sessionId: string, nowMs: number): void {
  lastTypingStartFanOutMs.set(typingCoalesceKey(roomId, sessionId), nowMs);
}

/** Returns false when the per-minute typing budget is exhausted (silent drop). */
export async function tryConsumeTypingRateLimit(
  doc: DynamoDBDocumentClient,
  connectionsTable: string,
  connectionId: string,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const bucketMs = minuteBucketEpochMs(nowMs);
  const limit = TYPING_EVENTS_PER_MINUTE;

  try {
    await doc.send(
      new UpdateCommand({
        TableName: connectionsTable,
        Key: { connectionId },
        UpdateExpression:
          'SET typingRateBucket = :bucket, typingRateCount = if_not_exists(typingRateCount, :zero) + :one',
        ConditionExpression:
          '(attribute_not_exists(typingRateBucket) OR typingRateBucket = :bucket) AND (attribute_not_exists(typingRateCount) OR typingRateCount < :limit)',
        ExpressionAttributeValues: {
          ':bucket': bucketMs,
          ':one': 1,
          ':zero': 0,
          ':limit': limit,
        },
      }),
    );
    return true;
  } catch (err: unknown) {
    if (!isConditionalCheckFailed(err)) {
      throw err;
    }
  }

  try {
    await doc.send(
      new UpdateCommand({
        TableName: connectionsTable,
        Key: { connectionId },
        UpdateExpression: 'SET typingRateBucket = :bucket, typingRateCount = :one',
        ConditionExpression: 'attribute_not_exists(typingRateBucket) OR typingRateBucket <> :bucket',
        ExpressionAttributeValues: { ':bucket': bucketMs, ':one': 1 },
      }),
    );
    return true;
  } catch (err: unknown) {
    if (isConditionalCheckFailed(err)) {
      return false;
    }
    throw err;
  }
}

export async function fanOutTyping(params: {
  doc: DynamoDBDocumentClient;
  connectionsTable: string;
  presenceTable: string;
  roomId: string;
  sessionId: string;
  displayName: string;
  action: 'start' | 'stop';
  except?: string;
}): Promise<void> {
  const { doc, connectionsTable, presenceTable, roomId, sessionId, displayName, action, except } = params;
  const mgmt = wsManagementClient();
  const ids = await queryConnectionsForRoom(doc, presenceTable, roomId);
  const out: Record<string, unknown> = {
    type: 'typing',
    roomId,
    sessionId,
    displayName,
    action,
    ts: Date.now(),
  };
  const buf = encoder.encode(JSON.stringify(out));
  await postToConnections(mgmt, doc, connectionsTable, ids, buf, except, presenceTable);
}
