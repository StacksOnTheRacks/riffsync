import {
  type CatalogEpisode,
  projectEpisode,
  sortEpisodes,
} from './catalog-shared';

/** Staff-only catalog row returned by **`GET /v1/admin/catalog`** handlers. */
export interface AdminEpisode extends CatalogEpisode {
  readonly movieSearchTitle: string | null;
  readonly embedAllows: boolean | null;
  readonly curatorNotes: string | null;
  readonly tmdbNeedsReview?: boolean | null;
  readonly youtubeThumbnailUrl: string | null;
}

function optionalString(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

function optionalBoolean(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes') return true;
    if (s === 'false' || s === '0' || s === 'no') return false;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return v === 1;
  return null;
}

function optionalBooleanField(v: unknown): boolean | undefined {
  if (v === null || v === undefined) return undefined;
  return optionalBoolean(v) ?? undefined;
}

export function projectAdminEpisode(item: Record<string, unknown>): AdminEpisode {
  const base = projectEpisode(item);
  return {
    ...base,
    movieSearchTitle: optionalString(item.movieSearchTitle),
    embedAllows: optionalBoolean(item.embedAllows),
    curatorNotes: optionalString(item.curatorNotes),
    tmdbNeedsReview: optionalBooleanField(item.tmdbNeedsReview),
    youtubeThumbnailUrl: optionalString(item.youtubeThumbnailUrl),
  };
}

export { sortEpisodes };
