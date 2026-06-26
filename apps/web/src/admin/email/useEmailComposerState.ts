import { useCallback, useState } from 'react'
import type { EmailBlock, EmailContent, InlineSpan } from './emailContentModel'

type BlockType = EmailBlock['type']

function cloneContent(content: EmailContent): EmailContent {
  return JSON.parse(JSON.stringify(content)) as EmailContent
}

function updateBlock(content: EmailContent, index: number, block: EmailBlock): EmailContent {
  const next = cloneContent(content)
  next.blocks[index] = block
  return next
}

function spanText(spans: InlineSpan[]): string {
  return spans.map((span) => span.text).join('')
}

function setSpanText(spans: InlineSpan[], text: string): InlineSpan[] {
  if (spans.length === 0) {
    return [{ type: 'text', text }]
  }
  const [first, ...rest] = spans
  return [{ ...first, text }, ...rest]
}

export function useEmailComposerState(initial: EmailContent) {
  const [content, setContent] = useState<EmailContent>(initial)

  const setBlockText = useCallback((index: number, text: string) => {
    setContent((prev) => {
      const block = prev.blocks[index]
      if (block.type === 'paragraph' || block.type === 'heading') {
        return updateBlock(prev, index, { ...block, children: setSpanText(block.children, text) })
      }
      return prev
    })
  }, [])

  const setBlockType = useCallback((index: number, type: BlockType) => {
    setContent((prev) => {
      const block = prev.blocks[index]
      const text =
        block.type === 'bulletedList' || block.type === 'numberedList'
          ? spanText(block.items[0] ?? [{ type: 'text', text: '' }])
          : spanText(block.children)
      if (type === 'paragraph') {
        return updateBlock(prev, index, { type: 'paragraph', children: [{ type: 'text', text }] })
      }
      if (type === 'heading') {
        return updateBlock(prev, index, { type: 'heading', level: 2, children: [{ type: 'text', text }] })
      }
      if (type === 'bulletedList' || type === 'numberedList') {
        return updateBlock(prev, index, {
          type,
          items: [[{ type: 'text', text }]],
        })
      }
      return prev
    })
  }, [])

  const toggleInline = useCallback((index: number, style: 'bold' | 'italic') => {
    setContent((prev) => {
      const block = prev.blocks[index]
      if (block.type !== 'paragraph' && block.type !== 'heading') return prev
      const children = block.children.map((span) => ({ ...span, [style]: !span[style] }))
      return updateBlock(prev, index, { ...block, children })
    })
  }, [])

  const addBlock = useCallback(() => {
    setContent((prev) => ({
      ...prev,
      blocks: [...prev.blocks, { type: 'paragraph', children: [{ type: 'text', text: '' }] }],
    }))
  }, [])

  const removeBlock = useCallback((index: number) => {
    setContent((prev) => {
      if (prev.blocks.length <= 1) return prev
      return { ...prev, blocks: prev.blocks.filter((_, i) => i !== index) }
    })
  }, [])

  return {
    content,
    setBlockText,
    setBlockType,
    toggleInline,
    addBlock,
    removeBlock,
  }
}
