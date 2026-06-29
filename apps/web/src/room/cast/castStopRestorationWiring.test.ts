import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const castDir = path.dirname(fileURLToPath(import.meta.url))
const pagesDir = path.join(castDir, '../../pages')

function readCast(relativePath: string): string {
  return fs.readFileSync(path.join(castDir, relativePath), 'utf8')
}

function readPage(relativePath: string): string {
  return fs.readFileSync(path.join(pagesDir, relativePath), 'utf8')
}

describe('Cast stop restoration wiring (#276)', () => {
  it('castStartController stopCast enters stopping before idle cleanup', () => {
    const src = readCast('castStartController.ts')
    expect(src).toMatch(/stopCast: async \(\) => \{[\s\S]*lifecycle = 'stopping'[\s\S]*cleanupSession/)
    expect(src).toMatch(/cleanupSession\(\)[\s\S]*lifecycle = 'idle'/)
  })

  it('useCastStartSession restores focus only after stopping completes to idle', () => {
    const src = readCast('useCastStartSession.ts')
    expect(src).toContain('shouldRestoreFocusFromCastStageRef')
    expect(src).toMatch(/previousLifecycle !== 'stopping'/)
    expect(src).toContain('stageFocusRestoreRef')
    expect(src).not.toContain('sendChat(')
    expect(src).not.toContain('setChatDraft')
  })

  it('RoomPage keeps Cast stage mounted through stopping and restores playback after', () => {
    const src = readPage('RoomPage.tsx')
    expect(src).toContain("castStartLifecycle === 'casting' || castStartLifecycle === 'stopping'")
    expect(src).toMatch(/stopping=\{castStartLifecycle === 'stopping'\}/)
    expect(src).toMatch(/castStageActive \? \([\s\S]*CastActiveStagePanel[\s\S]*RoomPlaybackPanel/)
  })

  it('CastActiveStagePanel exposes stopping feedback on the stage-local status surface', () => {
    const src = readCast('CastActiveStagePanel.tsx')
    expect(src).toContain('CAST_STOPPING_SUBCOPY')
    expect(src).toMatch(/disabled=\{stopping\}/)
  })
})
