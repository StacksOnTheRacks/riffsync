import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CAST_RECEIVER_FRAMEWORK_SRC } from './castReceiverSession'

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

describe('cast/receiver/index.html', () => {
  const html = readFileSync(resolve(webRoot, 'cast/receiver/index.html'), 'utf8')

  it('loads CAF synchronously and boots the dedicated receiver entry', () => {
    expect(html).toContain(CAST_RECEIVER_FRAMEWORK_SRC)
    expect(html).toContain('data-riffsync-cast-receiver-framework="true"')
    expect(html).toContain('/src/pages/cast/castReceiverMain.ts')
    expect(html).toContain('noindex')
    expect(html).not.toContain('/src/main.tsx')
    expect(html).not.toContain('aws-amplify')
  })
})
