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

const CAST_RUNTIME_SOURCES = [
  'castStartController.ts',
  'useCastStartSession.ts',
  'castSenderClient.ts',
  'buildCastPresentationSnapshot.ts',
  'CastStartRoomActions.tsx',
  'CastActiveStagePanel.tsx',
  'useCastAvailability.ts',
  'castSenderSupportDetector.ts',
]

const FORBIDDEN_CAST_SIDE_EFFECTS = [
  'ChatSession',
  'SfuMediaSession',
  'TheaterPlayback',
  'RoomRealtimeSdk',
  'patchRoom(',
  'sendControl(',
  'getDiagnostics(',
  'activeErrorCodes',
]

describe('Cast active participation wiring (#275)', () => {
  it('keeps Cast runtime modules free of room drawer/session teardown hooks', () => {
    for (const file of CAST_RUNTIME_SOURCES) {
      const src = readCast(file)
      for (const token of FORBIDDEN_CAST_SIDE_EFFECTS) {
        expect(src, `${file} must not reference ${token}`).not.toContain(token)
      }
    }
  })

  it('RoomPage routes Cast state only to stage chrome and sidebar Cast actions', () => {
    const src = readPage('RoomPage.tsx')
    const mediaEngineCall = src.match(/useRoomMediaEngine\(\{[\s\S]*?\}\)/)?.[0] ?? ''
    expect(src).toContain('useCastStartSession')
    expect(src).toContain('useRoomMediaEngine')
    expect(mediaEngineCall).not.toContain('castStartLifecycle')
    expect(mediaEngineCall).not.toContain('castStageActive')
    expect(src).toMatch(/castStageActive \? \([\s\S]*CastActiveStagePanel/)
    expect(src).toMatch(/const roomSidebarProps = \{[\s\S]*castStartLifecycle,/)
  })

  it('useCastStartSession reads chat for overlay snapshots only', () => {
    const src = readCast('useCastStartSession.ts')
    expect(src).toContain('buildCastPresentationSnapshot')
    expect(src).toContain('sendChatOverlayUpdate')
    expect(src).not.toMatch(/\bsendChat\b/)
    expect(src).not.toContain('setChatDraft')
  })

  it('castStartController stop path ends Cast session without room APIs', () => {
    const src = readCast('castStartController.ts')
    expect(src).toMatch(/stopCast: async \(\) => \{[\s\S]*cleanupSession/)
    expect(src).not.toContain('fetch(')
    expect(src).not.toContain('WebSocket')
  })

  it('RoomPageSidebar compose gating ignores Cast lifecycle', () => {
    const src = readCast('../RoomPageSidebar.tsx')
    expect(src).toMatch(/disabled=\{!fanToken \|\| chatComposeStatus\.disableSubmit\}/)
    expect(src).not.toMatch(/disableSubmit[\s\S]{0,80}castStartLifecycle/)
    expect(src).not.toMatch(/castStartLifecycle[\s\S]{0,80}disableSubmit/)
    expect(src).not.toMatch(/castStageActive/)
  })
})
