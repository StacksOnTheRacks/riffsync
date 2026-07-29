export type CatalogPlaybackHost = 'youtube' | 'custom';

export type RoomSeedPlaybackSuccess = {
  ok: true;
  playbackHost: CatalogPlaybackHost;
  customPlaybackUrl: string | null;
  youtubeVideoId?: string;
};

export type RoomSeedPlaybackFailureCode =
  | 'catalog_episode_not_found'
  | 'catalog_episode_youtube_id_missing'
  | 'catalog_episode_custom_url_missing';

export type RoomSeedPlaybackFailure = {
  ok: false;
  code: RoomSeedPlaybackFailureCode;
  error: string;
  statusCode: 404 | 400;
};

export type RoomSeedPlaybackResult = RoomSeedPlaybackSuccess | RoomSeedPlaybackFailure;

const YOUTUBE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

export function readCatalogPlaybackHost(
  row: Record<string, unknown> | undefined | null,
): CatalogPlaybackHost {
  if (!row) return 'youtube';
  return row.playbackHost === 'custom' ? 'custom' : 'youtube';
}

export function validateCatalogRowForRoomSeed(
  row: Record<string, unknown> | undefined | null,
  catalogEpisodeId: string,
): RoomSeedPlaybackResult {
  if (!row) {
    return {
      ok: false,
      code: 'catalog_episode_not_found',
      error: `Unknown catalog episode: ${catalogEpisodeId}`,
      statusCode: 404,
    };
  }

  const playbackHost = readCatalogPlaybackHost(row);

  if (playbackHost === 'custom') {
    const url = typeof row.customPlaybackUrl === 'string' ? row.customPlaybackUrl.trim() : '';
    if (!url.startsWith('https://')) {
      return {
        ok: false,
        code: 'catalog_episode_custom_url_missing',
        error: 'Catalog episode requires a custom HTTPS playback URL',
        statusCode: 400,
      };
    }

    const youtubeVideoId =
      typeof row.youtubeVideoId === 'string' && row.youtubeVideoId.trim() !== ''
        ? row.youtubeVideoId.trim()
        : undefined;

    return {
      ok: true,
      playbackHost: 'custom',
      customPlaybackUrl: url,
      ...(youtubeVideoId !== undefined ? { youtubeVideoId } : {}),
    };
  }

  const youtubeVideoId =
    typeof row.youtubeVideoId === 'string' ? row.youtubeVideoId.trim() : '';
  if (!YOUTUBE_VIDEO_ID_PATTERN.test(youtubeVideoId)) {
    return {
      ok: false,
      code: 'catalog_episode_youtube_id_missing',
      error: 'Catalog episode requires a valid YouTube video id',
      statusCode: 400,
    };
  }

  return {
    ok: true,
    playbackHost: 'youtube',
    customPlaybackUrl: null,
    youtubeVideoId,
  };
}
