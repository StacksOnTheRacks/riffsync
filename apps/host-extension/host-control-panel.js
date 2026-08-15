import { resolveHostSourceTabUrl } from './hostSourceTabUrl.js'

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

function render(state) {
  const bound = Boolean(state?.bound)
  bindEl.textContent = bound ? `Bound to room ${state.roomId}` : 'Not bound to a room'
  mediaEl.textContent = bound && state.mediaTabOpen ? 'Open' : 'Not open'
  openButton.disabled = !bound
  errorEl.textContent = ''
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'hostSessionState') {
    render(message)
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

chrome.runtime.sendMessage({ type: 'getState' }).then(render).catch((error) => {
  console.error(error)
  render({ bound: false, mediaTabOpen: false })
})
