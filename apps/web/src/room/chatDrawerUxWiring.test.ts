import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const roomDir = path.dirname(fileURLToPath(import.meta.url))

function readSrc(relativePath: string): string {
  return fs.readFileSync(path.join(roomDir, relativePath), 'utf8')
}

describe('chat drawer UX wiring (#207)', () => {
  it('useRoomMediaEngine exposes chat drawer presentation from diagnostics only', () => {
    const src = readSrc('useRoomMediaEngine.ts')
    const engineSrc = readSrc('engine/RoomMediaEngine.ts')
    expect(engineSrc).toContain('selectDrawerPresentation')
    expect(src).toContain('getDrawerPresentation')
    expect(src).not.toMatch(/chatDrawerBanner:[\s\S]*drawers\.sfuSignaling/)
    expect(src).not.toMatch(/chatComposeStatus:[\s\S]*drawers\.sfuSignaling/)
  })

  it('RoomPage passes chat drawer props into RoomPageSidebar', () => {
    const src = readSrc('../pages/RoomPage.tsx')
    expect(src).toMatch(/chatDrawerBanner=\{chatDrawerBanner\}/)
    expect(src).toMatch(/chatComposeStatus=\{chatComposeStatus\}/)
    expect(src).toContain('useRoomMediaEngine')
  })

  it('RoomPageSidebar renders chat drawer banner and compose status surfaces', () => {
    const src = readSrc('RoomPageSidebar.tsx')
    expect(src).toContain('RIFFSYNC_CHAT_DRAWER_STATUS_ID')
    expect(src).toContain('RIFFSYNC_CHAT_COMPOSE_STATUS_ID')
    expect(src).toMatch(/id=\{RIFFSYNC_CHAT_DRAWER_STATUS_ID\}/)
    expect(src).toMatch(/id=\{RIFFSYNC_CHAT_COMPOSE_STATUS_ID\}/)
    expect(src).toMatch(/role="status"/)
    expect(src).toContain('riffsync-room-chat-giphy-status--err')
    expect(src).toMatch(/disabled=\{!fanToken \|\| chatComposeStatus\.disableSubmit\}/)
    expect(src).not.toMatch(/sfuSignaling/)
    expect(src).not.toMatch(/videoRelayStatus/)
  })
})
