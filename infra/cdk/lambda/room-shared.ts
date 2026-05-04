/** Server-side room document (Dynamo single-table). */

export type RoomVisibility = 'public' | 'private';
export type PlaybackExpectation = 'free' | 'premium';

export const LOBBY_PARTITION = 'PUBLIC';

export function lobbySortKey(lastActivityAt: number, roomId: string): string {
  return `${String(lastActivityAt).padStart(20, '0')}#${roomId}`;
}

export function parsePlaybackExpectation(v: unknown): PlaybackExpectation | null {
  if (v === 'free' || v === 'premium') return v;
  return null;
}

export function parseVisibility(v: unknown): RoomVisibility | null {
  if (v === 'public' || v === 'private') return v;
  return null;
}

export function defaultStaleRoomMs(): number {
  const raw = process.env.STALE_ROOM_MS;
  if (raw === undefined || raw === '') return 45 * 60 * 1000;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 45 * 60 * 1000;
}

/** Max length for room `displayTitle` (lobby / “now playing” label). */
export const ROOM_DISPLAY_TITLE_MAX_LEN = 120;

/** Returns trimmed title or null if missing / empty / too long. */
export function normalizeRoomDisplayTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (t === '') return null;
  if (t.length > ROOM_DISPLAY_TITLE_MAX_LEN) return null;
  return t;
}

/** Seed display title from catalog row when creating a room. */
export function initialDisplayTitleFromCatalog(params: {
  catalogEpisodeId: string;
  catalogTitle: unknown;
}): string {
  const raw =
    typeof params.catalogTitle === 'string' ? params.catalogTitle.trim().slice(0, ROOM_DISPLAY_TITLE_MAX_LEN) : '';
  if (raw !== '') return raw;
  return params.catalogEpisodeId.slice(0, ROOM_DISPLAY_TITLE_MAX_LEN);
}
