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
  ScanCommand: vi.fn((input: unknown) => ({ input, kind: 'Scan' })),
  GetCommand: vi.fn((input: unknown) => ({ input, kind: 'Get' })),
}));

import { handler as listHandler } from './admin-catalog-list';
import { handler as getHandler } from './admin-catalog-get';

function staffEvent(
  routeKey: string,
  path: string,
  claims?: Record<string, unknown>,
  pathParameters?: Record<string, string>,
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey,
    rawPath: path,
    rawQueryString: '',
    headers: {},
    pathParameters,
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'GET',
        path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: 'req',
      routeKey,
      stage: 'prod',
      time: '01/Jan/2025:00:00:00 +0000',
      timeEpoch: 0,
      authorizer: claims ? { jwt: { claims } } : undefined,
    } as APIGatewayProxyEventV2['requestContext'],
    isBase64Encoded: false,
  };
}

const catalogItem = {
  id: 'ep-1',
  experimentNumber: 101,
  title: 'Test Episode',
  era: 'mike',
  youtubeVideoId: 'abc123',
  carousel: false,
  spotlight: false,
  movieSearchTitle: 'Manos',
  embedAllows: false,
  curatorNotes: 'notes',
};

describe('admin-catalog-list handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CATALOG_TABLE_NAME = 'catalog-table';
    delete process.env.STAFF_USER_POOL_ID;
  });

  it('returns sorted entries with curator hints', async () => {
    mocks.docSend.mockResolvedValueOnce({
      Items: [catalogItem, { ...catalogItem, id: 'ep-2', experimentNumber: 50 }],
    });

    const res = await listHandler(
      staffEvent('GET /v1/admin/catalog', '/v1/admin/catalog', {
        sub: 'staff-1',
        'cognito:groups': ['admin'],
      }),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(200);
    const body = JSON.parse(res?.body ?? '');
    expect(body.version).toBe(1);
    expect(body.entries).toHaveLength(2);
    expect(body.entries[0].id).toBe('ep-2');
    expect(body.entries[1].movieSearchTitle).toBe('Manos');
    expect(body.entries[1].embedAllows).toBe(false);
    expect(body.entries[1].curatorNotes).toBe('notes');
  });

  it('skips catalog _meta generation row during scan', async () => {
    mocks.docSend.mockResolvedValueOnce({
      Items: [catalogItem, { id: '_meta', catalogGeneration: 2 }],
    });

    const res = await listHandler(
      staffEvent('GET /v1/admin/catalog', '/v1/admin/catalog', {
        sub: 'staff-1',
        'cognito:groups': ['admin'],
      }),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(200);
    expect(JSON.parse(res?.body ?? '').entries).toHaveLength(1);
    expect(JSON.parse(res?.body ?? '').entries[0].id).toBe('ep-1');
  });

  it('returns 403 when staff groups omit admin/curator', async () => {
    const res = await listHandler(
      staffEvent('GET /v1/admin/catalog', '/v1/admin/catalog', {
        sub: 'staff-1',
        'cognito:groups': ['viewer'],
      }),
      {} as never,
      () => undefined,
    );
    expect(res?.statusCode).toBe(403);
    expect(JSON.parse(res?.body ?? '')).toEqual({
      error: 'Forbidden',
      code: 'staff_group_required',
    });
    expect(mocks.docSend).not.toHaveBeenCalled();
  });
});

describe('admin-catalog-get handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CATALOG_TABLE_NAME = 'catalog-table';
    delete process.env.STAFF_USER_POOL_ID;
  });

  it('returns entry for known id', async () => {
    mocks.docSend.mockResolvedValueOnce({ Item: catalogItem });

    const res = await getHandler(
      staffEvent(
        'GET /v1/admin/catalog/episodes/{id}',
        '/v1/admin/catalog/episodes/ep-1',
        { sub: 'staff-1', 'cognito:groups': ['curator'] },
        { id: 'ep-1' },
      ),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(200);
    expect(JSON.parse(res?.body ?? '').entry.id).toBe('ep-1');
  });

  it('returns 404 for unknown id', async () => {
    mocks.docSend.mockResolvedValueOnce({});

    const res = await getHandler(
      staffEvent(
        'GET /v1/admin/catalog/episodes/{id}',
        '/v1/admin/catalog/episodes/missing',
        { sub: 'staff-1', 'cognito:groups': ['admin'] },
        { id: 'missing' },
      ),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(404);
    expect(JSON.parse(res?.body ?? '')).toEqual({ error: 'Not found' });
  });

  it('returns 404 for catalog _meta id without Dynamo read', async () => {
    const res = await getHandler(
      staffEvent(
        'GET /v1/admin/catalog/episodes/{id}',
        '/v1/admin/catalog/episodes/_meta',
        { sub: 'staff-1', 'cognito:groups': ['admin'] },
        { id: '_meta' },
      ),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(404);
    expect(mocks.docSend).not.toHaveBeenCalled();
  });

  it('returns 403 when staff groups omit admin/curator', async () => {
    const res = await getHandler(
      staffEvent(
        'GET /v1/admin/catalog/episodes/{id}',
        '/v1/admin/catalog/episodes/ep-1',
        { sub: 'staff-1', 'cognito:groups': ['viewer'] },
        { id: 'ep-1' },
      ),
      {} as never,
      () => undefined,
    );
    expect(res?.statusCode).toBe(403);
    expect(mocks.docSend).not.toHaveBeenCalled();
  });
});
