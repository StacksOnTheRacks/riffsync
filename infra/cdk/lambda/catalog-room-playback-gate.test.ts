import { describe, expect, it } from 'vitest';
import {
  readCatalogPlaybackHost,
  validateCatalogRowForRoomSeed,
} from './catalog-room-playback-gate';

const validYoutubeId = 'dQw4w9WgXcQ';

describe('readCatalogPlaybackHost', () => {
  it('defaults missing or invalid values to youtube', () => {
    expect(readCatalogPlaybackHost(undefined)).toBe('youtube');
    expect(readCatalogPlaybackHost(null)).toBe('youtube');
    expect(readCatalogPlaybackHost({})).toBe('youtube');
    expect(readCatalogPlaybackHost({ playbackHost: 'other' })).toBe('youtube');
  });

  it('returns custom when playbackHost is custom', () => {
    expect(readCatalogPlaybackHost({ playbackHost: 'custom' })).toBe('custom');
  });
});

describe('validateCatalogRowForRoomSeed', () => {
  it('returns catalog_episode_not_found when row is missing', () => {
    const result = validateCatalogRowForRoomSeed(undefined, 'missing-ep');
    expect(result).toEqual({
      ok: false,
      code: 'catalog_episode_not_found',
      error: 'Unknown catalog episode: missing-ep',
      statusCode: 404,
    });
  });

  it('accepts YouTube-host rows with a valid 11-char id', () => {
    const result = validateCatalogRowForRoomSeed(
      { playbackHost: 'youtube', youtubeVideoId: validYoutubeId },
      'ep-yt',
    );
    expect(result).toEqual({
      ok: true,
      playbackHost: 'youtube',
      customPlaybackUrl: null,
      youtubeVideoId: validYoutubeId,
    });
  });

  it('defaults legacy rows without playbackHost to YouTube validation', () => {
    const result = validateCatalogRowForRoomSeed({ youtubeVideoId: validYoutubeId }, 'ep-legacy');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.playbackHost).toBe('youtube');
    expect(result.customPlaybackUrl).toBeNull();
  });

  it('rejects YouTube-host rows with missing or invalid ids', () => {
    expect(validateCatalogRowForRoomSeed({ playbackHost: 'youtube' }, 'ep-yt')).toMatchObject({
      ok: false,
      code: 'catalog_episode_youtube_id_missing',
      statusCode: 400,
    });
    expect(
      validateCatalogRowForRoomSeed(
        { playbackHost: 'youtube', youtubeVideoId: 'short' },
        'ep-yt',
      ),
    ).toMatchObject({
      ok: false,
      code: 'catalog_episode_youtube_id_missing',
      statusCode: 400,
    });
  });

  it('accepts Custom-host rows with HTTPS URL and no YouTube id', () => {
    const result = validateCatalogRowForRoomSeed(
      {
        playbackHost: 'custom',
        customPlaybackUrl: 'https://example.com/watch/123',
      },
      'ep-custom',
    );
    expect(result).toEqual({
      ok: true,
      playbackHost: 'custom',
      customPlaybackUrl: 'https://example.com/watch/123',
    });
  });

  it('includes optional youtubeVideoId on Custom-host rows when present', () => {
    const result = validateCatalogRowForRoomSeed(
      {
        playbackHost: 'custom',
        customPlaybackUrl: 'https://example.com/watch/123',
        youtubeVideoId: validYoutubeId,
      },
      'ep-custom',
    );
    expect(result).toEqual({
      ok: true,
      playbackHost: 'custom',
      customPlaybackUrl: 'https://example.com/watch/123',
      youtubeVideoId: validYoutubeId,
    });
  });

  it('rejects Custom-host rows with missing or non-HTTPS URLs', () => {
    expect(
      validateCatalogRowForRoomSeed({ playbackHost: 'custom' }, 'ep-custom'),
    ).toMatchObject({
      ok: false,
      code: 'catalog_episode_custom_url_missing',
      statusCode: 400,
    });
    expect(
      validateCatalogRowForRoomSeed(
        { playbackHost: 'custom', customPlaybackUrl: 'http://example.com/watch' },
        'ep-custom',
      ),
    ).toMatchObject({
      ok: false,
      code: 'catalog_episode_custom_url_missing',
      statusCode: 400,
    });
  });
});
