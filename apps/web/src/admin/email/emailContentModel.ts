export const EMAIL_CONTENT_VERSION = 1 as const
export const BROADCAST_CONFIRMATION_PHRASE = 'SEND TO CUSTOMERS'

export type InlineSpan =
  | { type: 'text'; text: string; bold?: boolean; italic?: boolean }
  | { type: 'link'; text: string; href: string; bold?: boolean; italic?: boolean }

export type EmailBlock =
  | { type: 'paragraph'; children: InlineSpan[] }
  | { type: 'heading'; level: 1 | 2 | 3; children: InlineSpan[] }
  | { type: 'bulletedList'; items: InlineSpan[][] }
  | { type: 'numberedList'; items: InlineSpan[][] }

export type EmailContent = {
  version: typeof EMAIL_CONTENT_VERSION
  blocks: EmailBlock[]
}

export function emptyEmailContent(): EmailContent {
  return {
    version: EMAIL_CONTENT_VERSION,
    blocks: [{ type: 'paragraph', children: [{ type: 'text', text: '' }] }],
  }
}

export async function computeEmailContentHash(subject: string, content: EmailContent): Promise<string> {
  const payload = JSON.stringify({ subject, content })
  const data = new TextEncoder().encode(payload)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderInlineSpanHtml(span: InlineSpan): string {
  let inner =
    span.type === 'link'
      ? `<a href="${escapeHtml(span.href.trim())}">${escapeHtml(span.text)}</a>`
      : escapeHtml(span.text)
  if (span.bold) inner = `<strong>${inner}</strong>`
  if (span.italic) inner = `<em>${inner}</em>`
  return inner
}

function renderInlineSpansHtml(spans: InlineSpan[]): string {
  return spans.map(renderInlineSpanHtml).join('')
}

export function renderEmailPreviewHtml(subject: string, content: EmailContent): string {
  const bodyParts: string[] = []
  for (const block of content.blocks) {
    if (block.type === 'paragraph') {
      bodyParts.push(`<p>${renderInlineSpansHtml(block.children)}</p>`)
    } else if (block.type === 'heading') {
      const tag = block.level === 1 ? 'h1' : block.level === 2 ? 'h2' : 'h3'
      bodyParts.push(`<${tag}>${renderInlineSpansHtml(block.children)}</${tag}>`)
    } else if (block.type === 'bulletedList') {
      bodyParts.push(
        `<ul>${block.items.map((item) => `<li>${renderInlineSpansHtml(item)}</li>`).join('')}</ul>`,
      )
    } else if (block.type === 'numberedList') {
      bodyParts.push(
        `<ol>${block.items.map((item) => `<li>${renderInlineSpansHtml(item)}</li>`).join('')}</ol>`,
      )
    }
  }

  return `<article class="riffsync-email-preview">
    <header><p class="riffsync-email-preview__brand">RiffSync</p><h2>${escapeHtml(subject || 'Subject')}</h2></header>
    <div class="riffsync-email-preview__body">${bodyParts.join('')}</div>
  </article>`
}

export function emailContentHasText(content: EmailContent): boolean {
  for (const block of content.blocks) {
    if (block.type === 'paragraph' || block.type === 'heading') {
      if (block.children.some((span) => span.text.trim().length > 0)) return true
    } else {
      for (const item of block.items) {
        if (item.some((span) => span.text.trim().length > 0)) return true
      }
    }
  }
  return false
}
