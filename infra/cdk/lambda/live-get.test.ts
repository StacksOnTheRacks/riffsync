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
  ScanCommand: vi.fn((input: unknown) => ({ input, kind: 'Scan' })),
  UpdateCommand: vi.fn((input: unknown) => ({ input, kind: 'Update' })),
}));

import { handler } from './live-get';

function liveItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'mst3k-forever-a-thon',
    experimentNumber: 0,
    title: 'MST3K Forever-A-Thon',
    catalog: 'live',
    tags: [],
    labels: [],
    youtubeVideoId: 'abcdefghijk',
    youtubeWatchUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
    tagline: '24/7',
    posterImageUrl: null,
    backdropImageUrl: null,
    tmdbMovieId: null,
    tmdbArtworkSyncedAt: null,
    carousel: false,
    spotlight: false,
    playbackHost: 'youtube',
    customPlaybackUrl: null,
    ...overrides,
  };
}

function getEvent(slug?: string): APIGatewayProxyEventV2 {
  const routeKey = slug ? 'GET /v1/live/{slug}' : 'GET /v1/live';
  const path = slug ? `/v1/live/${slug}` : '/v1/live';
  return {
    version: '2.0',
    routeKey,
    rawPath: path,
    rawQueryString: '',
    pathParameters: slug ? { slug } : undefined,
    headers: {},
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
      requestId: 'req-live-get',
      routeKey,
      stage: 'prod',
      time: '01/Jan/2025:00:00:00 +0000',
      timeEpoch: 0,
    },
    isBase64Encoded: false,
  };
}

describe('live-get handler', () => {
  beforeEach(() => {
    mocks.docSend.mockReset();
    process.env.ROOMS_TABLE_NAME = 'rooms';
    process.env.CATALOG_TABLE_NAME = 'catalog';
  });

  it('lists catalog live rows as channels', async () => {
    mocks.docSend.mockResolvedValueOnce({
      Items: [
        liveItem({ id: 'second-live', experimentNumber: 2, title: 'Second Live' }),
        liveItem(),
        liveItem({ id: 'not-live', catalog: 'mst3k', title: 'Regular Episode' }),
      ],
    });

    const res = await handler(getEvent(), {} as never, (() => undefined) as never);
    expect(res?.statusCode).toBe(200);
    const body = JSON.parse(res?.body ?? '{}') as { channels?: Array<Record<string, unknown>> };
    expect(body.channels?.map((c) => c.slug)).toEqual(['mst3k-forever-a-thon', 'second-live']);
    expect(body.channels?.[0]).toMatchObject({
      path: '/live/mst3k-forever-a-thon',
      roomId: 'live-mst3k-forever-a-thon',
      title: 'MST3K Forever-A-Thon',
    });
  });

  it('returns 404 for missing slug row', async () => {
    mocks.docSend.mockResolvedValueOnce({});

    const res = await handler(getEvent('nope'), {} as never, (() => undefined) as never);
    expect(res?.statusCode).toBe(404);
  });

  it('returns channel payload and ensures room', async () => {
    mocks.docSend
      .mockResolvedValueOnce({
        Item: liveItem(),
      })
      .mockResolvedValueOnce({});

    const res = await handler(getEvent('mst3k-forever-a-thon'), {} as never, (() => undefined) as never);
    expect(res?.statusCode).toBe(200);
    const body = JSON.parse(res?.body ?? '{}') as Record<string, unknown>;
    expect(body.slug).toBe('mst3k-forever-a-thon');
    expect(body.roomId).toBe('live-mst3k-forever-a-thon');
    expect(body.path).toBe('/live/mst3k-forever-a-thon');
    expect(body.youtubeVideoId).toBe('abcdefghijk');
    expect(body.embedAllows).toBe(true);
    expect(mocks.docSend).toHaveBeenCalledTimes(2);
  });

  it('returns 404 when slug row is not catalog live', async () => {
    mocks.docSend.mockResolvedValueOnce({
      Item: liveItem({ catalog: 'mst3k', title: 'Wrong' }),
    });

    const res = await handler(getEvent('mst3k-forever-a-thon'), {} as never, (() => undefined) as never);
    expect(res?.statusCode).toBe(404);
  });
});
