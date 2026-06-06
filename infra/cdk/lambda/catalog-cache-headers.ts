export type CatalogCacheVariant = 'full' | 'carousel' | 'spotlight' | `episode-${string}`;

const DEFAULT_MAX_AGE_SECONDS = 60;

export function parseCatalogHttpMaxAgeSeconds(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_MAX_AGE_SECONDS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_MAX_AGE_SECONDS;
  }
  return Math.min(86400, Math.max(0, parsed));
}

export function buildCatalogETag(generation: number, variant: CatalogCacheVariant): string {
  return `W/"${generation}-${variant}"`;
}

export function buildCatalogCacheControl(maxAgeSeconds: number): string {
  return `public, max-age=${maxAgeSeconds}`;
}

export function catalogCacheHeaders(
  generation: number,
  variant: CatalogCacheVariant,
  maxAgeSeconds: number,
): Record<string, string> {
  return {
    ETag: buildCatalogETag(generation, variant),
    'Cache-Control': buildCatalogCacheControl(maxAgeSeconds),
  };
}

function normalizeEtagValue(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('W/') ? trimmed.slice(2).trim() : trimmed;
}

/** Compare client `If-None-Match` to the computed weak ETag (strips optional `W/` prefix). */
export function etagMatches(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) {
    return false;
  }
  const normalized = ifNoneMatch.trim();
  if (!normalized) {
    return false;
  }
  const target = normalizeEtagValue(etag);
  for (const part of normalized.split(',')) {
    const candidate = part.trim();
    if (!candidate) {
      continue;
    }
    if (candidate === '*') {
      return true;
    }
    if (candidate === etag || normalizeEtagValue(candidate) === target) {
      return true;
    }
  }
  return false;
}

export function notModifiedResponse(cacheHeaders: Record<string, string>) {
  return {
    statusCode: 304 as const,
    headers: {
      ...cacheHeaders,
      'content-type': 'application/json; charset=utf-8',
    },
    body: '',
  };
}
