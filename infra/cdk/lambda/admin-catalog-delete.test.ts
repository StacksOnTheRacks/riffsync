import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docSend: vi.fn(),
  recordAdminCatalogRoute: vi.fn(),
}));

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({ send: mocks.docSend })),
  },
  GetCommand: vi.fn((input: unknown) => ({ input, kind: 'Get' })),
  ScanCommand: vi.fn((input: unknown) => ({ input, kind: 'Scan' })),
  DeleteCommand: vi.fn((input: unknown) => ({ input, kind: 'Delete' })),
  UpdateCommand: vi.fn((input: unknown) => ({ input, kind: 'Update' })),
}));

vi.mock('./riffsync-observability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./riffsync-observability')>();
  return {
    ...actual,
    recordAdminCatalogRoute: mocks.recordAdminCatalogRoute,
    logRiffsyncDiagError: vi.fn(),
  };
});

import { handler as deleteHandler } from './admin-catalog-delete';

function deleteEvent(
  path: string,
  claims?: Record<string, unknown>,
  pathParameters?: Record<string, string>,
): APIGatewayProxyEventV2 {
  const routeKey = 'DELETE /v1/admin/catalog/episodes/{id}';
  return {
    version: '2.0',
    routeKey,
    rawPath: path,
    rawQueryString: '',
    headers: {},
    body: undefined,
    pathParameters,
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'DELETE',
        path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: 'req-delete-1',
      routeKey,
      stage: 'prod',
      time: '01/Jan/2025:00:00:00 +0000',
      timeEpoch: 0,
      authorizer: claims ? { jwt: { claims } } : undefined,
    } as APIGatewayProxyEventV2['requestContext'],
    isBase64Encoded: false,
  };
}

describe('admin-catalog-delete handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CATALOG_TABLE_NAME = 'catalog-table';
    process.env.ROOMS_TABLE_NAME = 'rooms-table';
    delete process.env.STAFF_USER_POOL_ID;
    delete process.env.LISTS_TABLE_NAME;
  });

  it('returns 204 when episode exists and no references', async () => {
    mocks.docSend
      .mockResolvedValueOnce({ Item: { id: 'ep-1' } })
      .mockResolvedValueOnce({ Count: 0 })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Attributes: { catalogGeneration: 3 } });

    const res = await deleteHandler(
      deleteEvent(
        '/v1/admin/catalog/episodes/ep-1',
        { sub: 'staff-1', 'cognito:groups': ['admin'] },
        { id: 'ep-1' },
      ),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(204);
    expect(res?.body).toBe('');
    expect(mocks.recordAdminCatalogRoute).toHaveBeenCalledWith(
      'AdminCatalogDelete',
      'success',
      expect.objectContaining({ action: 'delete', episodeId: 'ep-1', statusCode: 204 }),
    );
  });

  it('returns 404 when episode missing', async () => {
    mocks.docSend.mockResolvedValueOnce({});

    const res = await deleteHandler(
      deleteEvent(
        '/v1/admin/catalog/episodes/missing',
        { sub: 'staff-1', 'cognito:groups': ['admin'] },
        { id: 'missing' },
      ),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(404);
    expect(JSON.parse(res?.body ?? '')).toEqual({ error: 'Not found' });
    expect(mocks.recordAdminCatalogRoute).toHaveBeenCalledWith(
      'AdminCatalogDelete',
      'not_found',
      expect.any(Object),
    );
  });

  it('returns 409 when room scan returns matches', async () => {
    mocks.docSend
      .mockResolvedValueOnce({ Item: { id: 'ep-1' } })
      .mockResolvedValueOnce({ Count: 2 });

    const res = await deleteHandler(
      deleteEvent(
        '/v1/admin/catalog/episodes/ep-1',
        { sub: 'staff-1', 'cognito:groups': ['admin'] },
        { id: 'ep-1' },
      ),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(409);
    expect(JSON.parse(res?.body ?? '')).toEqual({
      error: 'Conflict',
      code: 'catalog_episode_in_use',
      references: { rooms: 2, lists: 0 },
    });
    expect(mocks.recordAdminCatalogRoute).toHaveBeenCalledWith(
      'AdminCatalogDelete',
      'conflict',
      expect.any(Object),
    );
  });

  it('returns 403 for curator-only JWT', async () => {
    const res = await deleteHandler(
      deleteEvent(
        '/v1/admin/catalog/episodes/ep-1',
        { sub: 'staff-1', 'cognito:groups': ['curator'] },
        { id: 'ep-1' },
      ),
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

  it('returns 401 when authorizer claims omit sub', async () => {
    const res = await deleteHandler(
      deleteEvent('/v1/admin/catalog/episodes/ep-1', undefined, { id: 'ep-1' }),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(401);
    expect(JSON.parse(res?.body ?? '')).toEqual({
      error: 'Unauthorized',
      code: 'unauthorized',
    });
    expect(mocks.docSend).not.toHaveBeenCalled();
  });

  it('returns 403 when staff groups omit admin/curator', async () => {
    const res = await deleteHandler(
      deleteEvent(
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
