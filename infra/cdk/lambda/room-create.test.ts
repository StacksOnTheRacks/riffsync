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
  PutCommand: vi.fn((input: unknown) => ({ input, kind: 'Put' })),
}));

import { handler } from './room-create';

function createEvent(body: Record<string, unknown>, sub = 'host-sub-1'): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /v1/rooms',
    rawPath: '/v1/rooms',
    rawQueryString: '',
    headers: {},
    body: JSON.stringify(body),
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'POST',
        path: '/v1/rooms',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: 'req',
      routeKey: 'POST /v1/rooms',
      stage: 'prod',
      time: '01/Jan/2025:00:00:00 +0000',
      timeEpoch: 0,
      authorizer: { jwt: { claims: { sub } } },
    } as APIGatewayProxyEventV2['requestContext'],
    isBase64Encoded: false,
  };
}

const catalogItem = {
  id: 'ep-1',
  title: 'Test Episode',
  youtubeVideoId: 'abc123',
};

describe('room-create handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ROOMS_TABLE_NAME = 'rooms-table';
    process.env.CATALOG_TABLE_NAME = 'catalog-table';
  });

  it('seeds roomMode theater and avDisabled false on create', async () => {
    mocks.docSend
      .mockResolvedValueOnce({ Item: catalogItem })
      .mockResolvedValueOnce({});

    const res = await handler(
      createEvent({
        catalogEpisodeId: 'ep-1',
        playbackExpectation: 'free',
        visibility: 'public',
        roomMode: 'videoChat',
        avDisabled: true,
      }),
    );

    expect(res.statusCode).toBe(201);
    const putCall = mocks.docSend.mock.calls[1]?.[0] as { input: { Item: Record<string, unknown> } };
    expect(putCall.input.Item.roomMode).toBe('theater');
    expect(putCall.input.Item.avDisabled).toBe(false);

    const body = JSON.parse(res.body ?? '{}') as Record<string, unknown>;
    expect(body.roomMode).toBe('theater');
    expect(body.avDisabled).toBe(false);
  });
});
