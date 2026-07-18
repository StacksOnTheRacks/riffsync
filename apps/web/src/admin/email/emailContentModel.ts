export const EMAIL_CONTENT_VERSION = 2 as const
export const BROADCAST_CONFIRMATION_PHRASE = 'SEND TO CUSTOMERS'
export const FIRST_NAME_MERGE_TOKEN = '{{first_name}}'

export type EmailContent = {
  version: typeof EMAIL_CONTENT_VERSION
  html: string
}

export function emptyEmailContent(): EmailContent {
  return {
    version: EMAIL_CONTENT_VERSION,
    html: '<p></p>',
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

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function extractBodyHtml(html: string): string {
  const match = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html)
  return match?.[1] ?? html
}

function sanitizePreviewHtml(html: string): string {
  const document = new DOMParser().parseFromString(extractBodyHtml(html), 'text/html')
  const allowedTags = new Set([
    'A',
    'B',
    'BLOCKQUOTE',
    'BR',
    'DIV',
    'EM',
    'H1',
    'H2',
    'H3',
    'HR',
    'I',
    'IMG',
    'LI',
    'OL',
    'P',
    'SPAN',
    'STRONG',
    'TABLE',
    'TBODY',
    'TD',
    'TH',
    'THEAD',
    'TR',
    'U',
    'UL',
  ])
  const dropTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED'])

  for (const element of Array.from(document.body.querySelectorAll('*'))) {
    if (dropTags.has(element.tagName)) {
      element.remove()
      continue
    }
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes))
      continue
    }

    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase()
      const value = attr.value.trim()
      if (name.startsWith('on') || name === 'style') {
        element.removeAttribute(attr.name)
        continue
      }
      if ((name === 'href' || name === 'src') && !/^https:\/\//i.test(value)) {
        element.removeAttribute(attr.name)
        continue
      }
      if (!['href', 'src', 'alt', 'title', 'width', 'height', 'align', 'colspan', 'rowspan'].includes(name)) {
        element.removeAttribute(attr.name)
      }
    }
  }

  for (const anchor of Array.from(document.body.querySelectorAll('a[href]'))) {
    anchor.setAttribute('target', '_blank')
    anchor.setAttribute('rel', 'noopener noreferrer')
  }

  return document.body.innerHTML.trim()
}

export function applyPreviewMergeTokens(value: string, mode: 'html' | 'text' = 'html'): string {
  const firstName = mode === 'html' ? escapeHtml('Alex') : 'Alex'
  return value.replace(/\{\{\s*first_name\s*\}\}/g, firstName)
}

export function normalizeEmailHtml(html: string): string {
  return extractBodyHtml(html).trim()
}

export function renderEmailPreviewHtml(subject: string, content: EmailContent): string {
  const previewSubject = applyPreviewMergeTokens(subject || 'Subject', 'text')
  const previewBody = applyPreviewMergeTokens(sanitizePreviewHtml(content.html), 'html')

  return `<article class="riffsync-email-preview">
    <header><p class="riffsync-email-preview__brand">RiffSync</p><h2>${escapeHtml(previewSubject)}</h2></header>
    <div class="riffsync-email-preview__body">${previewBody}</div>
  </article>`
}

export function emailContentHasText(content: EmailContent): boolean {
  const document = new DOMParser().parseFromString(sanitizePreviewHtml(content.html), 'text/html')
  return (document.body.textContent ?? '').trim().length > 0
}
