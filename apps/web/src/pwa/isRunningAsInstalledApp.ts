interface StandaloneNavigator extends Navigator {
  standalone?: boolean
}

export function isRunningAsInstalledApp(): boolean {
  if (typeof window === 'undefined') return false

  const standaloneMode = window.matchMedia?.('(display-mode: standalone)').matches ?? false
  const minimalUiMode = window.matchMedia?.('(display-mode: minimal-ui)').matches ?? false
  const iosStandalone = Boolean((navigator as StandaloneNavigator).standalone)

  return standaloneMode || minimalUiMode || iosStandalone
}
