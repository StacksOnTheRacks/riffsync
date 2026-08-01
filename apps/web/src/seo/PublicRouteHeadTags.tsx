import { useEffect } from 'react'
import { matchPath, useLocation } from 'react-router-dom'
import { useCatalogEpisodeQuery } from '../catalog/catalogQueries'
import { getPublicOrigin } from '../config/publicOrigin'
import { useLiveChannelQuery } from '../live/liveQueries'
import { STATIC_INDEXABLE_ROUTES, type StaticIndexableRoute } from './indexableRoutes'
import { applyRouteHeadTags } from './applyRouteHeadTags'
import {
  buildLiveRouteHeadTags,
  buildSpaShellHeadTags,
  buildStaticRouteHeadTags,
  buildWatchRouteHeadTags,
} from './routeHeadTags'

const NOINDEX_PREFIXES = ['/admin/', '/room/'] as const
const NOINDEX_PATHS = new Set([
  '/account',
  '/admin',
  '/admin/auth/callback',
  '/admin/login',
  '/auth/callback',
  '/cast/receiver',
  '/lobby',
  '/privacy/data-removal',
])

function isStaticIndexableRoute(pathname: string): pathname is StaticIndexableRoute {
  return STATIC_INDEXABLE_ROUTES.includes(pathname as StaticIndexableRoute)
}

function isNoindexPath(pathname: string): boolean {
  return NOINDEX_PATHS.has(pathname) || NOINDEX_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export function PublicRouteHeadTags() {
  const location = useLocation()
  const watchMatch = matchPath('/watch/:catalogEpisodeId', location.pathname)
  const liveMatch = matchPath('/live/:slug', location.pathname)
  const watchEpisodeId = watchMatch?.params.catalogEpisodeId
  const liveSlug = liveMatch?.params.slug
  const partyCapture = new URLSearchParams(location.search).get('partyCapture') === '1'
  const episodeQuery = useCatalogEpisodeQuery(watchEpisodeId)
  const liveQuery = useLiveChannelQuery(liveSlug)

  useEffect(() => {
    const origin = getPublicOrigin()

    if (isStaticIndexableRoute(location.pathname)) {
      applyRouteHeadTags(buildStaticRouteHeadTags(location.pathname, origin))
      return
    }

    if (watchEpisodeId && !partyCapture) {
      if (episodeQuery.data) {
        applyRouteHeadTags(buildWatchRouteHeadTags(episodeQuery.data, origin))
      } else if (!episodeQuery.isPending) {
        applyRouteHeadTags(buildSpaShellHeadTags())
      }
      return
    }

    if (liveSlug) {
      if (liveQuery.data) {
        applyRouteHeadTags(buildLiveRouteHeadTags(liveQuery.data, origin))
      } else if (!liveQuery.isPending) {
        applyRouteHeadTags(buildSpaShellHeadTags())
      }
      return
    }

    if (watchEpisodeId || isNoindexPath(location.pathname)) {
      applyRouteHeadTags(buildSpaShellHeadTags())
    }
  }, [
    episodeQuery.data,
    episodeQuery.isPending,
    liveQuery.data,
    liveQuery.isPending,
    liveSlug,
    location.pathname,
    partyCapture,
    watchEpisodeId,
  ])

  return null
}
