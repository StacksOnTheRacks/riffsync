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

export type UseCastStartSessionInput = {
  enabled: boolean
  expandedViewActive: boolean
  roomMode: RoomMode
  youtubeVideoId: string | null | undefined
  isPublisher: boolean
  hasHostCaptureStream: boolean
  hasGuestRelayStream: boolean
  chat: ChatLine[]
  chatMemberLabels: Map<string, string>
  createSenderClient?: CastSenderClientFactory
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
  youtubeVideoId,
  isPublisher,
  hasHostCaptureStream,
  hasGuestRelayStream,
  chat,
  chatMemberLabels,
  createSenderClient = createDefaultCastSenderClient,
}: UseCastStartSessionInput): UseCastStartSessionResult {
  const castToTvButtonRef = useRef<HTMLButtonElement | null>(null)
  const stopCastButtonRef = useRef<HTMLButtonElement | null>(null)
  const [controller] = useState<CastStartController>(() =>
    createCastStartController({ client: createSenderClient() }),
  )
  const [castStartLifecycle, setCastStartLifecycle] = useState<CastStartLifecycle>('idle')

  const snapshotInput = useMemo<BuildCastPresentationSnapshotInput>(
    () => ({
      roomMode,
      youtubeVideoId,
      isPublisher,
      hasHostCaptureStream,
      hasGuestRelayStream,
      chat,
      chatMemberLabels,
    }),
    [
      roomMode,
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

  useEffect(() => controller.subscribe((state) => setCastStartLifecycle(state.lifecycle)), [controller])

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

    await controller.startCast(buildSnapshot())
  }, [buildSnapshot, controller, enabled, expandedViewActive])

  useEffect(() => {
    if (castStartLifecycle !== 'start_failed') return
    castToTvButtonRef.current?.focus()
  }, [castStartLifecycle])

  useEffect(() => {
    if (castStartLifecycle !== 'casting') return
    if (castToTvButtonRef.current === document.activeElement) {
      stopCastButtonRef.current?.focus()
    }
  }, [castStartLifecycle])

  const stopCast = useCallback(() => {
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
