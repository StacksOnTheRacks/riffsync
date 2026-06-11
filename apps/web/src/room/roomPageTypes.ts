import type { ChatGifLine, ChatTextLine } from './sessions/ChatSession'

export type ChatLine = ChatTextLine | ChatGifLine

export type PresenceMember = {
  sessionId: string
  displayName: string
  isHost: boolean
  avatarUrl?: string
}

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
