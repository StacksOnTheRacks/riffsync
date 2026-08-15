import { useCallback, useEffect, useState } from 'react'
import {
  getHostMediaTabState,
  openHostMediaTab,
  pingHostExtension,
  sendHostMediaPlayback,
  type HostMediaTabState,
} from '../hostBridge/hostExtensionBridge'

const emptyState: HostMediaTabState = {
  bound: false,
  roomId: null,
  origin: null,
  mediaTabOpen: false,
  mediaTabId: null,
  mediaTabUrl: null,
  mediaPlaybackControllable: false,
}

export function useHostExtensionPresence(enabled: boolean) {
  const [present, setPresent] = useState(false)
  const [checking, setChecking] = useState(enabled)
  const [mediaState, setMediaState] = useState<HostMediaTabState>(emptyState)

  const refresh = useCallback(async () => {
    if (!enabled) {
      setPresent(false)
      setChecking(false)
      setMediaState(emptyState)
      return
    }
    setChecking(true)
    const ok = await pingHostExtension()
    setPresent(ok)
    if (ok) {
      const state = await getHostMediaTabState()
      setMediaState(state ?? emptyState)
    } else {
      setMediaState(emptyState)
    }
    setChecking(false)
  }, [enabled])

  useEffect(() => {
    void refresh()
    if (!enabled) return
    const id = window.setInterval(() => {
      void refresh()
    }, 4000)
    return () => window.clearInterval(id)
  }, [enabled, refresh])

  const openMediaTab = useCallback(async (url: string) => {
    const state = await openHostMediaTab(url)
    if (state) setMediaState(state)
    return state
  }, [])

  const play = useCallback(async () => {
    const result = await sendHostMediaPlayback('play')
    if (result) setMediaState(result)
    return result
  }, [])

  const pause = useCallback(async () => {
    const result = await sendHostMediaPlayback('pause')
    if (result) setMediaState(result)
    return result
  }, [])

  return {
    present,
    checking,
    mediaState,
    refresh,
    openMediaTab,
    play,
    pause,
  }
}
