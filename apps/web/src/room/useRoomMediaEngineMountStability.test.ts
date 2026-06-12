import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const roomDir = path.dirname(fileURLToPath(import.meta.url))

function readSrc(relativePath: string): string {
  return fs.readFileSync(path.join(roomDir, relativePath), 'utf8')
}

/**
 * Regression guard for the 5s-poll teardown/rebuild loop: the mount effect must not depend
 * on the `room` object (its identity changes every poll), or the SFU/WS session is torn down
 * and rebuilt on every snapshot refresh. The initial room is read from a ref instead, and the
 * effect is gated on a stable `roomAvailable` boolean. Post-mount room updates flow through the
 * separate diffed `engine.applyRoomSnapshot` effect.
 */
describe('useRoomMediaEngine mount stability', () => {
  const src = readSrc('useRoomMediaEngine.ts')

  it('reads the initial room from a ref and gates mount on roomAvailable', () => {
    expect(src).toContain('const roomRef = useRef(room)')
    expect(src).toContain('const roomAvailable = Boolean(room) && Boolean(canonicalRoomId)')
    expect(src).toContain('const initialRoom = roomRef.current')
    expect(src).toContain('engine.mount(initialRoom, {')
  })

  it('does not list the room object in the mount effect dependency array', () => {
    const mountEffect = extractMountEffect(src)
    const deps = extractDependencyArray(mountEffect)
    expect(deps).toContain('roomAvailable')
    expect(deps).not.toContain('room,')
    expect(deps.split(/\s+/)).not.toContain('room')
  })

  it('keeps post-mount room updates on the diffed applyRoomSnapshot effect', () => {
    expect(src).toContain('engine.applyRoomSnapshot(room)')
  })
})

/** The mount effect is the one that calls engine.mount; slice from it to its dependency array. */
function extractMountEffect(src: string): string {
  const start = src.indexOf('engine.mount(initialRoom, {')
  expect(start).toBeGreaterThan(-1)
  const depsClose = src.indexOf('])', start)
  expect(depsClose).toBeGreaterThan(start)
  return src.slice(start, depsClose + 2)
}

function extractDependencyArray(effect: string): string {
  const open = effect.lastIndexOf('}, [')
  expect(open).toBeGreaterThan(-1)
  return effect.slice(open + 3)
}
