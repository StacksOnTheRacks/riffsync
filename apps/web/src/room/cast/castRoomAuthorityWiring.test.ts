import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const castDir = path.dirname(fileURLToPath(import.meta.url))
const pagesDir = path.join(castDir, '../../pages')
const castReceiverDir = path.join(pagesDir, 'cast')

function readCast(relativePath: string): string {
  return fs.readFileSync(path.join(castDir, relativePath), 'utf8')
}

function readPage(relativePath: string): string {
  return fs.readFileSync(path.join(pagesDir, relativePath), 'utf8')
}

function readCastReceiver(relativePath: string): string {
  return fs.readFileSync(path.join(castReceiverDir, relativePath), 'utf8')
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
  'castChannelProtocol.ts',
  'CastAvailabilityRoomActions.tsx',
]

const CAST_RECEIVER_SOURCES = [
  'CastReceiverPage.tsx',
  'CastReceiverPresentation.tsx',
  'castReceiverSession.ts',
  'castReceiverRenderConfirmation.ts',
]

const FORBIDDEN_CAST_SIDE_EFFECTS = [
  'ChatSession',
  'SfuMediaSession',
  'TheaterPlayback',
  'RoomRealtimeSdk',
  'patchRoom(',
  'sendControl(',
  'fetchSfuJoinToken',
  'getDiagnostics(',
  'activeErrorCodes',
  'share_state',
  'localStorage',
  'sessionStorage',
  'setRoomMode',
  'setAvDisabled',
  'unpublishHostScreen',
  'disconnect(',
  'teardown(',
  'WebSocket',
]

describe('Cast room authority wiring (#305)', () => {
  it('keeps Cast runtime modules free of room mutation and fan-out hooks', () => {
    for (const file of CAST_RUNTIME_SOURCES) {
      const src = readCast(file)
      for (const token of FORBIDDEN_CAST_SIDE_EFFECTS) {
        expect(src, `${file} must not reference ${token}`).not.toContain(token)
      }
    }
  })

  it('keeps Cast receiver modules free of room session integration', () => {
    for (const file of CAST_RECEIVER_SOURCES) {
      const src = readCastReceiver(file)
      for (const token of FORBIDDEN_CAST_SIDE_EFFECTS) {
        expect(src, `${file} must not reference ${token}`).not.toContain(token)
      }
    }
  })

  it('castChannelProtocol defines session-only lifecycle without persistence fields', () => {
    const src = readCast('castChannelProtocol.ts')
    expect(src).toContain('export type CastStartLifecycle =')
    expect(src).toContain("| 'idle'")
    expect(src).toContain("| 'session_ended'")
    expect(src).not.toMatch(/castStartLifecycle[\s\S]{0,120}localStorage/)
    expect(src).not.toContain('castLifecycle')
    expect(src).not.toContain('share_state')
  })

  it('buildCastPresentationSnapshot reads room presentation only, not Cast lifecycle', () => {
    const src = readCast('buildCastPresentationSnapshot.ts')
    expect(src).toContain('roomMode')
    expect(src).not.toContain('castStartLifecycle')
    expect(src).not.toContain('castStageActive')
    expect(src).not.toContain('CastStartLifecycle')
  })

  it('useCastAvailability probes sender support without room APIs', () => {
    const src = readCast('useCastAvailability.ts')
    expect(src).toContain('detectCastSenderSupport')
    expect(src).not.toContain('fetch(')
    expect(src).not.toContain('patchRoom')
  })

  it('RoomPage routes Cast lifecycle only to sender-local stage and sidebar actions', () => {
    const src = readPage('RoomPage.tsx')
    const mediaEngineCall = src.match(/useRoomMediaEngine\(\{[\s\S]*?\}\)/)?.[0] ?? ''
    expect(src).toContain('useCastStartSession')
    expect(mediaEngineCall).not.toContain('castStartLifecycle')
    expect(mediaEngineCall).not.toContain('castStageActive')
    expect(mediaEngineCall).not.toContain('castAvailability')
    expect(src).toMatch(/castStageActive \? \([\s\S]*CastActiveStagePanel/)
    expect(src).toMatch(/const roomSidebarProps = \{[\s\S]*castStartLifecycle,/)
    expect(src).not.toMatch(/castStartLifecycle[\s\S]{0,120}patchRoom/)
    expect(src).not.toMatch(/castStartLifecycle[\s\S]{0,120}announceRoomA11y/)
  })

  it('useCastStartSession cleans up Cast on unmount without room session hooks', () => {
    const src = readCast('useCastStartSession.ts')
    expect(src).toMatch(/return \(\) => \{[\s\S]*controller\.stopCast\(\)/)
    expect(src).not.toContain('patchRoom')
    expect(src).not.toContain('sendControl')
    expect(src).not.toContain('fetchSfuJoinToken')
    expect(src).not.toContain('localStorage')
  })

  it('castStartController lifecycle paths use Cast channel only', () => {
    const src = readCast('castStartController.ts')
    expect(src).toMatch(/stopCast: async \(\) => \{[\s\S]*stopActiveSession/)
    expect(src).not.toContain('fetch(')
    expect(src).not.toContain('WebSocket')
    expect(src).not.toContain('share_state')
  })
})
