// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { applyLoadMediaSelection } from './applyLoadMedia'
import type { RoomSnapshot } from '../api/roomsApi'
import type { CatalogEpisode } from '../catalog/catalogTypes'

const patchRoom = vi.fn()
const openHostMediaTab = vi.fn()

vi.mock('../api/roomsApi', () => ({
  patchRoom: (...args: unknown[]) => patchRoom(...args),
}))

const episode: CatalogEpisode = {
  id: 'ep-2',
  experimentNumber: 2,
  title: 'Next Episode',
  catalog: 'mst3k',
  tags: [],
  labels: [],
  youtubeVideoId: 'abc12345678',
  youtubeWatchUrl: 'https://youtube.com/watch?v=abc12345678',
  tagline: null,
  posterImageUrl: null,
  backdropImageUrl: null,
  tmdbMovieId: null,
  tmdbArtworkSyncedAt: null,
  carousel: false,
  spotlight: false,
  playbackHost: 'youtube',
  customPlaybackUrl: null,
}

const room: RoomSnapshot = {
  roomId: 'room-1',
  hostSub: 'host',
  catalogEpisodeId: 'ep-1',
  playbackHost: 'youtube',
  customPlaybackUrl: null,
  youtubeVideoId: 'abc12345678',
  visibility: 'private',
  lastActivityAt: 1,
  version: 1,
  roomMode: 'theater',
  avDisabled: false,
  broadcastCaptureActive: false,
}

describe('applyLoadMediaSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    patchRoom.mockResolvedValue({
      ok: true,
      roomId: 'room-1',
      version: 2,
      catalogEpisodeId: 'ep-2',
      playbackHost: 'youtube',
      customPlaybackUrl: null,
      youtubeVideoId: 'abc12345678',
      visibility: 'private',
      lastActivityAt: 2,
      roomMode: 'theater',
      avDisabled: false,
      broadcastCaptureActive: false,
    })
  })

  it('PATCHes catalogEpisodeId only then opens via extension when bound', async () => {
    openHostMediaTab.mockResolvedValue({ mediaTabOpen: true, bound: true })
    const openWindow = vi.spyOn(window, 'open').mockReturnValue(null)

    const result = await applyLoadMediaSelection({
      fanToken: 'token',
      roomId: 'room-1',
      room,
      episode,
      origin: 'https://www.test.example',
      extensionPresent: true,
      extensionBound: true,
      openHostMediaTab,
    })

    expect(result.ok).toBe(true)
    expect(patchRoom).toHaveBeenCalledWith('token', 'room-1', { catalogEpisodeId: 'ep-2' })
    expect(openHostMediaTab).toHaveBeenCalledWith(
      'https://www.test.example/watch/ep-2?partyCapture=1',
    )
    expect(openWindow).not.toHaveBeenCalled()
    openWindow.mockRestore()
  })

  it('uses new-tab path when extension is absent', async () => {
    openHostMediaTab.mockResolvedValue(null)
    const openWindow = vi.spyOn(window, 'open').mockReturnValue({} as Window)

    const result = await applyLoadMediaSelection({
      fanToken: 'token',
      roomId: 'room-1',
      room,
      episode,
      origin: 'https://www.test.example',
      extensionPresent: false,
      extensionBound: false,
      openHostMediaTab,
    })

    expect(result.ok).toBe(true)
    expect(openHostMediaTab).not.toHaveBeenCalled()
    expect(openWindow).toHaveBeenCalled()
    openWindow.mockRestore()
  })

  it('does not open media when PATCH fails', async () => {
    patchRoom.mockRejectedValue(new Error('403 Forbidden'))
    openHostMediaTab.mockResolvedValue({ mediaTabOpen: true, bound: true })
    const openWindow = vi.spyOn(window, 'open').mockReturnValue(null)

    const result = await applyLoadMediaSelection({
      fanToken: 'token',
      roomId: 'room-1',
      room,
      episode,
      origin: 'https://www.test.example',
      extensionPresent: true,
      extensionBound: true,
      openHostMediaTab,
    })

    expect(result.ok).toBe(false)
    expect(openHostMediaTab).not.toHaveBeenCalled()
    expect(openWindow).not.toHaveBeenCalled()
    openWindow.mockRestore()
  })
})
