import { describe, expect, it } from 'vitest'
import {
  enteredVideoChatMode,
  parseInboundRoomMode,
  stopMediaStreamTracks,
} from './roomMediaLifecycle'

describe('parseInboundRoomMode', () => {
  it('accepts theater and videoChat', () => {
    expect(parseInboundRoomMode('theater')).toBe('theater')
    expect(parseInboundRoomMode('videoChat')).toBe('videoChat')
  })

  it('rejects unknown values', () => {
    expect(parseInboundRoomMode('cinema')).toBeNull()
    expect(parseInboundRoomMode(null)).toBeNull()
  })
})

describe('enteredVideoChatMode', () => {
  it('is true only on theater to videoChat transition', () => {
    expect(enteredVideoChatMode('theater', 'videoChat')).toBe(true)
    expect(enteredVideoChatMode('videoChat', 'videoChat')).toBe(false)
    expect(enteredVideoChatMode('videoChat', 'theater')).toBe(false)
  })
})

describe('stopMediaStreamTracks', () => {
  it('stops every track on the stream', () => {
    const stops: string[] = []
    const stream = {
      getTracks: () => [
        { stop: () => stops.push('video') },
        { stop: () => stops.push('audio') },
      ],
    } as unknown as MediaStream
    stopMediaStreamTracks(stream)
    expect(stops).toEqual(['video', 'audio'])
  })
})
