import { useCallback, useEffect, useState } from 'react'
import {
  TheaterPlayback,
  type TheaterPlaybackSnapshot,
} from './sessions/TheaterPlayback'
import type { SfuMediaSession } from './sessions/SfuMediaSession'

/**
 * Thin React adapter around {@link TheaterPlayback}. Web Audio mix, host_screen video
 * binding, and guest playback status live in the session class.
 */
export function useTheaterPlayback(options: {
  enabled: boolean
  isPublisher: boolean
  avDisabled: boolean
  guestRemote: MediaStream | null
  captureStream: MediaStream | null
  sfuSession: SfuMediaSession
  youtubeVideoId?: string | null
}): {
  snapshot: TheaterPlaybackSnapshot
  playGuestVideo: () => Promise<void>
  playHostCapturePreview: () => Promise<void>
  bindGuestVideo: (element: HTMLVideoElement | null) => void
  bindHostCaptureVideo: (element: HTMLVideoElement | null) => void
  bindYoutubeMount: (element: HTMLElement | null) => void
  session: TheaterPlayback
} {
  const {
    enabled,
    isPublisher,
    avDisabled,
    guestRemote,
    captureStream,
    sfuSession,
    youtubeVideoId,
  } = options

  const [session] = useState(() => new TheaterPlayback())
  const [snapshot, setSnapshot] = useState<TheaterPlaybackSnapshot>(() => session.getSnapshot())

  useEffect(() => {
    return session.onSnapshotChange(setSnapshot)
  }, [session])

  useEffect(() => {
    session.attachSfuSession(sfuSession)
    return () => session.detachSfuSession()
  }, [session, sfuSession])

  useEffect(() => {
    session.configure({ enabled, isPublisher, avDisabled })
  }, [session, enabled, isPublisher, avDisabled])

  useEffect(() => {
    session.setGuestRemote(guestRemote)
  }, [session, guestRemote])

  useEffect(() => {
    session.setCaptureStream(captureStream)
  }, [session, captureStream])

  useEffect(() => {
    session.setYoutubeVideoId(youtubeVideoId ?? null)
  }, [session, youtubeVideoId])

  useEffect(() => {
    return () => session.dispose()
  }, [session])

  const playGuestVideo = useCallback(() => session.playGuestVideo(), [session])
  const playHostCapturePreview = useCallback(() => session.playHostCapturePreview(), [session])
  const bindGuestVideo = useCallback(
    (element: HTMLVideoElement | null) => session.setGuestVideoElement(element),
    [session],
  )
  const bindHostCaptureVideo = useCallback(
    (element: HTMLVideoElement | null) => session.setHostCaptureVideoElement(element),
    [session],
  )
  const bindYoutubeMount = useCallback(
    (element: HTMLElement | null) => session.setYoutubeMountElement(element),
    [session],
  )

  return {
    snapshot,
    playGuestVideo,
    playHostCapturePreview,
    bindGuestVideo,
    bindHostCaptureVideo,
    bindYoutubeMount,
    session,
  }
}
