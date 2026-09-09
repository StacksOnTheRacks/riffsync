import type { CatalogEpisode } from '../catalog/catalogTypes'
import type { LiveChannelSnapshot } from '../api/liveApi'
import { trimTabTitleSegment } from '../config/documentTitle'
import { absoluteUrl, resolveCanonicalOrigin } from './generateSeoArtifacts'
import type { StaticIndexableRoute } from './indexableRoutes'

export type { StaticIndexableRoute }

export const SITE_SUFFIX = 'RiffSync'

export const GENERIC_FAN_DESCRIPTION =
  'RiffSync — fan watch parties with a curated MST3K-friendly catalog, shared viewing, and room chat. Unofficial fan project.'

const STATIC_ROUTE_COPY: Record<StaticIndexableRoute, { title: string; description: string }> = {
  '/': {
    title: 'RiffSync - Watch Parties',
    description: GENERIC_FAN_DESCRIPTION,
  },
  '/catalog': {
    title: 'RiffSync Catalog - Browse the Library',
    description:
      'Browse RiffSync titles across MST3K, RiffTrax, Community, Riff Material, Movies, and TV Shows. Pick a title and start a lawful YouTube watch party. Unofficial fan project.',
  },
  '/catalog/mst3k': {
    title: 'MST3K - RiffSync Catalog',
    description:
      'Browse Mystery Science Theater 3000 episodes on RiffSync — Joel, Mike, Jonah, and Emily catalogs with lawful YouTube embeds. Unofficial fan project.',
  },
  '/catalog/mst3k/shorts': {
    title: 'MST3K Shorts - RiffSync Catalog',
    description:
      'Browse Mystery Science Theater 3000 shorts on RiffSync with lawful YouTube embeds. Pick a short and start a watch party. Unofficial fan project.',
  },
  '/catalog/rifftrax': {
    title: 'RiffTrax - RiffSync Catalog',
    description:
      'Browse RiffTrax movies and shorts on RiffSync with lawful YouTube embeds. Pick a title and start a watch party. Unofficial fan project.',
  },
  '/catalog/rifftrax/movies': {
    title: 'RiffTrax Movies - RiffSync Catalog',
    description:
      'Browse RiffTrax feature-length movies on RiffSync with lawful YouTube embeds. Pick a title and start a watch party. Unofficial fan project.',
  },
  '/catalog/rifftrax/shorts': {
    title: 'RiffTrax Shorts - RiffSync Catalog',
    description:
      'Browse RiffTrax shorts on RiffSync with lawful YouTube embeds. Pick a short and start a watch party. Unofficial fan project.',
  },
  '/catalog/community': {
    title: 'Community - RiffSync Catalog',
    description:
      'Browse community-made riffs on RiffSync with lawful YouTube embeds. Pick a title and start a watch party. Unofficial fan project.',
  },
  '/catalog/riff-material': {
    title: 'Riff Material - RiffSync Catalog',
    description:
      'Browse cheesy flicks ready to riff on RiffSync with lawful YouTube embeds. Pick a title and start a watch party. Unofficial fan project.',
  },
  '/catalog/tv-shows': {
    title: 'TV Shows - RiffSync Catalog',
    description:
      'Browse television riffs on RiffSync with lawful YouTube embeds. Pick a title and start a watch party. Unofficial fan project.',
  },
  '/catalog/movies': {
    title: 'Movies - RiffSync Catalog',
    description:
      'Browse movie-night picks on RiffSync with lawful YouTube embeds. Pick a title and start a watch party. Unofficial fan project.',
  },
  '/live': {
    title: 'Live Now - Official Channels | RiffSync',
    description:
      'Official live channels on RiffSync. Tune into MST3K streams and more with room chat. Unofficial fan project.',
  },
  '/download': {
    title: 'Install the RiffSync App - Download and Add to Home Screen',
    description:
      'Install RiffSync as an app on your phone, tablet, or computer. Step-by-step instructions for Chrome, Edge, Safari, and more. Fan watch parties with a curated catalog.',
  },
  '/how-to-host-a-watchparty': {
    title: 'How to Host a Watch Party - RiffSync',
    description:
      'Step-by-step help for hosting a RiffSync watch party: share your YouTube tab, keep guests in sync, and fix common screen-share issues.',
  },
  '/terms': {
    title: 'Terms of Service - RiffSync',
    description:
      'RiffSync Terms of Service — rules for using the fan watch-party site, catalog, chat, and related features. Unofficial fan project; not affiliated with MST3K or RiffTrax.',
  },
  '/privacy': {
    title: 'Privacy Policy - RiffSync',
    description:
      'RiffSync Privacy Policy — what we collect when you browse the catalog, join watch parties, or sign in, and how we use that information.',
  },
}

const NOINDEX_ROUTE_TITLES: Record<string, string> = {
  '/account': `Account - ${SITE_SUFFIX}`,
  '/your-parties': `Your Watch Parties - ${SITE_SUFFIX}`,
  '/live/watch-parties': `Watch Parties - Live Now - ${SITE_SUFFIX}`,
  '/privacy/data-removal': `Data removal request - ${SITE_SUFFIX}`,
}

export interface RouteHeadTags {
  documentTitle: string
  ogTitle: string
  description: string
  canonicalUrl: string | null
  ogImageUrl: string
  robotsNoindex: boolean
  jsonLd: string | null
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

export function staticRouteDocumentTitle(route: StaticIndexableRoute): string {
  return STATIC_ROUTE_COPY[route].title
}

function websiteJsonLd(origin: string, description: string): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_SUFFIX,
    url: absoluteUrl(origin, '/'),
    description,
  })
}

function withJsonLd(
  tags: Omit<RouteHeadTags, 'jsonLd'>,
  jsonLd: string | null,
): RouteHeadTags {
  return { ...tags, jsonLd }
}

export function buildStaticRouteHeadTags(
  route: StaticIndexableRoute,
  origin: string,
): RouteHeadTags {
  const copy = STATIC_ROUTE_COPY[route]
  const canonicalUrl = absoluteUrl(origin, route)
  return withJsonLd(
    {
      documentTitle: copy.title,
      ogTitle: copy.title,
      description: copy.description,
      canonicalUrl,
      ogImageUrl: defaultOgCardUrl(origin),
      robotsNoindex: false,
    },
    route === '/' ? websiteJsonLd(origin, copy.description) : null,
  )
}

export function buildNamedNoindexHeadTags(pathname: string): RouteHeadTags {
  const titled = NOINDEX_ROUTE_TITLES[pathname]
  if (titled) {
    return withJsonLd(
      {
        documentTitle: titled,
        ogTitle: titled,
        description: GENERIC_FAN_DESCRIPTION,
        canonicalUrl: null,
        ogImageUrl: defaultOgCardUrl(resolveCanonicalOrigin(undefined)),
        robotsNoindex: true,
      },
      null,
    )
  }
  return buildSpaShellHeadTags()
}

export function buildWatchRouteHeadTags(episode: CatalogEpisode, origin: string): RouteHeadTags {
  const untrimmedTitle = `${episode.title} - ${SITE_SUFFIX}`
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

  return withJsonLd(
    {
      documentTitle,
      ogTitle: untrimmedTitle,
      description,
      canonicalUrl: absoluteUrl(origin, `/watch/${episode.id}`),
      ogImageUrl,
      robotsNoindex: false,
    },
    null,
  )
}

export function buildLiveRouteHeadTags(
  channel: Pick<
    LiveChannelSnapshot,
    'slug' | 'title' | 'tagline' | 'posterImageUrl' | 'backdropImageUrl'
  >,
  origin: string,
): RouteHeadTags {
  const title = channel.title.trim() || channel.slug
  const documentTitle = `${title} - Live on ${SITE_SUFFIX}`
  const tagline = channel.tagline?.trim() ?? ''
  const description =
    tagline.length > 0
      ? `${tagline} Watch ${title} live on RiffSync.`
      : `Watch ${title} live on RiffSync with room chat. Unofficial fan project.`
  const poster = resolveAbsoluteAssetUrl(origin, channel.posterImageUrl)
  const backdrop = resolveAbsoluteAssetUrl(origin, channel.backdropImageUrl)
  const ogImageUrl = poster ?? backdrop ?? defaultOgCardUrl(origin)

  return withJsonLd(
    {
      documentTitle,
      ogTitle: documentTitle,
      description,
      canonicalUrl: absoluteUrl(origin, `/live/${channel.slug}`),
      ogImageUrl,
      robotsNoindex: false,
    },
    null,
  )
}

export function buildLiveEpisodeRouteHeadTags(episode: CatalogEpisode, origin: string): RouteHeadTags {
  return buildLiveRouteHeadTags(
    {
      slug: episode.id,
      title: episode.title,
      tagline: episode.tagline,
      posterImageUrl: episode.posterImageUrl,
      backdropImageUrl: episode.backdropImageUrl,
    },
    origin,
  )
}

export function buildSpaShellHeadTags(): RouteHeadTags {
  return withJsonLd(
    {
      documentTitle: SITE_SUFFIX,
      ogTitle: SITE_SUFFIX,
      description: GENERIC_FAN_DESCRIPTION,
      canonicalUrl: null,
      ogImageUrl: defaultOgCardUrl(resolveCanonicalOrigin(undefined)),
      robotsNoindex: true,
    },
    null,
  )
}
