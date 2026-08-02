import { describe, expect, it } from 'vitest';
import {
  compareReadCursors,
  decodeHistoryCursor,
  directMessagePassesHistoryCutoff,
  directMessageSortKey,
  encodeHistoryCursor,
  isDirectMessageUnread,
  isPairMember,
  isReadCursorNewer,
  parseDmSendBody,
  parseDirectMessageItem,
  parseHistoryLimit,
  toDirectMessageWire,
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

  it('compares read cursors with sentAt then messageId tie-break', () => {
    expect(compareReadCursors({ lastReadSentAt: 1, lastReadMessageId: 'a' }, { lastReadSentAt: 2, lastReadMessageId: 'a' })).toBeLessThan(0);
    expect(isReadCursorNewer({ lastReadSentAt: 2, lastReadMessageId: 'a' }, { lastReadSentAt: 1, lastReadMessageId: 'z' })).toBe(true);
    expect(isReadCursorNewer({ lastReadSentAt: 1, lastReadMessageId: 'b' }, { lastReadSentAt: 1, lastReadMessageId: 'a' })).toBe(true);
  });

  it('detects unread messages against cursor', () => {
    const message = {
      pairKey: 'a#b',
      sk: 'm#1#id',
      messageId: 'msg-b',
      senderSub: 'fan-b',
      kind: 'text' as const,
      body: 'hi',
      sentAt: 100,
    };
    expect(isDirectMessageUnread(message, { lastReadSentAt: 99, lastReadMessageId: 'msg-a' })).toBe(true);
    expect(isDirectMessageUnread(message, { lastReadSentAt: 100, lastReadMessageId: 'msg-a' })).toBe(true);
    expect(isDirectMessageUnread(message, { lastReadSentAt: 100, lastReadMessageId: 'msg-b' })).toBe(false);
  });

  it('filters history by closedAt cutoff after re-friend reopen', () => {
    const thread = {
      pairKey: 'a#b',
      subA: 'a',
      subB: 'b',
      status: 'open' as const,
      openedAt: 1,
      updatedAt: 2,
      closedAt: 500,
      reopenedAt: 1000,
    };
    const oldMessage = {
      pairKey: 'a#b',
      sk: 'm#1#old',
      messageId: 'old',
      senderSub: 'a',
      kind: 'text' as const,
      body: 'before',
      sentAt: 400,
    };
    const cutoffMessage = {
      ...oldMessage,
      messageId: 'at-cutoff',
      sentAt: 500,
    };
    const newMessage = {
      ...oldMessage,
      messageId: 'new',
      sentAt: 600,
    };
    expect(directMessagePassesHistoryCutoff(oldMessage, thread)).toBe(false);
    expect(directMessagePassesHistoryCutoff(cutoffMessage, thread)).toBe(false);
    expect(directMessagePassesHistoryCutoff(newMessage, thread)).toBe(true);
  });

  it('parses and serializes gif direct messages', () => {
    const parsedBody = parseDmSendBody(
      JSON.stringify({
        messageId: 'gif-1',
        kind: 'gif',
        giphyId: 'abc123',
        renditionUrl: 'https://media.example/gif.gif',
        title: 'Dance',
        width: 320,
        height: 240,
      }),
    );
    expect(parsedBody).toMatchObject({
      ok: true,
      kind: 'gif',
      body: 'Dance',
      giphyId: 'abc123',
      renditionUrl: 'https://media.example/gif.gif',
    });

    const item = parseDirectMessageItem({
      pairKey: 'a#b',
      sk: 'm#1#gif-1',
      messageId: 'gif-1',
      senderSub: 'a',
      kind: 'gif',
      body: 'Dance',
      giphyId: 'abc123',
      renditionUrl: 'https://media.example/gif.gif',
      title: 'Dance',
      sentAt: 123,
    });
    expect(item).not.toBeNull();
    expect(item ? toDirectMessageWire(item) : null).toMatchObject({
      kind: 'gif',
      giphyId: 'abc123',
      renditionUrl: 'https://media.example/gif.gif',
    });
  });
});
