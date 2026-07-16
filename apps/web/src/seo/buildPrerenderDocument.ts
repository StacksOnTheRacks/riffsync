import type { RouteHeadTags } from './routeHeadTags'

function escapeHtmlText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
}

function replaceTitle(html: string, title: string): string {
  return html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtmlText(title)}</title>`)
}

function replaceMetaDescription(html: string, description: string): string {
  const meta = `<meta\n      name="description"\n      content="${escapeHtmlAttribute(description)}"\n    />`
  if (/<meta\s+name="description"[\s\S]*?\/>/.test(html)) {
    return html.replace(/<meta\s+name="description"[\s\S]*?\/>/, meta)
  }
  return html.replace('</title>', `</title>\n    ${meta}`)
}

function replaceCanonicalLink(html: string, canonicalUrl: string | null): string {
  if (canonicalUrl == null) {
    return html.replace(/\s*<link rel="canonical"[^>]*>\s*/g, '\n')
  }
  const link = `<link rel="canonical" href="${escapeHtmlAttribute(canonicalUrl)}" />`
  if (/<link rel="canonical"[^>]*>/.test(html)) {
    return html.replace(/<link rel="canonical"[^>]*>/, link)
  }
  return html.replace(
    /<meta\s+name="description"[\s\S]*?\/>/,
    (match) => `${match}\n    ${link}`,
  )
}

function replaceRobotsMeta(html: string, noindex: boolean): string {
  const withoutRobots = html.replace(/\s*<meta name="robots" content="noindex"[^>]*>\s*/g, '\n')
  if (!noindex) {
    return withoutRobots
  }
  return withoutRobots.replace(
    /<meta\s+name="description"[\s\S]*?\/>/,
    (match) => `${match}\n    <meta name="robots" content="noindex" />`,
  )
}

function replaceMetaProperty(html: string, property: string, content: string): string {
  const escaped = escapeHtmlAttribute(content)
  const pattern = new RegExp(
    `<meta property="${property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" content="[^"]*" />`,
  )
  const replacement = `<meta property="${property}" content="${escaped}" />`
  if (pattern.test(html)) {
    return html.replace(pattern, replacement)
  }
  return html
}

function replaceMetaName(html: string, name: string, content: string): string {
  const escaped = escapeHtmlAttribute(content)
  const pattern = new RegExp(
    `<meta name="${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" content="[^"]*" />`,
  )
  const replacement = `<meta name="${name}" content="${escaped}" />`
  if (pattern.test(html)) {
    return html.replace(pattern, replacement)
  }
  return html
}

/** Inject per-route head tags into the Vite HTML shell without changing body markup. */
export function buildPrerenderDocument(templateHtml: string, head: RouteHeadTags): string {
  let html = templateHtml
  html = replaceTitle(html, head.documentTitle)
  html = replaceMetaDescription(html, head.description)
  html = replaceCanonicalLink(html, head.canonicalUrl)
  html = replaceRobotsMeta(html, head.robotsNoindex)

  const ogUrl = head.canonicalUrl ?? ''
  html = replaceMetaProperty(html, 'og:title', head.ogTitle)
  html = replaceMetaProperty(html, 'og:description', head.description)
  if (ogUrl) {
    html = replaceMetaProperty(html, 'og:url', ogUrl)
  }
  html = replaceMetaProperty(html, 'og:image', head.ogImageUrl)

  html = replaceMetaName(html, 'twitter:title', head.ogTitle)
  html = replaceMetaName(html, 'twitter:description', head.description)
  html = replaceMetaName(html, 'twitter:image', head.ogImageUrl)

  return html
}
