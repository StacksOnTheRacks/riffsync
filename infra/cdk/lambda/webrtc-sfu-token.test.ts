import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docSend: vi.fn(),
  verifyAccessToken: vi.fn(),
  smSend: vi.fn(),
  queryRoomPresenceItems: vi.fn(),
}));

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({ send: mocks.docSend })),
  },
  GetCommand: vi.fn((input: unknown) => ({ input, kind: 'Get' })),
  QueryCommand: vi.fn((input: unknown) => ({ input, kind: 'Query' })),
}));

vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: vi.fn(() => ({ send: mocks.smSend })),
  GetSecretValueCommand: vi.fn((input: unknown) => ({ input, kind: 'GetSecret' })),
}));

vi.mock('./cognito-jwt', () => ({
  verifyAccessToken: (...args: unknown[]) => mocks.verifyAccessToken(...args),
}));

vi.mock('./ws-shared', () => ({
  queryRoomPresenceItems: (...args: unknown[]) => mocks.queryRoomPresenceItems(...args),
}));

import { verifySfuJoinToken } from '../../../services/riffsync-sfu/src/jwt';
import { __resetParticipantMintRateLimitsForTests, handler } from './webrtc-sfu-token';

const hostSub = 'host-sub-1';
const fanSub = 'fan-sub-1';
const joinSecret = 'test-hmac-secret-at-least-32-chars-long';

function tokenEvent(options: {
  roomId?: string;
  sessionId?: string;
  body?: Record<string, unknown>;
  authorization?: string;
}): APIGatewayProxyEventV2 {
  const roomId = options.roomId ?? 'room-1';
  const sessionId = options.sessionId ?? 'sess-1';
  const headers: Record<string, string> = {
    'X-Session-Id': sessionId,
  };
  if (options.authorization) {
    headers.Authorization = options.authorization;
  }
  return {
    version: '2.0',
    routeKey: 'POST /v1/webrtc/sfu-token',
    rawPath: '/v1/webrtc/sfu-token',
    rawQueryString: '',
    headers,
    body: JSON.stringify({ roomId, ...(options.body ?? {}) }),
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'POST',
        path: '/v1/webrtc/sfu-token',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: 'req-sfu-token',
      routeKey: 'POST /v1/webrtc/sfu-token',
      stage: 'prod',
      time: '01/Jan/2025:00:00:00 +0000',
      timeEpoch: 0,
    } as APIGatewayProxyEventV2['requestContext'],
    isBase64Encoded: false,
  };
}

function parseBody(res: { statusCode?: number; body?: string }) {
  expect(res.body).toBeTruthy();
  return JSON.parse(res.body as string) as Record<string, unknown>;
}

function stubRoomAndPresence(options: {
  room?: Record<string, unknown>;
  myConn?: Record<string, unknown>;
  presenceItems?: Record<string, unknown>[];
}) {
  mocks.docSend.mockImplementation(async (cmd: { kind?: string; input?: { TableName?: string } }) => {
    const table = cmd.input?.TableName;
    if (table === 'rooms') {
      return {
        Item: {
          roomId: 'room-1',
          hostSub,
          avDisabled: false,
          ...(options.room ?? {}),
        },
      };
    }
    if (table === 'presence' && cmd.kind === 'Query') {
      return {
        Items: [
          {
            roomId: 'room-1',
            sessionId: 'sess-1',
            presenceKey: 'sess-1#conn-1',
            ...(options.myConn ?? {}),
          },
        ],
      };
    }
    return {};
  });
  mocks.queryRoomPresenceItems.mockResolvedValue(options.presenceItems ?? []);
}

describe('webrtc-sfu-token handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetParticipantMintRateLimitsForTests();
    process.env.ROOMS_TABLE_NAME = 'rooms';
    process.env.ROOM_PRESENCE_TABLE_NAME = 'presence';
    process.env.RIFFSYNC_API_ENV = 'prod';
    process.env.SFU_JOIN_SECRET_ID = 'sfu-join-secret';
    process.env.SFU_PUBLIC_WS_URL = 'wss://sfu.example/ws';
    process.env.SFU_MAX_PRODUCERS_PER_ROOM = '24';
    mocks.smSend.mockResolvedValue({ SecretString: joinSecret });
    mocks.verifyAccessToken.mockResolvedValue(null);
  });

  it('grants host_screen when the host requests producerClass host_screen', async () => {
    stubRoomAndPresence({
      myConn: { hostSub, fanSub: hostSub },
    });
    mocks.verifyAccessToken.mockResolvedValue({ sub: hostSub });

    const res = await handler(
      tokenEvent({
        authorization: 'Bearer host-jwt',
        body: { producerClass: 'host_screen' },
      }),
    );
    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.role).toBe('producer');
    expect(body.producerClass).toBe('host_screen');
    expect(body.producerClasses).toEqual(['host_screen']);
    const claims = verifySfuJoinToken(body.token as string, joinSecret);
    expect(claims?.producerClasses).toEqual(['host_screen']);
    expect(claims?.fanSub).toBeUndefined();
  });

  it('grants both producer classes when the host requests producerClasses', async () => {
    stubRoomAndPresence({
      myConn: { hostSub, fanSub: hostSub },
    });
    mocks.verifyAccessToken.mockResolvedValue({ sub: hostSub });

    const res = await handler(
      tokenEvent({
        authorization: 'Bearer host-jwt',
        body: { producerClasses: ['host_screen', 'participant_av'] },
      }),
    );
    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.role).toBe('producer');
    expect(body.producerClasses).toEqual(['host_screen', 'participant_av']);
    const claims = verifySfuJoinToken(body.token as string, joinSecret);
    expect(claims?.producerClasses).toEqual(['host_screen', 'participant_av']);
    expect(claims?.fanSub).toBe(hostSub);
  });

  it('grants consumer to a signed-in fan before participant AV publish', async () => {
    stubRoomAndPresence({
      myConn: { fanSub },
    });
    mocks.verifyAccessToken.mockResolvedValue({ sub: fanSub });

    const res = await handler(
      tokenEvent({
        authorization: 'Bearer fan-jwt',
      }),
    );
    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.role).toBe('consumer');
    expect(body.producerClass).toBeUndefined();
  });

  it('grants participant_av to a signed-in fan when avDisabled is false', async () => {
    stubRoomAndPresence({
      myConn: { fanSub },
    });
    mocks.verifyAccessToken.mockResolvedValue({ sub: fanSub });

    const res = await handler(
      tokenEvent({
        authorization: 'Bearer fan-jwt',
        body: { producerClass: 'participant_av' },
      }),
    );
    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.role).toBe('producer');
    expect(body.producerClass).toBe('participant_av');
    const claims = verifySfuJoinToken(body.token as string, joinSecret);
    expect(claims?.producerClasses).toEqual(['participant_av']);
    expect(claims?.fanSub).toBe(fanSub);
  });

  it('returns consumer role for anonymous guests', async () => {
    stubRoomAndPresence({ myConn: {} });

    const res = await handler(tokenEvent({}));
    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.role).toBe('consumer');
    expect(body.producerClass).toBeUndefined();
    const claims = verifySfuJoinToken(body.token as string, joinSecret);
    expect(claims?.role).toBe('consumer');
    expect(claims?.producerClass).toBeUndefined();
  });

  it('returns av_disabled when participant_av is requested and avDisabled is true', async () => {
    stubRoomAndPresence({
      room: { avDisabled: true },
      myConn: { fanSub },
    });
    mocks.verifyAccessToken.mockResolvedValue({ sub: fanSub });

    const res = await handler(
      tokenEvent({
        authorization: 'Bearer fan-jwt',
        body: { producerClass: 'participant_av' },
      }),
    );
    expect(res.statusCode).toBe(403);
    const body = parseBody(res);
    expect(body.code).toBe('av_disabled');
  });

  it('returns fan_auth_required without verified fan JWT on participant path', async () => {
    stubRoomAndPresence({ myConn: { fanSub } });

    const res = await handler(tokenEvent({ body: { producerClass: 'participant_av' } }));
    expect(res.statusCode).toBe(403);
    const body = parseBody(res);
    expect(body.code).toBe('fan_auth_required');
  });

  it('grants participant_av when JWT is valid but the presence row lacks fanSub (WS query JWT miss)', async () => {
    stubRoomAndPresence({ myConn: {} });
    mocks.verifyAccessToken.mockResolvedValue({ sub: fanSub });

    const res = await handler(
      tokenEvent({
        authorization: 'Bearer fan-jwt',
        body: { producerClass: 'participant_av' },
      }),
    );
    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.role).toBe('producer');
    expect(body.producerClass).toBe('participant_av');
    const claims = verifySfuJoinToken(body.token as string, joinSecret);
    expect(claims?.fanSub).toBe(fanSub);
  });

  it('prefers the presence row whose fanSub matches the JWT when multiple tabs share sessionId', async () => {
    mocks.docSend.mockImplementation(async (cmd: { kind?: string; input?: { TableName?: string } }) => {
      const table = cmd.input?.TableName;
      if (table === 'rooms') {
        return { Item: { roomId: 'room-1', hostSub, avDisabled: false } };
      }
      if (table === 'presence' && cmd.kind === 'Query') {
        return {
          Items: [
            {
              roomId: 'room-1',
              sessionId: 'sess-1',
              presenceKey: 'sess-1#conn-guest',
              lastSeenAt: 200,
            },
            {
              roomId: 'room-1',
              sessionId: 'sess-1',
              presenceKey: 'sess-1#conn-signed-in',
              fanSub,
              lastSeenAt: 100,
            },
          ],
        };
      }
      return {};
    });
    mocks.queryRoomPresenceItems.mockResolvedValue([]);
    mocks.verifyAccessToken.mockResolvedValue({ sub: fanSub });

    const res = await handler(
      tokenEvent({
        authorization: 'Bearer fan-jwt',
        body: { producerClass: 'participant_av' },
      }),
    );
    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.producerClass).toBe('participant_av');
  });

  it('returns unknown_session when presence row is missing', async () => {
    mocks.docSend.mockImplementation(async (cmd: { kind?: string; input?: { TableName?: string } }) => {
      if (cmd.input?.TableName === 'rooms') {
        return { Item: { roomId: 'room-1', hostSub, avDisabled: false } };
      }
      if (cmd.kind === 'Query') {
        return { Items: [] };
      }
      return {};
    });

    const res = await handler(tokenEvent({ sessionId: 'sess-missing' }));
    expect(res.statusCode).toBe(403);
    const body = parseBody(res);
    expect(body.code).toBe('unknown_session');
  });

  it('grants host_screen when the host JWT is valid but the presence row lacks hostSub', async () => {
    stubRoomAndPresence({
      myConn: { fanSub: hostSub },
    });
    mocks.verifyAccessToken.mockResolvedValue({ sub: hostSub });

    const res = await handler(
      tokenEvent({
        authorization: 'Bearer host-jwt',
        body: { producerClass: 'host_screen' },
      }),
    );
    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.role).toBe('producer');
    expect(body.producerClass).toBe('host_screen');
  });

  it('returns not_host when a non-host requests host_screen', async () => {
    stubRoomAndPresence({ myConn: { fanSub } });
    mocks.verifyAccessToken.mockResolvedValue({ sub: fanSub });

    const res = await handler(
      tokenEvent({
        authorization: 'Bearer fan-jwt',
        body: { producerClass: 'host_screen' },
      }),
    );
    expect(res.statusCode).toBe(403);
    const body = parseBody(res);
    expect(body.code).toBe('not_host');
  });

  it('returns rate_limited after per-fanSub throttle is exceeded', async () => {
    stubRoomAndPresence({ myConn: { fanSub } });
    mocks.verifyAccessToken.mockResolvedValue({ sub: fanSub });

    for (let i = 0; i < 30; i += 1) {
      const ok = await handler(
        tokenEvent({
          authorization: 'Bearer fan-jwt',
          body: { producerClass: 'participant_av' },
        }),
      );
      expect(ok.statusCode).toBe(200);
    }

    const res = await handler(
      tokenEvent({
        authorization: 'Bearer fan-jwt',
        body: { producerClass: 'participant_av' },
      }),
    );
    expect(res.statusCode).toBe(429);
    const body = parseBody(res);
    expect(body.code).toBe('rate_limited');
  });

  it('returns publisher_cap_exceeded when room fanSub estimate is at cap', async () => {
    const presenceItems = Array.from({ length: 8 }, (_, i) => ({
      roomId: 'room-1',
      sessionId: `sess-${i}`,
      fanSub: `fan-cap-${i}`,
    }));
    stubRoomAndPresence({
      myConn: { fanSub: 'fan-new' },
      presenceItems,
    });
    mocks.verifyAccessToken.mockResolvedValue({ sub: 'fan-new' });

    const res = await handler(
      tokenEvent({
        authorization: 'Bearer fan-jwt',
        body: { producerClass: 'participant_av' },
      }),
    );
    expect(res.statusCode).toBe(403);
    const body = parseBody(res);
    expect(body.code).toBe('publisher_cap_exceeded');
  });
});
