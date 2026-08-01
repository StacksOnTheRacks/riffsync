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
  UpdateCommand: vi.fn((input: unknown) => ({ input, kind: 'Update' })),
}));

vi.mock('./live-channels', () => ({
  LIVE_SYSTEM_HOST_SUB: 'system:live',
  getLiveChannel: (slug: string) => {
    if (slug !== 'mst3k-forever-a-thon') return undefined;
    return {
      slug: 'mst3k-forever-a-thon',
      catalogEpisodeId: 'mst3k-forever-a-thon',
      roomId: 'live-mst3k-forever-a-thon',
      enabled: true,
      defaultTitle: 'MST3K Forever-A-Thon',
    };
  },
}));

import { handler } from './live-get';

function getEvent(slug: string): APIGatewayProxyEventV2 {
  const routeKey = 'GET /v1/live/{slug}';
  return {
    version: '2.0',
    routeKey,
    rawPath: `/v1/live/${slug}`,
    rawQueryString: '',
    pathParameters: { slug },
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'GET',
        path: `/v1/live/${slug}`,
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

  it('returns 404 for unknown slug', async () => {
    const res = await handler(getEvent('nope'), {} as never, (() => undefined) as never);
    expect(res?.statusCode).toBe(404);
  });

  it('returns channel payload and ensures room', async () => {
    mocks.docSend
      .mockResolvedValueOnce({
        Item: {
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
        },
      })
      .mockResolvedValueOnce({});

    const res = await handler(getEvent('mst3k-forever-a-thon'), {} as never, (() => undefined) as never);
    expect(res?.statusCode).toBe(200);
    const body = JSON.parse(res?.body ?? '{}') as Record<string, unknown>;
    expect(body.slug).toBe('mst3k-forever-a-thon');
    expect(body.roomId).toBe('live-mst3k-forever-a-thon');
    expect(body.youtubeVideoId).toBe('abcdefghijk');
    expect(body.embedAllows).toBe(true);
    expect(mocks.docSend).toHaveBeenCalledTimes(2);
  });

  it('returns 409 when bound episode is not catalog live', async () => {
    mocks.docSend.mockResolvedValueOnce({
      Item: {
        id: 'mst3k-forever-a-thon',
        experimentNumber: 0,
        title: 'Wrong',
        catalog: 'mst3k',
        tags: [],
        labels: [],
        youtubeVideoId: 'abcdefghijk',
        youtubeWatchUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
        tagline: null,
        posterImageUrl: null,
        backdropImageUrl: null,
        tmdbMovieId: null,
        tmdbArtworkSyncedAt: null,
        carousel: false,
        spotlight: false,
        playbackHost: 'youtube',
        customPlaybackUrl: null,
      },
    });

    const res = await handler(getEvent('mst3k-forever-a-thon'), {} as never, (() => undefined) as never);
    expect(res?.statusCode).toBe(409);
  });
});
