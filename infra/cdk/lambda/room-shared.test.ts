import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  defaultStaleRoomMs,
  initialDisplayTitleFromCatalog,
  lobbySortKey,
  normalizeRoomDisplayTitle,
  parsePlaybackExpectation,
  parseVisibility,
  ROOM_DISPLAY_TITLE_MAX_LEN,
} from './room-shared';

describe('room-shared', () => {
  describe('parsePlaybackExpectation', () => {
    it('accepts valid values', () => {
      expect(parsePlaybackExpectation('free')).toBe('free');
      expect(parsePlaybackExpectation('premium')).toBe('premium');
    });
    it('rejects junk', () => {
      expect(parsePlaybackExpectation('ad_supported')).toBeNull();
      expect(parsePlaybackExpectation(null)).toBeNull();
    });
  });

  describe('parseVisibility', () => {
    it('accepts public/private', () => {
      expect(parseVisibility('public')).toBe('public');
      expect(parseVisibility('private')).toBe('private');
    });
  });

  describe('lobbySortKey', () => {
    it('ties break with roomId', () => {
      expect(lobbySortKey(1, 'a')).not.toBe(lobbySortKey(1, 'b'));
      expect(lobbySortKey(1, 'a')).toContain('a');
    });
  });

  describe('defaultStaleRoomMs', () => {
    const prev = process.env.STALE_ROOM_MS;

    afterEach(() => {
      if (prev === undefined) delete process.env.STALE_ROOM_MS;
      else process.env.STALE_ROOM_MS = prev;
    });

    beforeEach(() => {
      delete process.env.STALE_ROOM_MS;
    });

    it('defaults to 45 minutes', () => {
      expect(defaultStaleRoomMs()).toBe(45 * 60 * 1000);
    });

    it('reads env', () => {
      process.env.STALE_ROOM_MS = '60000';
      expect(defaultStaleRoomMs()).toBe(60000);
    });
  });
});

describe('normalizeRoomDisplayTitle', () => {
  it('trims and accepts valid strings', () => {
    expect(normalizeRoomDisplayTitle('  Hi  ')).toBe('Hi');
  });
  it('rejects empty', () => {
    expect(normalizeRoomDisplayTitle('   ')).toBeNull();
    expect(normalizeRoomDisplayTitle(null)).toBeNull();
  });
  it('rejects too long', () => {
    expect(normalizeRoomDisplayTitle('x'.repeat(ROOM_DISPLAY_TITLE_MAX_LEN + 1))).toBeNull();
  });
});

describe('initialDisplayTitleFromCatalog', () => {
  it('uses catalog title when present', () => {
    expect(initialDisplayTitleFromCatalog({ catalogEpisodeId: 'ep1', catalogTitle: '  Foo  ' })).toBe('Foo');
  });
  it('falls back to episode id', () => {
    expect(initialDisplayTitleFromCatalog({ catalogEpisodeId: 'ep99', catalogTitle: '' })).toBe('ep99');
  });
});
