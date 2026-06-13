import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

export const CHAT_HISTORY_LIMIT_DEFAULT = 50;
export const CHAT_HISTORY_LIMIT_MAX = 100;
export const CHAT_HISTORY_TTL_SECONDS_DEFAULT = 86_400;

const MESSAGE_SK_PREFIX = 'm#';
const REACTION_SK_PREFIX = 'r#';

export type PersistedChatTextFields = {
  roomId: string;
  sessionId: string;
  displayName: string;
  text: string;
  messageId: string;
  ts: number;
  avatarUrl?: string;
};

export type PersistedChatGifFields = {
  roomId: string;
  sessionId: string;
  displayName: string;
  messageId: string;
  giphyId: string;
  renditionUrl: string;
  ts: number;
  title?: string;
  width?: number;
  height?: number;
  avatarUrl?: string;
};

export type HistoryChatTextMessage = {
  kind: 'text';
  messageId: string;
  sessionId: string;
  text: string;
  ts: number;
  displayName?: string;
  avatarUrl?: string;
};

export type HistoryChatGifMessage = {
  kind: 'gif';
  messageId: string;
  sessionId: string;
  giphyId: string;
  renditionUrl: string;
  ts: number;
  title?: string;
  width?: number;
  height?: number;
  displayName?: string;
  avatarUrl?: string;
};

export type HistoryChatMessage = HistoryChatTextMessage | HistoryChatGifMessage;

export type HistoryReactionChip = {
  count: number;
  reactedByMe: boolean;
};

export type HistoryReactionsByMessage = Record<string, Record<string, HistoryReactionChip>>;

export function parseChatHistoryLimit(raw: string | undefined): number {
  if (!raw) return CHAT_HISTORY_LIMIT_DEFAULT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return CHAT_HISTORY_LIMIT_DEFAULT;
  return Math.min(parsed, CHAT_HISTORY_LIMIT_MAX);
}

export function parseChatHistoryTtlSeconds(raw: string | undefined): number {
  if (!raw) return CHAT_HISTORY_TTL_SECONDS_DEFAULT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return CHAT_HISTORY_TTL_SECONDS_DEFAULT;
  return parsed;
}

export function messageSortKey(ts: number, messageId: string): string {
  const padded = String(Math.floor(ts)).padStart(13, '0');
  return `${MESSAGE_SK_PREFIX}${padded}#${messageId}`;
}

export function reactionSortKey(messageId: string, emoji: string, sessionId: string): string {
  return `${REACTION_SK_PREFIX}${messageId}#${emoji}#${sessionId}`;
}

function chatExpiresAt(ttlSeconds: number): number {
  return Math.floor(Date.now() / 1000) + ttlSeconds;
}

export async function persistChatTextMessage(
  doc: DynamoDBDocumentClient,
  table: string,
  fields: PersistedChatTextFields,
  ttlSeconds: number,
): Promise<void> {
  const item: Record<string, unknown> = {
    roomId: fields.roomId,
    sk: messageSortKey(fields.ts, fields.messageId),
    kind: 'text',
    messageId: fields.messageId,
    sessionId: fields.sessionId,
    displayName: fields.displayName,
    text: fields.text,
    ts: fields.ts,
    expiresAt: chatExpiresAt(ttlSeconds),
  };
  if (fields.avatarUrl) {
    item.avatarUrl = fields.avatarUrl;
  }
  await doc.send(new PutCommand({ TableName: table, Item: item }));
}

export async function persistChatGifMessage(
  doc: DynamoDBDocumentClient,
  table: string,
  fields: PersistedChatGifFields,
  ttlSeconds: number,
): Promise<void> {
  const item: Record<string, unknown> = {
    roomId: fields.roomId,
    sk: messageSortKey(fields.ts, fields.messageId),
    kind: 'gif',
    messageId: fields.messageId,
    sessionId: fields.sessionId,
    displayName: fields.displayName,
    giphyId: fields.giphyId,
    renditionUrl: fields.renditionUrl,
    ts: fields.ts,
    expiresAt: chatExpiresAt(ttlSeconds),
  };
  if (fields.title !== undefined) item.title = fields.title;
  if (fields.width !== undefined) item.width = fields.width;
  if (fields.height !== undefined) item.height = fields.height;
  if (fields.avatarUrl) item.avatarUrl = fields.avatarUrl;
  await doc.send(new PutCommand({ TableName: table, Item: item }));
}

export async function persistReactionAdd(
  doc: DynamoDBDocumentClient,
  table: string,
  roomId: string,
  messageId: string,
  emoji: string,
  sessionId: string,
  ttlSeconds: number,
): Promise<void> {
  await doc.send(
    new PutCommand({
      TableName: table,
      Item: {
        roomId,
        sk: reactionSortKey(messageId, emoji, sessionId),
        messageId,
        emoji,
        sessionId,
        expiresAt: chatExpiresAt(ttlSeconds),
      },
    }),
  );
}

export async function persistReactionRemove(
  doc: DynamoDBDocumentClient,
  table: string,
  roomId: string,
  messageId: string,
  emoji: string,
  sessionId: string,
): Promise<void> {
  await doc.send(
    new DeleteCommand({
      TableName: table,
      Key: { roomId, sk: reactionSortKey(messageId, emoji, sessionId) },
    }),
  );
}

function itemToHistoryMessage(item: Record<string, unknown>): HistoryChatMessage | null {
  const kind = item.kind;
  const messageId = typeof item.messageId === 'string' ? item.messageId : '';
  const sessionId = typeof item.sessionId === 'string' ? item.sessionId : '';
  const ts = typeof item.ts === 'number' ? item.ts : 0;
  if (messageId === '' || sessionId === '') return null;

  const displayName =
    typeof item.displayName === 'string' && item.displayName.trim() !== '' ? item.displayName : undefined;
  const avatarUrl =
    typeof item.avatarUrl === 'string' && item.avatarUrl.trim() !== '' ? item.avatarUrl.trim() : undefined;

  if (kind === 'text') {
    const text = typeof item.text === 'string' ? item.text : '';
    if (text === '') return null;
    return {
      kind: 'text',
      messageId,
      sessionId,
      text,
      ts,
      ...(displayName !== undefined ? { displayName } : {}),
      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
    };
  }

  if (kind === 'gif') {
    const giphyId = typeof item.giphyId === 'string' ? item.giphyId : '';
    const renditionUrl = typeof item.renditionUrl === 'string' ? item.renditionUrl : '';
    if (giphyId === '' || renditionUrl === '') return null;
    const title = typeof item.title === 'string' && item.title.trim() !== '' ? item.title : undefined;
    const width = typeof item.width === 'number' ? item.width : undefined;
    const height = typeof item.height === 'number' ? item.height : undefined;
    return {
      kind: 'gif',
      messageId,
      sessionId,
      giphyId,
      renditionUrl,
      ts,
      ...(title !== undefined ? { title } : {}),
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(displayName !== undefined ? { displayName } : {}),
      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
    };
  }

  return null;
}

export function buildReactionsByMessage(
  reactionItems: readonly Record<string, unknown>[],
  messageIds: ReadonlySet<string>,
  viewerSessionId: string,
): HistoryReactionsByMessage {
  const grouped = new Map<string, Map<string, Set<string>>>();

  for (const item of reactionItems) {
    const messageId = typeof item.messageId === 'string' ? item.messageId : '';
    const emoji = typeof item.emoji === 'string' ? item.emoji : '';
    const sessionId = typeof item.sessionId === 'string' ? item.sessionId : '';
    if (messageId === '' || emoji === '' || sessionId === '' || !messageIds.has(messageId)) continue;

    let perEmoji = grouped.get(messageId);
    if (!perEmoji) {
      perEmoji = new Map();
      grouped.set(messageId, perEmoji);
    }
    let reactors = perEmoji.get(emoji);
    if (!reactors) {
      reactors = new Set();
      perEmoji.set(emoji, reactors);
    }
    reactors.add(sessionId);
  }

  const out: HistoryReactionsByMessage = {};
  for (const [messageId, perEmoji] of grouped) {
    const chips: Record<string, HistoryReactionChip> = {};
    for (const [emoji, reactors] of perEmoji) {
      chips[emoji] = {
        count: reactors.size,
        reactedByMe: reactors.has(viewerSessionId),
      };
    }
    out[messageId] = chips;
  }
  return out;
}

export async function queryChatHistory(
  doc: DynamoDBDocumentClient,
  table: string,
  roomId: string,
  viewerSessionId: string,
  limit: number,
): Promise<{ messages: HistoryChatMessage[]; reactions: HistoryReactionsByMessage }> {
  const messageOut = await doc.send(
    new QueryCommand({
      TableName: table,
      KeyConditionExpression: 'roomId = :r AND begins_with(sk, :pfx)',
      ExpressionAttributeValues: { ':r': roomId, ':pfx': MESSAGE_SK_PREFIX },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );

  const rawMessages = (messageOut.Items ?? []) as Record<string, unknown>[];
  const messages = rawMessages
    .map(itemToHistoryMessage)
    .filter((m): m is HistoryChatMessage => m !== null)
    .reverse();

  const messageIds = new Set(messages.map((m) => m.messageId));
  if (messageIds.size === 0) {
    return { messages, reactions: {} };
  }

  const reactionOut = await doc.send(
    new QueryCommand({
      TableName: table,
      KeyConditionExpression: 'roomId = :r AND begins_with(sk, :pfx)',
      ExpressionAttributeValues: { ':r': roomId, ':pfx': REACTION_SK_PREFIX },
    }),
  );

  const reactions = buildReactionsByMessage(
    (reactionOut.Items ?? []) as Record<string, unknown>[],
    messageIds,
    viewerSessionId,
  );

  return { messages, reactions };
}
