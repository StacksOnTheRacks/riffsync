import { useEffect, useState } from 'react'
import { isRunningAsInstalledApp } from './isRunningAsInstalledApp'

export function useShowGetAppNav(): boolean {
  const [show, setShow] = useState(() => !isRunningAsInstalledApp())

  useEffect(() => {
    const update = () => setShow(!isRunningAsInstalledApp())
    update()

    const mediaQueries = [
      window.matchMedia?.('(display-mode: standalone)'),
      window.matchMedia?.('(display-mode: minimal-ui)'),
    ].filter((query): query is MediaQueryList => Boolean(query))

    for (const query of mediaQueries) {
      query.addEventListener('change', update)
    }
    window.addEventListener('appinstalled', update)

    return () => {
      for (const query of mediaQueries) {
        query.removeEventListener('change', update)
      }
      window.removeEventListener('appinstalled', update)
    }
  }, [])

  return show
}
