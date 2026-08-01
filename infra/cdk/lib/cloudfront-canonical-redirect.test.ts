import { describe, expect, it } from 'vitest';

import { viewerRequestRedirectToCanonicalSource } from './cloudfront-canonical-redirect';

type CloudFrontRequest = {
  uri: string;
  headers?: {
    host?: {
      value: string;
    };
  };
  querystring?: Record<string, { value?: string; multiValue?: Array<{ value: string }> }>;
};

function handlerFromSource(source: string): (event: { request: CloudFrontRequest }) => unknown {
  return new Function(`${source}; return handler;`)() as (event: {
    request: CloudFrontRequest;
  }) => unknown;
}

function request(uri: string, host = 'riffsync.tv'): CloudFrontRequest {
  return {
    uri,
    headers: {
      host: { value: host },
    },
    querystring: {},
  };
}

describe('viewerRequestRedirectToCanonicalSource', () => {
  it('redirects non-canonical custom aliases before rewriting the URI', () => {
    const handler = handlerFromSource(viewerRequestRedirectToCanonicalSource('riffsync.tv'));

    const result = handler({
      request: {
        ...request('/catalog', 'www.riffsync.tv'),
        querystring: { from: { value: 'share link' } },
      },
    });

    expect(result).toEqual({
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: {
        location: {
          value: 'https://riffsync.tv/catalog?from=share%20link',
        },
      },
    });
  });

  it('rewrites extensionless clean URLs to prerendered index objects', () => {
    const handler = handlerFromSource(viewerRequestRedirectToCanonicalSource('riffsync.tv'));

    expect(handler({ request: request('/catalog') })).toMatchObject({
      uri: '/catalog/index.html',
    });
    expect(handler({ request: request('/watch/101-the-crawling-eye') })).toMatchObject({
      uri: '/watch/101-the-crawling-eye/index.html',
    });
    expect(handler({ request: request('/catalog/') })).toMatchObject({
      uri: '/catalog/index.html',
    });
  });

  it('leaves extensioned assets and SEO artifact files unchanged', () => {
    const handler = handlerFromSource(viewerRequestRedirectToCanonicalSource('riffsync.tv'));

    expect(handler({ request: request('/robots.txt') })).toMatchObject({ uri: '/robots.txt' });
    expect(handler({ request: request('/assets/main.js') })).toMatchObject({
      uri: '/assets/main.js',
    });
    expect(handler({ request: request('/spa-shell.html') })).toMatchObject({
      uri: '/spa-shell.html',
    });
  });

  it('rewrites CloudFront default-host requests instead of redirecting them', () => {
    const handler = handlerFromSource(viewerRequestRedirectToCanonicalSource('riffsync.tv'));

    expect(handler({ request: request('/catalog', 'd111111abcdef8.cloudfront.net') })).toMatchObject({
      uri: '/catalog/index.html',
    });
  });

  it('can rewrite clean URLs when no canonical host is configured', () => {
    const handler = handlerFromSource(viewerRequestRedirectToCanonicalSource());

    expect(handler({ request: request('/catalog', 'www.riffsync.tv') })).toMatchObject({
      uri: '/catalog/index.html',
    });
  });
});
