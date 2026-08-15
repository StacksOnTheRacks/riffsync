// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomHostIconRow } from './RoomHostIconRow'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('RoomHostIconRow', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderRow(isPublisher = true) {
    const onCopyShare = vi.fn()
    const onOpenRenameModal = vi.fn()
    const onSelectRoomVisibility = vi.fn()
    act(() => {
      root.render(
        <RoomHostIconRow
          isPublisher={isPublisher}
          onCopyShare={onCopyShare}
          onOpenRenameModal={onOpenRenameModal}
          roomVisibility="public"
          visibilityBusy={false}
          visibilityErr={null}
          onSelectRoomVisibility={onSelectRoomVisibility}
        />,
      )
    })
    return { onCopyShare, onOpenRenameModal, onSelectRoomVisibility }
  }

  it('uses gen-button on Share / Visibility / Rename like the top AV control bar', () => {
    renderRow(true)
    const share = container.querySelector('button[aria-label="Copy party link"]')
    const visibility = container.querySelector('button[aria-label="Lobby visibility"]')
    const rename = container.querySelector('button[aria-label="Rename party"]')
    expect(share?.classList.contains('gen-button')).toBe(true)
    expect(share?.classList.contains('riffsync-room-host-icons__btn')).toBe(true)
    expect(visibility?.classList.contains('gen-button')).toBe(true)
    expect(rename?.classList.contains('gen-button')).toBe(true)
  })

  it('renders only Share for non-publishers', () => {
    renderRow(false)
    expect(container.querySelector('button[aria-label="Copy party link"]')).not.toBeNull()
    expect(container.querySelector('button[aria-label="Lobby visibility"]')).toBeNull()
    expect(container.querySelector('button[aria-label="Rename party"]')).toBeNull()
  })
})
