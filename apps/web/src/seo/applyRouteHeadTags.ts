import type { RouteHeadTags } from './routeHeadTags'

function upsertMetaByName(name: string): HTMLMetaElement {
  const existing = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (existing) {
    return existing
  }
  const meta = document.createElement('meta')
  meta.setAttribute('name', name)
  document.head.appendChild(meta)
  return meta
}

function upsertMetaByProperty(property: string): HTMLMetaElement {
  const existing = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`)
  if (existing) {
    return existing
  }
  const meta = document.createElement('meta')
  meta.setAttribute('property', property)
  document.head.appendChild(meta)
  return meta
}

function upsertCanonicalLink(): HTMLLinkElement {
  const existing = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (existing) {
    return existing
  }
  const link = document.createElement('link')
  link.setAttribute('rel', 'canonical')
  document.head.appendChild(link)
  return link
}

function removeMetaByProperty(property: string): void {
  document.head.querySelector(`meta[property="${property}"]`)?.remove()
}

function removeCanonicalLink(): void {
  document.head.querySelector('link[rel="canonical"]')?.remove()
}

export function applyRouteHeadTags(head: RouteHeadTags): void {
  document.title = head.documentTitle

  upsertMetaByName('description').setAttribute('content', head.description)

  if (head.canonicalUrl) {
    upsertCanonicalLink().setAttribute('href', head.canonicalUrl)
    upsertMetaByProperty('og:url').setAttribute('content', head.canonicalUrl)
  } else {
    removeCanonicalLink()
    removeMetaByProperty('og:url')
  }

  const robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')
  if (head.robotsNoindex) {
    upsertMetaByName('robots').setAttribute('content', 'noindex')
  } else {
    robots?.remove()
  }

  upsertMetaByProperty('og:title').setAttribute('content', head.ogTitle)
  upsertMetaByProperty('og:description').setAttribute('content', head.description)
  upsertMetaByProperty('og:image').setAttribute('content', head.ogImageUrl)
  upsertMetaByName('twitter:title').setAttribute('content', head.ogTitle)
  upsertMetaByName('twitter:description').setAttribute('content', head.description)
  upsertMetaByName('twitter:image').setAttribute('content', head.ogImageUrl)
}
