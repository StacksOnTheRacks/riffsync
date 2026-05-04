import {
  ApiGatewayManagementApiClient,
  GoneException,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
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
      ProjectionExpression: 'connectionId',
    }),
  );
  const ids: string[] = [];
  for (const it of out.Items ?? []) {
    const cid = (it as { connectionId?: string }).connectionId;
    if (typeof cid === 'string') ids.push(cid);
  }
  return ids;
}

export async function postToConnections(
  client: ApiGatewayManagementApiClient,
  doc: DynamoDBDocumentClient,
  connectionsTable: string,
  ids: readonly string[],
  payload: Uint8Array,
  except?: string,
): Promise<void> {
  for (const id of ids) {
    if (id === except) continue;
    try {
      await client.send(
        new PostToConnectionCommand({
          ConnectionId: id,
          Data: payload,
        }),
      );
    } catch (err) {
      const gone =
        err instanceof GoneException ||
        (typeof err === 'object' && err !== null && (err as { name?: string }).name === 'GoneException');
      if (gone) {
        await doc.send(
          new DeleteCommand({
            TableName: connectionsTable,
            Key: { connectionId: id },
          }),
        ).catch(() => undefined);
      }
    }
  }
}
