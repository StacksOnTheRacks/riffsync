#!/usr/bin/env node
/**
 * Build a Chrome Web Store upload zip for RiffSync Host (production-only manifest).
 */
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const PACKAGE_ROOT = resolve(__dirname, '..')
export const PROD_SPA_MATCH = 'https://riffsync.tv/*'
export const PROD_API_HOST_PERMISSION =
  'https://hu8u08y3a5.execute-api.us-east-1.amazonaws.com/*'

const EXCLUDED_TOP_LEVEL = new Set([
  'dist',
  'node_modules',
  'scripts',
  'package.json',
  'README.md',
  '.gitignore',
])

/**
 * @param {import('node:fs').Dirent} entry
 */
function isRuntimeTopLevelEntry(entry) {
  if (!entry.isFile()) return false
  const name = entry.name
  if (name.endsWith('.test.js')) return false
  if (name.endsWith('.js')) return true
  if (name.endsWith('.html')) return true
  if (name === 'manifest.json') return true
  return false
}

/**
 * @param {string} packageRoot
 * @returns {string[]}
 */
export function listStoreZipRelativePaths(packageRoot = PACKAGE_ROOT) {
  /** @type {string[]} */
  const paths = []

  for (const entry of readdirSync(packageRoot, { withFileTypes: true })) {
    if (EXCLUDED_TOP_LEVEL.has(entry.name)) continue
    if (entry.isDirectory()) {
      if (entry.name === 'icons') {
        for (const icon of readdirSync(join(packageRoot, 'icons'))) {
          if (icon.endsWith('.png')) paths.push(`icons/${icon}`)
        }
      }
      continue
    }
    if (isRuntimeTopLevelEntry(entry)) paths.push(entry.name)
  }

  paths.sort()
  return paths
}

/**
 * @param {Record<string, unknown>} manifest
 * @returns {Record<string, unknown>}
 */
export function transformManifestForStore(manifest) {
  const out = structuredClone(manifest)
  if (!Array.isArray(out.content_scripts) || out.content_scripts.length === 0) {
    throw new Error('manifest.content_scripts[0] is required')
  }
  out.content_scripts[0].matches = [PROD_SPA_MATCH]
  return out
}

/**
 * @param {Record<string, unknown>} manifest
 */
export function assertStoreManifest(manifest) {
  const permissions = manifest.permissions
  const hostPermissions = manifest.host_permissions
  const matches = manifest.content_scripts?.[0]?.matches

  if (JSON.stringify(permissions) !== JSON.stringify(['tabs'])) {
    throw new Error(`unexpected permissions: ${JSON.stringify(permissions)}`)
  }
  if (JSON.stringify(hostPermissions) !== JSON.stringify([PROD_API_HOST_PERMISSION])) {
    throw new Error(`unexpected host_permissions: ${JSON.stringify(hostPermissions)}`)
  }
  if (JSON.stringify(matches) !== JSON.stringify([PROD_SPA_MATCH])) {
    throw new Error(`unexpected content_scripts.matches: ${JSON.stringify(matches)}`)
  }
  for (const size of ['16', '48', '128']) {
    if (!manifest.icons?.[size] || !manifest.action?.default_icon?.[size]) {
      throw new Error(`missing icon wiring for size ${size}`)
    }
  }
  const forbidden = [
    'tabCapture',
    'desktopCapture',
    'offscreen',
    'sidePanel',
    'storage',
    'scripting',
  ]
  for (const perm of forbidden) {
    if (permissions?.includes(perm) || hostPermissions?.includes(perm)) {
      throw new Error(`forbidden permission present: ${perm}`)
    }
  }
}

/**
 * @param {string} packageRoot
 * @param {string} stageDir
 */
export function stageStorePackage(packageRoot, stageDir) {
  rmSync(stageDir, { recursive: true, force: true })
  mkdirSync(stageDir, { recursive: true })

  const manifest = JSON.parse(readFileSync(join(packageRoot, 'manifest.json'), 'utf8'))
  const storeManifest = transformManifestForStore(manifest)
  assertStoreManifest(storeManifest)

  for (const rel of listStoreZipRelativePaths(packageRoot)) {
    const src = join(packageRoot, rel)
    const dest = join(stageDir, rel)
    mkdirSync(dirname(dest), { recursive: true })
    cpSync(src, dest)
  }

  writeFileSync(
    join(stageDir, 'manifest.json'),
    `${JSON.stringify(storeManifest, null, 2)}\n`,
    'utf8',
  )

  return { version: String(storeManifest.version), storeManifest }
}

/**
 * @param {string} stageDir
 * @param {string} zipPath
 */
export function zipDirectory(stageDir, zipPath) {
  const absoluteZip = resolve(zipPath)
  mkdirSync(dirname(absoluteZip), { recursive: true })
  rmSync(absoluteZip, { force: true })
  execFileSync('zip', ['-r', '-X', absoluteZip, '.'], {
    cwd: stageDir,
    stdio: 'pipe',
  })
  if (!existsSync(absoluteZip) || statSync(absoluteZip).size === 0) {
    throw new Error(`failed to create zip at ${absoluteZip}`)
  }
}

/**
 * @param {{ packageRoot?: string, outDir?: string }} [options]
 * @returns {{ zipPath: string, version: string }}
 */
export function buildStoreZip(options = {}) {
  const packageRoot = options.packageRoot ?? PACKAGE_ROOT
  const outDir = options.outDir ?? join(packageRoot, 'dist')
  const stageDir = join(outDir, '.store-stage')

  const { version } = stageStorePackage(packageRoot, stageDir)
  const zipPath = join(outDir, `riffsync-host-${version}.zip`)
  zipDirectory(stageDir, zipPath)
  rmSync(stageDir, { recursive: true, force: true })

  return { zipPath, version }
}

/**
 * @param {string} zipPath
 */
export function assertZipLayout(zipPath) {
  const listing = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' })
  const members = listing
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  for (const forbidden of ['node_modules/', 'dist/', '.test.js']) {
    if (members.some((m) => m.includes(forbidden) || m.endsWith('.test.js'))) {
      throw new Error(`zip contains forbidden path: ${forbidden}`)
    }
  }

  const required = [
    'manifest.json',
    'background.js',
    'host-bridge-content.js',
    'action-popup.html',
    'config.js',
    'icons/16.png',
    'icons/48.png',
    'icons/128.png',
  ]
  for (const rel of required) {
    if (!members.includes(rel)) {
      throw new Error(`zip missing ${rel}`)
    }
  }

  const manifest = JSON.parse(
    execFileSync('unzip', ['-p', zipPath, 'manifest.json'], { encoding: 'utf8' }),
  )
  assertStoreManifest(manifest)

  const configJs = execFileSync('unzip', ['-p', zipPath, 'config.js'], { encoding: 'utf8' })
  if (!configJs.includes('https://hu8u08y3a5.execute-api.us-east-1.amazonaws.com')) {
    throw new Error('config.js missing prod PUBLIC_API_BASE_URL')
  }

  const version = manifest.version
  if (basename(zipPath) !== `riffsync-host-${version}.zip`) {
    throw new Error(`zip filename must embed manifest.version (${version})`)
  }
}

function isMain() {
  const entry = process.argv[1] && resolve(process.argv[1])
  return entry === fileURLToPath(import.meta.url)
}

if (isMain()) {
  const { zipPath } = buildStoreZip()
  assertZipLayout(zipPath)
  console.log(`Wrote ${relative(PACKAGE_ROOT, zipPath)}`)
}
