import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildRobotsTxt,
  buildSitemapXml,
  resolveCanonicalOrigin,
} from '../src/seo/generateSeoArtifacts.ts'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(scriptDir, '..')
const repoRoot = resolve(webRoot, '../..')
const catalogPath = resolve(repoRoot, 'data/catalog/episodes.json')
const distDir = resolve(webRoot, 'dist')

async function loadCatalogEntries() {
  let raw
  try {
    raw = await readFile(catalogPath, 'utf8')
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`Catalog file missing: ${catalogPath}`)
    }
    throw error
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Catalog file is not valid JSON: ${catalogPath}`)
  }

  const entries = parsed?.entries
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(`Catalog entries missing or empty in ${catalogPath}`)
  }

  return entries
}

async function main() {
  const origin = resolveCanonicalOrigin(process.env.VITE_PUBLIC_ORIGIN)
  const episodes = await loadCatalogEntries()

  const robotsTxt = buildRobotsTxt(origin)
  const sitemapXml = buildSitemapXml(origin, episodes)

  await mkdir(distDir, { recursive: true })
  const robotsPath = resolve(distDir, 'robots.txt')
  const sitemapPath = resolve(distDir, 'sitemap.xml')
  await writeFile(robotsPath, robotsTxt, 'utf8')
  await writeFile(sitemapPath, sitemapXml, 'utf8')

  console.log(`Wrote ${robotsPath}`)
  console.log(`Wrote ${sitemapPath}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
