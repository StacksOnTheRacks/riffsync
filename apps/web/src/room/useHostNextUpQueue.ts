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
  const itemsRef = useRef(items)
  itemsRef.current = items

  useEffect(() => {
    if (!roomId) {
      setItems([])
      return
    }
    setItems(loadHostNextUpQueue(roomId))
  }, [roomId])

  useEffect(() => {
    if (!roomId) return
    saveHostNextUpQueue(roomId, items)
  }, [roomId, items])

  const addCatalogEpisode = useCallback((episode: Pick<CatalogEpisode, 'id' | 'title' | 'posterImageUrl'>) => {
    setItems((prev) =>
      appendNextUpItem(
        prev,
        createCatalogNextUpItem({
          catalogEpisodeId: episode.id,
          title: episode.title,
          posterImageUrl: episode.posterImageUrl,
        }),
      ),
    )
  }, [])

  const addUrl = useCallback((url: string): boolean => {
    const item = createUrlNextUpItem(url)
    if (!item) return false
    setItems((prev) => appendNextUpItem(prev, item))
    return true
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => removeNextUpItem(prev, id))
  }, [])

  const shiftNext = useCallback((): HostNextUpItem | null => {
    const result = shiftNextUpItem(itemsRef.current)
    setItems(result.remaining)
    return result.next
  }, [])

  return {
    items,
    addCatalogEpisode,
    addUrl,
    removeItem,
    shiftNext,
  }
}
