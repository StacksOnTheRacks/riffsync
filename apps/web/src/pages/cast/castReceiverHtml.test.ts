import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CAST_RECEIVER_APP_SCRIPT_SRC,
  CAST_RECEIVER_BOOT_SCRIPT_SRC,
  CAST_RECEIVER_DIAG_SCRIPT_SRC,
  CAST_RECEIVER_FRAMEWORK_SRC,
} from './castReceiverSession'

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

describe('cast/receiver/index.html', () => {
  const html = readFileSync(resolve(webRoot, 'cast/receiver/index.html'), 'utf8')

  it('loads CAF synchronously and boots the dedicated receiver entry', () => {
    expect(html).toContain(CAST_RECEIVER_DIAG_SCRIPT_SRC)
    expect(html).toContain('data-riffsync-cast-receiver-diag="true"')
    expect(html).toContain('data-riffsync-cast-diag-pixel="true"')
    expect(html).toContain('e=receiver_html_parsed')
    expect(html).toContain(CAST_RECEIVER_FRAMEWORK_SRC)
    expect(html).toContain('data-riffsync-cast-receiver-framework="true"')
    expect(html).toContain(CAST_RECEIVER_BOOT_SCRIPT_SRC)
    expect(html).toContain('data-riffsync-cast-receiver-boot="true"')
    expect(html.indexOf(CAST_RECEIVER_DIAG_SCRIPT_SRC)).toBeLessThan(html.indexOf(CAST_RECEIVER_FRAMEWORK_SRC))
    expect(html.indexOf(CAST_RECEIVER_FRAMEWORK_SRC)).toBeLessThan(html.indexOf(CAST_RECEIVER_BOOT_SCRIPT_SRC))
    expect(html).toContain(CAST_RECEIVER_APP_SCRIPT_SRC)
    expect(html).toContain('data-riffsync-cast-receiver-app="true"')
    expect(html).not.toContain('type="module"')
    expect(html).not.toContain('/src/pages/cast/castReceiverMain.ts')
    expect(html).toContain('noindex')
    expect(html).not.toContain('/src/main.tsx')
    expect(html).not.toContain('aws-amplify')
  })
})
