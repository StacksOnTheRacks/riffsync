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
  ScanCommand: vi.fn((input: unknown) => ({ input, kind: 'Scan' })),
}));

import { handler as getHandler } from './catalog-get';
import { handler as listHandler } from './catalog-list';

const sampleEpisode = {
  id: '101-the-crawling-eye',
  experimentNumber: 101,
  title: 'The Crawling Eye',
  catalog: 'mst3k',
  tags: ['Era: Joel'],
  labels: [],
  youtubeVideoId: null,
  youtubeWatchUrl: null,
  tagline: null,
  posterImageUrl: null,
  backdropImageUrl: null,
  tmdbMovieId: null,
  tmdbArtworkSyncedAt: null,
  carousel: false,
  spotlight: false,
};

function listEvent(
  queryStringParameters?: Record<string, string>,
  headers?: Record<string, string>,
): APIGatewayProxyEventV2 {
  const routeKey = 'GET /v1/catalog';
  return {
    version: '2.0',
    routeKey,
    rawPath: '/v1/catalog',
    rawQueryString: '',
    queryStringParameters,
    headers,
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'GET',
        path: '/v1/catalog',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: 'req-list-1',
      routeKey,
      stage: 'prod',
      time: '01/Jan/2025:00:00:00 +0000',
      timeEpoch: 0,
    } as APIGatewayProxyEventV2['requestContext'],
    isBase64Encoded: false,
  };
}

function getEvent(
  id: string,
  headers?: Record<string, string>,
): APIGatewayProxyEventV2 {
  const routeKey = 'GET /v1/catalog/{id}';
  return {
    version: '2.0',
    routeKey,
    rawPath: `/v1/catalog/${id}`,
    rawQueryString: '',
    pathParameters: { id },
    headers,
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'GET',
        path: `/v1/catalog/${id}`,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: 'req-get-1',
      routeKey,
      stage: 'prod',
      time: '01/Jan/2025:00:00:00 +0000',
      timeEpoch: 0,
    } as APIGatewayProxyEventV2['requestContext'],
    isBase64Encoded: false,
  };
}

describe('catalog-list handler cache headers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CATALOG_TABLE_NAME = 'catalog-table';
    delete process.env.CATALOG_HTTP_MAX_AGE_SECONDS;
  });

  it('returns 304 when If-None-Match matches generation ETag without scanning', async () => {
    mocks.docSend.mockResolvedValueOnce({ Item: { id: '_meta', catalogGeneration: 4 } });

    const res = await listHandler(
      listEvent(undefined, { 'if-none-match': 'W/"4-full"' }),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(304);
    expect(res?.body).toBe('');
    expect(res?.headers?.ETag).toBe('W/"4-full"');
    expect(res?.headers?.['Cache-Control']).toBe('public, max-age=60');
    expect(mocks.docSend).toHaveBeenCalledTimes(1);
  });

  it('returns 200 with ETag and body when generation differs', async () => {
    mocks.docSend
      .mockResolvedValueOnce({ Item: { id: '_meta', catalogGeneration: 2 } })
      .mockResolvedValueOnce({ Items: [sampleEpisode] });

    const res = await listHandler(listEvent(), {} as never, () => undefined);

    expect(res?.statusCode).toBe(200);
    expect(res?.headers?.ETag).toBe('W/"2-full"');
    const body = JSON.parse(res?.body ?? '');
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].id).toBe('101-the-crawling-eye');
  });

  it('uses carousel variant in ETag when carousel query is set', async () => {
    mocks.docSend.mockResolvedValueOnce({ Item: { id: '_meta', catalogGeneration: 1 } });

    const res = await listHandler(
      listEvent({ carousel: 'true' }, { 'if-none-match': 'W/"1-carousel"' }),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(304);
    expect(res?.headers?.ETag).toBe('W/"1-carousel"');
  });

  it('uses spotlight variant in ETag when spotlight query is set', async () => {
    mocks.docSend.mockResolvedValueOnce({ Item: { id: '_meta', catalogGeneration: 1 } });

    const res = await listHandler(
      listEvent({ spotlight: 'true' }, { 'if-none-match': 'W/"1-spotlight"' }),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(304);
    expect(res?.headers?.ETag).toBe('W/"1-spotlight"');
  });
});

describe('catalog-get handler cache headers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CATALOG_TABLE_NAME = 'catalog-table';
    delete process.env.CATALOG_HTTP_MAX_AGE_SECONDS;
  });

  it('returns 304 when If-None-Match matches episode variant ETag', async () => {
    mocks.docSend.mockResolvedValueOnce({ Item: { id: '_meta', catalogGeneration: 9 } });

    const res = await getHandler(
      getEvent('101-the-crawling-eye', { 'If-None-Match': 'W/"9-episode-101-the-crawling-eye"' }),
      {} as never,
      () => undefined,
    );

    expect(res?.statusCode).toBe(304);
    expect(mocks.docSend).toHaveBeenCalledTimes(1);
  });

  it('returns 200 with entry and per-episode ETag when not modified check fails', async () => {
    mocks.docSend
      .mockResolvedValueOnce({ Item: { id: '_meta', catalogGeneration: 3 } })
      .mockResolvedValueOnce({ Item: sampleEpisode });

    const res = await getHandler(getEvent('101-the-crawling-eye'), {} as never, () => undefined);

    expect(res?.statusCode).toBe(200);
    expect(res?.headers?.ETag).toBe('W/"3-episode-101-the-crawling-eye"');
    expect(JSON.parse(res?.body ?? '').entry.id).toBe('101-the-crawling-eye');
  });

  it('includes embedAllows on entry when stored', async () => {
    mocks.docSend
      .mockResolvedValueOnce({ Item: { id: '_meta', catalogGeneration: 3 } })
      .mockResolvedValueOnce({ Item: { ...sampleEpisode, embedAllows: false } });

    const res = await getHandler(getEvent('101-the-crawling-eye'), {} as never, () => undefined);

    expect(res?.statusCode).toBe(200);
    const entry = JSON.parse(res?.body ?? '').entry;
    expect(entry.embedAllows).toBe(false);
    expect(entry).not.toHaveProperty('movieSearchTitle');
  });
});
