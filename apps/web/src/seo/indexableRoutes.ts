/** Static indexable paths shared by sitemap, prerender, and tests. */
export const STATIC_INDEXABLE_ROUTES = [
  '/',
  '/catalog',
  '/catalog/mst3k',
  '/catalog/community',
  '/catalog/riff-material',
  '/download',
  '/how-to-host-a-watchparty',
  '/terms',
  '/privacy',
] as const

export type StaticIndexableRoute = (typeof STATIC_INDEXABLE_ROUTES)[number]

/** Dist path relative to `apps/web/dist/` for a static indexable route. */
export function staticRouteDistPath(route: StaticIndexableRoute): string {
  if (route === '/') {
    return 'index.html'
  }
  return `${route.slice(1)}/index.html`
}
