import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const wiringPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'useRoomSessionWiring.ts')

describe('useRoomSessionWiring SFU enabled gate (#202)', () => {
  it('does not couple useSfuMediaSession enabled to chat wsStatus === open', () => {
    const src = fs.readFileSync(wiringPath, 'utf8')
    expect(src).not.toMatch(/enabled:\s*wsStatus\s*===\s*['"]open['"]/)
    expect(src).toContain('enabled: Boolean(canonicalRoomId && sessionId && room)')
  })
})
