/** Sentinel hostSub so WS connect accepts the room; no Cognito principal matches. */
export const LIVE_SYSTEM_HOST_SUB = 'system:live';

export function liveRoomIdForCatalogEpisodeId(catalogEpisodeId: string): string {
  return `live-${catalogEpisodeId.trim()}`;
}
