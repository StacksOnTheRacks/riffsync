import { useEffect, useState } from 'react'
import { FAN_AUTH_CHANGED_EVENT, getFanAccessToken } from './fanTokens'

export function useFanSession(): { fanToken: string | null } {
  const [fanToken, setFanToken] = useState<string | null>(() => getFanAccessToken())

  useEffect(() => {
    const sync = () => setFanToken(getFanAccessToken())
    window.addEventListener(FAN_AUTH_CHANGED_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(FAN_AUTH_CHANGED_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  return { fanToken }
}
