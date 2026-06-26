import { useCallback, useMemo, useState } from 'react'
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
      const text = block.type === 'bulletedList' || block.type === 'numberedList'
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

  const blockLabels = useMemo(
    () => ({
      paragraph: 'Paragraph',
      heading: 'Heading',
      bulletedList: 'Bulleted list',
      numberedList: 'Numbered list',
    }),
    [],
  )

  return {
    content,
    setContent,
    setBlockText,
    setBlockType,
    toggleInline,
    addBlock,
    removeBlock,
    blockLabels,
  }
}

export function EmailBlockEditor(props: {
  index: number
  block: EmailBlock
  onTextChange: (index: number, text: string) => void
  onTypeChange: (index: number, type: BlockType) => void
  onToggleBold: (index: number) => void
  onToggleItalic: (index: number) => void
  onRemove: (index: number) => void
  canRemove: boolean
}) {
  const { index, block, onTextChange, onTypeChange, onToggleBold, onToggleItalic, onRemove, canRemove } =
    props

  const text =
    block.type === 'bulletedList' || block.type === 'numberedList'
      ? spanText(block.items[0] ?? [{ type: 'text', text: '' }])
      : spanText(block.children)

  const isInlineBlock = block.type === 'paragraph' || block.type === 'heading'
  const bold = isInlineBlock ? Boolean(block.children[0]?.bold) : false
  const italic = isInlineBlock ? Boolean(block.children[0]?.italic) : false

  return (
    <div className="riffsync-email-block">
      <div className="riffsync-email-block__toolbar">
        <select
          aria-label={`Block ${index + 1} type`}
          value={block.type}
          onChange={(e) => onTypeChange(index, e.target.value as BlockType)}
        >
          <option value="paragraph">Paragraph</option>
          <option value="heading">Heading</option>
          <option value="bulletedList">Bulleted list</option>
          <option value="numberedList">Numbered list</option>
        </select>
        {isInlineBlock ? (
          <>
            <button type="button" className={bold ? 'is-active' : ''} onClick={() => onToggleBold(index)}>
              Bold
            </button>
            <button
              type="button"
              className={italic ? 'is-active' : ''}
              onClick={() => onToggleItalic(index)}
            >
              Italic
            </button>
          </>
        ) : null}
        {canRemove ? (
          <button type="button" className="btn btn-secondary" onClick={() => onRemove(index)}>
            Remove
          </button>
        ) : null}
      </div>
      <textarea
        aria-label={`Block ${index + 1} text`}
        rows={block.type === 'heading' ? 2 : 4}
        value={text}
        onChange={(e) => onTextChange(index, e.target.value)}
      />
    </div>
  )
}
