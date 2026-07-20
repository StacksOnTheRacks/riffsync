import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const indexHtmlPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../index.html')

describe('public site shell (index.html)', () => {
  it('uses apex riffsync.tv and never www.riffsync.tv in absolute URLs', () => {
    const html = readFileSync(indexHtmlPath, 'utf8')
    expect(html).not.toMatch(/www\.riffsync\.tv/)
    expect(html).toMatch(/https:\/\/riffsync\.tv\//)
    expect(html).toMatch(/https:\/\/riffsync\.tv\/og-card\.png/)
  })

  it('links the PWA manifest and install metadata', () => {
    const html = readFileSync(indexHtmlPath, 'utf8')
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />')
    expect(html).toContain('<meta name="theme-color" content="#08060d" />')
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/riffsync-icon-192.png" />')
  })
})
