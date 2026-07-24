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
  DeleteCommand: vi.fn((input: unknown) => ({ input, kind: 'Delete' })),
}));

import { handler } from './fan-dm-ws-disconnect';

describe('fan-dm-ws-disconnect handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FAN_CONNECTIONS_TABLE_NAME = 'FanConnections';
    mocks.docSend.mockResolvedValue({});
  });

  it('deletes FanConnections row by connectionId', async () => {
    const res = await handler(
      {
        requestContext: { connectionId: 'conn-xyz' },
      } as Parameters<typeof handler>[0],
      {} as Parameters<typeof handler>[1],
      () => undefined,
    );

    expect(res.statusCode).toBe(200);
    expect(mocks.docSend).toHaveBeenCalledTimes(1);
    const del = mocks.docSend.mock.calls[0][0].input as {
      TableName: string;
      Key: { connectionId: string };
    };
    expect(del.TableName).toBe('FanConnections');
    expect(del.Key.connectionId).toBe('conn-xyz');
  });
});
