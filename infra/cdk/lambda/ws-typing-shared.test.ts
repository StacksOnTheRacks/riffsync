import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docSend: vi.fn(),
}));

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({ send: mocks.docSend })),
  },
  UpdateCommand: vi.fn((input: unknown) => ({ input, kind: 'Update' })),
}));

import { TYPING_PAIR_LIMIT_PER_MINUTE, tryConsumeTypingRateLimit } from './ws-typing-shared';

describe('tryConsumeTypingRateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows events under the per-minute pair budget', async () => {
    mocks.docSend.mockResolvedValueOnce({});
    const allowed = await tryConsumeTypingRateLimit(
      { send: mocks.docSend } as never,
      'connections',
      'conn-1',
      1_700_000_000_000,
    );
    expect(allowed).toBe(true);
    expect(mocks.docSend).toHaveBeenCalledTimes(1);
  });

  it('returns false when the same-minute budget is exhausted', async () => {
    const conditionalErr = Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' });
    mocks.docSend
      .mockRejectedValueOnce(conditionalErr)
      .mockRejectedValueOnce(conditionalErr);

    const allowed = await tryConsumeTypingRateLimit(
      { send: mocks.docSend } as never,
      'connections',
      'conn-1',
      1_700_000_000_000,
    );
    expect(allowed).toBe(false);
  });

  it('resets the counter when the minute bucket rolls', async () => {
    const conditionalErr = Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' });
    mocks.docSend.mockRejectedValueOnce(conditionalErr).mockResolvedValueOnce({});

    const allowed = await tryConsumeTypingRateLimit(
      { send: mocks.docSend } as never,
      'connections',
      'conn-1',
      1_700_000_000_000,
    );
    expect(allowed).toBe(true);
    expect(mocks.docSend).toHaveBeenCalledTimes(2);
    const resetCall = mocks.docSend.mock.calls[1][0] as {
      input?: { UpdateExpression?: string; ExpressionAttributeValues?: Record<string, unknown> };
    };
    expect(resetCall.input?.UpdateExpression).toContain('typingRateCount = :one');
    expect(TYPING_PAIR_LIMIT_PER_MINUTE).toBe(30);
  });
});
