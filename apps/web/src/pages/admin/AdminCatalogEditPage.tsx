import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { refreshStaffTokensIfStale } from '../../auth/staffHostedUiPkce'
import { getStaffAccessToken } from '../../auth/staffTokens'
import {
  fetchStaffCatalogEpisode,
  StaffCatalogEpisodeNotFoundError,
  type StaffCatalogEpisode,
} from '../../api/staffAdminCatalogApi'
import {
  StaffSessionForbiddenError,
  StaffSessionUnauthorizedError,
} from '../../api/staffAdminSessionApi'
import { catalogEpisodeToFormValues } from '../../catalog/validateCatalogEpisodeForm'
import { AdminCatalogForm } from './AdminCatalogForm'

function AdminCatalogEditMissingId() {
  return (
    <div className="container riffsync-admin-page">
      <div role="alert" className="riffsync-scaffold-note">
        <p>Missing episode id in URL.</p>
        <p>
          <Link to="/admin/catalog">Back to catalog</Link>
        </p>
      </div>
    </div>
  )
}

function AdminCatalogEditPageLoaded({ episodeId }: { episodeId: string }) {
  const [episode, setEpisode] = useState<StaffCatalogEpisode | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        await refreshStaffTokensIfStale()
        const token = getStaffAccessToken()
        if (!token) {
          if (!cancelled) setError('Operator sign-in required')
          return
        }
        const response = await fetchStaffCatalogEpisode(token, episodeId)
        if (!cancelled) setEpisode(response.entry)
      } catch (e: unknown) {
        if (cancelled) return
        if (e instanceof StaffCatalogEpisodeNotFoundError) {
          setError('Episode not found.')
        } else if (
          e instanceof StaffSessionUnauthorizedError ||
          e instanceof StaffSessionForbiddenError
        ) {
          setError(e.message)
        } else {
          setError(e instanceof Error ? e.message : 'Could not load episode')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [episodeId])

  if (loading) {
    return (
      <div className="container riffsync-admin-page">
        <p className="riffsync-admin-catalog-form-loading">Loading episode…</p>
      </div>
    )
  }

  if (error || !episode) {
    const showLogin =
      error === 'Operator sign-in required' ||
      (error?.includes('Staff group') ?? false) ||
      (error?.toLowerCase().includes('unauthorized') ?? false)

    return (
      <div className="container riffsync-admin-page">
        <div role="alert" className="riffsync-scaffold-note">
          <p>{error ?? 'Episode not found.'}</p>
          {showLogin ? (
            <p>
              <a href="/admin/login">Try operator sign-in again</a>
            </p>
          ) : (
            <p>
              <Link to="/admin/catalog">Back to catalog</Link>
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <AdminCatalogForm
      mode="edit"
      initialEpisode={episode}
      initialValues={catalogEpisodeToFormValues(episode)}
      breadcrumbLeaf="Edit"
      pageTitle="Edit episode"
    />
  )
}

export function AdminCatalogEditPage() {
  const { id: routeId } = useParams<{ id: string }>()
  const episodeId = routeId ? decodeURIComponent(routeId) : ''

  if (!episodeId) {
    return <AdminCatalogEditMissingId />
  }

  return <AdminCatalogEditPageLoaded episodeId={episodeId} />
}
