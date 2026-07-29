import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPrerenderDocument } from '../src/seo/buildPrerenderDocument.ts'
import { STATIC_INDEXABLE_ROUTES, staticRouteDistPath } from '../src/seo/indexableRoutes.ts'
import { catalogEntriesIndexableForSeo } from '../src/catalog/catalogSeo.ts'
import {
  buildSpaShellHeadTags,
  buildStaticRouteHeadTags,
  buildWatchRouteHeadTags,
  resolveSeoOrigin,
} from '../src/seo/routeHeadTags.ts'

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

async function writePrerenderedHtml(relativePath, html) {
  const outputPath = resolve(distDir, relativePath)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, html, 'utf8')
  console.log(`Wrote ${outputPath}`)
}

async function main() {
  const origin = resolveSeoOrigin(process.env.VITE_PUBLIC_ORIGIN)
  const templatePath = resolve(distDir, 'index.html')
  const templateHtml = await readFile(templatePath, 'utf8')
  const episodes = await loadCatalogEntries()
  const indexableEpisodes = catalogEntriesIndexableForSeo(episodes)

  for (const route of STATIC_INDEXABLE_ROUTES) {
    const head = buildStaticRouteHeadTags(route, origin)
    const html = buildPrerenderDocument(templateHtml, head)
    await writePrerenderedHtml(staticRouteDistPath(route), html)
  }

  for (const episode of indexableEpisodes) {
    const head = buildWatchRouteHeadTags(episode, origin)
    const html = buildPrerenderDocument(templateHtml, head)
    await writePrerenderedHtml(`watch/${episode.id}/index.html`, html)
  }

  const spaShell = buildPrerenderDocument(templateHtml, buildSpaShellHeadTags())
  await writePrerenderedHtml('spa-shell.html', spaShell)

  console.log(
    `Prerendered ${STATIC_INDEXABLE_ROUTES.length} static routes, ${indexableEpisodes.length} watch pages, and spa-shell.html`,
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
