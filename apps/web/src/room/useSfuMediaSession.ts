import { useCallback, useEffect, useState } from 'react'
import {
  SfuMediaSession,
  type SfuMediaSessionStatus,
} from './sessions/SfuMediaSession'
import type { SfuConsumerTrackEvent } from './sfu/mediasoupSharing'
import type { ParticipantAvController } from './sfu/participantAvSession'
import type { RoomMode } from '../api/roomsApi'

/**
 * Thin React adapter around {@link SfuMediaSession}. SFU signaling reconnect loop,
 * participant AV gate, and mediasoup lifecycle live in the session class.
 */
export function useSfuMediaSession(options: {
  enabled: boolean
  apiBaseUrl: string | undefined
  roomId: string
  sessionId: string
  accessToken: string | null
  fanToken: string | null
  avDisabled: boolean
  wsOpen: boolean
  getIceServers: () => Promise<RTCIceServer[]>
  getHostScreenStream: () => MediaStream | null
  captureStream: MediaStream | null
  roomMode: RoomMode
  isPublisher: boolean
  onConsumerTrack?: (event: SfuConsumerTrackEvent) => void
  onParticipantAvConsumersClear?: () => void
}): {
  status: SfuMediaSessionStatus
  sfuError: string | null
  guestRemote: MediaStream | null
  participantAvController: ParticipantAvController
  session: SfuMediaSession
  unpublishHostScreen: () => void
} {
  const {
    enabled,
    apiBaseUrl,
    roomId,
    sessionId,
    accessToken,
    fanToken,
    avDisabled,
    wsOpen,
    getIceServers,
    getHostScreenStream,
    captureStream,
    roomMode,
    isPublisher,
    onConsumerTrack,
    onParticipantAvConsumersClear,
  } = options

  const [session] = useState(() => new SfuMediaSession())
  const [status, setStatus] = useState<SfuMediaSessionStatus>('idle')
  const [sfuError, setSfuError] = useState<string | null>(null)
  const [guestRemote, setGuestRemote] = useState<MediaStream | null>(null)
  const [participantAvPublishTick, setParticipantAvPublishTick] = useState(0)

  void participantAvPublishTick
  const participantAvController = session.participantAv

  useEffect(() => {
    return session.onStatusChange(setStatus)
  }, [session])

  useEffect(() => {
    return session.onError(setSfuError)
  }, [session])

  useEffect(() => {
    return session.onRemoteStream(setGuestRemote)
  }, [session])

  useEffect(() => {
    if (!onConsumerTrack) return
    return session.onConsumerTrack(onConsumerTrack)
  }, [session, onConsumerTrack])

  useEffect(() => {
    if (!onParticipantAvConsumersClear) return
    return session.onParticipantAvConsumersClear(onParticipantAvConsumersClear)
  }, [session, onParticipantAvConsumersClear])

  useEffect(() => {
    return session.participantAv.subscribe(() => {
      setParticipantAvPublishTick((n) => n + 1)
    })
  }, [session])

  useEffect(() => {
    return () => {
      session.participantAv.teardownPublishing()
    }
  }, [session])

  useEffect(() => {
    session.updatePublishGate({ wsOpen, fanToken, avDisabled })
  }, [session, wsOpen, fanToken, avDisabled])

  useEffect(() => {
    if (!enabled) {
      session.disconnect()
      return () => session.disconnect()
    }
    session.connect({
      apiBaseUrl,
      roomId,
      sessionId,
      accessToken,
      getIceServers,
      getHostScreenStream,
      enabled: true,
    })
    return () => session.disconnect()
  }, [
    accessToken,
    apiBaseUrl,
    enabled,
    getHostScreenStream,
    getIceServers,
    roomId,
    session,
    sessionId,
  ])

  useEffect(() => {
    return session.syncHostScreenPublish({
      stream: captureStream,
      roomMode,
      isPublisher,
    })
  }, [captureStream, isPublisher, roomMode, session, enabled])

  const unpublishHostScreen = useCallback(() => {
    session.unpublishHostScreen()
  }, [session])

  return {
    status,
    sfuError,
    guestRemote: isPublisher ? null : guestRemote,
    participantAvController,
    session,
    unpublishHostScreen,
  }
}
