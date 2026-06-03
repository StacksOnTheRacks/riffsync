import { Link, useParams } from 'react-router-dom'

export type AdminCatalogPlaceholderVariant = 'list' | 'new' | 'edit'

export function AdminCatalogRoutePlaceholder({
  variant = 'list',
}: {
  variant?: AdminCatalogPlaceholderVariant
}) {
  const { id } = useParams<{ id: string }>()

  const showBreadcrumb = variant === 'new' || variant === 'edit'
  const crumbLeaf = variant === 'new' ? 'New episode' : 'Edit'

  return (
    <div className="container riffsync-admin-page">
      {showBreadcrumb ? (
        <nav className="riffsync-admin-breadcrumb" aria-label="Breadcrumb">
          <ol>
            <li>
              <Link to="/admin">Admin</Link>
            </li>
            <li>
              <Link to="/admin/catalog">Catalog</Link>
            </li>
            <li aria-current="page">{crumbLeaf}</li>
          </ol>
        </nav>
      ) : null}

      {variant === 'list' ? (
        <>
          <h1>Catalog</h1>
          <p className="riffsync-admin-placeholder-note">
            Catalog list UI ships in{' '}
            <a href="https://github.com/StacksOnTheRacks/riffsync/issues/80">issue #80</a>.
          </p>
        </>
      ) : null}

      {variant === 'new' ? (
        <>
          <h1>New episode</h1>
          <p className="riffsync-admin-placeholder-note">
            Create/edit form UI ships in{' '}
            <a href="https://github.com/StacksOnTheRacks/riffsync/issues/81">issue #81</a>.
          </p>
        </>
      ) : null}

      {variant === 'edit' ? (
        <>
          <h1>Edit episode</h1>
          {id ? (
            <p className="riffsync-admin-placeholder-id">
              Episode id: <code>{id}</code>
            </p>
          ) : null}
          <p className="riffsync-admin-placeholder-note">
            Create/edit form UI ships in{' '}
            <a href="https://github.com/StacksOnTheRacks/riffsync/issues/81">issue #81</a>.
          </p>
        </>
      ) : null}
    </div>
  )
}
