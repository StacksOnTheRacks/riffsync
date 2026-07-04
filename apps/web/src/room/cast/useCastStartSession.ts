import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { RoomMode } from '../../api/roomsApi'
import type { ChatLine } from '../roomPageTypes'
import {
  buildCastPresentationSnapshot,
  type BuildCastPresentationSnapshotInput,
} from './buildCastPresentationSnapshot'
import type { CastStartLifecycle } from './castChannelProtocol'
import { createCastStartController, type CastStartController } from './castStartController'
import { createDefaultCastSenderClient, type CastSenderClientFactory } from './castSenderClient'

function isFocusRestoreTargetVisible(element: HTMLElement): boolean {
  if (!element.isConnected) return false
  const style = window.getComputedStyle(element)
  return style.visibility !== 'hidden' && style.display !== 'none'
}

function isCastStageFocusTarget(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false
  return (
    element.matches('[data-testid="cast-active-stage-panel"], [data-testid="cast-active-stage-panel"] *') ||
    element.classList.contains('riffsync-room-page__cast-stop-button')
  )
}

export type UseCastStartSessionInput = {
  enabled: boolean
  expandedViewActive: boolean
  roomMode: RoomMode
  roomId: string
  sessionId: string
  apiBaseUrl?: string
  youtubeVideoId: string | null | undefined
  isPublisher: boolean
  hasHostCaptureStream: boolean
  hasGuestRelayStream: boolean
  chat: ChatLine[]
  chatMemberLabels: Map<string, string>
  createSenderClient?: CastSenderClientFactory
  stageFocusRestoreRef?: RefObject<HTMLElement | null>
}

export type UseCastStartSessionResult = {
  castStartLifecycle: CastStartLifecycle
  startCast: () => Promise<void>
  stopCast: () => void
  castToTvButtonRef: RefObject<HTMLButtonElement | null>
  stopCastButtonRef: RefObject<HTMLButtonElement | null>
}

export function useCastStartSession({
  enabled,
  expandedViewActive,
  roomMode,
  roomId,
  sessionId,
  apiBaseUrl,
  youtubeVideoId,
  isPublisher,
  hasHostCaptureStream,
  hasGuestRelayStream,
  chat,
  chatMemberLabels,
  createSenderClient = createDefaultCastSenderClient,
  stageFocusRestoreRef,
}: UseCastStartSessionInput): UseCastStartSessionResult {
  const castToTvButtonRef = useRef<HTMLButtonElement | null>(null)
  const stopCastButtonRef = useRef<HTMLButtonElement | null>(null)
  const shouldTransferFocusToStopRef = useRef(false)
  const shouldRestoreFocusFromCastStageRef = useRef(false)
  const previousLifecycleRef = useRef<CastStartLifecycle>('idle')
  const [controller] = useState<CastStartController>(() =>
    createCastStartController({ client: createSenderClient() }),
  )
  const [castStartLifecycle, setCastStartLifecycle] = useState<CastStartLifecycle>('idle')

  const snapshotInput = useMemo<BuildCastPresentationSnapshotInput>(
    () => ({
      roomMode,
      livePlayback:
        (hasHostCaptureStream || hasGuestRelayStream) && roomId && sessionId
          ? { roomId, sessionId, apiBaseUrl }
          : null,
      youtubeVideoId,
      isPublisher,
      hasHostCaptureStream,
      hasGuestRelayStream,
      chat,
      chatMemberLabels,
    }),
    [
      roomMode,
      roomId,
      sessionId,
      apiBaseUrl,
      youtubeVideoId,
      isPublisher,
      hasHostCaptureStream,
      hasGuestRelayStream,
      chat,
      chatMemberLabels,
    ],
  )

  const buildSnapshot = useCallback(
    () => buildCastPresentationSnapshot(snapshotInput),
    [snapshotInput],
  )

  useEffect(
    () =>
      controller.subscribe((state) => {
        const currentLifecycle = previousLifecycleRef.current
        if (
          (currentLifecycle === 'casting' || currentLifecycle === 'stopping' || currentLifecycle === 'stop_failed') &&
          (state.lifecycle === 'session_ended' || state.lifecycle === 'playback_blocked')
        ) {
          shouldRestoreFocusFromCastStageRef.current = isCastStageFocusTarget(document.activeElement)
        }
        setCastStartLifecycle(state.lifecycle)
      }),
    [controller],
  )

  useEffect(() => {
    if (!enabled) return
    return () => {
      void controller.stopCast()
    }
  }, [controller, enabled])

  useEffect(() => {
    if (castStartLifecycle !== 'casting') return
    void controller.sendChatOverlayUpdate(buildSnapshot())
  }, [buildSnapshot, castStartLifecycle, chat, controller])

  const startCast = useCallback(async () => {
    if (!enabled || expandedViewActive) return

    if (controller.getState().lifecycle === 'start_failed') {
      controller.resetStartFailure()
    }

    shouldTransferFocusToStopRef.current =
      castToTvButtonRef.current !== null &&
      castToTvButtonRef.current === document.activeElement

    await controller.startCast(buildSnapshot())
  }, [buildSnapshot, controller, enabled, expandedViewActive])

  useEffect(() => {
    if (castStartLifecycle !== 'start_failed') return
    castToTvButtonRef.current?.focus()
  }, [castStartLifecycle])

  useEffect(() => {
    if (castStartLifecycle !== 'launching' && castStartLifecycle !== 'session_pending_render') return

    const handleFocusIn = (event: FocusEvent) => {
      if (!shouldTransferFocusToStopRef.current) return
      const target = event.target
      if (target instanceof HTMLElement && target !== castToTvButtonRef.current) {
        shouldTransferFocusToStopRef.current = false
      }
    }

    document.addEventListener('focusin', handleFocusIn, true)
    return () => document.removeEventListener('focusin', handleFocusIn, true)
  }, [castStartLifecycle])

  useEffect(() => {
    if (castStartLifecycle !== 'casting') return
    if (shouldTransferFocusToStopRef.current) {
      stopCastButtonRef.current?.focus()
    }
    shouldTransferFocusToStopRef.current = false
  }, [castStartLifecycle])

  useEffect(() => {
    if (castStartLifecycle !== 'stopping') return

    const handleFocusIn = (event: FocusEvent) => {
      if (!shouldRestoreFocusFromCastStageRef.current) return
      const target = event.target
      if (target instanceof HTMLElement && !isCastStageFocusTarget(target)) {
        shouldRestoreFocusFromCastStageRef.current = false
      }
    }

    document.addEventListener('focusin', handleFocusIn, true)
    return () => document.removeEventListener('focusin', handleFocusIn, true)
  }, [castStartLifecycle])

  useEffect(() => {
    const previousLifecycle = previousLifecycleRef.current
    previousLifecycleRef.current = castStartLifecycle

    if (castStartLifecycle === 'stop_failed' && previousLifecycle === 'stopping') {
      if (shouldRestoreFocusFromCastStageRef.current) {
        stopCastButtonRef.current?.focus()
      }
      return
    }

    if (
      castStartLifecycle !== 'idle' &&
      castStartLifecycle !== 'session_ended' &&
      castStartLifecycle !== 'playback_blocked'
    ) {
      return
    }
    if (
      previousLifecycle !== 'stopping' &&
      previousLifecycle !== 'casting' &&
      previousLifecycle !== 'stop_failed'
    ) {
      return
    }
    if (!shouldRestoreFocusFromCastStageRef.current) return

    shouldRestoreFocusFromCastStageRef.current = false

    const stageTarget = stageFocusRestoreRef?.current
    if (stageTarget && isFocusRestoreTargetVisible(stageTarget)) {
      stageTarget.focus()
      return
    }

    const castToTvTarget = castToTvButtonRef.current
    if (castToTvTarget && isFocusRestoreTargetVisible(castToTvTarget)) {
      castToTvTarget.focus()
    }
  }, [castStartLifecycle, stageFocusRestoreRef])

  const stopCast = useCallback(() => {
    const active = document.activeElement
    const stopButton = stopCastButtonRef.current
    shouldRestoreFocusFromCastStageRef.current =
      (stopButton !== null && (active === stopButton || stopButton.contains(active))) ||
      isCastStageFocusTarget(active)
    void controller.stopCast()
  }, [controller])

  return {
    castStartLifecycle,
    startCast,
    stopCast,
    castToTvButtonRef,
    stopCastButtonRef,
  }
}
