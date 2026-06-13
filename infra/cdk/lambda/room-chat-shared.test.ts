import { describe, expect, it } from 'vitest';
import {
  buildReactionsByMessage,
  messageSortKey,
  parseChatHistoryLimit,
  parseChatHistoryTtlSeconds,
  reactionSortKey,
} from './room-chat-shared';

describe('room-chat-shared config', () => {
  it('defaults and caps chat history limit', () => {
    expect(parseChatHistoryLimit(undefined)).toBe(50);
    expect(parseChatHistoryLimit('25')).toBe(25);
    expect(parseChatHistoryLimit('500')).toBe(100);
    expect(parseChatHistoryLimit('nope')).toBe(50);
  });

  it('defaults chat history ttl seconds', () => {
    expect(parseChatHistoryTtlSeconds(undefined)).toBe(86_400);
    expect(parseChatHistoryTtlSeconds('3600')).toBe(3600);
    expect(parseChatHistoryTtlSeconds('0')).toBe(86_400);
  });
});

describe('room-chat-shared sort keys', () => {
  it('builds stable message and reaction sort keys', () => {
    expect(messageSortKey(1_700_000_000_123, '550e8400-e29b-41d4-a716-446655440000')).toBe(
      'm#1700000000123#550e8400-e29b-41d4-a716-446655440000',
    );
    expect(reactionSortKey('msg-1', '👍', 'sess-a')).toBe('r#msg-1#👍#sess-a');
  });
});

describe('buildReactionsByMessage', () => {
  it('aggregates counts and reactedByMe for the viewer session', () => {
    const reactions = buildReactionsByMessage(
      [
        { messageId: 'm1', emoji: '👍', sessionId: 'sess-a' },
        { messageId: 'm1', emoji: '👍', sessionId: 'sess-b' },
        { messageId: 'm1', emoji: '🔥', sessionId: 'sess-viewer' },
        { messageId: 'm2', emoji: '👍', sessionId: 'sess-a' },
      ],
      new Set(['m1']),
      'sess-viewer',
    );

    expect(reactions).toEqual({
      m1: {
        '👍': { count: 2, reactedByMe: false },
        '🔥': { count: 1, reactedByMe: true },
      },
    });
  });
});
