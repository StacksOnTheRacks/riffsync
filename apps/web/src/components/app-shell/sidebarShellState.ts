import { useCallback, useEffect, useState } from 'react'

export function useSidebarFocusTrap(
  enabled: boolean,
  containerRef: React.RefObject<HTMLElement | null>,
  onEscape: () => void,
) {
  useEffect(() => {
    if (!enabled || !containerRef.current) {
      return
    }

    const container = containerRef.current
    const focusable = container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    first?.focus()

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onEscape()
        return
      }

      if (event.key !== 'Tab' || focusable.length === 0) {
        return
      }

      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        }
      } else if (document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    container.addEventListener('keydown', onKeyDown)
    return () => container.removeEventListener('keydown', onKeyDown)
  }, [containerRef, enabled, onEscape])
}

export function useSidebarShellState(isMobile: boolean) {
  const [railExpanded, setRailExpanded] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const sidebarExpanded = isMobile ? drawerOpen : railExpanded
  const sidebarCollapsed = !isMobile && !railExpanded

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setDrawerOpen((current) => !current)
      return
    }
    setRailExpanded((current) => !current)
  }, [isMobile])

  const closeMobileDrawer = useCallback(() => {
    setDrawerOpen(false)
  }, [])

  return {
    sidebarExpanded,
    sidebarCollapsed,
    toggleSidebar,
    closeMobileDrawer,
    drawerOpen,
  }
}
