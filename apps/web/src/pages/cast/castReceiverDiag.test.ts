// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const diagSource = readFileSync(resolve(webRoot, 'public/cast-receiver-diag.js'), 'utf8')

describe('public/cast-receiver-diag.js', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete (window as Window & { __riffsyncCastDiag?: unknown }).__riffsyncCastDiag
  })

  it('stays ES5 and posts html_loaded when an API origin is baked in', () => {
    expect(diagSource).not.toMatch(/\b(?:const|let|class|=>|import |export )\b/)
    expect(diagSource).toContain('receiver_html_loaded')
    expect(diagSource).toContain('__RIFFSYNC_PUBLIC_API_BASE_URL__')

    const sendBeacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { sendBeacon })
    const source = diagSource.replaceAll('__RIFFSYNC_PUBLIC_API_BASE_URL__', 'https://api.test.example')
    // eslint-disable-next-line no-new-func
    new Function(source)()

    expect(sendBeacon).toHaveBeenCalledWith(
      'https://api.test.example/v1/cast/diag',
      JSON.stringify({ event: 'receiver_html_loaded', hop: 'receiver' }),
    )
    expect(typeof (window as Window & { __riffsyncCastDiag?: unknown }).__riffsyncCastDiag).toBe(
      'function',
    )
  })
})
