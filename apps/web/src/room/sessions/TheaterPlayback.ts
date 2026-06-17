import {
  createTheaterAudioMix,
  type TheaterAudioConsumerEvent,
  type TheaterAudioMix,
} from '../audio/theaterAudioMix'
import type { SfuConsumerTrackEvent } from '../sfu/mediasoupSharing'
import type { GuestHostScreenFsm } from '../sfu/sfuRelayStatusCopy'
import {
  playbackAudioBlockedError,
  theaterAudioSuspendedError,
  type RealtimeDrawerErrorCode,
} from '../realtimeDrawerErrors'
import { emitMixErrorDrawerLog } from '../sfu/produceConsumeDrawerLog'
import { emitClientDrawerLog } from '../clientDrawerLog'
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

function mapSfuConsumerToMixEvent(event: SfuConsumerTrackEvent): TheaterAudioConsumerEvent | null {
  if (event.action === 'pause' || event.action === 'resume') return null
  if (event.action === 'detach') {
    return { action: 'detach', producerId: event.producerId }
  }
  if (event.action !== 'attach') return null
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
  private lastErrorCode: RealtimeDrawerErrorCode | undefined
  private signalingSiblingDegraded = false
  private sfuSignalingWasConnected = false
  private isPublisher = false
  private avDisabled = false
  // When false, host_screen audio plays through the <video> element and no Web Audio mix is
  // built. The mix exists only to combine participant (camera/mic) audio, which is experimental.
  private mixEnabled = true
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
  private audioUnlockGestureCleanup: (() => void) | null = null
  private sfuConsumerUnsub: (() => void) | null = null
  private guestVideoPlayToken = 0
  private hostCapturePlayToken = 0
  private readonly snapshotListeners = new Set<SnapshotListener>()
  private readonly lifecycleListeners = new Set<LifecycleListener>()

  getLifecycleState(): TheaterPlaybackLifecycleState {
    return this.lifecycleState
  }

  getLastErrorCode(): RealtimeDrawerErrorCode | undefined {
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

  /** Toggle the experimental Web Audio participant mix. Off keeps tab-share audio on the element. */
  setMixEnabled(enabled: boolean): void {
    if (this.mixEnabled === enabled) return
    this.mixEnabled = enabled
    if (!enabled) {
      this.teardownMix()
    } else if (this.enabled) {
      this.ensureMix()
      this.mix?.setAvDisabled(this.avDisabled)
      this.syncHostVideoElement()
    }
    this.syncLifecycleState()
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
      // Runs from a user gesture: unmute and play so host_screen audio comes through the element.
      v.muted = false
      await v.play()
      this.setGuestPlayHint(false)
      // Resume the participant mix too, if one exists (experimental camera/mic audio).
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
    const mapped = mapSfuConsumerToMixEvent(event)
    if (!mapped) return
    this.mix.onConsumerEvent(mapped)
    void this.mix.resumeIfSuspended().then(() => this.syncLifecycleState())
    this.syncLifecycleState()
  }

  private ensureMix(): void {
    if (!this.mixEnabled) return
    if (this.mix) return
    this.mix = createTheaterAudioMix()
    this.mix.setAvDisabled(this.avDisabled)
    this.audioContextWatchUnsub?.()
    this.audioContextWatchUnsub = this.mix.watchAudioContextState(() => {
      this.syncLifecycleState()
    })
    this.installAudioUnlockGesture()
  }

  /**
   * Browsers only let us resume a suspended AudioContext from a user gesture. The "interact with
   * the page to resume sound" status is only truthful if any interaction actually unlocks audio,
   * so listen for the first pointer/key/touch anywhere and resume the mix, then self-remove.
   */
  private installAudioUnlockGesture(): void {
    if (this.audioUnlockGestureCleanup) return
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return
    const events: Array<keyof DocumentEventMap> = ['pointerdown', 'keydown', 'touchstart']
    const onGesture = (): void => {
      void this.mix?.resumeIfSuspended().then(() => {
        if (this.getAudioContextState() !== 'suspended') {
          this.setGuestPlayHint(false)
          this.removeAudioUnlockGesture()
        }
        this.syncLifecycleState()
      })
    }
    for (const name of events) {
      document.addEventListener(name, onGesture, { passive: true })
    }
    this.audioUnlockGestureCleanup = () => {
      for (const name of events) document.removeEventListener(name, onGesture)
    }
  }

  private removeAudioUnlockGesture(): void {
    this.audioUnlockGestureCleanup?.()
    this.audioUnlockGestureCleanup = null
  }

  private teardownMix(): void {
    this.audioContextWatchUnsub?.()
    this.audioContextWatchUnsub = null
    this.removeAudioUnlockGesture()
    this.mix?.dispose()
    this.mix = null
  }

  private syncLifecycleState(): void {
    if (!this.enabled) {
      this.setLifecycleState('torn-down', undefined)
      return
    }

    // Default (tab-share) path: audio plays through the <video> element, no Web Audio mix. The
    // only audio-health signal is whether the element needed a user gesture to start.
    if (!this.mixEnabled) {
      if (this.guestPlayHint || this.hostCapturePlayHint) {
        this.setLifecycleState('degraded', playbackAudioBlockedError().code)
        return
      }
      if (this.signalingSiblingDegraded) {
        this.setLifecycleState('degraded', undefined)
        return
      }
      this.setLifecycleState('connected', undefined)
      return
    }

    if (!this.mix) {
      this.setLifecycleState('torn-down', undefined)
      return
    }

    const audioSuspended = this.getAudioContextState() === 'suspended'
    if (audioSuspended) {
      this.setLifecycleState('degraded', theaterAudioSuspendedError().code)
      return
    }

    if (this.guestPlayHint || this.hostCapturePlayHint) {
      this.setLifecycleState('degraded', playbackAudioBlockedError().code)
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
    errorCode: RealtimeDrawerErrorCode | undefined,
  ): void {
    const prevCode = this.lastErrorCode
    this.lastErrorCode = errorCode
    if (
      next === 'degraded' &&
      errorCode &&
      errorCode !== prevCode &&
      (errorCode === 'THEATER_AUDIO_SUSPENDED' || errorCode === 'PLAYBACK_AUDIO_BLOCKED')
    ) {
      emitMixErrorDrawerLog(errorCode)
    }
    if (this.lifecycleState === next) return
    this.lifecycleState = next
    for (const listener of this.lifecycleListeners) listener(next)
  }

  private syncHostVideoElement(): void {
    if (!this.enabled || !this.mix) return
    // Only the publisher's capture element feeds the mix. A guest must never have its element
    // tapped via createMediaElementSource: that reroutes the tab audio into the Web Audio graph
    // (suspended / MediaStreamSource-buggy in Chromium) and silences the speakers. Guests play
    // host_screen audio directly through their <video> element instead.
    const el = this.isPublisher ? this.hostCaptureVideoEl : null
    this.mix.setHostVideoElement(el)
  }

  private syncGuestVideoBinding(): void {
    const v = this.guestVideoEl
    if (!v || this.isPublisher || !this.enabled) {
      if (v && !this.isPublisher) {
        v.srcObject = null
      }
      // We hold a host_screen stream but cannot bind it yet. Surface why so a blank guest
      // theater is diagnosable from the console (no <video> bound vs theater not enabled).
      if (this.guestRemote && !this.isPublisher) {
        emitClientDrawerLog({
          drawer: 'produce_consume',
          event: 'guest_screen_bind_deferred',
          outcome: 'retry',
          code: !v ? 'no_element' : !this.enabled ? 'theater_disabled' : 'publisher',
        })
      }
      return
    }
    if (!this.guestRemote) {
      v.srcObject = null
      return
    }
    // Bind the full host_screen stream (audio + video). The element plays the audio natively,
    // which is the reliable path for remote WebRTC audio; the Web Audio mix is reserved for
    // experimental participant (camera/mic) audio only.
    const tracks = this.guestRemote.getTracks()
    const playbackStream = new MediaStream(tracks)
    v.srcObject = playbackStream
    const audioTrackCount = this.guestRemote.getAudioTracks().length
    const videoTrackCount = this.guestRemote.getVideoTracks().length
    emitClientDrawerLog({
      drawer: 'produce_consume',
      event: 'guest_screen_bound',
      outcome: 'recovered',
      code: `a${audioTrackCount}:v${videoTrackCount}`,
    })
    const token = ++this.guestVideoPlayToken
    void (async () => {
      // Try to play with sound. Many browsers allow autoplay of a stream assigned via srcObject;
      // when they don't, play() rejects and we surface the "Enable sound" gesture button, which
      // plays the element from a real user gesture.
      v.muted = false
      try {
        await v.play()
        if (token !== this.guestVideoPlayToken) return
        this.setGuestPlayHint(false)
        return
      } catch {
        /* autoplay policy can block unmuted remote playback until a user gesture */
      }
      if (token !== this.guestVideoPlayToken) return
      emitClientDrawerLog({
        drawer: 'produce_consume',
        event: 'guest_screen_play_blocked',
        outcome: 'failed',
      })
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
    this.syncLifecycleState()
  }

  private setHostCapturePlayHint(next: boolean): void {
    if (this.hostCapturePlayHint === next) return
    this.hostCapturePlayHint = next
    this.emitSnapshot()
    this.syncLifecycleState()
  }

  private emitSnapshot(): void {
    const snapshot = this.getSnapshot()
    for (const listener of this.snapshotListeners) listener(snapshot)
  }
}
