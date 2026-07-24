import { describe, expect, it } from 'vitest';
import { fanSubRoomPresenceSk, ROOM_PRESENCE_FAN_SUB_INDEX } from './room-presence-shared';

describe('room-presence-shared', () => {
  it('defines FanSubPresenceIndex GSI name', () => {
    expect(ROOM_PRESENCE_FAN_SUB_INDEX).toBe('FanSubPresenceIndex');
  });

  it('builds fanSubRoomSk as roomId#presenceKey', () => {
    expect(fanSubRoomPresenceSk('room-1', 'sess#conn')).toBe('room-1#sess#conn');
  });
});
