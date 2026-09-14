// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHostScreenCapture } from './useHostScreenCapture'

function CaptureHarness({
  qualityPreset,
  onReady,
}: {
  qualityPreset: 'balanced' | 'sharp'
  onReady: (api: ReturnType<typeof useHostScreenCapture>) => void
}) {
  const api = useHostScreenCapture({
    roomId: 'room-1',
    sendJson: vi.fn(),
    unpublishHostScreen: vi.fn(),
    captureStream: null,
    setCaptureStream: vi.fn(),
    captureStreamRef: { current: null },
    qualityPreset,
  })
  onReady(api)
  return null
}

describe('useHostScreenCapture', () => {
  let container: HTMLDivElement
  let root: Root
  let api: ReturnType<typeof useHostScreenCapture> | null = null

  beforeEach(() => {
    api = null
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('applies sharp constraints on the next startCapture after quality changes', async () => {
    const getDisplayMedia = vi.fn().mockResolvedValue({
      getTracks: () => [],
    })
    vi.stubGlobal('navigator', {
      mediaDevices: { getDisplayMedia },
    })

    act(() => {
      root.render(
        <CaptureHarness
          qualityPreset="balanced"
          onReady={(value) => {
            api = value
          }}
        />,
      )
    })

    await act(async () => {
      await api!.startCapture()
    })

    expect(getDisplayMedia.mock.calls[0]?.[0]?.video).toMatchObject({
      frameRate: { ideal: 24, max: 30 },
    })

    getDisplayMedia.mockClear()

    act(() => {
      root.render(
        <CaptureHarness
          qualityPreset="sharp"
          onReady={(value) => {
            api = value
          }}
        />,
      )
    })

    await act(async () => {
      await api!.startCapture()
    })

    expect(getDisplayMedia.mock.calls[0]?.[0]?.video).toMatchObject({
      frameRate: { ideal: 30, max: 30 },
      width: { ideal: 1920, max: 1920 },
      height: { ideal: 1080, max: 1080 },
    })
  })
})
