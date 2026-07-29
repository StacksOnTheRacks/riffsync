import type { CatalogEpisode } from '../catalog/catalogTypes'
import {
  episodeAllowsInAppEmbed,
  resolveCatalogYoutubeWatchUrl,
} from '../catalog/catalogYoutubePlayback'

type HostSourceTabArgs = {
  catalogEp:
    | Pick<
        CatalogEpisode,
        'id' | 'embedAllows' | 'youtubeWatchUrl' | 'youtubeVideoId' | 'playbackHost'
      >
    | null
    | undefined
  catalogEpisodeId: string
  origin: string
}

function directYoutubeWatchUrl(args: HostSourceTabArgs): string | null {
  if (args.catalogEp?.id !== args.catalogEpisodeId) return null
  if (args.catalogEp.playbackHost === 'custom') return null
  if (episodeAllowsInAppEmbed(args.catalogEp)) return null
  return resolveCatalogYoutubeWatchUrl(args.catalogEp)
}

export function hostSourceOpensOnYoutube(args: HostSourceTabArgs): boolean {
  return directYoutubeWatchUrl(args) !== null
}

export function resolveHostSourceTabUrl(args: HostSourceTabArgs): string {
  const youtubeWatchUrl = directYoutubeWatchUrl(args)
  if (youtubeWatchUrl) return youtubeWatchUrl

  const origin = args.origin.replace(/\/+$/, '')
  return `${origin}/watch/${encodeURIComponent(args.catalogEpisodeId)}?partyCapture=1`
}
