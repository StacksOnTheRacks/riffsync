import type { EmailBlock } from './emailContentModel'

type BlockType = EmailBlock['type']

function spanText(spans: { text: string }[]): string {
  return spans.map((span) => span.text).join('')
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
