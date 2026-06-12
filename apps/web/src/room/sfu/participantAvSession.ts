import {
  participantAvErrorFromDomException,
  participantAvErrorFromSfuMediaCode,
  type ParticipantAvErrorCode,
} from '../av/participantAvErrors'
import type { SfuUnifiedSessionHandle } from './mediasoupSharing'

export const PARTICIPANT_AV_MEDIA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    width: { ideal: 1280, max: 1280 },
    height: { ideal: 720, max: 720 },
    frameRate: { ideal: 24, max: 30 },
  },
  audio: { echoCancellation: true, noiseSuppression: true },
}

export function canParticipantAvPublish(opts: {
  fanToken: string | null
  avDisabled: boolean
}): boolean {
  return Boolean(opts.fanToken) && !opts.avDisabled
}

export type ParticipantAvPublishState = {
  cameraEnabled: boolean
  micEnabled: boolean
  micMuted: boolean
  canPublish: boolean
  needsProducerToken: boolean
  error: ParticipantAvErrorCode | null
  busy: boolean
}

export type ParticipantAvController = {
  getState: () => ParticipantAvPublishState
  getLocalPreviewStream: () => MediaStream | null
  subscribe: (listener: () => void) => () => void
  refreshPublishGate: () => void
  attachSession: (session: SfuUnifiedSessionHandle | null) => void
  resetOnReconnect: () => void
  /** Stop local getUserMedia and close participant_av producers (kill switch / room leave). */
  teardownPublishing: () => void
  enableCamera: () => Promise<void>
  disableCamera: () => void
  enableMic: () => Promise<void>
  disableMic: () => void
  toggleMicMute: () => void
  /** Hard-fail publish: toggles off, clears tracks, sets stable error code. */
  failPublish: (code: ParticipantAvErrorCode) => void
  clearError: () => void
}

export function createParticipantAvController(options: {
  canPublish: () => boolean
  onNeedsProducerTokenChange?: () => void
  /** Camera off while mic remains — partial unpublish telemetry (#216). */
  onPartialUnpublish?: () => void
}): ParticipantAvController {
  let cameraEnabled = false
  let micEnabled = false
  let micMuted = false
  let error: ParticipantAvErrorCode | null = null
  let busy = false
  let localStream: MediaStream | null = null
  let session: SfuUnifiedSessionHandle | null = null
  const listeners = new Set<() => void>()

  const notify = () => {
    for (const fn of listeners) fn()
  }

  const getState = (): ParticipantAvPublishState => ({
    cameraEnabled,
    micEnabled,
    micMuted,
    canPublish: options.canPublish(),
    needsProducerToken: cameraEnabled || micEnabled,
    error,
    busy,
  })

  const stopLocalTracks = () => {
    if (!localStream) return
    for (const track of localStream.getTracks()) {
      try {
        track.stop()
      } catch {
        /* ignore */
      }
    }
    localStream = null
  }

  const localTracksLive = (): boolean =>
    localStream?.getTracks().some((track) => track.readyState === 'live') ?? false

  const ensureLocalMedia = async (): Promise<boolean> => {
    if (!cameraEnabled && !micEnabled) return false
    if (localStream && localTracksLive()) return true
    try {
      localStream = await ensureUserMedia(cameraEnabled, micEnabled)
      const hasVideo = localStream.getVideoTracks().length > 0
      const hasAudio = localStream.getAudioTracks().length > 0
      cameraEnabled = hasVideo && cameraEnabled
      micEnabled = hasAudio && micEnabled
      if (!cameraEnabled && !micEnabled) {
        stopLocalTracks()
        throw new Error('Could not access camera or microphone.')
      }
      return true
    } catch (e) {
      cameraEnabled = false
      micEnabled = false
      micMuted = false
      stopLocalTracks()
      error = participantAvErrorFromDomException(e)
      notify()
      return false
    }
  }

  const syncPublish = async () => {
    if (!session) return
    if (!cameraEnabled && !micEnabled) {
      session.unpublishProducerClass('participant_av')
      stopLocalTracks()
      return
    }
    if (!cameraEnabled) {
      session.unpublishProducerKind('participant_av', 'video')
    }
    if (!micEnabled) {
      session.unpublishProducerKind('participant_av', 'audio')
    }
    if (!session.supportsPublish) return
    if (!(await ensureLocalMedia())) return
    if (!localStream) return
    const tracksToPublish: MediaStreamTrack[] = []
    if (cameraEnabled) {
      for (const track of localStream.getVideoTracks()) {
        tracksToPublish.push(track)
      }
    }
    if (micEnabled) {
      for (const track of localStream.getAudioTracks()) {
        tracksToPublish.push(track)
      }
    }
    if (tracksToPublish.length === 0) return
    try {
      await session.ready
      const streamForPublish = new MediaStream(tracksToPublish)
      await session.publishStream(streamForPublish, 'participant_av')
      if (micEnabled) {
        if (micMuted) {
          session.pauseProducerKind('participant_av', 'audio')
        } else {
          session.resumeProducerKind('participant_av', 'audio')
        }
      }
    } catch {
      cameraEnabled = false
      micEnabled = false
      micMuted = false
      stopLocalTracks()
      session.unpublishProducerClass('participant_av')
      options.onNeedsProducerTokenChange?.()
      error = participantAvErrorFromSfuMediaCode('produce_failed')
      notify()
    }
  }

  const ensureUserMedia = async (wantVideo: boolean, wantAudio: boolean): Promise<MediaStream> => {
    if (!options.canPublish()) {
      throw new Error('Camera and microphone are unavailable until the room is connected.')
    }
    const constraints: MediaStreamConstraints = {
      video: wantVideo ? PARTICIPANT_AV_MEDIA_CONSTRAINTS.video : false,
      audio: wantAudio ? PARTICIPANT_AV_MEDIA_CONSTRAINTS.audio : false,
    }
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch (firstErr) {
      if (wantVideo && wantAudio) {
        try {
          return await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: PARTICIPANT_AV_MEDIA_CONSTRAINTS.audio,
          })
        } catch {
          throw firstErr
        }
      }
      throw firstErr
    }
  }

  const mergeStream = async (wantVideo: boolean, wantAudio: boolean) => {
    stopLocalTracks()
    localStream = await ensureUserMedia(wantVideo, wantAudio)
    const hasVideo = localStream.getVideoTracks().length > 0
    const hasAudio = localStream.getAudioTracks().length > 0
    cameraEnabled = hasVideo && wantVideo
    micEnabled = hasAudio && wantAudio
    if (!cameraEnabled && !micEnabled) {
      stopLocalTracks()
      throw new Error('Could not access camera or microphone.')
    }
    options.onNeedsProducerTokenChange?.()
    await syncPublish()
    notify()
  }

  return {
    getState,
    getLocalPreviewStream: () => {
      if (!cameraEnabled || !localStream) return null
      if (localStream.getVideoTracks().length === 0) return null
      return localStream
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    refreshPublishGate: () => {
      notify()
    },
    attachSession: (next) => {
      session = next
      if (!session) return
      void syncPublish()
    },
    resetOnReconnect: () => {
      busy = false
      session = null
      notify()
    },
    teardownPublishing: () => {
      cameraEnabled = false
      micEnabled = false
      micMuted = false
      error = null
      busy = false
      stopLocalTracks()
      session?.unpublishProducerClass('participant_av')
      notify()
    },
    enableCamera: async () => {
      if (busy || cameraEnabled) return
      busy = true
      error = null
      notify()
      try {
        await mergeStream(true, micEnabled)
        error = null
      } catch (e) {
        cameraEnabled = false
        if (!micEnabled) stopLocalTracks()
        error = participantAvErrorFromDomException(e)
        notify()
      } finally {
        busy = false
        notify()
      }
    },
    disableCamera: () => {
      if (!cameraEnabled) return
      const micStaysOn = micEnabled
      cameraEnabled = false
      if (!micEnabled) {
        session?.unpublishProducerClass('participant_av')
        stopLocalTracks()
        options.onNeedsProducerTokenChange?.()
      } else if (localStream) {
        if (micStaysOn) {
          options.onPartialUnpublish?.()
        }
        for (const track of localStream.getVideoTracks()) {
          try {
            track.stop()
            localStream.removeTrack(track)
          } catch {
            /* ignore */
          }
        }
        session?.unpublishProducerKind('participant_av', 'video')
      }
      notify()
    },
    enableMic: async () => {
      if (busy || micEnabled) return
      busy = true
      error = null
      notify()
      try {
        await mergeStream(cameraEnabled, true)
        micMuted = false
        error = null
      } catch (e) {
        micEnabled = false
        micMuted = false
        if (!cameraEnabled) stopLocalTracks()
        error = participantAvErrorFromDomException(e)
        notify()
      } finally {
        busy = false
        notify()
      }
    },
    disableMic: () => {
      if (!micEnabled) return
      micEnabled = false
      micMuted = false
      if (!cameraEnabled) {
        session?.unpublishProducerClass('participant_av')
        stopLocalTracks()
        options.onNeedsProducerTokenChange?.()
      } else if (localStream) {
        for (const track of localStream.getAudioTracks()) {
          try {
            track.stop()
            localStream.removeTrack(track)
          } catch {
            /* ignore */
          }
        }
        session?.unpublishProducerKind('participant_av', 'audio')
      }
      notify()
    },
    toggleMicMute: () => {
      if (!micEnabled || !session) return
      micMuted = !micMuted
      if (micMuted) {
        session.pauseProducerKind('participant_av', 'audio')
      } else {
        session.resumeProducerKind('participant_av', 'audio')
      }
      notify()
    },
    failPublish: (code) => {
      cameraEnabled = false
      micEnabled = false
      micMuted = false
      busy = false
      error = code
      stopLocalTracks()
      session?.unpublishProducerClass('participant_av')
      options.onNeedsProducerTokenChange?.()
      notify()
    },
    clearError: () => {
      if (!error) return
      error = null
      notify()
    },
  }
}

export type ParticipantAvPublishGate = {
  fanToken: string | null
  avDisabled: boolean
  onNeedsProducerTokenChange?: () => void
}

export function createBoundParticipantAvController(
  readGate: () => ParticipantAvPublishGate,
  hooks?: { onPartialUnpublish?: () => void },
): ParticipantAvController {
  return createParticipantAvController({
    canPublish: () => {
      const gate = readGate()
      return canParticipantAvPublish({
        fanToken: gate.fanToken,
        avDisabled: gate.avDisabled,
      })
    },
    onNeedsProducerTokenChange: () => readGate().onNeedsProducerTokenChange?.(),
    onPartialUnpublish: hooks?.onPartialUnpublish,
  })
}
