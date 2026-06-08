import { useEffect, useState } from 'react'

const DESKTOP_STAGE_MQ = '(min-width: 992px)'

export function useViewportWide(): boolean {
  const [wide, setWide] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return true
    return window.matchMedia(DESKTOP_STAGE_MQ).matches
  })

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_STAGE_MQ)
    const onChange = () => setWide(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return wide
}
