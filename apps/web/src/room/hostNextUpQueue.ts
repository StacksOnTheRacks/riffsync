export type HostNextUpCatalogItem = {
  kind: 'catalog'
  id: string
  catalogEpisodeId: string
  title: string
  posterImageUrl: string | null
}

export type HostNextUpUrlItem = {
  kind: 'url'
  id: string
  url: string
  label: string
}

export type HostNextUpItem = HostNextUpCatalogItem | HostNextUpUrlItem

const STORAGE_PREFIX = 'riffsync.hostNextUp.v1:'

function storageKey(roomId: string): string {
  return `${STORAGE_PREFIX}${roomId}`
}

function newItemId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `nu-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function urlQueueLabel(url: string): string {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')
    const path = parsed.pathname === '/' ? '' : parsed.pathname
    const combined = `${host}${path}`
    return combined.length > 40 ? `${combined.slice(0, 37)}...` : combined
  } catch {
    return url.slice(0, 40)
  }
}

function isCatalogItem(value: unknown): value is HostNextUpCatalogItem {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<HostNextUpCatalogItem>
  return (
    row.kind === 'catalog' &&
    typeof row.id === 'string' &&
    typeof row.catalogEpisodeId === 'string' &&
    typeof row.title === 'string' &&
    (row.posterImageUrl === null || typeof row.posterImageUrl === 'string')
  )
}

function isUrlItem(value: unknown): value is HostNextUpUrlItem {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<HostNextUpUrlItem>
  return (
    row.kind === 'url' &&
    typeof row.id === 'string' &&
    typeof row.url === 'string' &&
    typeof row.label === 'string' &&
    isAbsoluteHttpUrl(row.url)
  )
}

export function parseHostNextUpItems(raw: unknown): HostNextUpItem[] {
  if (!Array.isArray(raw)) return []
  const out: HostNextUpItem[] = []
  for (const row of raw) {
    if (isCatalogItem(row)) out.push(row)
    else if (isUrlItem(row)) out.push(row)
  }
  return out
}

export function loadHostNextUpQueue(roomId: string): HostNextUpItem[] {
  if (typeof localStorage === 'undefined' || !roomId) return []
  try {
    const raw = localStorage.getItem(storageKey(roomId))
    if (!raw) return []
    return parseHostNextUpItems(JSON.parse(raw) as unknown)
  } catch {
    return []
  }
}

export function saveHostNextUpQueue(roomId: string, items: HostNextUpItem[]): void {
  if (typeof localStorage === 'undefined' || !roomId) return
  try {
    localStorage.setItem(storageKey(roomId), JSON.stringify(items))
  } catch {
    // Quota or private mode — ignore persistence failure.
  }
}

export function createCatalogNextUpItem(args: {
  catalogEpisodeId: string
  title: string
  posterImageUrl: string | null
}): HostNextUpCatalogItem {
  return {
    kind: 'catalog',
    id: newItemId(),
    catalogEpisodeId: args.catalogEpisodeId,
    title: args.title,
    posterImageUrl: args.posterImageUrl,
  }
}

export function createUrlNextUpItem(url: string): HostNextUpUrlItem | null {
  const trimmed = url.trim()
  if (!isAbsoluteHttpUrl(trimmed)) return null
  return {
    kind: 'url',
    id: newItemId(),
    url: trimmed,
    label: urlQueueLabel(trimmed),
  }
}

export function appendNextUpItem(items: HostNextUpItem[], item: HostNextUpItem): HostNextUpItem[] {
  return [...items, item]
}

export function removeNextUpItem(items: HostNextUpItem[], id: string): HostNextUpItem[] {
  return items.filter((row) => row.id !== id)
}

export function shiftNextUpItem(items: HostNextUpItem[]): {
  next: HostNextUpItem | null
  remaining: HostNextUpItem[]
} {
  if (items.length === 0) return { next: null, remaining: items }
  const [next, ...remaining] = items
  return { next, remaining }
}
