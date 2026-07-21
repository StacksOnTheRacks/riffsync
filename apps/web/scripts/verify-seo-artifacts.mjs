import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { catalogEntriesWithYoutubeLink } from '../src/catalog/mockCatalog.ts'
import { countSitemapUrls } from '../src/seo/generateSeoArtifacts.ts'
import { STATIC_INDEXABLE_ROUTES, staticRouteDistPath } from '../src/seo/indexableRoutes.ts'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(scriptDir, '..')
const repoRoot = resolve(webRoot, '../..')
const catalogPath = resolve(repoRoot, 'data/catalog/episodes.json')
const distDir = resolve(webRoot, 'dist')

const WATCH_FIXTURE_ID = '101-the-crawling-eye'

async function loadCatalogEntries() {
  const raw = await readFile(catalogPath, 'utf8')
  const parsed = JSON.parse(raw)
  const entries = parsed?.entries
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(`Catalog entries missing or empty in ${catalogPath}`)
  }
  return entries
}

function countUrlTags(xml) {
  const matches = xml.match(/<url>/g)
  return matches ? matches.length : 0
}

async function assertFileContains(relativePath, needle) {
  const content = await readFile(resolve(distDir, relativePath), 'utf8')
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} is missing expected content: ${needle}`)
  }
}

async function main() {
  const robotsPath = resolve(distDir, 'robots.txt')
  const sitemapPath = resolve(distDir, 'sitemap.xml')
  const spaShellPath = resolve(distDir, 'spa-shell.html')
  const pwaAssetPaths = [
    'manifest.webmanifest',
    'sw.js',
    'icons/riffsync-icon-192.png',
    'icons/riffsync-icon-512.png',
    'download/index.html',
  ]

  const [robotsTxt, sitemapXml, episodes] = await Promise.all([
    readFile(robotsPath, 'utf8'),
    readFile(sitemapPath, 'utf8'),
    loadCatalogEntries(),
  ])

  if (!robotsTxt.includes('Sitemap:')) {
    throw new Error('robots.txt is missing a Sitemap directive')
  }

  const expectedUrlCount = countSitemapUrls(episodes)
  const actualUrlCount = countUrlTags(sitemapXml)
  if (actualUrlCount !== expectedUrlCount) {
    throw new Error(
      `sitemap.xml has ${actualUrlCount} <url> entries; expected ${expectedUrlCount}`,
    )
  }

  const spaShell = await readFile(spaShellPath, 'utf8')
  if (!spaShell.includes('noindex')) {
    throw new Error('spa-shell.html is missing noindex robots meta')
  }

  for (const route of STATIC_INDEXABLE_ROUTES) {
    const relativePath = staticRouteDistPath(route)
    try {
      await readFile(resolve(distDir, relativePath), 'utf8')
    } catch {
      throw new Error(`Missing prerendered file: dist/${relativePath}`)
    }
  }

  for (const relativePath of pwaAssetPaths) {
    try {
      await readFile(resolve(distDir, relativePath))
    } catch {
      throw new Error(`Missing PWA/download artifact: dist/${relativePath}`)
    }
  }

  const youtubeLinked = catalogEntriesWithYoutubeLink(episodes)
  let watchPrerenderCount = 0
  for (const episode of youtubeLinked) {
    const watchPath = `watch/${episode.id}/index.html`
    try {
      await readFile(resolve(distDir, watchPath), 'utf8')
      watchPrerenderCount += 1
    } catch {
      throw new Error(`Missing prerendered watch page: dist/${watchPath}`)
    }
  }

  if (watchPrerenderCount !== youtubeLinked.length) {
    throw new Error(
      `Expected ${youtubeLinked.length} watch prerender files; found ${watchPrerenderCount}`,
    )
  }

  await assertFileContains('index.html', '<title>RiffSync - Watch Parties</title>')
  await assertFileContains('index.html', 'rel="canonical" href="https://riffsync.tv/"')
  await assertFileContains(
    `watch/${WATCH_FIXTURE_ID}/index.html`,
    'The Crawling Eye - RiffSync',
  )
  await assertFileContains(
    `watch/${WATCH_FIXTURE_ID}/index.html`,
    `rel="canonical" href="https://riffsync.tv/watch/${WATCH_FIXTURE_ID}"`,
  )

  console.log(
    `SEO artifacts verified (${actualUrlCount} sitemap URLs, ${watchPrerenderCount} watch prerenders).`,
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
