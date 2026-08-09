let tvClientSessionCounter = 0

export function createTvClientSessionId(): string {
  tvClientSessionCounter += 1
  return `tv-client-${Date.now().toString(36)}-${tvClientSessionCounter}`
}

export function resetTvClientSessionIdCounterForTests(): void {
  tvClientSessionCounter = 0
}

export type TvPlaybackPath =
  | 'tv_client_stream'
  | 'tv_client_idle_youtube_embed'
  | 'tv_client_placeholder'
  | 'tv_client_video_chat'

export type TvFailureClass =
  | 'link_failed'
  | 'player_blocked'
  | 'media_unsupported'
  | 'network'
  | 'sender_gone'
