import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { RETIRED_MESH_HOST_SCREEN_COPY } from '../../pages/roomPageDrawerStatusTestHelpers'

const webSrcRoot = path.join(import.meta.dirname, '../..')

const STAGE_PLAYBACK_PATHS = [
  'room/sfu/sfuRelayStatusCopy.ts',
  'room/sessions/TheaterPlayback.ts',
  'room/RoomPlaybackPanel.tsx',
  'room/drawerErrorPresentation.ts',
  'pages/RoomPage.tsx',
] as const

function readWebSrc(relativePath: string): string {
  return fs.readFileSync(path.join(webSrcRoot, relativePath), 'utf8')
}

describe('guest host-screen mesh retirement grep (#212 / #161)', () => {
  for (const relativePath of STAGE_PLAYBACK_PATHS) {
    it(`stage playback path ${relativePath} has no retired mesh FSM copy`, () => {
      const src = readWebSrc(relativePath)
      for (const banned of RETIRED_MESH_HOST_SCREEN_COPY) {
        expect(src, `${relativePath} must not contain "${banned}"`).not.toContain(banned)
      }
    })
  }
})
