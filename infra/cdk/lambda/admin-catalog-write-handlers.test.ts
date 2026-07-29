import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docSend: vi.fn(),
  recordAdminCatalogRoute: vi.fn(),
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
  PutCommand: vi.fn((input: unknown) => ({ input, kind: 'Put' })),
  GetCommand: vi.fn((input: unknown) => ({ input, kind: 'Get' })),
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

import { handler as postHandler } from './admin-catalog-post';
import { handler as patchHandler } from './admin-catalog-patch';

function staffEvent(
  method: 'POST' | 'PATCH',
  path: string,
  body: Record<string, unknown>,
  claims?: Record<string, unknown>,
  pathParameters?: Record<string, string>,
): APIGatewayProxyEventV2 {
  const routeKey = `${method} /v1/admin/catalog/episodes/{id}`;
  return {
    version: '2.0',
    routeKey,
    rawPath: path,
    rawQueryString: '',
    headers: {},
    body: JSON.stringify(body),
    pathParameters,
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method,
        path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: 'req-post-1',
      routeKey,
      stage: 'prod',
      time: '01/Jan/2025:00:00:00 +0000',
      timeEpoch: 0,
      authorizer: claims ? { jwt: { claims } } : undefined,
    } as APIGatewayProxyEventV2['requestContext'],
    isBase64Encoded: false,
  };
}

const writeBody = {
  experimentNumber: 101,
  title: 'Test Episode',
  catalog: 'mst3k',
  tags: ['Era: Mike'],
  labels: [],
  youtubeVideoId: null,
  youtubeWatchUrl: null,
  carousel: false,
  spotlight: false,
};

const existingItem = {
  id: 'ep-1',
  experimentNumber: 101,
  title: 'Test Episode',
  catalog: 'mst3k',
  tags: ['Era: Mike'],
  labels: [],
  youtubeVideoId: null,
  youtubeWatchUrl: null,
  tagline: 'keep',
  posterImageUrl: null,
  backdropImageUrl: null,
  tmdbMovieId: null,
  tmdbArtworkSyncedAt: null,
  carousel: false,
  spotlight: false,
};

describe('admin-catalog-post handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CATALOG_TABLE_NAME = 'catalog-table';
    delete process.env.STAFF_USER_POOL_ID;
  });

  it('creates row with null reconcile fields and returns 201', async () => {
    mocks.docSend.mockResolvedValueOnce({}).mockResolvedValueOnce({
      Attributes: { catalogGeneration: 2 },
    });

    const res = await postHandler(
      staffEvent(
        'POST',
        '/v1/admin/catalog/episodes/ep-1',
        writeBody,
        { sub: 'staff-1', 'cognito:groups': ['admin'] },
        { id: 'ep-1' },
      ),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(201);
    const body = JSON.parse(res?.body ?? '');
    expect(body.entry.id).toBe('ep-1');
    expect(body.entry.tagline).toBeNull();
    expect(body.entry.embedAllows).toBe(true);
    expect(body.entry.movieSearchTitle).toBeNull();
    expect(mocks.recordAdminCatalogRoute).toHaveBeenCalledWith(
      'AdminCatalogPost',
      'success',
      expect.objectContaining({ episodeId: 'ep-1', sub: 'staff-1', statusCode: 201 }),
    );
  });

  it('returns 409 when id exists', async () => {
    const { ConditionalCheckFailedException } = await import('@aws-sdk/client-dynamodb');
    mocks.docSend.mockRejectedValueOnce(new ConditionalCheckFailedException({ message: 'exists', $metadata: {} }));

    const res = await postHandler(
      staffEvent(
        'POST',
        '/v1/admin/catalog/episodes/ep-1',
        writeBody,
        { sub: 'staff-1', 'cognito:groups': ['curator'] },
        { id: 'ep-1' },
      ),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(409);
    expect(JSON.parse(res?.body ?? '')).toEqual({
      error: 'Conflict',
      code: 'catalog_episode_exists',
    });
  });

  it('returns 400 when body includes read-only key', async () => {
    const res = await postHandler(
      staffEvent(
        'POST',
        '/v1/admin/catalog/episodes/ep-1',
        { ...writeBody, tagline: 'nope' },
        { sub: 'staff-1', 'cognito:groups': ['admin'] },
        { id: 'ep-1' },
      ),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(400);
    expect(JSON.parse(res?.body ?? '').code).toBe('validation_error');
    expect(mocks.recordAdminCatalogRoute).toHaveBeenCalledWith(
      'AdminCatalogPost',
      'validation_error',
      expect.objectContaining({ validationFieldPaths: ['/tagline'] }),
    );
  });

  it('persists operator hints on create', async () => {
    mocks.docSend.mockResolvedValueOnce({}).mockResolvedValueOnce({
      Attributes: { catalogGeneration: 3 },
    });

    const res = await postHandler(
      staffEvent(
        'POST',
        '/v1/admin/catalog/episodes/ep-2',
        {
          ...writeBody,
          movieSearchTitle: 'The Crawling Eye',
          embedAllows: false,
        },
        { sub: 'staff-1', 'cognito:groups': ['admin'] },
        { id: 'ep-2' },
      ),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(201);
    const body = JSON.parse(res?.body ?? '');
    expect(body.entry.movieSearchTitle).toBe('The Crawling Eye');
    expect(body.entry.embedAllows).toBe(false);
  });

  it('persists Custom-host fields and returns them on public projection', async () => {
    mocks.docSend.mockResolvedValueOnce({}).mockResolvedValueOnce({
      Attributes: { catalogGeneration: 4 },
    });

    const res = await postHandler(
      staffEvent(
        'POST',
        '/v1/admin/catalog/episodes/ep-custom',
        {
          ...writeBody,
          playbackHost: 'custom',
          customPlaybackUrl: 'https://example.test/movie',
        },
        { sub: 'staff-1', 'cognito:groups': ['admin'] },
        { id: 'ep-custom' },
      ),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(201);
    const body = JSON.parse(res?.body ?? '');
    expect(body.entry.playbackHost).toBe('custom');
    expect(body.entry.customPlaybackUrl).toBe('https://example.test/movie');
    const putInput = mocks.docSend.mock.calls[0]?.[0] as { input?: { Item?: Record<string, unknown> } };
    expect(putInput?.input?.Item?.playbackHost).toBe('custom');
    expect(putInput?.input?.Item?.customPlaybackUrl).toBe('https://example.test/movie');
  });

  it('returns 403 when staff groups omit admin/curator', async () => {
    const res = await postHandler(
      staffEvent(
        'POST',
        '/v1/admin/catalog/episodes/ep-1',
        writeBody,
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

describe('admin-catalog-patch handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CATALOG_TABLE_NAME = 'catalog-table';
    delete process.env.STAFF_USER_POOL_ID;
  });

  it('updates allowed fields and preserves reconcile columns', async () => {
    mocks.docSend
      .mockResolvedValueOnce({ Item: existingItem })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Attributes: { catalogGeneration: 5 } });

    const res = await patchHandler(
      staffEvent(
        'PATCH',
        '/v1/admin/catalog/episodes/ep-1',
        { title: 'Updated title' },
        { sub: 'staff-1', 'cognito:groups': ['admin'] },
        { id: 'ep-1' },
      ),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(200);
    const body = JSON.parse(res?.body ?? '');
    expect(body.entry.title).toBe('Updated title');
    expect(body.entry.tagline).toBe('keep');
    expect(mocks.recordAdminCatalogRoute).toHaveBeenCalledWith(
      'AdminCatalogPatch',
      'success',
      expect.objectContaining({ action: 'update', episodeId: 'ep-1' }),
    );
  });

  it('patches operator hints and returns updated entry', async () => {
    mocks.docSend
      .mockResolvedValueOnce({ Item: existingItem })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Attributes: { catalogGeneration: 6 } });

    const res = await patchHandler(
      staffEvent(
        'PATCH',
        '/v1/admin/catalog/episodes/ep-1',
        {
          movieSearchTitle: 'The Crawling Eye',
          embedAllows: false,
        },
        { sub: 'staff-1', 'cognito:groups': ['admin'] },
        { id: 'ep-1' },
      ),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(200);
    const body = JSON.parse(res?.body ?? '');
    expect(body.entry.movieSearchTitle).toBe('The Crawling Eye');
    expect(body.entry.embedAllows).toBe(false);
  });

  it('returns 400 when patch includes tmdbNeedsReview', async () => {
    mocks.docSend.mockResolvedValueOnce({ Item: existingItem });

    const res = await patchHandler(
      staffEvent(
        'PATCH',
        '/v1/admin/catalog/episodes/ep-1',
        { tmdbNeedsReview: true },
        { sub: 'staff-1', 'cognito:groups': ['admin'] },
        { id: 'ep-1' },
      ),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(400);
    expect(JSON.parse(res?.body ?? '').code).toBe('validation_error');
    expect(mocks.docSend).toHaveBeenCalledTimes(1);
  });

  it('returns 404 for unknown id', async () => {
    mocks.docSend.mockResolvedValueOnce({});

    const res = await patchHandler(
      staffEvent(
        'PATCH',
        '/v1/admin/catalog/episodes/missing',
        { title: 'Updated title' },
        { sub: 'staff-1', 'cognito:groups': ['admin'] },
        { id: 'missing' },
      ),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(404);
    expect(mocks.recordAdminCatalogRoute).toHaveBeenCalledWith(
      'AdminCatalogPatch',
      'not_found',
      expect.any(Object),
    );
  });

  it('returns 403 when staff groups omit admin/curator', async () => {
    const res = await patchHandler(
      staffEvent(
        'PATCH',
        '/v1/admin/catalog/episodes/ep-1',
        { title: 'Updated title' },
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
