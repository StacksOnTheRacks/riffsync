import type { CatalogEpisode } from '../catalog/catalogTypes'
import { trimTabTitleSegment } from '../config/documentTitle'
import { absoluteUrl, resolveCanonicalOrigin } from './generateSeoArtifacts'

export const SITE_SUFFIX = 'RiffSync'

export const GENERIC_FAN_DESCRIPTION =
  'RiffSync — fan watch parties with a curated MST3K-friendly catalog, shared viewing, and room chat. Unofficial fan project.'

const STATIC_ROUTE_COPY = {
  '/': {
    title: 'RiffSync — watch parties',
    description: GENERIC_FAN_DESCRIPTION,
  },
  '/catalog': {
    title: 'RiffSync Catalog — browse the library',
    description:
      'Browse the RiffSync catalog of riff-style episodes with lawful YouTube embeds. Explore MST3K, Community, Riff-Ready, and Movie Night, pick an experiment, and start a watch party. Unofficial fan project.',
  },
  '/catalog/mst3k': {
    title: 'MST3K — RiffSync Catalog',
    description:
      'Browse Mystery Science Theater 3000 episodes on RiffSync — Joel, Mike, Jonah, and Emily eras with lawful YouTube embeds. Unofficial fan project.',
  },
  '/catalog/community': {
    title: 'Community — RiffSync Catalog',
    description:
      'Browse Community catalog titles on RiffSync with lawful YouTube embeds. Pick an experiment and start a watch party. Unofficial fan project.',
  },
  '/catalog/riff-ready': {
    title: 'Riff-Ready — RiffSync Catalog',
    description:
      'Browse Riff-Ready titles on RiffSync with lawful YouTube embeds. Pick an experiment and start a watch party. Unofficial fan project.',
  },
  '/catalog/movie-night': {
    title: 'Movie Night — RiffSync Catalog',
    description:
      'Browse Movie Night titles on RiffSync with lawful YouTube embeds. Pick an experiment and start a watch party. Unofficial fan project.',
  },
  '/how-to-host-a-watchparty': {
    title: 'How to host a watch party — RiffSync',
    description:
      'Step-by-step help for hosting a RiffSync watch party: share your YouTube tab, keep guests in sync, and fix common screen-share issues.',
  },
  '/terms': {
    title: 'Terms of Service — RiffSync',
    description:
      'RiffSync Terms of Service — rules for using the fan watch-party site, catalog, chat, and related features. Unofficial fan project; not affiliated with MST3K or RiffTrax.',
  },
  '/privacy': {
    title: 'Privacy Policy — RiffSync',
    description:
      'RiffSync Privacy Policy — what we collect when you browse the catalog, join watch parties, or sign in, and how we use that information.',
  },
} as const

export type StaticIndexableRoute = keyof typeof STATIC_ROUTE_COPY

export interface RouteHeadTags {
  documentTitle: string
  ogTitle: string
  description: string
  canonicalUrl: string | null
  ogImageUrl: string
  robotsNoindex: boolean
}

export function resolveSeoOrigin(envOrigin: string | undefined): string {
  return resolveCanonicalOrigin(envOrigin)
}

export function resolveAbsoluteAssetUrl(origin: string, assetUrl: string | null | undefined): string | null {
  if (assetUrl == null) return null
  const trimmed = assetUrl.trim()
  if (trimmed.length === 0) return null
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed
  }
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return absoluteUrl(origin, path)
}

export function defaultOgCardUrl(origin: string): string {
  return absoluteUrl(origin, '/og-card.png')
}

export function buildStaticRouteHeadTags(
  route: StaticIndexableRoute,
  origin: string,
): RouteHeadTags {
  const copy = STATIC_ROUTE_COPY[route]
  const canonicalUrl = absoluteUrl(origin, route)
  return {
    documentTitle: copy.title,
    ogTitle: copy.title,
    description: copy.description,
    canonicalUrl,
    ogImageUrl: defaultOgCardUrl(origin),
    robotsNoindex: false,
  }
}

export function buildWatchRouteHeadTags(episode: CatalogEpisode, origin: string): RouteHeadTags {
  const untrimmedTitle = `${episode.title} — ${SITE_SUFFIX}`
  const documentTitle =
    untrimmedTitle.length > 70 ? trimTabTitleSegment(untrimmedTitle) : untrimmedTitle

  const tagline = episode.tagline?.trim() ?? ''
  const description =
    tagline.length > 0
      ? `${tagline} — watch ${episode.title} on RiffSync. Unofficial fan project with lawful YouTube embeds.`
      : `Watch ${episode.title} on RiffSync — fan watch parties with lawful YouTube embeds. Unofficial fan project.`

  const poster = resolveAbsoluteAssetUrl(origin, episode.posterImageUrl)
  const backdrop = resolveAbsoluteAssetUrl(origin, episode.backdropImageUrl)
  const ogImageUrl = poster ?? backdrop ?? defaultOgCardUrl(origin)

  return {
    documentTitle,
    ogTitle: untrimmedTitle,
    description,
    canonicalUrl: absoluteUrl(origin, `/watch/${episode.id}`),
    ogImageUrl,
    robotsNoindex: false,
  }
}

export function buildSpaShellHeadTags(): RouteHeadTags {
  return {
    documentTitle: SITE_SUFFIX,
    ogTitle: SITE_SUFFIX,
    description: GENERIC_FAN_DESCRIPTION,
    canonicalUrl: null,
    ogImageUrl: defaultOgCardUrl(resolveCanonicalOrigin(undefined)),
    robotsNoindex: true,
  }
}
