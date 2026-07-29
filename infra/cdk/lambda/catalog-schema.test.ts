import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import catalogSchema from '../../../data/catalog/catalog.schema.json';

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

const validateBundle = ajv.compile(catalogSchema);
const episodeSchema = (catalogSchema as { $defs: { episode: object } }).$defs.episode;
const validateEpisode = ajv.compile(episodeSchema);

const repoRoot = resolve(__dirname, '../../..');
const episodesPath = resolve(repoRoot, 'data/catalog/episodes.json');

const baseEpisode = {
  id: 'fixture-episode',
  experimentNumber: 1,
  title: 'Fixture',
  catalog: 'mst3k',
  tags: [],
  labels: [],
  playbackHost: 'youtube',
  youtubeVideoId: null,
  youtubeWatchUrl: null,
  tagline: null,
  posterImageUrl: null,
  backdropImageUrl: null,
  tmdbMovieId: null,
  tmdbArtworkSyncedAt: null,
  customPlaybackUrl: null,
};

describe('catalog.schema.json', () => {
  it('validates committed episodes.json bundle after playback host backfill', () => {
    const bundle = JSON.parse(readFileSync(episodesPath, 'utf8')) as {
      version: number;
      entries: Record<string, unknown>[];
    };
    expect(bundle.version).toBe(1);
    const episodes = bundle.entries.filter(
      (entry) => (entry as { id?: string }).id !== '_meta',
    );
    expect(validateBundle({ ...bundle, entries: episodes })).toBe(true);
    const meta = bundle.entries.find((entry) => (entry as { id?: string }).id === '_meta');
    expect(meta).toMatchObject({ playbackHost: 'youtube', customPlaybackUrl: null });
  });

  it('accepts YouTube-host row with null customPlaybackUrl', () => {
    expect(validateEpisode({ ...baseEpisode })).toBe(true);
  });

  it('accepts Custom-host row with HTTPS customPlaybackUrl', () => {
    expect(
      validateEpisode({
        ...baseEpisode,
        playbackHost: 'custom',
        customPlaybackUrl: 'https://example.test/movie',
      }),
    ).toBe(true);
  });

  it('rejects Custom-host row missing customPlaybackUrl', () => {
    expect(
      validateEpisode({
        ...baseEpisode,
        playbackHost: 'custom',
        customPlaybackUrl: null,
      }),
    ).toBe(false);
  });

  it('rejects Custom-host row with http URL', () => {
    expect(
      validateEpisode({
        ...baseEpisode,
        playbackHost: 'custom',
        customPlaybackUrl: 'http://example.test/movie',
      }),
    ).toBe(false);
  });

  it('rejects customPlaybackUrl over maxLength 2048', () => {
    expect(
      validateEpisode({
        ...baseEpisode,
        playbackHost: 'custom',
        customPlaybackUrl: `https://example.test/${'a'.repeat(2048)}`,
      }),
    ).toBe(false);
  });
});
