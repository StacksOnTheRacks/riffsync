export const ALLOWED_SPA_ORIGINS = [
  'https://riffsync.tv',
  'http://localhost:5173',
]

export function parseRoomBind(tabUrl) {
  if (typeof tabUrl !== 'string' || tabUrl.length === 0) return null

  let url
  try {
    url = new URL(tabUrl)
  } catch {
    return null
  }

  if (!ALLOWED_SPA_ORIGINS.includes(url.origin)) return null

  const match = url.pathname.match(/^\/room\/([^/]+)\/?$/)
  if (!match) return null

  let roomId
  try {
    roomId = decodeURIComponent(match[1])
  } catch {
    return null
  }

  if (!roomId) return null

  return { roomId, origin: url.origin }
}
