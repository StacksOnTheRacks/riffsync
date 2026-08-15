import { parseRoomBind } from './roomBind.js'

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
      return { tabId: mediaTabId, reused: true }
    }

    const tab = await tabs.create({ url, active: false })
    mediaTabId = tab.id
    return { tabId: mediaTabId, reused: false }
  }

  function handleTabRemoved(tabId) {
    if (tabId === mediaTabId) {
      mediaTabId = null
    }
  }

  function clearMediaTabId() {
    mediaTabId = null
  }

  function getMediaTabId() {
    return mediaTabId
  }

  function isMediaTabOpen() {
    return mediaTabId != null
  }

  async function reportOpen() {
    if (mediaTabId == null) return false
    if (!(await tabExists(mediaTabId))) {
      mediaTabId = null
      return false
    }
    return true
  }

  return {
    openOrNavigate,
    handleTabRemoved,
    clearMediaTabId,
    getMediaTabId,
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
    }
  }

  return {
    bound: true,
    roomId: bind.roomId,
    origin: bind.origin,
    mediaTabOpen: await tracker.reportOpen(),
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
    }
  }

  await tracker.openOrNavigate(url)
  return {
    ok: true,
    bound: true,
    roomId: bind.roomId,
    origin: bind.origin,
    mediaTabOpen: true,
  }
}
