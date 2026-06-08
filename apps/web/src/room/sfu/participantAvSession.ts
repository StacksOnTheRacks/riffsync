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
  wsOpen: boolean
  fanToken: string | null
  avDisabled: boolean
}): boolean {
  return opts.wsOpen && Boolean(opts.fanToken) && !opts.avDisabled
}

export type ParticipantAvPublishState = {
  cameraEnabled: boolean
  micEnabled: boolean
  micMuted: boolean
  canPublish: boolean
  needsProducerToken: boolean
  error: string | null
  busy: boolean
}

export type ParticipantAvController = {
  getState: () => ParticipantAvPublishState
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
}

export function createParticipantAvController(options: {
  canPublish: () => boolean
  onNeedsProducerTokenChange?: () => void
}): ParticipantAvController {
  let cameraEnabled = false
  let micEnabled = false
  let micMuted = false
  let error: string | null = null
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

  const syncPublish = async () => {
    if (!session) return
    if (!cameraEnabled && !micEnabled) {
      session.unpublishProducerClass('participant_av')
      stopLocalTracks()
      return
    }
    if (!localStream) return
    try {
      await session.ready
      await session.publishStream(localStream, 'participant_av')
      if (micMuted) {
        session.pauseProducerKind('participant_av', 'audio')
      } else {
        session.resumeProducerKind('participant_av', 'audio')
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not publish camera or microphone.'
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
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    refreshPublishGate: () => {
      notify()
    },
    attachSession: (next) => {
      session = next
      if (!session) {
        stopLocalTracks()
        return
      }
      void syncPublish()
    },
    resetOnReconnect: () => {
      cameraEnabled = false
      micEnabled = false
      micMuted = false
      error = null
      busy = false
      stopLocalTracks()
      session?.unpublishProducerClass('participant_av')
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
      } catch (e) {
        error = e instanceof Error ? e.message : 'Camera permission denied.'
        notify()
      } finally {
        busy = false
        notify()
      }
    },
    disableCamera: () => {
      if (!cameraEnabled) return
      cameraEnabled = false
      if (!micEnabled) {
        session?.unpublishProducerClass('participant_av')
        stopLocalTracks()
        options.onNeedsProducerTokenChange?.()
      } else if (localStream) {
        for (const track of localStream.getVideoTracks()) {
          try {
            track.stop()
            localStream.removeTrack(track)
          } catch {
            /* ignore */
          }
        }
        void syncPublish()
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
      } catch (e) {
        error = e instanceof Error ? e.message : 'Microphone permission denied.'
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
        void syncPublish()
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
  }
}

export type ParticipantAvPublishGate = {
  wsOpen: boolean
  fanToken: string | null
  avDisabled: boolean
  onNeedsProducerTokenChange?: () => void
}

export function createBoundParticipantAvController(
  readGate: () => ParticipantAvPublishGate,
): ParticipantAvController {
  return createParticipantAvController({
    canPublish: () => {
      const gate = readGate()
      return canParticipantAvPublish({
        wsOpen: gate.wsOpen,
        fanToken: gate.fanToken,
        avDisabled: gate.avDisabled,
      })
    },
    onNeedsProducerTokenChange: () => readGate().onNeedsProducerTokenChange?.(),
  })
}
