import type { FriendRosterSnapshot } from '../friends/friendsApi'

export type PeopleFriendMenuState =
  | { kind: 'add_friend' }
  | { kind: 'cancel_request'; requestId: string }
  | { kind: 'request_pending' }
  | { kind: 'friends' }

export function resolvePeopleFriendMenuState(
  peerFanSub: string,
  snapshot: FriendRosterSnapshot,
): PeopleFriendMenuState {
  if (snapshot.friends.some((friend) => friend.fanSub === peerFanSub)) {
    return { kind: 'friends' }
  }

  const outbound = snapshot.outbound.find((request) => request.recipientSub === peerFanSub)
  if (outbound) {
    return { kind: 'cancel_request', requestId: outbound.requestId }
  }

  const inbound = snapshot.inbound.find((request) => request.requesterSub === peerFanSub)
  if (inbound) {
    return { kind: 'request_pending' }
  }

  return { kind: 'add_friend' }
}

export function peopleFriendMenuPrimaryLabel(state: PeopleFriendMenuState): string {
  switch (state.kind) {
    case 'add_friend':
      return 'Add friend'
    case 'cancel_request':
      return 'Cancel request'
    case 'request_pending':
      return 'Request pending'
    case 'friends':
      return 'Friends'
  }
}

export function peopleFriendMenuPrimaryDisabled(state: PeopleFriendMenuState): boolean {
  return state.kind === 'request_pending' || state.kind === 'friends'
}
