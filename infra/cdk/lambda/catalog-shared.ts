/**
 * Public catalog episode shape returned by **`GET /v1/catalog`** and **`GET /v1/catalog/{id}`**.
 * Optional TMDB / reconcile fields may be **`null`** or omitted until enrichment runs
 * (**`docs/architecture.catalog-images.md`**).
 */
export interface CatalogEpisode {
  readonly id: string;
  readonly experimentNumber: number;
  readonly title: string;
  readonly catalog: 'mst3k' | 'community' | 'riff_material' | 'movie_night' | 'other';
  readonly tags: string[];
  readonly labels: string[];
  readonly youtubeVideoId: string | null;
  readonly youtubeWatchUrl: string | null;
  readonly tagline: string | null;
  readonly posterImageUrl: string | null;
  readonly backdropImageUrl: string | null;
  readonly tmdbMovieId: number | null;
  readonly tmdbArtworkSyncedAt: string | null;
  /** When true, row is included in **`GET /v1/catalog?carousel=true`** (home hero). */
  readonly carousel: boolean;
  /** When true, row is included in **`GET /v1/catalog?spotlight=true`** (home spotlight strip). */
  readonly spotlight: boolean;
  /** When false, SPA should not offer in-app YouTube embed; omitted when not stored on the row. */
  readonly embedAllows?: boolean;
  /** Playback surface for in-app watch; missing/invalid Dynamo values default to **`youtube`**. */
  readonly playbackHost: 'youtube' | 'custom';
  /** HTTPS movie-page URL when **`playbackHost`** is **`custom`**; always present on public JSON. */
  readonly customPlaybackUrl: string | null;
  readonly tmdbOverview?: string | null;
  readonly tmdbPopularity?: number | null;
  readonly tmdbPosterPath?: string | null;
  readonly tmdbBackdropPath?: string | null;
}

const CATALOGS = new Set(['mst3k', 'community', 'riff_material', 'movie_night', 'other']);

/** Dynamo / hand-edited rows may use BOOL, or accidentally String/Number — treat like UI expectations. */
function parseBooleanCatalogFlag(v: unknown): boolean {
  if (v === true) return true;
  if (v === false || v === null || v === undefined) return false;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes';
  }
  if (typeof v === 'number' && Number.isFinite(v)) return v === 1;
  return false;
}

export function projectEpisode(item: Record<string, unknown>): CatalogEpisode {
  const id = item.id;
  if (typeof id !== 'string') {
    throw new Error('Catalog item missing string `id`');
  }
  const catalogRaw = item.catalog;
  const catalog =
    typeof catalogRaw === 'string' && CATALOGS.has(catalogRaw)
      ? (catalogRaw as CatalogEpisode['catalog'])
      : 'other';

  const experimentNumber = Number(item.experimentNumber);
  if (!Number.isFinite(experimentNumber)) {
    throw new Error('Catalog item missing numeric `experimentNumber`');
  }

  const optionalString = (v: unknown): string | null =>
    v === null || v === undefined ? null : String(v);

  const optionalNumber = (v: unknown): number | null =>
    v === null || v === undefined ? null : Number(v);

  const optionalStringField = (v: unknown): string | undefined =>
    v === null || v === undefined ? undefined : String(v);

  const optionalNumberField = (v: unknown): number | undefined =>
    v === null || v === undefined ? undefined : Number(v);

  const stringList = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((entry): entry is string => typeof entry === 'string') : [];

  const embedAllows =
    Object.prototype.hasOwnProperty.call(item, 'embedAllows') && typeof item.embedAllows === 'boolean'
      ? item.embedAllows
      : undefined;

  const playbackHost = item.playbackHost === 'custom' ? 'custom' : 'youtube';

  return {
    id,
    experimentNumber,
    title: String(item.title),
    catalog,
    tags: stringList(item.tags),
    labels: stringList(item.labels),
    youtubeVideoId: optionalString(item.youtubeVideoId),
    youtubeWatchUrl: optionalString(item.youtubeWatchUrl),
    tagline: optionalString(item.tagline),
    posterImageUrl: optionalString(item.posterImageUrl),
    backdropImageUrl: optionalString(item.backdropImageUrl),
    tmdbMovieId: optionalNumber(item.tmdbMovieId),
    tmdbArtworkSyncedAt: optionalString(item.tmdbArtworkSyncedAt),
    carousel: parseBooleanCatalogFlag(item.carousel),
    spotlight: parseBooleanCatalogFlag(item.spotlight),
    playbackHost,
    customPlaybackUrl: optionalString(item.customPlaybackUrl),
    ...(embedAllows !== undefined ? { embedAllows } : {}),
    tmdbOverview: optionalStringField(item.tmdbOverview),
    tmdbPopularity: optionalNumberField(item.tmdbPopularity),
    tmdbPosterPath: optionalStringField(item.tmdbPosterPath),
    tmdbBackdropPath: optionalStringField(item.tmdbBackdropPath),
  };
}

export function sortEpisodes(entries: CatalogEpisode[]): CatalogEpisode[] {
  return [...entries].sort((a, b) => a.experimentNumber - b.experimentNumber);
}
