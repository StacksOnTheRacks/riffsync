import { afterEach, describe, expect, it } from 'vitest';
import { isActiveCatalogEpisodeRoomReference } from './admin-catalog-delete-shared';

describe('isActiveCatalogEpisodeRoomReference', () => {
  const staleMs = 45 * 60 * 1000;
  const nowMs = 1_000_000;

  afterEach(() => {
    delete process.env.STALE_ROOM_MS;
  });

  it('returns true for matching episode within stale window', () => {
    expect(
      isActiveCatalogEpisodeRoomReference(
        { catalogEpisodeId: 'ep-1', lastActivityAt: nowMs - 1_000 },
        'ep-1',
        nowMs,
        staleMs,
      ),
    ).toBe(true);
  });

  it('returns false for matching episode past stale window', () => {
    expect(
      isActiveCatalogEpisodeRoomReference(
        { catalogEpisodeId: 'ep-1', lastActivityAt: nowMs - staleMs - 1 },
        'ep-1',
        nowMs,
        staleMs,
      ),
    ).toBe(false);
  });

  it('returns false when episode id differs', () => {
    expect(
      isActiveCatalogEpisodeRoomReference(
        { catalogEpisodeId: 'ep-2', lastActivityAt: nowMs - 1_000 },
        'ep-1',
        nowMs,
        staleMs,
      ),
    ).toBe(false);
  });

  it('returns false when lastActivityAt is missing or invalid', () => {
    expect(isActiveCatalogEpisodeRoomReference({ catalogEpisodeId: 'ep-1' }, 'ep-1', nowMs, staleMs)).toBe(
      false,
    );
    expect(
      isActiveCatalogEpisodeRoomReference(
        { catalogEpisodeId: 'ep-1', lastActivityAt: '2026-01-01' },
        'ep-1',
        nowMs,
        staleMs,
      ),
    ).toBe(false);
  });
});
