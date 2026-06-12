import {
  createTheaterAudioMix,
  type TheaterAudioConsumerEvent,
  type TheaterAudioMix,
} from '../audio/theaterAudioMix'
import type { SfuConsumerTrackEvent } from '../sfu/mediasoupSharing'
import type { GuestHostScreenFsm } from '../sfu/sfuRelayStatusCopy'
import type { SfuMediaSession } from './SfuMediaSession'

/** Normative drawer lifecycle for diagnostics (`execution_model.md`). */
export type TheaterPlaybackLifecycleState = 'connected' | 'degraded' | 'torn-down'

export type TheaterPlaybackSnapshot = {
  guestShareFsm: GuestHostScreenFsm
  guestPlayHint: boolean
  hostCapturePlayHint: boolean
}

type SnapshotListener = (snapshot: TheaterPlaybackSnapshot) => void
type LifecycleListener = (state: TheaterPlaybackLifecycleState) => void

const GUEST_INBOUND_POLL_MS = 2300

function mapSfuConsumerToMixEvent(event: SfuConsumerTrackEvent): TheaterAudioConsumerEvent {
  if (event.action === 'detach') {
    return { action: 'detach', producerId: event.producerId }
  }
  return {
    action: 'attach',
    producerId: event.producerId,
    producerClass: event.producerClass,
    kind: event.kind,
    track: event.track,
  }
}

/**
 * Theater-mode playback: Web Audio mix graph and host_screen video element lifecycle.
 * Subscribes to {@link SfuMediaSession} consumer events; does not own SFU signaling.
 */
export class TheaterPlayback {
  private enabled = false
  private lifecycleState: TheaterPlaybackLifecycleState = 'torn-down'
  private lastErrorCode: string | undefined
  private signalingSiblingDegraded = false
  private sfuSignalingWasConnected = false
  private isPublisher = false
  private avDisabled = false
  private mix: TheaterAudioMix | null = null
  private guestRemote: MediaStream | null = null
  private captureStream: MediaStream | null = null
  private guestVideoEl: HTMLVideoElement | null = null
  private hostCaptureVideoEl: HTMLVideoElement | null = null
  private youtubeMountEl: HTMLElement | null = null
  private youtubeVideoId: string | null = null
  private guestInboundHealth = false
  private guestShareFsm: GuestHostScreenFsm = 'idle'
  private guestPlayHint = false
  private hostCapturePlayHint = false
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private pollCancelled = false
  private audioContextWatchUnsub: (() => void) | null = null
  private sfuConsumerUnsub: (() => void) | null = null
  private guestVideoPlayToken = 0
  private hostCapturePlayToken = 0
  private readonly snapshotListeners = new Set<SnapshotListener>()
  private readonly lifecycleListeners = new Set<LifecycleListener>()

  getLifecycleState(): TheaterPlaybackLifecycleState {
    return this.lifecycleState
  }

  getLastErrorCode(): string | undefined {
    return this.lastErrorCode
  }

  onLifecycleChange(listener: LifecycleListener): () => void {
    this.lifecycleListeners.add(listener)
    return () => this.lifecycleListeners.delete(listener)
  }

  /** SFU signaling sibling state while theater mix is active (`execution_model.md`). */
  notifySignalingSiblingState(
    state: 'connected' | 'reconnecting' | 'degraded' | 'torn-down',
  ): void {
    if (state === 'connected') {
      this.sfuSignalingWasConnected = true
      this.signalingSiblingDegraded = false
    } else if (state === 'degraded') {
      this.signalingSiblingDegraded = true
    } else if (state === 'reconnecting' && this.sfuSignalingWasConnected) {
      this.signalingSiblingDegraded = true
    } else if (state === 'torn-down') {
      this.sfuSignalingWasConnected = false
      this.signalingSiblingDegraded = false
    }
    this.syncLifecycleState()
  }

  getSnapshot(): TheaterPlaybackSnapshot {
    return {
      guestShareFsm: this.guestShareFsm,
      guestPlayHint: this.guestPlayHint,
      hostCapturePlayHint: this.hostCapturePlayHint,
    }
  }

  onSnapshotChange(listener: SnapshotListener): () => void {
    this.snapshotListeners.add(listener)
    return () => this.snapshotListeners.delete(listener)
  }

  configure(opts: { enabled: boolean; isPublisher: boolean; avDisabled: boolean }): void {
    const wasEnabled = this.enabled
    this.enabled = opts.enabled
    this.isPublisher = opts.isPublisher
    this.avDisabled = opts.avDisabled

    if (!this.enabled) {
      this.stopGuestInboundPoll()
      this.teardownMix()
      this.setGuestShareFsm('idle')
      this.setGuestPlayHint(false)
      this.setHostCapturePlayHint(false)
      this.syncLifecycleState()
      return
    }

    if (!wasEnabled) {
      this.ensureMix()
    }
    this.mix?.setAvDisabled(this.avDisabled)
    this.syncHostVideoElement()
    this.syncGuestVideoBinding()
    this.syncHostCaptureVideoBinding()
    this.configureGuestInboundPoll()
    this.syncGuestShareFsm()
    this.syncLifecycleState()
  }

  attachSfuSession(session: SfuMediaSession): void {
    this.sfuConsumerUnsub?.()
    this.sfuConsumerUnsub = session.onConsumerTrack((event) => {
      this.routeSfuConsumerEvent(event)
    })
  }

  /** Route SFU consumer attach/detach into the theater audio mix graph. */
  routeSfuConsumerEvent(event: SfuConsumerTrackEvent): void {
    this.onSfuConsumerEvent(event)
  }

  getAudioContextState(): AudioContextState | undefined {
    return this.mix?.getAudioContextState()
  }

  detachSfuSession(): void {
    this.sfuConsumerUnsub?.()
    this.sfuConsumerUnsub = null
  }

  setGuestRemote(stream: MediaStream | null): void {
    this.guestRemote = stream
    this.syncGuestVideoBinding()
    this.syncGuestShareFsm()
  }

  setCaptureStream(stream: MediaStream | null): void {
    this.captureStream = stream
    this.syncHostCaptureVideoBinding()
    this.syncHostVideoElement()
  }

  setGuestVideoElement(element: HTMLVideoElement | null): void {
    this.guestVideoEl = element
    this.syncGuestVideoBinding()
    this.syncHostVideoElement()
  }

  setHostCaptureVideoElement(element: HTMLVideoElement | null): void {
    this.hostCaptureVideoEl = element
    this.syncHostCaptureVideoBinding()
    this.syncHostVideoElement()
  }

  /** DOM mount for optional in-room YouTube embed (theater mode only). */
  setYoutubeMountElement(element: HTMLElement | null): void {
    this.youtubeMountEl = element
    this.syncYoutubeMount()
  }

  setYoutubeVideoId(videoId: string | null): void {
    const next = videoId?.trim() ? videoId.trim() : null
    if (this.youtubeVideoId === next) return
    this.youtubeVideoId = next
    this.syncYoutubeMount()
  }

  async playGuestVideo(): Promise<void> {
    const v = this.guestVideoEl
    if (!v || !this.enabled) return
    try {
      await v.play()
      this.setGuestPlayHint(false)
      await this.mix?.resumeIfSuspended()
      this.syncLifecycleState()
    } catch {
      this.setGuestPlayHint(true)
    }
  }

  async playHostCapturePreview(): Promise<void> {
    const v = this.hostCaptureVideoEl
    if (!v || !this.enabled || !this.isPublisher) return
    try {
      await v.play()
      this.setHostCapturePlayHint(false)
      this.mix?.setHostVideoElement(v)
      await this.mix?.resumeIfSuspended()
      this.syncLifecycleState()
    } catch {
      this.setHostCapturePlayHint(true)
    }
  }

  dispose(): void {
    this.detachSfuSession()
    this.stopGuestInboundPoll()
    this.teardownMix()
    this.guestRemote = null
    this.captureStream = null
    this.guestVideoEl = null
    this.hostCaptureVideoEl = null
    this.youtubeMountEl = null
    this.youtubeVideoId = null
    this.guestInboundHealth = false
    this.guestShareFsm = 'idle'
    this.guestPlayHint = false
    this.hostCapturePlayHint = false
    this.signalingSiblingDegraded = false
    this.sfuSignalingWasConnected = false
    this.lastErrorCode = undefined
    this.setLifecycleState('torn-down', undefined)
    this.snapshotListeners.clear()
    this.lifecycleListeners.clear()
  }

  private onSfuConsumerEvent(event: SfuConsumerTrackEvent): void {
    if (!this.enabled || !this.mix) return
    this.mix.onConsumerEvent(mapSfuConsumerToMixEvent(event))
    void this.mix.resumeIfSuspended().then(() => this.syncLifecycleState())
    this.syncLifecycleState()
  }

  private ensureMix(): void {
    if (this.mix) return
    this.mix = createTheaterAudioMix()
    this.mix.setAvDisabled(this.avDisabled)
    this.audioContextWatchUnsub?.()
    this.audioContextWatchUnsub = this.mix.watchAudioContextState(() => {
      this.syncLifecycleState()
    })
  }

  private teardownMix(): void {
    this.audioContextWatchUnsub?.()
    this.audioContextWatchUnsub = null
    this.mix?.dispose()
    this.mix = null
  }

  private syncLifecycleState(): void {
    if (!this.enabled || !this.mix) {
      this.setLifecycleState('torn-down', undefined)
      return
    }

    const audioSuspended = this.getAudioContextState() === 'suspended'
    if (audioSuspended) {
      this.setLifecycleState('degraded', 'THEATER_AUDIO_SUSPENDED')
      return
    }

    if (this.signalingSiblingDegraded) {
      this.setLifecycleState('degraded', undefined)
      return
    }

    this.setLifecycleState('connected', undefined)
  }

  private setLifecycleState(
    next: TheaterPlaybackLifecycleState,
    errorCode: string | undefined,
  ): void {
    this.lastErrorCode = errorCode
    if (this.lifecycleState === next) return
    this.lifecycleState = next
    for (const listener of this.lifecycleListeners) listener(next)
  }

  private syncHostVideoElement(): void {
    if (!this.enabled || !this.mix) return
    const el = this.isPublisher ? this.hostCaptureVideoEl : this.guestVideoEl
    this.mix.setHostVideoElement(el)
  }

  private syncGuestVideoBinding(): void {
    const v = this.guestVideoEl
    if (!v || this.isPublisher || !this.enabled) {
      if (v && !this.isPublisher) {
        v.srcObject = null
      }
      return
    }
    if (!this.guestRemote) {
      v.srcObject = null
      return
    }
    const playbackStream = new MediaStream(this.guestRemote.getVideoTracks())
    v.srcObject = playbackStream
    const token = ++this.guestVideoPlayToken
    void (async () => {
      v.muted = true
      try {
        await v.play()
        if (token !== this.guestVideoPlayToken) return
        this.setGuestPlayHint(false)
        await this.mix?.resumeIfSuspended()
        return
      } catch {
        /* autoplay policy often blocks unmuted remote playback */
      }
      if (token !== this.guestVideoPlayToken) return
      this.setGuestPlayHint(true)
    })()
  }

  private syncHostCaptureVideoBinding(): void {
    const v = this.hostCaptureVideoEl
    if (!v || !this.isPublisher || !this.enabled) {
      if (v && this.isPublisher) {
        v.srcObject = null
      }
      return
    }
    if (!this.captureStream) {
      v.srcObject = null
      return
    }
    v.srcObject = this.captureStream
    v.muted = true
    const token = ++this.hostCapturePlayToken
    void (async () => {
      try {
        await v.play()
        if (token !== this.hostCapturePlayToken) return
        this.setHostCapturePlayHint(false)
        this.mix?.setHostVideoElement(v)
        await this.mix?.resumeIfSuspended()
      } catch {
        if (token !== this.hostCapturePlayToken) return
        this.setHostCapturePlayHint(true)
      }
    })()
  }

  private syncYoutubeMount(): void {
    const mount = this.youtubeMountEl
    if (!mount || !this.enabled) return
    mount.dataset.riffsyncYoutubeVideoId = this.youtubeVideoId ?? ''
  }

  private configureGuestInboundPoll(): void {
    if (this.isPublisher) {
      this.stopGuestInboundPoll()
      this.guestInboundHealth = false
      this.setGuestShareFsm('idle')
      return
    }
    if (this.pollInterval !== null) return
    this.pollCancelled = false
    const tick = (): void => {
      const s = this.guestRemote
      const live =
        s?.getVideoTracks().some((t) => t.kind === 'video' && t.readyState === 'live') ?? false
      this.guestInboundHealth = live
      if (!this.pollCancelled) {
        this.syncGuestShareFsm()
      }
    }
    queueMicrotask(tick)
    this.pollInterval = setInterval(tick, GUEST_INBOUND_POLL_MS)
  }

  private stopGuestInboundPoll(): void {
    this.pollCancelled = true
    if (this.pollInterval !== null) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
  }

  private syncGuestShareFsm(): void {
    if (this.isPublisher) {
      this.setGuestShareFsm('idle')
      return
    }
    if (!this.guestRemote) {
      this.setGuestShareFsm('idle')
      return
    }
    const liveVideos =
      this.guestRemote.getTracks().some((t) => t.kind === 'video' && t.readyState === 'live') ??
      false
    this.setGuestShareFsm(
      liveVideos || this.guestInboundHealth ? 'running' : 'verifying_media',
    )
  }

  private setGuestShareFsm(next: GuestHostScreenFsm): void {
    if (this.guestShareFsm === next) return
    this.guestShareFsm = next
    this.emitSnapshot()
  }

  private setGuestPlayHint(next: boolean): void {
    if (this.guestPlayHint === next) return
    this.guestPlayHint = next
    this.emitSnapshot()
  }

  private setHostCapturePlayHint(next: boolean): void {
    if (this.hostCapturePlayHint === next) return
    this.hostCapturePlayHint = next
    this.emitSnapshot()
  }

  private emitSnapshot(): void {
    const snapshot = this.getSnapshot()
    for (const listener of this.snapshotListeners) listener(snapshot)
  }
}
