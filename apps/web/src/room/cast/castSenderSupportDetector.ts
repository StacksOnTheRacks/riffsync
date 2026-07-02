import type { CastSenderSupportDetector } from './castAvailabilityTypes'
import { prepareDefaultCastSenderClient } from './castSenderClient'

const CAST_FRAMEWORK_SRC = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1'
const CAST_FRAMEWORK_SCRIPT_SELECTOR = 'script[data-riffsync-cast-framework="true"]'
const CAST_DETECTION_TIMEOUT_MS = 5000

type CastChromeWindow = Window & {
  chrome?: {
    cast?: {
      isAvailable?: boolean
    }
  }
  __onGCastApiAvailable?: (isAvailable: boolean) => void
}

function readCastIsAvailable(): boolean | undefined {
  if (typeof window === 'undefined') return undefined
  const isAvailable = (window as CastChromeWindow).chrome?.cast?.isAvailable
  return typeof isAvailable === 'boolean' ? isAvailable : undefined
}

function waitForCastFrameworkCallback(): Promise<boolean> {
  return new Promise((resolve) => {
    const win = window as CastChromeWindow
    const existing = readCastIsAvailable()
    if (existing !== undefined) {
      resolve(existing)
      return
    }

    const timeoutId = window.setTimeout(() => resolve(false), CAST_DETECTION_TIMEOUT_MS)
    const previousCallback = win.__onGCastApiAvailable

    win.__onGCastApiAvailable = (isAvailable) => {
      window.clearTimeout(timeoutId)
      if (previousCallback && previousCallback !== win.__onGCastApiAvailable) {
        previousCallback(isAvailable)
      }
      resolve(isAvailable)
    }

    ensureCastFrameworkScript()
  })
}

async function confirmCastSenderStartReady(isAvailable: boolean): Promise<boolean> {
  if (!isAvailable) return false
  return prepareDefaultCastSenderClient()
}

function ensureCastFrameworkScript(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(CAST_FRAMEWORK_SCRIPT_SELECTOR)) return

  const script = document.createElement('script')
  script.src = CAST_FRAMEWORK_SRC
  script.async = true
  script.dataset.riffsyncCastFramework = 'true'
  script.onerror = () => {
    const win = window as CastChromeWindow
    win.__onGCastApiAvailable?.(false)
  }
  document.head.appendChild(script)
}

/** Post-render Google Cast sender availability probe for #301. */
export const detectCastSenderSupport: CastSenderSupportDetector = async () => {
  if (typeof window === 'undefined') return false

  const immediate = readCastIsAvailable()
  if (immediate !== undefined) return confirmCastSenderStartReady(immediate)

  return confirmCastSenderStartReady(await waitForCastFrameworkCallback())
}
