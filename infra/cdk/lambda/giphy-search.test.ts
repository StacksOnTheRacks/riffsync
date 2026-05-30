import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docSend: vi.fn(),
  secretsSend: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({ send: mocks.docSend })),
  },
  UpdateCommand: vi.fn((input: unknown) => ({ input, kind: 'Update' })),
}));

vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: vi.fn(() => ({ send: mocks.secretsSend })),
  GetSecretValueCommand: vi.fn((input: unknown) => ({ input, kind: 'GetSecret' })),
}));

import { enforceGiphyRateLimit, handler } from './giphy-search';
import {
  fetchGiphySearch,
  giphyRateLimitKey,
  minuteBucketEpochMs,
  normalizeGiphySearchPayload,
  parseGiphySearchQuery,
} from './giphy-search-shared';

describe('parseGiphySearchQuery', () => {
  it('requires trimmed q between 1 and 50 characters', () => {
    expect(parseGiphySearchQuery({ q: '  hi  ' })).toEqual({
      ok: true,
      query: { q: 'hi', limit: 20, offset: 0 },
    });
    expect(parseGiphySearchQuery({ q: '' }).ok).toBe(false);
    expect(parseGiphySearchQuery({ q: '   ' }).ok).toBe(false);
    expect(parseGiphySearchQuery({ q: 'x'.repeat(51) }).ok).toBe(false);
    expect(parseGiphySearchQuery(undefined).ok).toBe(false);
  });

  it('validates limit and offset bounds', () => {
    expect(parseGiphySearchQuery({ q: 'a', limit: '25' })).toEqual({
      ok: true,
      query: { q: 'a', limit: 25, offset: 0 },
    });
    expect(parseGiphySearchQuery({ q: 'a', limit: '26' }).ok).toBe(false);
    expect(parseGiphySearchQuery({ q: 'a', offset: '4999' })).toEqual({
      ok: true,
      query: { q: 'a', limit: 20, offset: 4999 },
    });
    expect(parseGiphySearchQuery({ q: 'a', offset: '5000' }).ok).toBe(false);
  });
});

describe('normalizeGiphySearchPayload', () => {
  it('maps Giphy data to normalized HTTPS CDN results', () => {
    const results = normalizeGiphySearchPayload({
      data: [
        {
          id: 'abc123',
          title: 'Wave',
          images: {
            fixed_height_small: {
              url: 'https://media0.giphy.com/media/abc123/100.gif',
              width: '100',
              height: '80',
            },
            fixed_height: {
              url: 'https://media1.giphy.com/media/abc123/200.gif',
              width: '200',
              height: '160',
            },
          },
        },
        {
          id: 'skip-http',
          images: {
            fixed_height_small: { url: 'http://media0.giphy.com/media/x/1.gif' },
            fixed_height: { url: 'https://media1.giphy.com/media/x/2.gif' },
          },
        },
      ],
    });

    expect(results).toEqual([
      {
        giphyId: 'abc123',
        title: 'Wave',
        previewUrl: 'https://media0.giphy.com/media/abc123/100.gif',
        renditionUrl: 'https://media1.giphy.com/media/abc123/200.gif',
        width: 200,
        height: 160,
      },
    ]);
  });
});

describe('fetchGiphySearch', () => {
  it('calls Giphy with fixed rating and normalizes success payloads', async () => {
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'gif1',
              images: {
                preview_gif: { url: 'https://media2.giphy.com/media/gif1/p.gif' },
                fixed_height: { url: 'https://media2.giphy.com/media/gif1/r.gif' },
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const out = await fetchGiphySearch('test-key', { q: 'cats', limit: 5, offset: 10 }, mocks.fetch);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.results).toHaveLength(1);
      expect(out.results[0]?.giphyId).toBe('gif1');
    }

    const calledUrl = String(mocks.fetch.mock.calls[0]?.[0]);
    expect(calledUrl).toContain('api.giphy.com/v1/gifs/search');
    expect(calledUrl).toContain('api_key=test-key');
    expect(calledUrl).toContain('q=cats');
    expect(calledUrl).toContain('limit=5');
    expect(calledUrl).toContain('offset=10');
    expect(calledUrl).toContain('rating=pg-13');
  });

  it('maps upstream 5xx to 502/503 without leaking bodies', async () => {
    mocks.fetch.mockResolvedValue(new Response('upstream error', { status: 503 }));
    const out503 = await fetchGiphySearch('k', { q: 'x', limit: 1, offset: 0 }, mocks.fetch);
    expect(out503).toEqual({ ok: false, status: 503 });

    mocks.fetch.mockResolvedValue(new Response('bad', { status: 418 }));
    const out502 = await fetchGiphySearch('k', { q: 'x', limit: 1, offset: 0 }, mocks.fetch);
    expect(out502).toEqual({ ok: false, status: 502 });
  });
});

describe('enforceGiphyRateLimit', () => {
  beforeEach(() => {
    mocks.docSend.mockReset();
    process.env.GIPHY_RATE_LIMIT_TABLE_NAME = 'GiphyRateLimits';
  });

  it('uses sub + minute bucket keys and allows under the limit', async () => {
    mocks.docSend.mockResolvedValue({});
    const now = 1_700_000_123_456;
    const bucket = minuteBucketEpochMs(now);
    const ok = await enforceGiphyRateLimit('GiphyRateLimits', 'sub-1', 30, now);
    expect(ok).toBe(true);
    expect(mocks.docSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          TableName: 'GiphyRateLimits',
          Key: giphyRateLimitKey('sub-1', bucket),
          ConditionExpression: 'attribute_not_exists(requestCount) OR requestCount < :limit',
        }),
      }),
    );
  });

  it('returns false when DynamoDB conditional check fails', async () => {
    mocks.docSend.mockRejectedValue({ name: 'ConditionalCheckFailedException' });
    const ok = await enforceGiphyRateLimit('GiphyRateLimits', 'sub-1', 30);
    expect(ok).toBe(false);
  });
});

describe('giphy-search handler', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.docSend.mockReset();
    mocks.secretsSend.mockReset();
    mocks.fetch.mockReset();
    process.env.GIPHY_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:giphy';
    process.env.GIPHY_RATE_LIMIT_TABLE_NAME = 'GiphyRateLimits';
    process.env.GIPHY_RATE_LIMIT_PER_MINUTE = '30';
  });

  function fanEvent(query?: Record<string, string>): APIGatewayProxyEventV2 {
    return {
      version: '2.0',
      routeKey: 'GET /v1/giphy/search',
      rawPath: '/v1/giphy/search',
      rawQueryString: '',
      headers: {},
      queryStringParameters: query,
      requestContext: {
        accountId: '123',
        apiId: 'api',
        domainName: 'example.com',
        domainPrefix: 'example',
        http: {
          method: 'GET',
          path: '/v1/giphy/search',
          protocol: 'HTTP/1.1',
          sourceIp: '127.0.0.1',
          userAgent: 'vitest',
        },
        requestId: 'req',
        routeKey: 'GET /v1/giphy/search',
        stage: 'prod',
        time: '01/Jan/2025:00:00:00 +0000',
        timeEpoch: 0,
        authorizer: {
          jwt: {
            claims: { sub: 'fan-sub-99' },
          },
        },
      } as APIGatewayProxyEventV2['requestContext'],
      isBase64Encoded: false,
    };
  }

  it('returns 401 without jwt sub', async () => {
    const event = fanEvent({ q: 'hello' });
    (event.requestContext as { authorizer?: unknown }).authorizer = undefined;
    const res = await handler(event, {} as never, () => undefined);
    expect(res?.statusCode).toBe(401);
  });

  it('returns 400 for invalid query', async () => {
    const res = await handler(fanEvent({ q: '' }), {} as never, () => undefined);
    expect(res?.statusCode).toBe(400);
  });

  it('returns 429 when rate limit is exceeded', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    mocks.docSend.mockRejectedValue({ name: 'ConditionalCheckFailedException' });
    const res = await handler(fanEvent({ q: 'hello' }), {} as never, () => undefined);
    expect(res?.statusCode).toBe(429);

    const emf = JSON.parse(logSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(emf.Route).toBe('GiphySearch');
    expect(emf.Outcome).toBe('rate_limited');
    const infoLine = JSON.parse(infoSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(infoLine).toMatchObject({ riffsyncDiag: 'api', route: 'GiphySearch', outcome: 'rate_limited' });
    expect(infoLine.q).toBeUndefined();
    logSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it('returns 200 with EMF success on happy path', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    mocks.docSend.mockResolvedValue({});
    mocks.secretsSend.mockResolvedValue({ SecretString: JSON.stringify({ apiKey: 'test-key' }) });
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'gif1',
              images: {
                preview_gif: { url: 'https://media2.giphy.com/media/gif1/p.gif' },
                fixed_height: { url: 'https://media2.giphy.com/media/gif1/r.gif' },
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const res = await handler(fanEvent({ q: 'cats' }), {} as never, () => undefined);
    expect(res?.statusCode).toBe(200);

    const emf = JSON.parse(logSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(emf.Route).toBe('GiphySearch');
    expect(emf.Outcome).toBe('success');
    const infoLine = JSON.parse(infoSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(infoLine).toMatchObject({
      riffsyncDiag: 'api',
      route: 'GiphySearch',
      outcome: 'success',
      queryLength: 4,
      resultCount: 1,
    });
    expect(infoLine.q).toBeUndefined();
    logSpy.mockRestore();
    infoSpy.mockRestore();
  });
});
