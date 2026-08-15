import { useCallback, useEffect, useRef, useState } from 'react'
import type { CatalogEpisode } from '../catalog/catalogTypes'
import {
  appendNextUpItem,
  createCatalogNextUpItem,
  createUrlNextUpItem,
  loadHostNextUpQueue,
  removeNextUpItem,
  saveHostNextUpQueue,
  shiftNextUpItem,
  type HostNextUpItem,
} from './hostNextUpQueue'

export function useHostNextUpQueue(roomId: string | undefined) {
  const [items, setItems] = useState<HostNextUpItem[]>(() =>
    roomId ? loadHostNextUpQueue(roomId) : [],
  )
  const [loadedRoomId, setLoadedRoomId] = useState(roomId)
  const itemsRef = useRef(items)

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  if (roomId !== loadedRoomId) {
    setLoadedRoomId(roomId)
    setItems(roomId ? loadHostNextUpQueue(roomId) : [])
  }

  useEffect(() => {
    if (!roomId) return
    saveHostNextUpQueue(roomId, items)
  }, [roomId, items])

  const addCatalogEpisode = useCallback((episode: Pick<CatalogEpisode, 'id' | 'title' | 'posterImageUrl'>) => {
    setItems((prev) => {
      const next = appendNextUpItem(
        prev,
        createCatalogNextUpItem({
          catalogEpisodeId: episode.id,
          title: episode.title,
          posterImageUrl: episode.posterImageUrl,
        }),
      )
      itemsRef.current = next
      return next
    })
  }, [])

  const addUrl = useCallback((url: string): boolean => {
    const item = createUrlNextUpItem(url)
    if (!item) return false
    setItems((prev) => {
      const next = appendNextUpItem(prev, item)
      itemsRef.current = next
      return next
    })
    return true
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const next = removeNextUpItem(prev, id)
      itemsRef.current = next
      return next
    })
  }, [])

  /** Read the FIFO head without mutating the queue. */
  const peekNext = useCallback((): HostNextUpItem | null => {
    return itemsRef.current[0] ?? null
  }, [])

  /**
   * Shift the FIFO head synchronously (React 19-safe).
   * Prefer peek + removeItem after a successful side effect for Fast Forward.
   */
  const shiftNext = useCallback((): HostNextUpItem | null => {
    const result = shiftNextUpItem(itemsRef.current)
    if (result.next) {
      itemsRef.current = result.remaining
      setItems(result.remaining)
    }
    return result.next
  }, [])

  return {
    items,
    addCatalogEpisode,
    addUrl,
    removeItem,
    peekNext,
    shiftNext,
  }
}
