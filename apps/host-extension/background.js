import {
  createMediaTabTracker,
  openOrNavigateHostMediaTab,
  reportHostingMediaTab,
} from './mediaTab.js'

const tracker = createMediaTabTracker(chrome.tabs)

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => {
    console.error(error)
  })

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  return tabs[0] ?? null
}

async function currentState() {
  const tab = await getActiveTab()
  return reportHostingMediaTab(tracker, tab?.url)
}

function broadcastState(state) {
  chrome.runtime.sendMessage({ type: 'hostSessionState', ...state }).catch(() => {})
}

async function refreshAndBroadcast() {
  const state = await currentState()
  broadcastState(state)
  return state
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'getState') {
    currentState().then(sendResponse)
    return true
  }

  if (message?.type === 'openOrNavigate') {
    getActiveTab()
      .then((tab) => openOrNavigateHostMediaTab(tracker, tab?.url, message.url))
      .then(async (result) => {
        const state = await currentState()
        sendResponse({ ...state, ok: result.ok })
        broadcastState(state)
      })
      .catch((error) => {
        console.error(error)
        currentState().then((state) => {
          sendResponse({ ...state, ok: false })
          broadcastState(state)
        })
      })
    return true
  }

  return undefined
})

chrome.tabs.onRemoved.addListener((tabId) => {
  tracker.handleTabRemoved(tabId)
  refreshAndBroadcast()
})

chrome.tabs.onActivated.addListener(() => {
  refreshAndBroadcast()
})

chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.url) {
    refreshAndBroadcast()
  }
})

chrome.windows.onFocusChanged.addListener(() => {
  refreshAndBroadcast()
})
