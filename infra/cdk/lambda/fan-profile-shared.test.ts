import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import { avatarUrlFromStoredProfile, batchAvatarUrlsByFanSub } from './fan-profile-shared';

describe('avatarUrlFromStoredProfile', () => {
  it('returns trimmed https URL when set', () => {
    expect(avatarUrlFromStoredProfile({ avatarUrl: '  https://cdn.example/a.png  ' })).toBe(
      'https://cdn.example/a.png',
    );
  });

  it('returns undefined for blank or missing avatarUrl', () => {
    expect(avatarUrlFromStoredProfile({ avatarUrl: '   ' })).toBeUndefined();
    expect(avatarUrlFromStoredProfile(undefined)).toBeUndefined();
  });
});

describe('batchAvatarUrlsByFanSub', () => {
  const send = vi.fn();

  beforeEach(() => {
    send.mockReset();
  });

  it('batch-reads avatar URLs keyed by fan sub', async () => {
    send.mockResolvedValue({
      Responses: {
        FanProfiles: [
          { sub: 'fan-a', avatarUrl: 'https://cdn.example/a.png' },
          { sub: 'fan-b', avatarUrl: '' },
        ],
      },
    });

    const doc = { send } as unknown as DynamoDBDocumentClient;
    const map = await batchAvatarUrlsByFanSub(doc, 'FanProfiles', ['fan-a', 'fan-b', 'fan-a']);

    expect(map.size).toBe(1);
    expect(map.get('fan-a')).toBe('https://cdn.example/a.png');
    expect(send).toHaveBeenCalledTimes(1);
  });
});
