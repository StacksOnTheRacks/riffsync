import { applyTitleChange } from './changeTitle.js'
import { PUBLIC_API_BASE_URL } from './config.js'
import { createEphemeralJwtCache, requestHostAccessToken } from './hostJwt.js'
import { resolveHostSourceTabUrl } from './hostSourceTabUrl.js'
import { requestMediaPlaybackControl } from './mediaControl.js'
import {
  createMediaTabTracker,
  openOrNavigateHostMediaTab,
  reportHostingMediaTab,
} from './mediaTab.js'
import { patchRoomCatalogEpisode } from './roomsApi.js'

const tracker = createMediaTabTracker(chrome.tabs)
const jwtCache = createEphemeralJwtCache()

function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else resolve(response)
    })
  })
}

/**
 * Prefer the tab that sent the message (Room-tab content script).
 * Fall back to the last-focused active tab for any legacy callers.
 */
async function resolvePartyTab(sender) {
  if (sender?.tab?.id != null) {
    return sender.tab
  }
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  return tabs[0] ?? null
}

async function currentState(sender) {
  const tab = await resolvePartyTab(sender)
  return reportHostingMediaTab(tracker, tab?.url)
}

function broadcastState(state) {
  chrome.runtime.sendMessage({ type: 'hostSessionState', ...state }).catch(() => {})
}

async function refreshAndBroadcast(sender) {
  const state = await currentState(sender)
  broadcastState(state)
  return state
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'getState') {
    currentState(sender).then(sendResponse)
    return true
  }

  if (message?.type === 'openOrNavigate') {
    resolvePartyTab(sender)
      .then((tab) => openOrNavigateHostMediaTab(tracker, tab?.url, message.url))
      .then(async (result) => {
        const state = await currentState(sender)
        sendResponse({ ...state, ok: result.ok })
        broadcastState(state)
      })
      .catch((error) => {
        console.error(error)
        currentState(sender).then((state) => {
          sendResponse({ ...state, ok: false })
          broadcastState(state)
        })
      })
    return true
  }

  if (message?.type === 'mediaPlayback') {
    currentState(sender)
      .then(async (state) => {
        const result = await requestMediaPlaybackControl({
          mediaTabId: state.mediaTabId,
          mediaTabUrl: state.mediaTabUrl,
          action: message.action,
          sendMessage: sendMessageToTab,
        })
        sendResponse({ ...state, ...result })
      })
      .catch((error) => {
        console.error(error)
        currentState(sender).then((state) => {
          sendResponse({ ...state, ok: false, reason: 'unsupported' })
        })
      })
    return true
  }

  if (message?.type === 'changeTitle') {
    resolvePartyTab(sender)
      .then(async (tab) => {
        const result = await applyTitleChange({
          activeTabUrl: tab?.url,
          partyTabId: tab?.id,
          catalogEpisodeId: message.catalogEpisodeId,
          catalogRow: message.catalogRow,
          jwtCache,
          requestJwt: ({ tabId }) =>
            requestHostAccessToken({ tabId, sendMessage: sendMessageToTab }),
          patchRoom: (args) => patchRoomCatalogEpisode(PUBLIC_API_BASE_URL, args),
          resolveUrl: resolveHostSourceTabUrl,
          navigate: async ({ url }) => openOrNavigateHostMediaTab(tracker, tab?.url, url),
        })
        const state = await currentState(sender)
        sendResponse({ ...state, ...result })
        broadcastState(state)
      })
      .catch((error) => {
        console.error(error)
        currentState(sender).then((state) => {
          sendResponse({ ...state, ok: false, reason: 'network' })
          broadcastState(state)
        })
      })
    return true
  }

  return undefined
})

chrome.tabs.onRemoved.addListener((tabId) => {
  tracker.handleTabRemoved(tabId)
  refreshAndBroadcast(null)
})

chrome.tabs.onActivated.addListener(() => {
  refreshAndBroadcast(null)
})

chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.url) {
    refreshAndBroadcast(null)
  }
})

chrome.windows.onFocusChanged.addListener(() => {
  refreshAndBroadcast(null)
})
