// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { applyRouteHeadTags } from './applyRouteHeadTags'
import { buildSpaShellHeadTags, buildStaticRouteHeadTags } from './routeHeadTags'

describe('applyRouteHeadTags', () => {
  beforeEach(() => {
    document.head.innerHTML = `
      <title>RiffSync</title>
      <meta name="description" content="Old description" />
      <link rel="canonical" href="https://riffsync.tv/" />
      <meta property="og:url" content="https://riffsync.tv/" />
      <meta property="og:title" content="Old title" />
      <meta property="og:description" content="Old OG description" />
      <meta property="og:image" content="https://riffsync.tv/old.png" />
      <meta name="twitter:title" content="Old title" />
      <meta name="twitter:description" content="Old Twitter description" />
      <meta name="twitter:image" content="https://riffsync.tv/old.png" />
    `
  })

  it('applies indexable route title, description, canonical, and social tags', () => {
    applyRouteHeadTags(buildStaticRouteHeadTags('/catalog', 'https://riffsync.tv'))

    expect(document.title).toBe('RiffSync Catalog - Browse the Library')
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'Browse RiffSync episodes across MST3K, RiffTrax, Community, and Riff Material. Pick a title and start a lawful YouTube watch party. Unofficial fan project.',
    )
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://riffsync.tv/catalog',
    )
    expect(document.head.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(
      'https://riffsync.tv/catalog',
    )
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull()
  })

  it('applies noindex shell tags and removes canonical identity', () => {
    applyRouteHeadTags(buildSpaShellHeadTags())

    expect(document.title).toBe('RiffSync')
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull()
    expect(document.head.querySelector('meta[property="og:url"]')).toBeNull()
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex',
    )
  })
})
