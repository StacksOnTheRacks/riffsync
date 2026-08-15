// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCatalogNextUpItem,
  createUrlNextUpItem,
  saveHostNextUpQueue,
} from './hostNextUpQueue'
import { useHostNextUpQueue } from './useHostNextUpQueue'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type HookApi = ReturnType<typeof useHostNextUpQueue>

function Harness({
  roomId,
  onApi,
}: {
  roomId: string
  onApi: (api: HookApi) => void
}) {
  const api = useHostNextUpQueue(roomId)
  onApi(api)
  return (
    <ul data-testid="queue">
      {api.items.map((item) => (
        <li key={item.id} data-testid={`item-${item.id}`}>
          {item.kind === 'catalog' ? item.title : item.label}
        </li>
      ))}
    </ul>
  )
}

describe('useHostNextUpQueue', () => {
  const store = new Map<string, string>()
  let container: HTMLDivElement
  let root: Root
  let latest: HookApi | null = null

  beforeEach(() => {
    store.clear()
    latest = null
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  function renderQueue(roomId = 'room-ff') {
    act(() => {
      root.render(
        <Harness
          roomId={roomId}
          onApi={(api) => {
            latest = api
          }}
        />,
      )
    })
  }

  it('shiftNext returns the head item synchronously and updates remaining', () => {
    const catalog = createCatalogNextUpItem({
      catalogEpisodeId: 'ep-1',
      title: 'Labyrinth',
      posterImageUrl: null,
    })
    const url = createUrlNextUpItem('https://www.youtube.com/watch?v=abc')
    expect(url).not.toBeNull()
    saveHostNextUpQueue('room-ff', [catalog, url!])
    renderQueue()

    expect(latest?.items).toHaveLength(2)

    let shifted: ReturnType<HookApi['shiftNext']> = null
    act(() => {
      shifted = latest!.shiftNext()
    })

    expect(shifted).not.toBeNull()
    expect(shifted!.id).toBe(catalog.id)
    expect(latest?.items).toHaveLength(1)
    expect(latest?.items[0]?.id).toBe(url!.id)
  })

  it('peekNext returns the head without mutating the queue', () => {
    const catalog = createCatalogNextUpItem({
      catalogEpisodeId: 'ep-2',
      title: 'Ghoulies',
      posterImageUrl: null,
    })
    saveHostNextUpQueue('room-ff', [catalog])
    renderQueue()

    const peeked = latest!.peekNext()
    expect(peeked?.id).toBe(catalog.id)
    expect(latest?.items).toHaveLength(1)

    act(() => {
      latest!.removeItem(catalog.id)
    })
    expect(latest?.items).toHaveLength(0)
    expect(latest!.peekNext()).toBeNull()
  })
})
