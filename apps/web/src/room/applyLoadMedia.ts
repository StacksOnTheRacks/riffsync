import { patchRoom, type RoomSnapshot } from '../api/roomsApi'
import type { CatalogEpisode } from '../catalog/catalogTypes'
import type { HostMediaTabState } from '../hostBridge/hostExtensionBridge'
import { mergeRoomPatchResult } from './hostRoomControls'
import { openOrNavigateHostSourceTab, resolveHostSourceTabUrl } from './hostSourceTab'

export type ApplyLoadMediaArgs = {
  fanToken: string
  roomId: string
  room: RoomSnapshot
  episode: CatalogEpisode
  origin: string
  extensionPresent: boolean
  extensionBound: boolean
  openHostMediaTab: (url: string) => Promise<HostMediaTabState | null>
}

export type ApplyLoadMediaResult =
  | { ok: true; room: RoomSnapshot }
  | { ok: false; error: string }

export async function applyLoadMediaSelection({
  fanToken,
  roomId,
  room,
  episode,
  origin,
  extensionPresent,
  extensionBound,
  openHostMediaTab,
}: ApplyLoadMediaArgs): Promise<ApplyLoadMediaResult> {
  try {
    const res = await patchRoom(fanToken, roomId, { catalogEpisodeId: episode.id })
    const updatedRoom = mergeRoomPatchResult(room, res)
    const url = resolveHostSourceTabUrl({
      catalogEp: episode,
      catalogEpisodeId: episode.id,
      origin,
    })

    if (extensionPresent && extensionBound) {
      const state = await openHostMediaTab(url)
      if (state?.mediaTabOpen) {
        return { ok: true, room: updatedRoom }
      }
    }

    openOrNavigateHostSourceTab(url)
    return { ok: true, room: updatedRoom }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not load media.' }
  }
}
