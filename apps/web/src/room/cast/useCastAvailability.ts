import { useEffect, useState } from 'react'
import type { CastAvailabilityState, CastSenderSupportDetector } from './castAvailabilityTypes'
import { detectCastSenderSupport } from './castSenderSupportDetector'

export function useCastAvailability(
  enabled: boolean,
  detect: CastSenderSupportDetector = detectCastSenderSupport,
): CastAvailabilityState {
  const [probeResult, setProbeResult] = useState<'available' | 'unavailable' | null>(null)
  const [probeEnabled, setProbeEnabled] = useState(enabled)

  if (probeEnabled !== enabled) {
    setProbeEnabled(enabled)
    setProbeResult(null)
  }

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    void detect()
      .then((available) => {
        if (!cancelled) setProbeResult(available ? 'available' : 'unavailable')
      })
      .catch(() => {
        if (!cancelled) setProbeResult('unavailable')
      })

    return () => {
      cancelled = true
    }
  }, [detect, enabled])

  if (!enabled || probeResult === null) return 'checking'
  return probeResult
}
