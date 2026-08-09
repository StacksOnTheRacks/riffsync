import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { stopMediaStreamTracks } from './roomMediaLifecycle'
import {
  theaterShareVideoConstraints,
  type TheaterShareQualityPreset,
} from './theaterShareQuality'
import { webrtcLog } from './webrtcDebug'

export function useHostScreenCapture(options: {
  roomId: string
  sendJson: (payload: Record<string, unknown>) => void
  unpublishHostScreen: () => void
  captureStream: MediaStream | null
  setCaptureStream: Dispatch<SetStateAction<MediaStream | null>>
  captureStreamRef: RefObject<MediaStream | null>
  qualityPreset?: TheaterShareQualityPreset
}): {
  captureErr: string | null
  startCapture: () => Promise<void>
  stopCapture: () => void
} {
  const { roomId, sendJson, unpublishHostScreen, setCaptureStream, qualityPreset = 'balanced' } = options
  const [captureErr, setCaptureErr] = useState<string | null>(null)
  const shareGenerationRef = useRef(0)
  const sendJsonRef = useRef(sendJson)
  const qualityPresetRef = useRef(qualityPreset)

  useEffect(() => {
    qualityPresetRef.current = qualityPreset
  }, [qualityPreset])

  useEffect(() => {
    sendJsonRef.current = sendJson
  }, [sendJson])

  useEffect(() => {
    shareGenerationRef.current = 0
  }, [roomId])

  const stopCapture = useCallback(() => {
    const gen = shareGenerationRef.current
    sendJsonRef.current({
      action: 'share_state',
      state: 'stopped',
      ...(gen > 0 ? { shareGeneration: gen } : {}),
    })
    shareGenerationRef.current = 0
    unpublishHostScreen()
    setCaptureStream((prev) => {
      stopMediaStreamTracks(prev)
      return null
    })
  }, [setCaptureStream, unpublishHostScreen])

  const startCapture = useCallback(async () => {
    setCaptureErr(null)

    const applyStream = (stream: MediaStream) => {
      shareGenerationRef.current += 1
      sendJsonRef.current({
        action: 'share_state',
        state: 'started',
        shareGeneration: shareGenerationRef.current,
      })
      stream.getTracks().forEach((tr) => {
        tr.addEventListener('ended', () => {
          stopCapture()
        })
      })
      setCaptureStream(stream)
      webrtcLog('capture stream applied, tracks:', stream.getTracks().length)
    }

    try {
      type CaptureControllerLike = {
        setFocusBehavior: (behavior: 'focus-captured-surface' | 'no-focus-change') => void
      }
      type CaptureControllerWindow = Window & {
        CaptureController?: new () => CaptureControllerLike
      }

      const CaptureControllerCtor = (window as CaptureControllerWindow).CaptureController
      const captureController =
        typeof CaptureControllerCtor === 'function' ? new CaptureControllerCtor() : undefined

      const quality = theaterShareVideoConstraints(qualityPresetRef.current)
      const captureOptions: Parameters<MediaDevices['getDisplayMedia']>[0] & {
        selfBrowserSurface?: 'include' | 'exclude'
        surfaceSwitching?: 'include' | 'exclude'
        controller?: CaptureControllerLike
      } = {
        video: {
          displaySurface: 'browser',
          preferCurrentTab: true,
          ...quality,
        } as MediaTrackConstraints & {
          preferCurrentTab?: boolean
          displaySurface?: string
        },
        audio: true,
        selfBrowserSurface: 'include',
        surfaceSwitching: 'include',
      }
      if (captureController) captureOptions.controller = captureController

      const stream = await navigator.mediaDevices.getDisplayMedia(captureOptions)
      try {
        captureController?.setFocusBehavior('no-focus-change')
      } catch (e) {
        webrtcLog('CaptureController focus behavior unavailable:', e)
      }
      applyStream(stream)
      return
    } catch (eStrict) {
      webrtcLog('getDisplayMedia (tab-tuned constraints) failed, trying permissive:', eStrict)
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      applyStream(stream)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not start tab capture'
      setCaptureErr(msg)
      console.warn('[riffsync] getDisplayMedia failed — guests will not see video until share succeeds:', e)
      webrtcLog('getDisplayMedia failed', e)
    }
  }, [setCaptureStream, stopCapture])

  return {
    captureErr,
    startCapture,
    stopCapture,
  }
}
