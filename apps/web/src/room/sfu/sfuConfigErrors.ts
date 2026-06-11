import type { SfuMediaErrorCode } from './mediasoupSharing'

/** Stable configuration-class SFU errors (`.ai/business_logic/error_state.md`). */
export type SfuConfigMediaErrorCode = 'local_sfu_unreachable' | 'sfu_relay_unreachable'

export const LOCAL_SFU_UNREACHABLE_MSG =
  'Local video relay is not running. Run npm run media:local, then confirm curl -sSf http://127.0.0.1:3000/healthz.'

export const SFU_RELAY_UNREACHABLE_MSG =
  'Video relay is unreachable. Check docs/sfu-deploy-checklist.md and /healthz on the signaling host.'

const LOCAL_WS_OPEN_FAILURE_THRESHOLD = 2
const PROD_WS_OPEN_FAILURE_THRESHOLD = 4

const LOCAL_DISPOSABLE_HOSTS = new Set(['127.0.0.1', 'localhost', 'host.docker.internal'])

export function isLocalDisposableSfuHost(wsBaseUrl: string): boolean {
  try {
    return LOCAL_DISPOSABLE_HOSTS.has(new URL(wsBaseUrl).hostname.toLowerCase())
  } catch {
    return false
  }
}

export function wsBaseToHealthzUrl(wsBaseUrl: string): string {
  const u = new URL(wsBaseUrl)
  u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:'
  u.pathname = '/healthz'
  u.search = ''
  u.hash = ''
  return u.toString()
}

export async function probeSfuHealthz(wsBaseUrl: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(wsBaseToHealthzUrl(wsBaseUrl), {
      method: 'GET',
      signal: signal ?? AbortSignal.timeout(4000),
    })
    return res.ok
  } catch {
    return false
  }
}

export function isConfigClassSfuMediaError(code: SfuMediaErrorCode): boolean {
  return (
    code === 'missing_ws_url' ||
    code === 'local_sfu_unreachable' ||
    code === 'sfu_relay_unreachable'
  )
}

export function messageForConfigSfuMediaError(code: SfuConfigMediaErrorCode): string {
  return code === 'local_sfu_unreachable' ? LOCAL_SFU_UNREACHABLE_MSG : SFU_RELAY_UNREACHABLE_MSG
}

export type ClassifySignalingOpenFailureResult = {
  code: SfuConfigMediaErrorCode | null
  message: string | null
}

/**
 * Classify consecutive signaling WebSocket open failures per `.ai/runtime/configuration.md`.
 * Returns a config error when the contract threshold is met; otherwise null (transient retry).
 */
export async function classifySignalingOpenFailure(
  wsBaseUrl: string,
  consecutiveFailures: number,
  signal?: AbortSignal,
): Promise<ClassifySignalingOpenFailureResult> {
  const isLocal = isLocalDisposableSfuHost(wsBaseUrl)

  if (isLocal) {
    if (consecutiveFailures === 1) {
      const healthy = await probeSfuHealthz(wsBaseUrl, signal)
      if (!healthy) {
        return {
          code: 'local_sfu_unreachable',
          message: LOCAL_SFU_UNREACHABLE_MSG,
        }
      }
    }
    if (consecutiveFailures >= LOCAL_WS_OPEN_FAILURE_THRESHOLD) {
      return {
        code: 'local_sfu_unreachable',
        message: LOCAL_SFU_UNREACHABLE_MSG,
      }
    }
    return { code: null, message: null }
  }

  if (consecutiveFailures >= PROD_WS_OPEN_FAILURE_THRESHOLD) {
    return {
      code: 'sfu_relay_unreachable',
      message: SFU_RELAY_UNREACHABLE_MSG,
    }
  }
  return { code: null, message: null }
}
