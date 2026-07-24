import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docSend: vi.fn(),
  verifyAccessToken: vi.fn(),
}));

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({ send: mocks.docSend })),
  },
  PutCommand: vi.fn((input: unknown) => ({ input, kind: 'Put' })),
}));

vi.mock('./cognito-jwt', () => ({
  verifyAccessToken: mocks.verifyAccessToken,
}));

import { handler } from './fan-dm-ws-connect';

describe('fan-dm-ws-connect handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FAN_CONNECTIONS_TABLE_NAME = 'FanConnections';
    mocks.docSend.mockResolvedValue({});
  });

  it('returns 401 without fan JWT', async () => {
    mocks.verifyAccessToken.mockResolvedValue(null);

    const res = await handler(
      {
        requestContext: { connectionId: 'conn-1' },
        queryStringParameters: {},
      } as Parameters<typeof handler>[0],
      {} as Parameters<typeof handler>[1],
      () => undefined,
    );

    expect(res.statusCode).toBe(401);
    expect(mocks.docSend).not.toHaveBeenCalled();
  });

  it('writes FanConnections row with fanSub when JWT verifies', async () => {
    mocks.verifyAccessToken.mockResolvedValue({ sub: 'fan-a' });

    const res = await handler(
      {
        requestContext: { connectionId: 'conn-abc' },
        queryStringParameters: {
          accessToken: 'jwt-token',
          sessionId: 'browser-tab-1',
        },
      } as Parameters<typeof handler>[0],
      {} as Parameters<typeof handler>[1],
      () => undefined,
    );

    expect(res.statusCode).toBe(200);
    expect(mocks.docSend).toHaveBeenCalledTimes(1);
    const put = mocks.docSend.mock.calls[0][0].input as {
      TableName: string;
      Item: Record<string, unknown>;
    };
    expect(put.TableName).toBe('FanConnections');
    expect(put.Item.connectionId).toBe('conn-abc');
    expect(put.Item.fanSub).toBe('fan-a');
    expect(put.Item.sessionId).toBe('browser-tab-1');
    expect(typeof put.Item.connectedAt).toBe('number');
    expect(typeof put.Item.expiresAt).toBe('number');
  });
});
