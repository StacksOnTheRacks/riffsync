import { fetchPublicCatalog, selectCatalogRow } from './catalogApi.js'
import { titleChangeErrorMessage } from './changeTitle.js'
import { PUBLIC_API_BASE_URL } from './config.js'
import { resolveHostSourceTabUrl } from './hostSourceTabUrl.js'
import { nowPlayingLabel } from './nowPlaying.js'
import { fetchRoomNowPlaying } from './roomsApi.js'

const HOST_SOURCE_FIXTURE = {
  catalogEp: {
    id: '032-mitchell',
    embedAllows: true,
    youtubeWatchUrl: 'https://www.youtube.com/watch?v=NXGXtm6gcxk',
    youtubeVideoId: 'NXGXtm6gcxk',
    playbackHost: 'youtube',
  },
  catalogEpisodeId: '032-mitchell',
}

const bindEl = document.getElementById('bind-status')
const mediaEl = document.getElementById('media-tab-status')
const openButton = document.getElementById('open-media-tab')
const errorEl = document.getElementById('error-status')
const libraryStatusEl = document.getElementById('library-status')
const libraryListEl = document.getElementById('library-list')
const libraryRetryButton = document.getElementById('library-retry')
const nowPlayingEl = document.getElementById('now-playing-status')
const nowPlayingRetryButton = document.getElementById('now-playing-retry')
const applyTitleButton = document.getElementById('apply-title')
const titleErrorEl = document.getElementById('title-error')

let libraryEntries = []
let librarySelection = { id: null, row: null }
let sessionState = { bound: false, roomId: null, origin: null, mediaTabOpen: false }
let nowPlayingRoomId = null
let nowPlayingRoom = null

function syncActionButtons() {
  const bound = Boolean(sessionState.bound)
  openButton.disabled = !bound
  applyTitleButton.disabled = !bound || !librarySelection.id
}

function render(state) {
  sessionState = {
    bound: Boolean(state?.bound),
    roomId: state?.roomId ?? null,
    origin: state?.origin ?? null,
    mediaTabOpen: Boolean(state?.mediaTabOpen),
  }
  bindEl.textContent = sessionState.bound
    ? `Bound to room ${sessionState.roomId}`
    : 'Not bound to a room'
  mediaEl.textContent = sessionState.bound && sessionState.mediaTabOpen ? 'Open' : 'Not open'
  syncActionButtons()
  errorEl.textContent = ''
}

function setNowPlayingStatus(text, { retryHidden = true } = {}) {
  nowPlayingEl.textContent = text
  nowPlayingRetryButton.hidden = retryHidden
}

async function loadNowPlaying(roomId) {
  if (!roomId) {
    nowPlayingRoomId = null
    nowPlayingRoom = null
    setNowPlayingStatus('Open a RiffSync room tab to see now playing.')
    return
  }

  nowPlayingRoomId = roomId
  nowPlayingRoom = null
  setNowPlayingStatus('Loading now playing...')
  const result = await fetchRoomNowPlaying(PUBLIC_API_BASE_URL, roomId)
  if (nowPlayingRoomId !== roomId) return

  if (result.status === 'ok') {
    nowPlayingRoom = result.room
    setNowPlayingStatus(nowPlayingLabel(result.room, libraryEntries) || 'Now playing unavailable')
    return
  }
  if (result.status === 'missing') {
    setNowPlayingStatus('Room not found.')
    return
  }
  setNowPlayingStatus('Could not load now playing.', { retryHidden: false })
}

function refreshNowPlayingForBind(state) {
  const roomId = state?.bound ? state.roomId : null
  if (roomId === nowPlayingRoomId && roomId) return
  loadNowPlaying(roomId)
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'hostSessionState') {
    render(message)
    refreshNowPlayingForBind(message)
  }
})

openButton.addEventListener('click', async () => {
  errorEl.textContent = ''
  const state = await chrome.runtime.sendMessage({ type: 'getState' })
  if (!state?.bound || !state.origin) {
    render({ bound: false, mediaTabOpen: false })
    return
  }

  const url = resolveHostSourceTabUrl({
    ...HOST_SOURCE_FIXTURE,
    origin: state.origin,
  })
  const result = await chrome.runtime.sendMessage({ type: 'openOrNavigate', url })
  render(result)
  if (!result?.ok && !result?.bound) {
    errorEl.textContent = 'Open refused: active tab is not a room on an allowed origin.'
  }
})

function setLibraryStatus(text, { listHidden = true, retryHidden = true } = {}) {
  libraryStatusEl.textContent = text
  libraryStatusEl.hidden = false
  libraryListEl.hidden = listHidden
  libraryRetryButton.hidden = retryHidden
}

function renderLibraryList() {
  libraryListEl.replaceChildren()
  for (const entry of libraryEntries) {
    const item = document.createElement('li')
    const row = document.createElement('button')
    row.type = 'button'
    row.className = 'library-row'
    row.dataset.id = entry.id
    row.setAttribute('aria-selected', entry.id === librarySelection.id ? 'true' : 'false')

    if (entry.posterImageUrl) {
      const poster = document.createElement('img')
      poster.className = 'library-poster'
      poster.src = entry.posterImageUrl
      poster.alt = ''
      row.append(poster)
    }

    const meta = document.createElement('span')
    meta.className = 'library-meta'
    const title = document.createElement('span')
    title.className = 'library-title'
    title.textContent = entry.title
    meta.append(title)
    if (Number.isFinite(entry.experimentNumber)) {
      const experiment = document.createElement('span')
      experiment.className = 'library-experiment'
      experiment.textContent = String(entry.experimentNumber)
      meta.append(experiment)
    }
    row.append(meta)
    item.append(row)
    libraryListEl.append(item)
  }
}

function renderLibraryResult(result) {
  if (result.status === 'ok') {
    libraryEntries = result.entries
    if (librarySelection.id) {
      librarySelection = selectCatalogRow(libraryEntries, librarySelection.id)
    }
    renderLibraryList()
    setLibraryStatus('', { listHidden: false, retryHidden: true })
    libraryStatusEl.hidden = true
    if (nowPlayingRoom) {
      setNowPlayingStatus(nowPlayingLabel(nowPlayingRoom, libraryEntries) || 'Now playing unavailable')
    }
    return
  }

  libraryEntries = []
  libraryListEl.replaceChildren()
  if (result.status === 'empty') {
    setLibraryStatus('No titles in the catalog library.', {
      listHidden: true,
      retryHidden: true,
    })
    return
  }

  setLibraryStatus(result.message || 'Could not load the catalog library.', {
    listHidden: true,
    retryHidden: false,
  })
}

async function loadLibrary() {
  setLibraryStatus('Loading catalog library...', { listHidden: true, retryHidden: true })
  const result = await fetchPublicCatalog(PUBLIC_API_BASE_URL)
  renderLibraryResult(result)
}

libraryListEl.addEventListener('click', (event) => {
  const row = event.target.closest('[data-id]')
  if (!row) return
  librarySelection = selectCatalogRow(libraryEntries, row.dataset.id)
  renderLibraryList()
  syncActionButtons()
})

libraryRetryButton.addEventListener('click', () => {
  loadLibrary()
})

nowPlayingRetryButton.addEventListener('click', () => {
  loadNowPlaying(sessionState.bound ? sessionState.roomId : null)
})

applyTitleButton.addEventListener('click', async () => {
  titleErrorEl.textContent = ''
  if (!sessionState.bound) {
    titleErrorEl.textContent = titleChangeErrorMessage({ reason: 'unbound' })
    return
  }
  if (!librarySelection.id || !librarySelection.row) {
    titleErrorEl.textContent = titleChangeErrorMessage({ reason: 'missing_selection' })
    return
  }

  applyTitleButton.disabled = true
  const result = await chrome.runtime.sendMessage({
    type: 'changeTitle',
    catalogEpisodeId: librarySelection.id,
    catalogRow: librarySelection.row,
  })
  render(result)
  if (result?.ok) {
    await loadNowPlaying(result.roomId || sessionState.roomId)
  } else {
    titleErrorEl.textContent = titleChangeErrorMessage(result)
  }
  syncActionButtons()
})

chrome.runtime.sendMessage({ type: 'getState' }).then((state) => {
  render(state)
  refreshNowPlayingForBind(state)
}).catch((error) => {
  console.error(error)
  render({ bound: false, mediaTabOpen: false })
  loadNowPlaying(null)
})

loadLibrary()
