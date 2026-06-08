import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docSend: vi.fn(),
}));

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(),
  ConditionalCheckFailedException: class ConditionalCheckFailedException extends Error {
    name = 'ConditionalCheckFailedException';
  },
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({ send: mocks.docSend })),
  },
  GetCommand: vi.fn((input: unknown) => ({ input, kind: 'Get' })),
  UpdateCommand: vi.fn((input: unknown) => ({ input, kind: 'Update' })),
}));

const teardownMocks = vi.hoisted(() => ({
  requestSfuProducerTeardown: vi.fn(),
}));

vi.mock('./sfu-admin-teardown', () => ({
  requestSfuProducerTeardown: teardownMocks.requestSfuProducerTeardown,
}));

import { handler } from './room-patch';

const hostSub = 'host-sub-1';

const baseRoom = {
  roomId: 'room-1',
  hostSub,
  catalogEpisodeId: 'ep-1',
  youtubeVideoId: 'yt-1',
  playbackExpectation: 'free',
  visibility: 'private',
  lastActivityAt: 1_700_000_000_000,
  version: 2,
  roomMode: 'theater',
  avDisabled: false,
  broadcastCaptureActive: true,
};

function patchEvent(
  body: Record<string, unknown>,
  sub = hostSub,
  roomId = 'room-1',
): APIGatewayProxyEventV2 {
  const routeKey = 'PATCH /v1/rooms/{roomId}';
  return {
    version: '2.0',
    routeKey,
    rawPath: `/v1/rooms/${roomId}`,
    rawQueryString: '',
    pathParameters: { roomId },
    headers: {},
    body: JSON.stringify(body),
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'PATCH',
        path: `/v1/rooms/${roomId}`,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: 'req-patch-room',
      routeKey,
      stage: 'prod',
      time: '01/Jan/2025:00:00:00 +0000',
      timeEpoch: 0,
      authorizer: { jwt: { claims: { sub } } },
    } as APIGatewayProxyEventV2['requestContext'],
    isBase64Encoded: false,
  };
}

describe('room-patch handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ROOMS_TABLE_NAME = 'rooms-table';
    process.env.CATALOG_TABLE_NAME = 'catalog-table';
    process.env.RIFFSYNC_API_ENV = 'prod';
    teardownMocks.requestSfuProducerTeardown.mockResolvedValue({ ok: true, closedCount: 0 });
  });

  it('updates roomMode and avDisabled with version increment', async () => {
    mocks.docSend.mockResolvedValueOnce({ Item: baseRoom }).mockResolvedValueOnce({});

    const res = await handler(
      patchEvent({ roomMode: 'videoChat', avDisabled: true }),
    );

    expect(teardownMocks.requestSfuProducerTeardown).toHaveBeenCalledWith({
      env: 'prod',
      roomId: 'room-1',
      producerClass: 'participant_av',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body ?? '{}') as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.version).toBe(3);
    expect(body.roomMode).toBe('videoChat');
    expect(body.avDisabled).toBe(true);
    expect(body.broadcastCaptureActive).toBe(true);

    const updateCall = mocks.docSend.mock.calls[1]?.[0] as { input: Record<string, unknown> };
    expect(updateCall.input.UpdateExpression).toContain('#rm = :rm');
    expect(updateCall.input.UpdateExpression).toContain('#ad = :ad');
    expect(updateCall.input.ExpressionAttributeValues).toMatchObject({
      ':rm': 'videoChat',
      ':ad': true,
      ':vcur': 2,
      ':vnext': 3,
    });
  });

  it('defaults legacy AV fields in response when omitted from patch', async () => {
    const legacyRoom = {
      roomId: 'room-legacy',
      hostSub,
      catalogEpisodeId: 'ep-1',
      youtubeVideoId: 'yt-1',
      playbackExpectation: 'free',
      visibility: 'private',
      lastActivityAt: 1_700_000_000_000,
      version: 1,
    };
    mocks.docSend.mockResolvedValueOnce({ Item: legacyRoom }).mockResolvedValueOnce({});

    const res = await handler(patchEvent({ avDisabled: true }, hostSub, 'room-legacy'));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body ?? '{}') as Record<string, unknown>;
    expect(body.roomMode).toBe('theater');
    expect(body.avDisabled).toBe(true);
    expect(body.broadcastCaptureActive).toBe(false);
  });

  it('rejects invalid roomMode with 400', async () => {
    mocks.docSend.mockResolvedValueOnce({ Item: baseRoom });

    const res = await handler(patchEvent({ roomMode: 'cinema' }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body ?? '{}')).toMatchObject({
      error: 'roomMode must be "theater" or "videoChat"',
    });
    expect(mocks.docSend).toHaveBeenCalledTimes(1);
  });

  it('rejects avDisabled null with 400', async () => {
    mocks.docSend.mockResolvedValueOnce({ Item: baseRoom });

    const res = await handler(patchEvent({ avDisabled: null }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body ?? '{}')).toMatchObject({
      error: 'avDisabled must be boolean',
    });
    expect(mocks.docSend).toHaveBeenCalledTimes(1);
  });

  it('returns 403 for non-host', async () => {
    mocks.docSend.mockResolvedValueOnce({ Item: baseRoom });

    const res = await handler(patchEvent({ roomMode: 'videoChat' }, 'other-sub'));

    expect(res.statusCode).toBe(403);
    expect(mocks.docSend).toHaveBeenCalledTimes(1);
  });

  it('returns 409 on stale version', async () => {
    mocks.docSend
      .mockResolvedValueOnce({ Item: baseRoom })
      .mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' });

    const res = await handler(patchEvent({ avDisabled: true }));

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body ?? '{}')).toMatchObject({
      error: 'Conflict — stale version',
      version: 2,
    });
  });

  it('does not call SFU teardown when avDisabled is false', async () => {
    mocks.docSend.mockResolvedValueOnce({ Item: baseRoom }).mockResolvedValueOnce({});

    const res = await handler(patchEvent({ avDisabled: false }));

    expect(res.statusCode).toBe(200);
    expect(teardownMocks.requestSfuProducerTeardown).not.toHaveBeenCalled();
  });

  it('still returns 200 when SFU teardown fails after avDisabled write', async () => {
    mocks.docSend.mockResolvedValueOnce({ Item: baseRoom }).mockResolvedValueOnce({});
    teardownMocks.requestSfuProducerTeardown.mockResolvedValueOnce({
      ok: false,
      reason: 'http_error',
      detail: 'timeout',
    });

    const res = await handler(patchEvent({ avDisabled: true }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body ?? '{}') as Record<string, unknown>;
    expect(body.avDisabled).toBe(true);
  });

  it('atomically patches roomMode and clears broadcastCaptureActive', async () => {
    mocks.docSend.mockResolvedValueOnce({ Item: baseRoom }).mockResolvedValueOnce({});

    const res = await handler(
      patchEvent({ roomMode: 'videoChat', broadcastCaptureActive: null }),
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body ?? '{}') as Record<string, unknown>;
    expect(body.roomMode).toBe('videoChat');
    expect(body.broadcastCaptureActive).toBe(false);
    expect(body.avDisabled).toBe(false);

    const updateCall = mocks.docSend.mock.calls[1]?.[0] as { input: Record<string, unknown> };
    expect(updateCall.input.UpdateExpression).toContain('#rm = :rm');
    expect(updateCall.input.UpdateExpression).toContain('#bc = :bc');
    expect(updateCall.input.ExpressionAttributeValues).toMatchObject({
      ':rm': 'videoChat',
      ':bc': null,
    });
  });
});
