import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it } from 'node:test'
import {
  PACKAGE_ROOT,
  PROD_SPA_MATCH,
  assertStoreManifest,
  assertZipLayout,
  buildStoreZip,
  listStoreZipRelativePaths,
  transformManifestForStore,
} from './package-store-zip.mjs'

describe('package-store-zip', () => {
  it('lists runtime files and excludes tests, scripts, and dist', () => {
    const paths = listStoreZipRelativePaths(PACKAGE_ROOT)
    assert.ok(paths.includes('background.js'))
    assert.ok(paths.includes('host-bridge-content.js'))
    assert.ok(paths.includes('action-popup.html'))
    assert.ok(paths.includes('config.js'))
    assert.ok(paths.includes('icons/16.png'))
    assert.equal(
      paths.some((p) => p.endsWith('.test.js') || p.startsWith('scripts/')),
      false,
    )
  })

  it('transforms content_scripts.matches to prod SPA only', () => {
    const source = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, 'manifest.json'), 'utf8'),
    )
    assert.ok(source.content_scripts[0].matches.includes('http://localhost:5173/*'))

    const store = transformManifestForStore(source)
    assert.deepEqual(store.content_scripts[0].matches, [PROD_SPA_MATCH])
    assertStoreManifest(store)
  })

  it('builds riffsync-host-{version}.zip with store manifest and layout', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'riffsync-host-store-'))
    try {
      const { zipPath, version } = buildStoreZip({ outDir })
      assert.equal(version, '0.2.0')
      assert.equal(zipPath, join(outDir, 'riffsync-host-0.2.0.zip'))
      assertZipLayout(zipPath)
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })
})
