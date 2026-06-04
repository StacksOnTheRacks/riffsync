import { describe, expect, it, vi } from 'vitest';
import {
  buildCatalogCacheControl,
  buildCatalogETag,
  catalogCacheHeaders,
  etagMatches,
  parseCatalogHttpMaxAgeSeconds,
} from './catalog-cache-headers';

describe('parseCatalogHttpMaxAgeSeconds', () => {
  it('defaults to 60 when unset or invalid', () => {
    expect(parseCatalogHttpMaxAgeSeconds(undefined)).toBe(60);
    expect(parseCatalogHttpMaxAgeSeconds('')).toBe(60);
    expect(parseCatalogHttpMaxAgeSeconds('nope')).toBe(60);
  });

  it('clamps configured values to 0 through 86400', () => {
    expect(parseCatalogHttpMaxAgeSeconds('0')).toBe(0);
    expect(parseCatalogHttpMaxAgeSeconds('120')).toBe(120);
    expect(parseCatalogHttpMaxAgeSeconds('999999')).toBe(86400);
    expect(parseCatalogHttpMaxAgeSeconds('-5')).toBe(0);
  });
});

describe('catalog cache ETag helpers', () => {
  it('builds weak validators per variant', () => {
    expect(buildCatalogETag(3, 'full')).toBe('W/"3-full"');
    expect(buildCatalogETag(3, 'carousel')).toBe('W/"3-carousel"');
    expect(buildCatalogETag(5, 'episode-ep-1')).toBe('W/"5-episode-ep-1"');
  });

  it('builds Cache-Control from max-age', () => {
    expect(buildCatalogCacheControl(60)).toBe('public, max-age=60');
  });

  it('matches If-None-Match with or without weak prefix', () => {
    const etag = buildCatalogETag(2, 'full');
    expect(etagMatches(etag, etag)).toBe(true);
    expect(etagMatches('"2-full"', etag)).toBe(true);
    expect(etagMatches('W/"2-full"', etag)).toBe(true);
    expect(etagMatches('W/"3-full"', etag)).toBe(false);
    expect(etagMatches('*', etag)).toBe(true);
  });

  it('returns combined cache headers', () => {
    expect(catalogCacheHeaders(4, 'carousel', 30)).toEqual({
      ETag: 'W/"4-carousel"',
      'Cache-Control': 'public, max-age=30',
    });
  });
});
