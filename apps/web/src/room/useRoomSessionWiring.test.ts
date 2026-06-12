import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const wiringPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'useRoomSessionWiring.ts')
const realtimeSdkPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'useRoomRealtimeSdk.ts')

describe('useRoomSessionWiring SFU enabled gate (#202)', () => {
  it('does not couple useSfuMediaSession enabled to chat wsStatus === open', () => {
    const src = fs.readFileSync(wiringPath, 'utf8')
    expect(src).not.toMatch(/enabled:\s*wsStatus\s*===\s*['"]open['"]/)
    expect(src).toContain('enabled: Boolean(canonicalRoomId && sessionId && room)')
  })
})

describe('chat compose send success contract (#206)', () => {
  it('retains chat draft in useRoomSessionWiring when sendJson returns false', () => {
    const src = fs.readFileSync(wiringPath, 'utf8')
    expect(src).toMatch(/const sent = sendJson\(\{ action: 'chat'/)
    expect(src).toMatch(/if \(sent\) setChatDraft\(''\)/)
  })

  it('retains chat draft in useRoomRealtimeSdk when sendJson returns false', () => {
    const src = fs.readFileSync(realtimeSdkPath, 'utf8')
    expect(src).toMatch(/const sent = sendJson\(\{ action: 'chat'/)
    expect(src).toMatch(/if \(sent\) setChatDraft\(''\)/)
  })

  it('does not gate sendControl on SFU status in RoomRealtimeSdk', () => {
    const sdkPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      'sessions',
      'RoomRealtimeSdk.ts',
    )
    const src = fs.readFileSync(sdkPath, 'utf8')
    const sendControlBlock = src.slice(src.indexOf('sendControl('), src.indexOf('getChatStatus()'))
    expect(sendControlBlock).not.toMatch(/sfu|getSfu|sfuLastError/)
  })
})
