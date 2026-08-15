import { parseRoomBind } from './roomBind.js'

export async function applyTitleChange({
  activeTabUrl,
  partyTabId,
  catalogEpisodeId,
  catalogRow,
  jwtCache,
  requestJwt,
  patchRoom,
  resolveUrl,
  navigate,
}) {
  const bind = parseRoomBind(activeTabUrl)
  if (!bind) {
    return { ok: false, bound: false, reason: 'unbound' }
  }

  if (
    typeof catalogEpisodeId !== 'string' ||
    catalogEpisodeId.length === 0 ||
    !catalogRow ||
    catalogRow.id !== catalogEpisodeId
  ) {
    return { ok: false, bound: true, roomId: bind.roomId, reason: 'missing_selection' }
  }

  async function obtainToken({ forceRefresh }) {
    if (forceRefresh) {
      jwtCache.drop()
    } else {
      const cached = jwtCache.peek()
      if (cached) return { ok: true, accessToken: cached }
    }

    const jwt = await requestJwt({ tabId: partyTabId })
    if (!jwt?.ok || typeof jwt.accessToken !== 'string' || jwt.accessToken.length === 0) {
      return { ok: false, error: jwt?.error || 'unsupported' }
    }
    jwtCache.store(jwt.accessToken)
    return { ok: true, accessToken: jwt.accessToken }
  }

  let token = await obtainToken({ forceRefresh: false })
  if (!token.ok) {
    return { ok: false, bound: true, roomId: bind.roomId, reason: 'auth', error: token.error }
  }

  let patch = await patchRoom({
    roomId: bind.roomId,
    accessToken: token.accessToken,
    catalogEpisodeId,
  })

  if (patch?.status === 401) {
    token = await obtainToken({ forceRefresh: true })
    if (!token.ok) {
      return { ok: false, bound: true, roomId: bind.roomId, reason: 'auth', error: token.error }
    }
    patch = await patchRoom({
      roomId: bind.roomId,
      accessToken: token.accessToken,
      catalogEpisodeId,
    })
  }

  if (!patch?.ok) {
    return {
      ok: false,
      bound: true,
      roomId: bind.roomId,
      reason: patch?.reason === 'network' ? 'network' : 'http',
      status: patch?.status,
      code: patch?.code,
    }
  }

  const url = resolveUrl({
    catalogEp: catalogRow,
    catalogEpisodeId,
    origin: bind.origin,
  })
  const nav = await navigate({ url })
  return {
    ok: Boolean(nav?.ok),
    bound: true,
    roomId: bind.roomId,
    origin: bind.origin,
    navigated: Boolean(nav?.ok),
  }
}

export function titleChangeErrorMessage(result) {
  if (!result || result.ok) return ''
  if (result.reason === 'unbound') {
    return 'Not on a room tab. Open a RiffSync room to change the title.'
  }
  if (result.reason === 'missing_selection') {
    return 'Select a library title first.'
  }
  if (result.reason === 'auth') {
    if (result.error === 'not_signed_in') {
      return 'Sign in as the room host on the party tab.'
    }
    if (result.error === 'refresh_failed') {
      return 'Could not refresh your host session. Sign in again on the party tab.'
    }
    if (result.error === 'forbidden_origin') {
      return 'This page origin is not allowed for host sign-in.'
    }
    if (result.error === 'timeout') {
      return 'Host sign-in timed out. Keep the party tab focused, stay signed in as host, reload the party page, and try again.'
    }
    if (result.error === 'content_script_missing') {
      return 'Host bridge is not available on this tab. Reload the party page after loading the extension.'
    }
    if (result.error === 'unsupported') {
      return 'Host bridge did not answer on the party tab. Reload riffsync.tv (latest deploy required) and stay signed in as host.'
    }
    return 'Host sign-in is not available on this page.'
  }
  if (result.reason === 'network') {
    return 'Network error. Check your connection and try again.'
  }
  if (result.status === 401) {
    return 'Unauthorized. Sign in as the room host and try again.'
  }
  if (result.status === 403) {
    return 'You are not the host of this room.'
  }
  if (result.status === 404) {
    return 'Room or episode was not found.'
  }
  if (result.status === 409) {
    return 'Room was updated elsewhere. Retry the title change.'
  }
  if (result.code === 'catalog_episode_not_found') {
    return 'That catalog episode was not found.'
  }
  if (result.code === 'catalog_episode_youtube_id_missing') {
    return 'That catalog episode is missing a YouTube id.'
  }
  if (result.code === 'catalog_episode_custom_url_missing') {
    return 'That catalog episode is missing a custom playback URL.'
  }
  if (result.reason === 'http' && result.status === 400) {
    return 'The catalog episode could not be applied to this room.'
  }
  return 'Could not change the room title.'
}
