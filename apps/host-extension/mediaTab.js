import { parseRoomBind } from './roomBind.js'
import { isPartyCapturePlaybackUrl } from './mediaPlayback.js'

function isAbsoluteHttpUrl(url) {
  if (typeof url !== 'string') return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function createMediaTabTracker(tabs) {
  let mediaTabId = null
  let mediaTabUrl = null

  async function tabExists(tabId) {
    try {
      await tabs.get(tabId)
      return true
    } catch {
      return false
    }
  }

  async function openOrNavigate(url) {
    if (!isAbsoluteHttpUrl(url)) {
      throw new Error('openOrNavigate requires an absolute http(s) URL')
    }

    if (mediaTabId != null && (await tabExists(mediaTabId))) {
      await tabs.update(mediaTabId, { url, active: false })
      mediaTabUrl = url
      return { tabId: mediaTabId, reused: true }
    }

    const tab = await tabs.create({ url, active: false })
    mediaTabId = tab.id
    mediaTabUrl = url
    return { tabId: mediaTabId, reused: false }
  }

  function handleTabRemoved(tabId) {
    if (tabId === mediaTabId) {
      mediaTabId = null
      mediaTabUrl = null
    }
  }

  function clearMediaTabId() {
    mediaTabId = null
    mediaTabUrl = null
  }

  function getMediaTabId() {
    return mediaTabId
  }

  function getMediaTabUrl() {
    return mediaTabUrl
  }

  function isMediaTabOpen() {
    return mediaTabId != null
  }

  async function reportOpen() {
    if (mediaTabId == null) return { open: false, url: null }
    try {
      const tab = await tabs.get(mediaTabId)
      mediaTabUrl = typeof tab?.url === 'string' ? tab.url : mediaTabUrl
      return { open: true, url: mediaTabUrl }
    } catch {
      mediaTabId = null
      mediaTabUrl = null
      return { open: false, url: null }
    }
  }

  return {
    openOrNavigate,
    handleTabRemoved,
    clearMediaTabId,
    getMediaTabId,
    getMediaTabUrl,
    isMediaTabOpen,
    reportOpen,
  }
}

export async function reportHostingMediaTab(tracker, activeTabUrl) {
  const bind = parseRoomBind(activeTabUrl)
  if (!bind) {
    return {
      bound: false,
      roomId: null,
      origin: null,
      mediaTabOpen: false,
      mediaTabId: null,
      mediaTabUrl: null,
      mediaPlaybackControllable: false,
    }
  }

  const media = await tracker.reportOpen()
  return {
    bound: true,
    roomId: bind.roomId,
    origin: bind.origin,
    mediaTabOpen: media.open,
    mediaTabId: media.open ? tracker.getMediaTabId() : null,
    mediaTabUrl: media.open ? media.url : null,
    mediaPlaybackControllable: media.open && isPartyCapturePlaybackUrl(media.url),
  }
}

export async function openOrNavigateHostMediaTab(tracker, activeTabUrl, url) {
  const bind = parseRoomBind(activeTabUrl)
  if (!bind) {
    return {
      ok: false,
      bound: false,
      roomId: null,
      origin: null,
      mediaTabOpen: false,
      mediaTabId: null,
      mediaTabUrl: null,
      mediaPlaybackControllable: false,
    }
  }

  await tracker.openOrNavigate(url)
  return {
    ok: true,
    bound: true,
    roomId: bind.roomId,
    origin: bind.origin,
    mediaTabOpen: true,
    mediaTabId: tracker.getMediaTabId(),
    mediaTabUrl: url,
    mediaPlaybackControllable: isPartyCapturePlaybackUrl(url),
  }
}
