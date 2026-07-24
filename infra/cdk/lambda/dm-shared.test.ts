import { describe, expect, it } from 'vitest';
import {
  decodeHistoryCursor,
  directMessageSortKey,
  encodeHistoryCursor,
  isPairMember,
  parseHistoryLimit,
} from './dm-shared';
import { friendshipPairKey } from './friends-shared';

describe('dm-shared helpers', () => {
  it('builds zero-padded message sort keys', () => {
    expect(directMessageSortKey(42, 'abc')).toBe('m#0000000000042#abc');
  });

  it('round-trips history cursors as base64url JSON', () => {
    const cursor = { sentAt: 1700000000123, messageId: '550e8400-e29b-41d4-a716-446655440000' };
    const encoded = encodeHistoryCursor(cursor);
    expect(decodeHistoryCursor(encoded)).toEqual(cursor);
  });

  it('returns null for invalid cursors', () => {
    expect(decodeHistoryCursor('not-valid')).toBeNull();
    expect(decodeHistoryCursor('')).toBeNull();
  });

  it('detects pair membership', () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    expect(isPairMember(pairKey, 'fan-a')).toBe(true);
    expect(isPairMember(pairKey, 'fan-c')).toBe(false);
    expect(isPairMember('bad-key', 'fan-a')).toBe(false);
  });

  it('clamps history limit to max 100', () => {
    expect(parseHistoryLimit(undefined)).toBe(50);
    expect(parseHistoryLimit('10')).toBe(10);
    expect(parseHistoryLimit('500')).toBe(100);
  });
});
