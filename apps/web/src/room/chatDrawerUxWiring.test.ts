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
    expect(src).toContain('snapshot.drawerPresentation')
    expect(src).not.toMatch(/chatDrawerBanner:[\s\S]*drawers\.sfuSignaling/)
    expect(src).not.toMatch(/chatComposeStatus:[\s\S]*drawers\.sfuSignaling/)
  })

  it('RoomPage passes chat drawer props into RoomPageSidebar', () => {
    const src = readSrc('../pages/RoomPage.tsx')
    expect(src).toMatch(/const roomSidebarProps = \{[\s\S]*chatDrawerBanner,[\s\S]*chatComposeStatus,/)
    expect(src).toMatch(/<RoomPageSidebar presentation="overlay" \{\.\.\.roomSidebarProps\}/)
    expect(src).toMatch(/<RoomPageSidebar \{\.\.\.roomSidebarProps\}/)
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

  it('Room friends pane backfills DM history while push is unavailable', () => {
    const src = readSrc('../friends/useRoomFriendsPane.ts')
    expect(src).toContain('DM_PUSH_FALLBACK_POLL_MS')
    expect(src).toContain('fetchDmMessages(fanToken, peer.pairKey)')
    expect(src).toContain("dmPushStatus === 'open'")
  })

  it('anchors sparse chat history to the compose edge', () => {
    const css = readSrc('../styles/riffsync-app.css')
    expect(css).toMatch(
      /\.riffsync-room-page__chat \.riffsync-room-chat-log \{[\s\S]*display: flex;[\s\S]*flex-direction: column;/,
    )
    expect(css).toContain('.riffsync-room-page__chat .riffsync-room-chat-log > :first-child')
    expect(css).toMatch(
      /\.riffsync-room-page__chat \.riffsync-room-chat-log > :first-child \{[\s\S]*margin-top: auto;/,
    )
  })
})
