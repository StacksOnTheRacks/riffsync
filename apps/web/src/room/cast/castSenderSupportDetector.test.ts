// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectCastSenderSupport } from './castSenderSupportDetector'

describe('detectCastSenderSupport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.head.innerHTML = ''
    delete (window as Window & { __onGCastApiAvailable?: (isAvailable: boolean) => void }).__onGCastApiAvailable
    delete (window as Window & { chrome?: { cast?: { isAvailable?: boolean } } }).chrome
  })

  it('returns true when chrome.cast.isAvailable is already true', async () => {
    ;(window as Window & { chrome?: { cast?: { isAvailable?: boolean } } }).chrome = {
      cast: { isAvailable: true },
    }

    await expect(detectCastSenderSupport()).resolves.toBe(true)
  })

  it('returns false when chrome.cast.isAvailable is already false', async () => {
    ;(window as Window & { chrome?: { cast?: { isAvailable?: boolean } } }).chrome = {
      cast: { isAvailable: false },
    }

    await expect(detectCastSenderSupport()).resolves.toBe(false)
  })

  it('resolves from __onGCastApiAvailable after loading the Cast framework script', async () => {
    vi.useFakeTimers()

    const promise = detectCastSenderSupport()
    await Promise.resolve()

    const script = document.querySelector('script[data-riffsync-cast-framework="true"]')
    expect(script).not.toBeNull()
    expect((script as HTMLScriptElement).src).toBe(
      'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1',
    )

    ;(window as Window & { __onGCastApiAvailable?: (isAvailable: boolean) => void }).__onGCastApiAvailable?.(
      true,
    )

    await expect(promise).resolves.toBe(true)
    vi.useRealTimers()
  })

  it('installs the Cast availability callback before loading the sender script', async () => {
    vi.useFakeTimers()

    const observedCallbackStates: boolean[] = []
    const appendChild = document.head.appendChild.bind(document.head)
    document.head.appendChild = (<T extends Node>(node: T): T => {
      observedCallbackStates.push(
        typeof (window as Window & { __onGCastApiAvailable?: (isAvailable: boolean) => void }).__onGCastApiAvailable ===
          'function',
      )
      return appendChild(node) as T
    }) as typeof document.head.appendChild

    try {
      const promise = detectCastSenderSupport()
      await Promise.resolve()

      expect(observedCallbackStates).toEqual([true])

      ;(window as Window & { __onGCastApiAvailable?: (isAvailable: boolean) => void }).__onGCastApiAvailable?.(
        true,
      )

      await expect(promise).resolves.toBe(true)
    } finally {
      document.head.appendChild = appendChild
      vi.useRealTimers()
    }
  })

  it('returns false when the Cast framework script fails to load', async () => {
    const promise = detectCastSenderSupport()
    await Promise.resolve()

    const script = document.querySelector('script[data-riffsync-cast-framework="true"]') as HTMLScriptElement
    script.onerror?.(new Event('error'))

    await expect(promise).resolves.toBe(false)
  })
})
