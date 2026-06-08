import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docSend: vi.fn(),
}));

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({ send: mocks.docSend })),
  },
  GetCommand: vi.fn((input: unknown) => ({ input, kind: 'Get' })),
}));

import {
  handler,
  readAvDisabled,
  readBroadcastCaptureActive,
  readRoomMode,
} from './room-get';

function getEvent(roomId: string): APIGatewayProxyEventV2 {
  const routeKey = 'GET /v1/rooms/{roomId}';
  return {
    version: '2.0',
    routeKey,
    rawPath: `/v1/rooms/${roomId}`,
    rawQueryString: '',
    pathParameters: { roomId },
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'GET',
        path: `/v1/rooms/${roomId}`,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: 'req-get-room',
      routeKey,
      stage: 'prod',
      time: '01/Jan/2025:00:00:00 +0000',
      timeEpoch: 0,
    } as APIGatewayProxyEventV2['requestContext'],
    isBase64Encoded: false,
  };
}

const fullRoomRow = {
  roomId: 'room-1',
  hostSub: 'host-sub-1',
  catalogEpisodeId: 'ep-1',
  youtubeVideoId: 'yt-1',
  displayTitle: 'Now Playing',
  playbackExpectation: 'free',
  visibility: 'public',
  lastActivityAt: 1_700_000_000_000,
  version: 3,
  roomMode: 'videoChat',
  avDisabled: true,
  broadcastCaptureActive: true,
};

const legacyRoomRow = {
  roomId: 'room-legacy',
  hostSub: 'host-sub-2',
  catalogEpisodeId: 'ep-2',
  youtubeVideoId: 'yt-2',
  playbackExpectation: 'premium',
  visibility: 'private',
  lastActivityAt: 1_700_000_100_000,
  version: 1,
};

describe('room-get AV field readers', () => {
  it('defaults legacy rows to theater and false AV flags', () => {
    expect(readRoomMode(legacyRoomRow)).toBe('theater');
    expect(readAvDisabled(legacyRoomRow)).toBe(false);
    expect(readBroadcastCaptureActive(legacyRoomRow)).toBe(false);
  });

  it('maps stored AV attributes from full rows', () => {
    expect(readRoomMode(fullRoomRow)).toBe('videoChat');
    expect(readAvDisabled(fullRoomRow)).toBe(true);
    expect(readBroadcastCaptureActive(fullRoomRow)).toBe(true);
  });
});

describe('room-get handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ROOMS_TABLE_NAME = 'rooms-table';
  });

  it('returns roomMode, avDisabled, and broadcastCaptureActive when stored', async () => {
    mocks.docSend.mockResolvedValueOnce({ Item: fullRoomRow });

    const res = await handler(getEvent('room-1'));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body ?? '{}') as { room: Record<string, unknown> };
    expect(body.room.roomMode).toBe('videoChat');
    expect(body.room.avDisabled).toBe(true);
    expect(body.room.broadcastCaptureActive).toBe(true);
  });

  it('defaults missing AV attributes on legacy rows without error', async () => {
    mocks.docSend.mockResolvedValueOnce({ Item: legacyRoomRow });

    const res = await handler(getEvent('room-legacy'));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body ?? '{}') as { room: Record<string, unknown> };
    expect(body.room.roomMode).toBe('theater');
    expect(body.room.avDisabled).toBe(false);
    expect(body.room.broadcastCaptureActive).toBe(false);
  });
});
