import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';

/** Sparse GSI on RoomPresence — PK `fanSub`, SK `fanSubRoomSk` (`roomId#presenceKey`). */
export const ROOM_PRESENCE_FAN_SUB_INDEX = 'FanSubPresenceIndex';

export function fanSubRoomPresenceSk(roomId: string, presenceKey: string): string {
  return `${roomId}#${presenceKey}`;
}

/** True when the fan has at least one live RoomPresence row in any room (multi-tab OR). */
export async function isFanOnlineInAnyRoom(
  doc: DynamoDBDocumentClient,
  tableName: string,
  fanSub: string,
): Promise<boolean> {
  const out = await doc.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: ROOM_PRESENCE_FAN_SUB_INDEX,
      KeyConditionExpression: 'fanSub = :fanSub',
      ExpressionAttributeValues: { ':fanSub': fanSub },
      Limit: 1,
      ProjectionExpression: 'fanSub',
    }),
  );
  return (out.Items?.length ?? 0) > 0;
}
