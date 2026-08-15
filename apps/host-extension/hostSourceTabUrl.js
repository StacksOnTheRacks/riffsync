const YOUTUBE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/

function parseYoutubeWatchUrl(raw) {
  const trimmed = raw.trim()
  if (!trimmed) return null

  let url
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  const host = url.hostname.replace(/^www\./, '').toLowerCase()
  let videoId = null

  if (host === 'youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0] ?? null
  } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (url.pathname === '/watch') {
      videoId = url.searchParams.get('v')
    } else {
      const [kind, id] = url.pathname.split('/').filter(Boolean)
      if (kind === 'embed' || kind === 'shorts' || kind === 'live') {
        videoId = id ?? null
      }
    }
  }

  if (!videoId || !YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) return null

  return {
    videoId,
    canonicalWatchUrl: `https://www.youtube.com/watch?v=${videoId}`,
  }
}

function episodeAllowsInAppEmbed(ep) {
  return ep.embedAllows !== false
}

function resolveCatalogYoutubeWatchUrl(ep) {
  const parsedWatchUrl = ep.youtubeWatchUrl ? parseYoutubeWatchUrl(ep.youtubeWatchUrl) : null
  if (parsedWatchUrl) return parsedWatchUrl.canonicalWatchUrl

  const videoId = ep.youtubeVideoId?.trim()
  if (!videoId || !YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) return null

  return `https://www.youtube.com/watch?v=${videoId}`
}

function directYoutubeWatchUrl(args) {
  if (args.catalogEp?.id !== args.catalogEpisodeId) return null
  if (args.catalogEp.playbackHost === 'custom') return null
  if (episodeAllowsInAppEmbed(args.catalogEp)) return null
  return resolveCatalogYoutubeWatchUrl(args.catalogEp)
}

export function hostSourceOpensOnYoutube(args) {
  return directYoutubeWatchUrl(args) !== null
}

export function resolveHostSourceTabUrl(args) {
  const youtubeWatchUrl = directYoutubeWatchUrl(args)
  if (youtubeWatchUrl) return youtubeWatchUrl

  const origin = args.origin.replace(/\/+$/, '')
  return `${origin}/watch/${encodeURIComponent(args.catalogEpisodeId)}?partyCapture=1`
}
