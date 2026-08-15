import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import {
  appendNextUpItem,
  createCatalogNextUpItem,
  createUrlNextUpItem,
  isAbsoluteHttpUrl,
  loadHostNextUpQueue,
  parseHostNextUpItems,
  removeNextUpItem,
  saveHostNextUpQueue,
  shiftNextUpItem,
  urlQueueLabel,
} from './hostNextUpQueue'

describe('hostNextUpQueue', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('accepts only absolute http(s) URLs', () => {
    expect(isAbsoluteHttpUrl('https://youtube.com/watch?v=1')).toBe(true)
    expect(isAbsoluteHttpUrl('http://example.com')).toBe(true)
    expect(isAbsoluteHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isAbsoluteHttpUrl('/watch/foo')).toBe(false)
    expect(createUrlNextUpItem('not-a-url')).toBeNull()
  })

  it('creates catalog and url items and shifts FIFO', () => {
    const catalog = createCatalogNextUpItem({
      catalogEpisodeId: 'ep-1',
      title: 'Labyrinth',
      posterImageUrl: null,
    })
    const url = createUrlNextUpItem('https://www.youtube.com/watch?v=abc')
    expect(url).not.toBeNull()
    let items = appendNextUpItem([], catalog)
    items = appendNextUpItem(items, url!)
    expect(items).toHaveLength(2)
    const shifted = shiftNextUpItem(items)
    expect(shifted.next?.kind).toBe('catalog')
    expect(shifted.remaining).toHaveLength(1)
    expect(removeNextUpItem(items, catalog.id)).toHaveLength(1)
  })

  it('persists per roomId and ignores bad payloads', () => {
    const item = createCatalogNextUpItem({
      catalogEpisodeId: 'ep-2',
      title: 'Ghoulies',
      posterImageUrl: 'https://example.com/p.jpg',
    })
    saveHostNextUpQueue('room-a', [item])
    expect(loadHostNextUpQueue('room-a')).toEqual([item])
    expect(loadHostNextUpQueue('room-b')).toEqual([])
    expect(parseHostNextUpItems([{ kind: 'url', id: 'x', url: 'ftp://bad', label: 'x' }])).toEqual([])
  })

  it('formats url labels', () => {
    expect(urlQueueLabel('https://www.youtube.com/watch?v=abc')).toContain('youtube.com')
  })
})
