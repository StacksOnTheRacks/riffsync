// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Chatbox, ChatboxTabList } from './Chatbox'

describe('Chatbox', () => {
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

  it('uses tablist semantics with aria-selected on active tab', () => {
    const onSelectTab = vi.fn()
    act(() => {
      root.render(
        <ChatboxTabList
          activeTab="chat"
          tabs={[
            { id: 'chat', label: 'Chat' },
            { id: 'people', label: 'People (2)' },
            { id: 'friends', label: 'Friends', unreadDot: true },
          ]}
          onSelectTab={onSelectTab}
        />,
      )
    })
    const tablist = container.querySelector('[role="tablist"]')
    expect(tablist).not.toBeNull()
    const tabs = container.querySelectorAll('[role="tab"]')
    expect(tabs.length).toBe(3)
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true')
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('false')
    act(() => (tabs[1] as HTMLButtonElement).click())
    expect(onSelectTab).toHaveBeenCalledWith('people')
  })
})
