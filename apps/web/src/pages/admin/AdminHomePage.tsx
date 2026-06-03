import { Link } from 'react-router-dom'
import { useAdminSession } from '../../admin/AdminSessionContext'

export function AdminHomePage() {
  const { loading, error, reload } = useAdminSession()

  if (loading) {
    return (
      <div className="container riffsync-admin-page">
        <p>Loading operator session…</p>
      </div>
    )
  }

  return (
    <div className="container riffsync-admin-page">
      <h1>Admin home</h1>
      {error ? (
        <div role="alert" className="riffsync-scaffold-note">
          <p>{error}</p>
          <p>
            <a href="/admin/login">Try operator sign-in again</a>
          </p>
          <p>
            <button type="button" className="btn btn-secondary" onClick={() => reload()}>
              Retry session
            </button>
          </p>
        </div>
      ) : (
        <>
          <p>Operator tools for catalog and curation. Use Catalog to manage episodes when list UI ships.</p>
          <p>
            <Link to="/admin/catalog" className="btn btn-primary">
              Open catalog
            </Link>
          </p>
        </>
      )}
    </div>
  )
}
