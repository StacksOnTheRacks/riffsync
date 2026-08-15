import { useCallback, useEffect, useState } from 'react'
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

  if (roomId !== loadedRoomId) {
    setLoadedRoomId(roomId)
    setItems(roomId ? loadHostNextUpQueue(roomId) : [])
  }

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
    let shifted: HostNextUpItem | null = null
    setItems((prev) => {
      const result = shiftNextUpItem(prev)
      shifted = result.next
      return result.remaining
    })
    return shifted
  }, [])

  return {
    items,
    addCatalogEpisode,
    addUrl,
    removeItem,
    shiftNext,
  }
}
