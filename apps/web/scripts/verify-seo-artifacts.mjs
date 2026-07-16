import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { countSitemapUrls } from '../src/seo/generateSeoArtifacts.ts'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(scriptDir, '..')
const repoRoot = resolve(webRoot, '../..')
const catalogPath = resolve(repoRoot, 'data/catalog/episodes.json')
const distDir = resolve(webRoot, 'dist')

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

async function main() {
  const robotsPath = resolve(distDir, 'robots.txt')
  const sitemapPath = resolve(distDir, 'sitemap.xml')

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

  console.log(`SEO artifacts verified (${actualUrlCount} sitemap URLs).`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
