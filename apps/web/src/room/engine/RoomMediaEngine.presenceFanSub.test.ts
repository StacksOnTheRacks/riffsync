import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const engineDir = path.dirname(fileURLToPath(import.meta.url))

describe('RoomMediaEngine presence fanSub (#377)', () => {
  it('preserves optional fanSub when mapping presence into the People roster', () => {
    const src = fs.readFileSync(path.join(engineDir, 'RoomMediaEngine.ts'), 'utf8')
    const onPresenceBlock = src.match(/onPresence:\s*\(event\)\s*=>\s*\{([\s\S]*?)\n\s*\},/)?.[1]
    expect(onPresenceBlock).toBeTruthy()
    expect(onPresenceBlock).toContain('fanSub: member.fanSub')
    expect(onPresenceBlock).toContain('avatarUrl: member.avatarUrl')
  })
})
