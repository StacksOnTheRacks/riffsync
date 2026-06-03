import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import catalogSchema from '../../../data/catalog/catalog.schema.json';

export const ADMIN_WRITABLE_KEYS = [
  'experimentNumber',
  'title',
  'era',
  'youtubeVideoId',
  'youtubeWatchUrl',
  'carousel',
] as const;

export type AdminWritableKey = (typeof ADMIN_WRITABLE_KEYS)[number];

export const READ_ONLY_WRITE_KEYS = [
  'tagline',
  'posterImageUrl',
  'backdropImageUrl',
  'tmdbMovieId',
  'tmdbArtworkSyncedAt',
  'movieSearchTitle',
  'embedAllows',
  'curatorNotes',
  'tmdbNeedsReview',
  'youtubeThumbnailUrl',
  'tmdbOverview',
  'tmdbPopularity',
  'tmdbPosterPath',
  'tmdbBackdropPath',
] as const;

const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

const episodeSchema = (catalogSchema as { $defs: { episode: object } }).$defs.episode;
const validateEpisodeSchema = ajv.compile(episodeSchema);

const EPISODE_SCHEMA_PROPERTY_KEYS = Object.keys(
  (episodeSchema as { properties: Record<string, unknown> }).properties,
);

function pickSchemaEpisodeFields(item: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of EPISODE_SCHEMA_PROPERTY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(item, key)) {
      out[key] = item[key];
    }
  }
  return out;
}

export type ValidationDetail = {
  instancePath: string;
  message?: string;
};

export type CatalogValidationResult =
  | { ok: true; item: Record<string, unknown> }
  | { ok: false; error: string; details: ValidationDetail[] };

function ajvDetails(errors: typeof validateEpisodeSchema.errors): ValidationDetail[] {
  if (!errors) return [];
  return errors.map((err) => {
    const path = err.instancePath || '';
    const missing =
      err.keyword === 'required' &&
      err.params &&
      typeof (err.params as { missingProperty?: string }).missingProperty === 'string'
        ? `/${(err.params as { missingProperty: string }).missingProperty}`
        : path;
    return {
      instancePath: missing.startsWith('/') ? missing : `/${missing}`.replace(/^\/\/+/, '/'),
      message: err.message,
    };
  });
}

export function validatePathEpisodeId(id: string | undefined): CatalogValidationResult | null {
  if (!id) {
    return { ok: false, error: 'Missing path parameter id', details: [{ instancePath: '/id' }] };
  }
  if (!SLUG_PATTERN.test(id)) {
    return {
      ok: false,
      error: 'Invalid episode id slug',
      details: [{ instancePath: '/id', message: 'must match slug pattern' }],
    };
  }
  return null;
}

export function stripAndRejectReadOnly(body: Record<string, unknown>): CatalogValidationResult | null {
  const forbidden = Object.keys(body).filter((key) =>
    (READ_ONLY_WRITE_KEYS as readonly string[]).includes(key),
  );
  if (forbidden.length > 0) {
    return {
      ok: false,
      error: 'Read-only fields are not allowed on write',
      details: forbidden.map((key) => ({ instancePath: `/${key}` })),
    };
  }
  return null;
}

function parseWritableBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ADMIN_WRITABLE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      out[key] = body[key];
    }
  }
  return out;
}

function validateMergedEpisode(item: Record<string, unknown>): CatalogValidationResult | null {
  if (!validateEpisodeSchema(item)) {
    return {
      ok: false,
      error: 'Validation failed',
      details: ajvDetails(validateEpisodeSchema.errors),
    };
  }
  return null;
}

export function validateCatalogEpisodePost(
  pathId: string,
  body: Record<string, unknown>,
): CatalogValidationResult {
  const pathError = validatePathEpisodeId(pathId);
  if (pathError) return pathError;

  const readOnlyError = stripAndRejectReadOnly(body);
  if (readOnlyError) return readOnlyError;

  if (Object.prototype.hasOwnProperty.call(body, 'id') && body.id !== pathId) {
    return {
      ok: false,
      error: 'Path id and body id must match when body id is present',
      details: [{ instancePath: '/id' }],
    };
  }

  const writable = parseWritableBody(body);
  const requiredKeys: AdminWritableKey[] = [
    'experimentNumber',
    'title',
    'era',
    'youtubeVideoId',
    'youtubeWatchUrl',
  ];
  const missing = requiredKeys.filter((key) => !Object.prototype.hasOwnProperty.call(writable, key));
  if (missing.length > 0) {
    return {
      ok: false,
      error: 'Missing required fields',
      details: missing.map((key) => ({ instancePath: `/${key}` })),
    };
  }

  const carousel = Object.prototype.hasOwnProperty.call(writable, 'carousel')
    ? writable.carousel
    : false;

  const item: Record<string, unknown> = {
    id: pathId,
    experimentNumber: writable.experimentNumber,
    title: writable.title,
    era: writable.era,
    youtubeVideoId: writable.youtubeVideoId,
    youtubeWatchUrl: writable.youtubeWatchUrl,
    carousel,
    tagline: null,
    posterImageUrl: null,
    backdropImageUrl: null,
    tmdbMovieId: null,
    tmdbArtworkSyncedAt: null,
  };

  const schemaError = validateMergedEpisode(item);
  if (schemaError) return schemaError;

  return { ok: true, item };
}

export function validateCatalogEpisodePatch(
  pathId: string,
  body: Record<string, unknown>,
  existing: Record<string, unknown>,
): CatalogValidationResult {
  const pathError = validatePathEpisodeId(pathId);
  if (pathError) return pathError;

  const readOnlyError = stripAndRejectReadOnly(body);
  if (readOnlyError) return readOnlyError;

  if (Object.prototype.hasOwnProperty.call(body, 'id') && body.id !== pathId) {
    return {
      ok: false,
      error: 'Path id and body id must match when body id is present',
      details: [{ instancePath: '/id' }],
    };
  }

  const writable = parseWritableBody(body);
  if (Object.keys(writable).length === 0) {
    return {
      ok: false,
      error: 'No writable fields provided',
      details: [{ instancePath: '/', message: 'at least one writable field required' }],
    };
  }

  const merged: Record<string, unknown> = { ...existing, ...writable, id: pathId };
  const schemaError = validateMergedEpisode(pickSchemaEpisodeFields(merged));
  if (schemaError) return schemaError;

  return { ok: true, item: merged };
}

export function validationErrorResponse(details: ValidationDetail[]) {
  return {
    error: 'Validation failed',
    code: 'validation_error',
    details,
  };
}
