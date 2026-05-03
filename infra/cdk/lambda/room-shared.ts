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
