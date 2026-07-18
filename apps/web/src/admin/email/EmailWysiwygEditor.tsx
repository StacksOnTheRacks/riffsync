import { useEffect, useRef, useState } from 'react'
import Link from '@tiptap/extension-link'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  EMAIL_CONTENT_VERSION,
  FIRST_NAME_MERGE_TOKEN,
  normalizeEmailHtml,
  type EmailContent,
} from './emailContentModel'

type EditorMode = 'visual' | 'source'

export function EmailWysiwygEditor(props: {
  content: EmailContent
  onChange: (content: EmailContent) => void
}) {
  const { content, onChange } = props
  const [mode, setMode] = useState<EditorMode>('visual')
  const sourceRef = useRef<HTMLTextAreaElement | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Link.configure({
        autolink: true,
        defaultProtocol: 'https',
        openOnClick: false,
      }),
    ],
    content: content.html,
    editorProps: {
      attributes: {
        class: 'riffsync-email-wysiwyg__surface',
        'aria-label': 'Email body visual editor',
      },
    },
    onUpdate: ({ editor: nextEditor }) => {
      if (mode === 'visual') {
        onChange({ version: EMAIL_CONTENT_VERSION, html: nextEditor.getHTML() })
      }
    },
  })

  useEffect(() => {
    if (!editor || mode !== 'visual' || editor.getHTML() === content.html) {
      return
    }
    editor.commands.setContent(content.html, { emitUpdate: false })
  }, [content.html, editor, mode])

  const setVisualMode = () => {
    setMode('visual')
    if (editor) {
      editor.commands.setContent(normalizeEmailHtml(content.html), { emitUpdate: false })
    }
  }

  const insertFirstNameToken = () => {
    if (mode === 'source') {
      const textarea = sourceRef.current
      const start = textarea?.selectionStart ?? content.html.length
      const end = textarea?.selectionEnd ?? start
      const html = `${content.html.slice(0, start)}${FIRST_NAME_MERGE_TOKEN}${content.html.slice(end)}`
      onChange({ version: EMAIL_CONTENT_VERSION, html })
      window.requestAnimationFrame(() => {
        textarea?.focus()
        textarea?.setSelectionRange(
          start + FIRST_NAME_MERGE_TOKEN.length,
          start + FIRST_NAME_MERGE_TOKEN.length,
        )
      })
      return
    }

    editor?.chain().focus().insertContent(FIRST_NAME_MERGE_TOKEN).run()
  }

  const setLink = () => {
    if (!editor) return
    const previousUrl = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Paste an https link', previousUrl ?? 'https://')
    if (url === null) return
    const trimmed = url.trim()
    if (trimmed.length === 0) {
      editor.chain().focus().unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run()
  }

  return (
    <div className="riffsync-email-wysiwyg">
      <div className="riffsync-email-wysiwyg__toolbar" aria-label="Email editor toolbar">
        <button
          type="button"
          className={mode === 'visual' ? 'is-active' : ''}
          onClick={setVisualMode}
        >
          Visual
        </button>
        <button
          type="button"
          className={mode === 'source' ? 'is-active' : ''}
          onClick={() => setMode('source')}
        >
          HTML
        </button>
        <span className="riffsync-email-wysiwyg__divider" aria-hidden="true" />
        <button
          type="button"
          className={editor?.isActive('bold') ? 'is-active' : ''}
          disabled={mode !== 'visual' || !editor}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          Bold
        </button>
        <button
          type="button"
          className={editor?.isActive('italic') ? 'is-active' : ''}
          disabled={mode !== 'visual' || !editor}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          Italic
        </button>
        <button
          type="button"
          className={editor?.isActive('heading', { level: 2 }) ? 'is-active' : ''}
          disabled={mode !== 'visual' || !editor}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          Heading
        </button>
        <button
          type="button"
          className={editor?.isActive('bulletList') ? 'is-active' : ''}
          disabled={mode !== 'visual' || !editor}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          Bullets
        </button>
        <button
          type="button"
          className={editor?.isActive('orderedList') ? 'is-active' : ''}
          disabled={mode !== 'visual' || !editor}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          Numbers
        </button>
        <button
          type="button"
          className={editor?.isActive('link') ? 'is-active' : ''}
          disabled={mode !== 'visual' || !editor}
          onClick={setLink}
        >
          Link
        </button>
        <button type="button" onClick={insertFirstNameToken}>
          Insert first name
        </button>
      </div>

      {mode === 'visual' ? (
        <EditorContent editor={editor} />
      ) : (
        <textarea
          ref={sourceRef}
          aria-label="Email body HTML source"
          className="riffsync-email-wysiwyg__source"
          rows={16}
          value={content.html}
          onChange={(e) => onChange({ version: EMAIL_CONTENT_VERSION, html: e.target.value })}
        />
      )}

      <p className="riffsync-email-wysiwyg__help">
        Paste HTML here or switch to HTML mode for source edits. Use <code>{FIRST_NAME_MERGE_TOKEN}</code> for each
        customer&apos;s first name.
      </p>
    </div>
  )
}
