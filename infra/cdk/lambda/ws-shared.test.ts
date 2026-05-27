import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import {
  enrichRosterMembersWithAvatarUrls,
  rosterFromConnectionItems,
  type PresenceBroadcastMember,
} from './ws-shared';

vi.mock('./fan-profile-shared', () => ({
  batchAvatarUrlsByFanSub: vi.fn(),
}));

import { batchAvatarUrlsByFanSub } from './fan-profile-shared';

const batchMock = vi.mocked(batchAvatarUrlsByFanSub);

describe('rosterFromConnectionItems', () => {
  it('merges tabs by sessionId and tracks fanSub for avatar enrichment', () => {
    const { members, fanSubBySessionId } = rosterFromConnectionItems([
      {
        sessionId: 'sess-a',
        displayName: 'Alice',
        fanSub: 'fan-1',
      },
      {
        sessionId: 'sess-a',
        displayName: 'Alice tab 2',
        fanSub: 'fan-1',
      },
      {
        sessionId: 'sess-guest',
      },
      {
        sessionId: 'sess-host',
        hostSub: 'host-sub',
        fanSub: 'host-sub',
      },
    ]);

    expect(members).toHaveLength(3);
    expect(fanSubBySessionId.get('sess-a')).toBe('fan-1');
    expect(fanSubBySessionId.get('sess-host')).toBe('host-sub');
    expect(fanSubBySessionId.has('sess-guest')).toBe(false);

    const host = members.find((m) => m.sessionId === 'sess-host');
    expect(host?.isHost).toBe(true);
    expect(host?.avatarUrl).toBeUndefined();

    const guest = members.find((m) => m.sessionId === 'sess-guest');
    expect(guest?.isHost).toBe(false);
    expect(guest?.displayName).toMatch(/^Guest/);
  });
});

describe('enrichRosterMembersWithAvatarUrls', () => {
  it('adds avatarUrl only for members with a profile URL', async () => {
    batchMock.mockResolvedValue(new Map([['fan-1', 'https://cdn.example/avatars/fan-1.png']]));

    const members: PresenceBroadcastMember[] = [
      { sessionId: 'sess-a', displayName: 'Alice', isHost: false },
      { sessionId: 'sess-guest', displayName: 'Guest', isHost: false },
    ];
    const fanSubBySessionId = new Map([['sess-a', 'fan-1']]);

    const enriched = await enrichRosterMembersWithAvatarUrls(
      {} as DynamoDBDocumentClient,
      'FanProfiles',
      members,
      fanSubBySessionId,
    );

    expect(enriched[0]?.avatarUrl).toBe('https://cdn.example/avatars/fan-1.png');
    expect(enriched[1]?.avatarUrl).toBeUndefined();
    expect(batchMock).toHaveBeenCalledWith({}, 'FanProfiles', ['fan-1']);
  });
});
