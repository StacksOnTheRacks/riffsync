import { ALLOWED_SPA_ORIGINS } from './roomBind.js'

/**
 * True when the media tab is a first-party party-capture watch URL that can
 * host the embeddable YouTube player (extension play/pause target).
 * Direct youtube.com tabs return false.
 */
export function isPartyCapturePlaybackUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return false
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (!ALLOWED_SPA_ORIGINS.includes(parsed.origin)) return false
  if (!/^\/watch\/[^/]+\/?$/.test(parsed.pathname)) return false
  return parsed.searchParams.get('partyCapture') === '1'
}

export function mediaPlaybackControlErrorMessage(result) {
  if (!result || result.ok) return ''
  if (result.reason === 'media_tab_closed') {
    return 'Open the media tab first.'
  }
  if (result.reason === 'not_controllable') {
    return 'Play/pause works only for RiffSync party-capture embeds, not direct YouTube tabs.'
  }
  if (result.reason === 'content_script_missing') {
    return 'Media tab bridge is missing. Reload the media tab and try again.'
  }
  if (result.reason === 'timeout' || result.reason === 'unsupported') {
    return 'Media tab did not answer. Reload the media tab after the latest deploy.'
  }
  if (result.reason === 'player_unavailable') {
    return 'Player is not ready yet, or this title is not an embeddable YouTube video.'
  }
  if (result.reason === 'command_failed') {
    return 'Could not send play/pause to the media tab.'
  }
  return 'Could not control playback.'
}
