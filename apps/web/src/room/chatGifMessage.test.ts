import { describe, expect, it } from 'vitest'
import { parseInboundChatGifMessage } from './chatGifMessage'

describe('parseInboundChatGifMessage', () => {
  it('parses a valid chat_gif fan-out payload', () => {
    const parsed = parseInboundChatGifMessage({
      type: 'chat_gif',
      sessionId: 'sess-1',
      messageId: 'msg-uuid',
      giphyId: 'abc123',
      renditionUrl: 'https://media0.giphy.com/media/abc123/giphy.gif',
      title: 'Wave',
      width: 480,
      height: 270,
      ts: 1_700_000_000_000,
      displayName: 'Fan',
      avatarUrl: 'https://cdn.example.test/a.png',
    })

    expect(parsed).toEqual({
      messageId: 'msg-uuid',
      sessionId: 'sess-1',
      giphyId: 'abc123',
      renditionUrl: 'https://media0.giphy.com/media/abc123/giphy.gif',
      title: 'Wave',
      width: 480,
      height: 270,
      ts: 1_700_000_000_000,
      displayName: 'Fan',
      avatarUrl: 'https://cdn.example.test/a.png',
    })
  })

  it('returns null when messageId is invalid', () => {
    expect(
      parseInboundChatGifMessage({
        sessionId: 'sess-1',
        messageId: '',
        giphyId: 'x',
        renditionUrl: 'https://media0.giphy.com/media/x/giphy.gif',
      }),
    ).toBeNull()
  })

  it('returns null when giphyId or renditionUrl is missing', () => {
    expect(
      parseInboundChatGifMessage({
        sessionId: 'sess-1',
        messageId: 'id-1',
        giphyId: '  ',
        renditionUrl: 'https://media0.giphy.com/media/x/giphy.gif',
      }),
    ).toBeNull()
    expect(
      parseInboundChatGifMessage({
        sessionId: 'sess-1',
        messageId: 'id-1',
        giphyId: 'x',
        renditionUrl: '',
      }),
    ).toBeNull()
  })
})
