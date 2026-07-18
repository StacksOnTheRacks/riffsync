import { describe, expect, it } from 'vitest'
import type { CatalogEpisode } from '../catalog/catalogTypes'
import {
  DEFAULT_PUBLIC_ORIGIN,
  ROBOTS_DISALLOW_PATHS,
  STATIC_SITEMAP_PATHS,
  absoluteUrl,
  buildRobotsTxt,
  buildSitemapXml,
  countSitemapUrls,
  resolveCanonicalOrigin,
} from './generateSeoArtifacts'

function episode(overrides: Partial<CatalogEpisode> & Pick<CatalogEpisode, 'id'>): CatalogEpisode {
  return {
    experimentNumber: 101,
    title: 'Fixture',
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
    ...overrides,
  }
}

describe('resolveCanonicalOrigin', () => {
  it('uses VITE_PUBLIC_ORIGIN when set', () => {
    expect(resolveCanonicalOrigin('https://staging.example.com/')).toBe('https://staging.example.com')
  })

  it('falls back to apex production origin', () => {
    expect(resolveCanonicalOrigin(undefined)).toBe(DEFAULT_PUBLIC_ORIGIN)
    expect(resolveCanonicalOrigin('   ')).toBe(DEFAULT_PUBLIC_ORIGIN)
  })
})

describe('buildRobotsTxt', () => {
  it('disallows ephemeral and authenticated paths and publishes the sitemap line', () => {
    const robots = buildRobotsTxt('https://riffsync.tv')
    expect(robots).toMatch(/^User-agent: \*\n/)
    for (const path of ROBOTS_DISALLOW_PATHS) {
      expect(robots).toContain(`Disallow: ${path}`)
    }
    expect(robots).toContain('Sitemap: https://riffsync.tv/sitemap.xml')
  })

  it('uses the resolved canonical origin for the sitemap line', () => {
    const robots = buildRobotsTxt('https://preview.riffsync.tv')
    expect(robots).toContain('Sitemap: https://preview.riffsync.tv/sitemap.xml')
  })
})

describe('buildSitemapXml', () => {
  const entries = [
    episode({ id: '101-the-crawling-eye' }),
    episode({ id: 'no-youtube', youtubeVideoId: null, youtubeWatchUrl: null }),
    episode({ id: 'blank-youtube', youtubeVideoId: '   ' }),
  ]

  it('includes static routes and only YouTube-linked watch URLs', () => {
    const xml = buildSitemapXml('https://riffsync.tv', entries)
    for (const path of STATIC_SITEMAP_PATHS) {
      expect(xml).toContain(`<loc>${absoluteUrl('https://riffsync.tv', path)}</loc>`)
    }
    expect(xml).toContain('<loc>https://riffsync.tv/watch/101-the-crawling-eye</loc>')
    expect(xml).not.toContain('/watch/no-youtube')
    expect(xml).not.toContain('/watch/blank-youtube')
  })

  it('escapes XML entities in loc values', () => {
    const xml = buildSitemapXml('https://riffsync.tv', [
      episode({ id: 'episode-with-"quotes"' }),
    ])
    expect(xml).toContain('<loc>https://riffsync.tv/watch/episode-with-&quot;quotes&quot;</loc>')
  })
})

describe('countSitemapUrls', () => {
  it('counts static routes plus YouTube-linked episodes', () => {
    const entries = [
      episode({ id: 'linked-a' }),
      episode({ id: 'linked-b' }),
      episode({ id: 'missing', youtubeVideoId: null, youtubeWatchUrl: null }),
    ]
    expect(countSitemapUrls(entries)).toBe(STATIC_SITEMAP_PATHS.length + 2)
  })
})
