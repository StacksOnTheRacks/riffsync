import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { refreshStaffTokensIfStale } from '../../auth/staffHostedUiPkce'
import { getStaffAccessToken } from '../../auth/staffTokens'
import {
  fetchStaffCatalogList,
  type StaffCatalogEpisode,
} from '../../api/staffAdminCatalogApi'
import {
  StaffSessionForbiddenError,
  StaffSessionUnauthorizedError,
} from '../../api/staffAdminSessionApi'
import {
  filterStaffCatalogEntries,
  type StaffCatalogFilterCatalog,
} from '../../catalog/filterStaffCatalogEntries'
import { CATALOG_CATEGORIES, formatCatalogLabel } from '../../catalog/catalogTypes'

const SAVED_BANNER_TIMEOUT_MS = 5000

function posterThumbUrl(entry: StaffCatalogEpisode): string | null {
  return entry.posterImageUrl ?? entry.youtubeThumbnailUrl ?? null
}

export function AdminCatalogListPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [entries, setEntries] = useState<StaffCatalogEpisode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [catalog, setCatalog] = useState<StaffCatalogFilterCatalog>('all')

  const savedFromState = (location.state as { saved?: boolean } | null)?.saved === true
  const savedFromQuery = searchParams.get('saved') === '1'
  const [savedBannerVisible, setSavedBannerVisible] = useState(savedFromState || savedFromQuery)

  const deletedFromState = (location.state as { deleted?: boolean } | null)?.deleted === true
  const deletedFromQuery = searchParams.get('deleted') === '1'
  const [deletedBannerVisible, setDeletedBannerVisible] = useState(
    deletedFromState || deletedFromQuery,
  )

  const dismissSavedBanner = useCallback(() => {
    setSavedBannerVisible(false)
    if (savedFromState) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: {} })
    }
    if (savedFromQuery) {
      const next = new URLSearchParams(searchParams)
      next.delete('saved')
      setSearchParams(next, { replace: true })
    }
  }, [location.pathname, location.search, navigate, savedFromQuery, savedFromState, searchParams, setSearchParams])

  const dismissDeletedBanner = useCallback(() => {
    setDeletedBannerVisible(false)
    if (deletedFromState) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: {} })
    }
    if (deletedFromQuery) {
      const next = new URLSearchParams(searchParams)
      next.delete('deleted')
      setSearchParams(next, { replace: true })
    }
  }, [
    deletedFromQuery,
    deletedFromState,
    location.pathname,
    location.search,
    navigate,
    searchParams,
    setSearchParams,
  ])

  useEffect(() => {
    if (!savedBannerVisible) return
    const timer = window.setTimeout(() => dismissSavedBanner(), SAVED_BANNER_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [dismissSavedBanner, savedBannerVisible])

  useEffect(() => {
    if (!deletedBannerVisible) return
    const timer = window.setTimeout(() => dismissDeletedBanner(), SAVED_BANNER_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [deletedBannerVisible, dismissDeletedBanner])

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
        const response = await fetchStaffCatalogList(token)
        if (!cancelled) setEntries(response.entries)
      } catch (e: unknown) {
        if (cancelled) return
        if (e instanceof StaffSessionUnauthorizedError || e instanceof StaffSessionForbiddenError) {
          setError(e.message)
        } else {
          setError(e instanceof Error ? e.message : 'Could not load catalog')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const filteredEntries = useMemo(
    () => filterStaffCatalogEntries(entries, { query, catalog }),
    [entries, query, catalog],
  )

  const isEmptyCatalog = !loading && !error && entries.length === 0
  const isFilterNoMatch = !loading && !error && entries.length > 0 && filteredEntries.length === 0

  return (
    <div className="container riffsync-admin-page riffsync-admin-catalog-page">
      <header className="riffsync-admin-catalog-header">
        <h1>Catalog</h1>
        <div className="riffsync-admin-catalog-toolbar">
          <label className="riffsync-admin-catalog-search">
            <span className="sr-only">Search catalog</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by id, title, #, tag, or label"
              disabled={loading || Boolean(error)}
            />
          </label>
          <label className="riffsync-admin-catalog-era">
            <span className="sr-only">Filter by catalog</span>
            <select
              value={catalog}
              onChange={(e) => setCatalog(e.target.value as StaffCatalogFilterCatalog)}
              disabled={loading || Boolean(error)}
            >
              <option value="all">All catalogs</option>
              {CATALOG_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {formatCatalogLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <Link to="/admin/catalog/new" className="btn btn-primary riffsync-admin-catalog-add">
            Add episode
          </Link>
        </div>
      </header>

      {savedBannerVisible ? (
        <div role="status" className="riffsync-admin-catalog-saved-banner">
          <p>Episode saved</p>
          <button type="button" className="btn btn-secondary" onClick={dismissSavedBanner}>
            Dismiss
          </button>
        </div>
      ) : null}

      {deletedBannerVisible ? (
        <div role="status" className="riffsync-admin-catalog-saved-banner">
          <p>Episode deleted.</p>
          <button type="button" className="btn btn-secondary" onClick={dismissDeletedBanner}>
            Dismiss
          </button>
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="riffsync-scaffold-note">
          <p>{error}</p>
          <p>
            <a href="/admin/login">Try operator sign-in again</a>
          </p>
        </div>
      ) : null}

      {loading ? (
        <p className="riffsync-admin-catalog-loading">Loading catalog…</p>
      ) : null}

      {!loading && !error && isEmptyCatalog ? (
        <div className="riffsync-admin-catalog-empty">
          <p>No episodes in catalog yet.</p>
          <p>
            <Link to="/admin/catalog/new" className="btn btn-primary riffsync-admin-catalog-add">
              Add episode
            </Link>
          </p>
        </div>
      ) : null}

      {!loading && !error && isFilterNoMatch ? (
        <div className="riffsync-admin-catalog-no-match">
          <p>No episodes match your search.</p>
          <p className="riffsync-admin-catalog-no-match-hint">
            Clear the search field or set catalog to All catalogs to see all episodes.
          </p>
        </div>
      ) : null}

      {!loading && !error && filteredEntries.length > 0 ? (
        <div className="riffsync-admin-catalog-table-wrap">
          <table className="riffsync-admin-catalog-table">
            <thead>
              <tr>
                <th scope="col">id</th>
                <th scope="col">#</th>
                <th scope="col">Poster</th>
                <th scope="col">title</th>
                <th scope="col">catalog</th>
                <th scope="col">labels</th>
                <th scope="col">hero</th>
                <th scope="col">spotlight</th>
                <th scope="col">YouTube</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => {
                const thumb = posterThumbUrl(entry)
                return (
                  <tr key={entry.id} className={entry.embedAllows === false ? 'riffsync-admin-catalog-row--embed-blocked' : undefined}>
                    <td>
                      <code className="riffsync-admin-catalog-id">{entry.id}</code>
                      {entry.embedAllows === false ? (
                        <span className="riffsync-admin-catalog-embed-hint" title="Embed not allowed">
                          Embed blocked
                        </span>
                      ) : null}
                    </td>
                    <td>{entry.experimentNumber}</td>
                    <td className="riffsync-admin-catalog-poster-cell">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt=""
                          width={48}
                          height={48}
                          className="riffsync-admin-catalog-poster-thumb"
                        />
                      ) : (
                        <span aria-hidden="true">—</span>
                      )}
                    </td>
                    <td>{entry.title}</td>
                    <td>{formatCatalogLabel(entry.catalog)}</td>
                    <td>{entry.labels.length > 0 ? entry.labels.join(', ') : 'None'}</td>
                    <td>{entry.carousel ? 'Yes' : 'No'}</td>
                    <td>{entry.spotlight ? 'Yes' : 'No'}</td>
                    <td>{entry.youtubeVideoId ? 'Yes' : 'No'}</td>
                    <td>
                      <Link
                        to={`/admin/catalog/${encodeURIComponent(entry.id)}/edit`}
                        className="riffsync-admin-catalog-edit-link"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
