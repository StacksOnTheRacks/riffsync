import type { CatalogEpisode } from '../catalog/catalogTypes'
import { catalogEntriesWithYoutubeLink } from '../catalog/mockCatalog'
import { STATIC_INDEXABLE_ROUTES } from './indexableRoutes'

export const DEFAULT_PUBLIC_ORIGIN = 'https://riffsync.tv'

export const ROBOTS_DISALLOW_PATHS = [
  '/room/',
  '/lobby',
  '/account',
  '/admin/',
  '/cast/receiver',
  '/privacy/data-removal',
  '/auth/callback',
  '/admin/auth/callback',
] as const

/** @deprecated Import `STATIC_INDEXABLE_ROUTES` from `indexableRoutes.ts` for new code. */
export const STATIC_SITEMAP_PATHS = STATIC_INDEXABLE_ROUTES

/** Canonical origin for absolute SEO URLs at build time. */
export function resolveCanonicalOrigin(envOrigin: string | undefined): string {
  const trimmed = envOrigin?.trim()
  if (trimmed && trimmed.length > 0) {
    return trimmed.replace(/\/$/, '')
  }
  return DEFAULT_PUBLIC_ORIGIN
}

export function absoluteUrl(origin: string, path: string): string {
  const normalizedOrigin = origin.replace(/\/$/, '')
  if (path === '/') {
    return `${normalizedOrigin}/`
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedOrigin}${normalizedPath}`
}

export function buildRobotsTxt(origin: string): string {
  const lines = ['User-agent: *', ...ROBOTS_DISALLOW_PATHS.map((path) => `Disallow: ${path}`)]
  lines.push(`Sitemap: ${absoluteUrl(origin, '/sitemap.xml')}`)
  return `${lines.join('\n')}\n`
}

export function buildSitemapXml(origin: string, episodes: CatalogEpisode[]): string {
  const locs: string[] = STATIC_SITEMAP_PATHS.map((path) => absoluteUrl(origin, path))
  for (const episode of catalogEntriesWithYoutubeLink(episodes)) {
    locs.push(absoluteUrl(origin, `/watch/${episode.id}`))
  }

  const urlEntries = locs
    .map((loc) => `  <url>\n    <loc>${escapeXml(loc)}</loc>\n  </url>`)
    .join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urlEntries,
    '</urlset>',
    '',
  ].join('\n')
}

export function countSitemapUrls(episodes: CatalogEpisode[]): number {
  return STATIC_SITEMAP_PATHS.length + catalogEntriesWithYoutubeLink(episodes).length
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}
