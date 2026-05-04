import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { DynamoDBDocumentClient, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

export function wsManagementClient(): ApiGatewayManagementApiClient {
  const endpoint = process.env.WS_MANAGEMENT_API_ENDPOINT;
  if (!endpoint) {
    throw new Error('Missing WS_MANAGEMENT_API_ENDPOINT');
  }
  return new ApiGatewayManagementApiClient({ endpoint });
}

export async function queryConnectionsForRoom(
  doc: DynamoDBDocumentClient,
  table: string,
  roomId: string,
): Promise<string[]> {
  const out = await doc.send(
    new QueryCommand({
      TableName: table,
      IndexName: 'RoomConnectionsIndex',
      KeyConditionExpression: 'roomId = :r',
      ExpressionAttributeValues: { ':r': roomId },
    }),
  );
  const ids: string[] = [];
  for (const it of out.Items ?? []) {
    const cid = (it as { connectionId?: string }).connectionId;
    if (typeof cid === 'string') ids.push(cid);
  }
  return ids;
}

function isPostToConnectionGone(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'GoneException';
}

/** API Gateway rejects payloads over 128 KiB — keep fan-out payloads small client-side too. */
const MAX_WS_FANOUT_BYTES = 120 * 1024;

export async function postToConnections(
  client: ApiGatewayManagementApiClient,
  doc: DynamoDBDocumentClient,
  connectionsTable: string,
  ids: readonly string[],
  payload: Uint8Array,
  except?: string,
): Promise<void> {
  if (payload.byteLength > MAX_WS_FANOUT_BYTES) {
    console.warn(
      JSON.stringify({
        riffsyncDiag: 'post_fanout_skipped_payload_too_large',
        payloadBytes: payload.byteLength,
        connectionsCount: ids.length,
      }),
    );
    return;
  }
  for (const id of ids) {
    if (id === except) continue;
    try {
      await client.send(
        new PostToConnectionCommand({
          ConnectionId: id,
          Data: payload,
        }),
      );
    } catch (err: unknown) {
      if (isPostToConnectionGone(err)) {
        await doc
          .send(
            new DeleteCommand({
              TableName: connectionsTable,
              Key: { connectionId: id },
            }),
          )
          .catch(() => undefined);
      } else {
        const name =
          typeof err === 'object' && err !== null && 'name' in err
            ? String((err as { name: unknown }).name)
            : 'unknown';
        const msg =
          typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : String(err);
        console.warn(JSON.stringify({ riffsyncDiag: 'post_to_connection_failed', targetTail: id.slice(-12), name, msg }));
      }
    }
  }
}
