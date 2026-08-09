import { describe, expect, it } from 'vitest'
import type { CatalogEpisode } from '../catalog/catalogTypes'
import { buildPrerenderDocument } from './buildPrerenderDocument'
import { STATIC_INDEXABLE_ROUTES } from './indexableRoutes'
import {
  buildLiveEpisodeRouteHeadTags,
  buildLiveRouteHeadTags,
  buildSpaShellHeadTags,
  buildStaticRouteHeadTags,
  buildWatchRouteHeadTags,
} from './routeHeadTags'

const TEMPLATE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>RiffSync</title>
    <meta
      name="description"
      content="Generic description"
    />
    <link rel="canonical" href="https://riffsync.tv/" />
    <meta property="og:title" content="RiffSync - Watch Parties" />
    <meta property="og:description" content="Generic OG description" />
    <meta property="og:url" content="https://riffsync.tv/" />
    <meta property="og:image" content="https://riffsync.tv/og-card.png" />
    <meta name="twitter:title" content="RiffSync - Watch Parties" />
    <meta name="twitter:description" content="Generic Twitter description" />
    <meta name="twitter:image" content="https://riffsync.tv/og-card.png" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/main.js"></script>
  </body>
</html>`

function episode(overrides: Partial<CatalogEpisode> & Pick<CatalogEpisode, 'id'>): CatalogEpisode {
  return {
    experimentNumber: 101,
    title: 'The Crawling Eye',
    catalog: 'mst3k',
    tags: ['Era: Joel'],
    labels: [],
    youtubeVideoId: 'abc123',
    youtubeWatchUrl: 'https://www.youtube.com/watch?v=abc123',
    tagline: null,
    posterImageUrl: null,
    backdropImageUrl: null,
    tmdbMovieId: null,
    tmdbArtworkSyncedAt: null,
    carousel: false,
    spotlight: false,
    playbackHost: 'youtube',
    customPlaybackUrl: null,
    ...overrides,
  }
}

describe('buildStaticRouteHeadTags', () => {
  it('produces normative home copy', () => {
    const head = buildStaticRouteHeadTags('/', 'https://riffsync.tv')
    expect(head.documentTitle).toBe('RiffSync - Watch Parties')
    expect(head.description).toContain('fan watch parties')
    expect(head.canonicalUrl).toBe('https://riffsync.tv/')
    expect(head.ogImageUrl).toBe('https://riffsync.tv/og-card.png')
    expect(head.robotsNoindex).toBe(false)
  })

  it('covers every static indexable route', () => {
    for (const route of STATIC_INDEXABLE_ROUTES) {
      const head = buildStaticRouteHeadTags(route, 'https://riffsync.tv')
      expect(head.documentTitle.length).toBeGreaterThan(0)
      expect(head.description.length).toBeGreaterThan(0)
      expect(head.canonicalUrl).toContain('https://riffsync.tv')
      expect(head.robotsNoindex).toBe(false)
    }
  })

  it('uses normative catalog title and description', () => {
    const head = buildStaticRouteHeadTags('/catalog', 'https://riffsync.tv')
    expect(head.documentTitle).toBe('RiffSync Catalog - Browse the Library')
    expect(head.description).toBe(
      'Browse RiffSync episodes across MST3K, RiffTrax, Community, and Riff Material. Pick a title and start a lawful YouTube watch party. Unofficial fan project.',
    )
    expect(head.canonicalUrl).toBe('https://riffsync.tv/catalog')
  })

  it('uses normative download page copy', () => {
    const head = buildStaticRouteHeadTags('/download', 'https://riffsync.tv')
    expect(head.documentTitle).toBe('Install the RiffSync App - Download and Add to Home Screen')
    expect(head.description).toBe(
      'Install RiffSync as an app on your phone, tablet, or computer. Step-by-step instructions for Chrome, Edge, Safari, and more. Fan watch parties with a curated catalog.',
    )
    expect(head.canonicalUrl).toBe('https://riffsync.tv/download')
    expect(head.ogImageUrl).toBe('https://riffsync.tv/og-card.png')
  })

  it('uses normative subcategory copy for catalog subcategory routes', () => {
    const subcategories = [
      {
        route: '/catalog/mst3k' as const,
        title: 'MST3K - RiffSync Catalog',
        description:
          'Browse Mystery Science Theater 3000 episodes on RiffSync — Joel, Mike, Jonah, and Emily catalogs with lawful YouTube embeds. Unofficial fan project.',
        canonical: 'https://riffsync.tv/catalog/mst3k',
      },
      {
        route: '/catalog/rifftrax' as const,
        title: 'RiffTrax - RiffSync Catalog',
        description:
          'Browse RiffTrax movies on RiffSync with lawful YouTube embeds. Pick a title and start a watch party. Unofficial fan project.',
        canonical: 'https://riffsync.tv/catalog/rifftrax',
      },
      {
        route: '/catalog/community' as const,
        title: 'Community - RiffSync Catalog',
        description:
          'Browse Community catalog titles on RiffSync with lawful YouTube embeds. Pick an experiment and start a watch party. Unofficial fan project.',
        canonical: 'https://riffsync.tv/catalog/community',
      },
      {
        route: '/catalog/riff-material' as const,
        title: 'Riff Material - RiffSync Catalog',
        description:
          'Browse Riff Material titles on RiffSync with lawful YouTube embeds. Pick an experiment and start a watch party. Unofficial fan project.',
        canonical: 'https://riffsync.tv/catalog/riff-material',
      },
    ] as const

    for (const { route, title, description, canonical } of subcategories) {
      const head = buildStaticRouteHeadTags(route, 'https://riffsync.tv')
      expect(head.documentTitle).toBe(title)
      expect(head.description).toBe(description)
      expect(head.canonicalUrl).toBe(canonical)
      expect(head.ogImageUrl).toBe('https://riffsync.tv/og-card.png')
    }
  })

  it('indexes ten static routes without dynamic Live entries', () => {
    expect(STATIC_INDEXABLE_ROUTES).toHaveLength(10)
    expect(STATIC_INDEXABLE_ROUTES).not.toContain('/live/mst3k-forever-a-thon')
  })
})

describe('buildLiveRouteHeadTags', () => {
  it('builds Live channel head tags from API channel data', () => {
    const head = buildLiveRouteHeadTags(
      {
        slug: 'second-live',
        title: 'Second Live',
        tagline: 'Live all day.',
        posterImageUrl: '/posters/live.jpg',
        backdropImageUrl: null,
      },
      'https://riffsync.tv',
    )

    expect(head.documentTitle).toBe('Second Live - Live on RiffSync')
    expect(head.description).toBe('Live all day.')
    expect(head.canonicalUrl).toBe('https://riffsync.tv/live/second-live')
    expect(head.ogImageUrl).toBe('https://riffsync.tv/posters/live.jpg')
    expect(head.robotsNoindex).toBe(false)
  })

  it('builds Live channel head tags from catalog live episodes', () => {
    const head = buildLiveEpisodeRouteHeadTags(
      episode({
        id: 'mst3k-forever-a-thon',
        title: 'MST3K Forever-A-Thon',
        catalog: 'live',
      }),
      'https://riffsync.tv',
    )

    expect(head.documentTitle).toBe('MST3K Forever-A-Thon - Live on RiffSync')
    expect(head.canonicalUrl).toBe('https://riffsync.tv/live/mst3k-forever-a-thon')
  })
})

describe('buildWatchRouteHeadTags', () => {
  it('uses catalog title without tagline and falls back to og-card image', () => {
    const head = buildWatchRouteHeadTags(
      episode({ id: '101-the-crawling-eye', title: 'The Crawling Eye' }),
      'https://riffsync.tv',
    )
    expect(head.documentTitle).toBe('The Crawling Eye - RiffSync')
    expect(head.ogTitle).toBe('The Crawling Eye - RiffSync')
    expect(head.description).toBe(
      'Watch The Crawling Eye on RiffSync — fan watch parties with lawful YouTube embeds. Unofficial fan project.',
    )
    expect(head.canonicalUrl).toBe('https://riffsync.tv/watch/101-the-crawling-eye')
    expect(head.ogImageUrl).toBe('https://riffsync.tv/og-card.png')
  })

  it('includes tagline in description when present', () => {
    const head = buildWatchRouteHeadTags(
      episode({
        id: 'fixture',
        title: 'Pod People',
        tagline: 'They tried to run',
      }),
      'https://riffsync.tv',
    )
    expect(head.description).toBe(
      'They tried to run — watch Pod People on RiffSync. Unofficial fan project with lawful YouTube embeds.',
    )
  })

  it('prefers poster art over backdrop for OG image', () => {
    const head = buildWatchRouteHeadTags(
      episode({
        id: 'fixture',
        posterImageUrl: '/posters/pod-people.jpg',
        backdropImageUrl: '/backdrops/pod-people.jpg',
      }),
      'https://riffsync.tv',
    )
    expect(head.ogImageUrl).toBe('https://riffsync.tv/posters/pod-people.jpg')
  })

  it('uses backdrop when poster is absent', () => {
    const head = buildWatchRouteHeadTags(
      episode({
        id: 'fixture',
        posterImageUrl: null,
        backdropImageUrl: 'https://images.example/backdrop.jpg',
      }),
      'https://riffsync.tv',
    )
    expect(head.ogImageUrl).toBe('https://images.example/backdrop.jpg')
  })

  it('trims HTML title only when composed title exceeds 70 characters', () => {
    const longTitle =
      'A Very Long Episode Title That Would Overflow Browser Tab Labels If Left Untrimmed'
    const head = buildWatchRouteHeadTags(
      episode({ id: 'fixture', title: longTitle }),
      'https://riffsync.tv',
    )
    expect(head.documentTitle.length).toBeLessThanOrEqual(70)
    expect(head.ogTitle).toBe(`${longTitle} - RiffSync`)
    expect(head.documentTitle).not.toBe(head.ogTitle)
  })
})

describe('buildSpaShellHeadTags', () => {
  it('uses generic noindex shell without canonical', () => {
    const head = buildSpaShellHeadTags()
    expect(head.documentTitle).toBe('RiffSync')
    expect(head.robotsNoindex).toBe(true)
    expect(head.canonicalUrl).toBeNull()
  })
})

describe('buildPrerenderDocument', () => {
  it('injects home head tags without changing body markup', () => {
    const head = buildStaticRouteHeadTags('/', 'https://riffsync.tv')
    const html = buildPrerenderDocument(TEMPLATE_HTML, head)
    expect(html).toContain('<title>RiffSync - Watch Parties</title>')
    expect(html).toContain('rel="canonical" href="https://riffsync.tv/"')
    expect(html).toContain('<div id="root"></div>')
    expect(html).toContain('<script type="module" src="/assets/main.js"></script>')
    expect(html).not.toContain('name="robots" content="noindex"')
  })

  it('emits noindex and removes canonical for spa shell', () => {
    const html = buildPrerenderDocument(TEMPLATE_HTML, buildSpaShellHeadTags())
    expect(html).toContain('<meta name="robots" content="noindex" />')
    expect(html).not.toContain('rel="canonical"')
    expect(html).toContain('<title>RiffSync</title>')
  })
})
