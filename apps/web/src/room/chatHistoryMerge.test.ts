import { describe, expect, it } from 'vitest'
import { mergeChatHistory } from './chatHistoryMerge'
import type { ChatLine } from './roomPageTypes'

describe('mergeChatHistory', () => {
  const existing: ChatLine[] = [
    {
      kind: 'text',
      messageId: 'm-live',
      sessionId: 'sess-live',
      text: 'live only',
      ts: 3000,
    },
  ]

  it('merges by messageId, sorts chronologically, and replaces reaction chips for snapshot ids', () => {
    const merged = mergeChatHistory(
      existing,
      {
        'm-live': { '👍': { count: 1, reactedByMe: false } },
        'm-old': { '🔥': { count: 2, reactedByMe: true } },
      },
      {
        messages: [
          {
            kind: 'text',
            messageId: 'm-old',
            sessionId: 'sess-a',
            text: 'older',
            ts: 1000,
          },
          {
            kind: 'text',
            messageId: 'm-live',
            sessionId: 'sess-live',
            text: 'updated live',
            ts: 3000,
          },
        ],
        reactions: {
          'm-old': { '🔥': { count: 3, reactedByMe: true } },
          'm-live': { '👍': { count: 4, reactedByMe: true } },
        },
      },
    )

    expect(merged.chat.map((line) => line.messageId)).toEqual(['m-old', 'm-live'])
    expect(merged.chat[1]?.kind === 'text' ? merged.chat[1].text : '').toBe('updated live')
    expect(merged.chatReactions).toEqual({
      'm-old': { '🔥': { count: 3, reactedByMe: true } },
      'm-live': { '👍': { count: 4, reactedByMe: true } },
    })
  })
})
