import { useEffect, useState } from 'react'
import { isRunningAsInstalledApp } from './isRunningAsInstalledApp'

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

let installPromptEvent: BeforeInstallPromptEvent | null = null
let installed = isRunningAsInstalledApp()
const listeners = new Set<() => void>()
let browserListenersInstalled = false

function emitChange(): void {
  for (const listener of listeners) {
    listener()
  }
}

function installBrowserListeners(): void {
  if (browserListenersInstalled || typeof window === 'undefined') return
  browserListenersInstalled = true

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    installPromptEvent = event as BeforeInstallPromptEvent
    installed = isRunningAsInstalledApp()
    emitChange()
  })

  window.addEventListener('appinstalled', () => {
    installPromptEvent = null
    installed = true
    emitChange()
  })
}

function snapshot() {
  installBrowserListeners()
  return {
    canPrompt: Boolean(installPromptEvent) && !installed,
    isInstalled: installed || isRunningAsInstalledApp(),
  }
}

export function usePwaInstallPrompt() {
  const [state, setState] = useState(snapshot)

  useEffect(() => {
    const update = () => setState(snapshot())
    listeners.add(update)
    update()
    return () => {
      listeners.delete(update)
    }
  }, [])

  const promptInstall = async (): Promise<boolean> => {
    const event = installPromptEvent
    if (!event || state.isInstalled) return false

    await event.prompt()
    const choice = await event.userChoice
    installPromptEvent = null
    installed = choice.outcome === 'accepted' || isRunningAsInstalledApp()
    emitChange()
    return choice.outcome === 'accepted'
  }

  return {
    ...state,
    promptInstall,
  }
}
