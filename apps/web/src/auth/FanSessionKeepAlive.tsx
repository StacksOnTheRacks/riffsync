import { useEffect, useReducer } from 'react'
import { refreshFanTokensIfStale } from './fanHostedUiPkce'
import { getFanAccessToken, getFanRefreshToken } from './fanTokens'

/**
 * Runs Cognito **`refresh_token` → `access_token`** renewal on a timer and when the tab becomes visible,
 * so hosts stay signed in across short-lived access tokens without another Hosted UI redirect.
 */
export function FanSessionKeepAlive() {
  const [, bump] = useReducer((x: number) => x + 1, 0)

  useEffect(() => {
    let cancelled = false
    const maybeBump = () => {
      if (!cancelled) bump()
    }

    const run = async () => {
      const accessBefore = getFanAccessToken()
      const refreshBefore = Boolean(getFanRefreshToken())
      await refreshFanTokensIfStale()
      const accessAfter = getFanAccessToken()
      const refreshAfter = Boolean(getFanRefreshToken())
      if (
        accessBefore !== accessAfter ||
        refreshBefore !== refreshAfter
      ) {
        maybeBump()
      }
    }

    void run()
    const id = window.setInterval(() => void run(), 60_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') void run()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return null
}
