import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import {
  derivePresenceActive,
  enrichRosterMembersWithAvatarUrls,
  PRESENCE_ACTIVE_WINDOW_SEC,
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
    expect(guest?.active).toBe(false);
    expect(guest?.lastActiveAt).toBeUndefined();
  });

  it('uses max lastActiveAt across tabs and precomputes active', () => {
    const nowSec = 1_700_000_000;
    const recent = nowSec - 30;
    const stale = nowSec - PRESENCE_ACTIVE_WINDOW_SEC;

    const { members } = rosterFromConnectionItems(
      [
        { sessionId: 'sess-a', displayName: 'Alice', lastActiveAt: stale },
        { sessionId: 'sess-a', displayName: 'Alice tab 2', lastActiveAt: recent },
        { sessionId: 'sess-b', displayName: 'Bob', lastActiveAt: stale },
      ],
      nowSec,
    );

    const alice = members.find((m) => m.sessionId === 'sess-a');
    expect(alice?.lastActiveAt).toBe(recent);
    expect(alice?.active).toBe(true);

    const bob = members.find((m) => m.sessionId === 'sess-b');
    expect(bob?.lastActiveAt).toBe(stale);
    expect(bob?.active).toBe(false);
  });

  it('treats lastActiveAt exactly at window boundary as inactive', () => {
    const nowSec = 1_700_000_000;
    const atBoundary = nowSec - PRESENCE_ACTIVE_WINDOW_SEC;
    const { members } = rosterFromConnectionItems(
      [{ sessionId: 'sess-a', displayName: 'Alice', lastActiveAt: atBoundary }],
      nowSec,
    );
    expect(members[0]?.active).toBe(false);
  });
});

describe('derivePresenceActive', () => {
  it('returns true inside the 120s window and false at or beyond it', () => {
    const nowSec = 1_000_000;
    expect(derivePresenceActive(nowSec - 119, nowSec)).toBe(true);
    expect(derivePresenceActive(nowSec - 120, nowSec)).toBe(false);
    expect(derivePresenceActive(undefined, nowSec)).toBe(false);
  });
});

describe('enrichRosterMembersWithAvatarUrls', () => {
  it('adds avatarUrl only for members with a profile URL', async () => {
    batchMock.mockResolvedValue(new Map([['fan-1', 'https://cdn.example/avatars/fan-1.png']]));

    const members: PresenceBroadcastMember[] = [
      { sessionId: 'sess-a', displayName: 'Alice', isHost: false, active: true },
      { sessionId: 'sess-guest', displayName: 'Guest', isHost: false, active: false },
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
