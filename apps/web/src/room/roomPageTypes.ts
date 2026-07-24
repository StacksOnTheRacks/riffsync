import type { ChatGifLine, ChatTextLine } from './sessions/ChatSession'
import type { ChatSystemLine } from './chatSystemLine'
import type { RemoteTypingEntry } from './chatTypingIndicators'

export type ChatLine = ChatTextLine | ChatGifLine | ChatSystemLine

export type PresenceMember = {
  sessionId: string
  displayName: string
  isHost: boolean
  active?: boolean
  lastActiveAt?: number
  /** Present for signed-in fan connections only; omitted for anonymous guests. */
  fanSub?: string
  avatarUrl?: string
}

export type { RemoteTypingEntry }

export type RoomSidebarTab = 'chat' | 'people' | 'room' | 'profile'

export function resolveMemberAvatarUrl(
  memberSessionId: string,
  serverAvatarUrl: string | undefined,
  mySessionId: string,
  myAvatarUrl: string | null,
): string | undefined {
  if (serverAvatarUrl) return serverAvatarUrl
  if (memberSessionId === mySessionId && myAvatarUrl) return myAvatarUrl
  return undefined
}
