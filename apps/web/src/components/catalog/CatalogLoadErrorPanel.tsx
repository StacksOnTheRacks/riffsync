import { Link } from 'react-router-dom'
import {
  CATALOG_UNAVAILABLE_HEADING,
  formatCatalogUserError,
} from '../../catalog/catalogLoadError'

type CatalogLoadErrorPanelProps = {
  error: unknown
  onRetry?: () => void
  retryLabel?: string
  homeLink?: boolean
  catalogLink?: boolean
}

export function CatalogLoadErrorPanel({
  error,
  onRetry,
  retryLabel = 'Try again',
  homeLink = false,
  catalogLink = false,
}: CatalogLoadErrorPanelProps) {
  return (
    <div role="alert">
      <h1>{CATALOG_UNAVAILABLE_HEADING}</h1>
      <p>{formatCatalogUserError(error)}</p>
      {onRetry ? (
        <p>
          <button type="button" className="btn btn-primary" onClick={() => onRetry()}>
            {retryLabel}
          </button>
        </p>
      ) : null}
      {homeLink || catalogLink ? (
        <p>
          {homeLink ? (
            <>
              <Link to="/">Home</Link>
              {catalogLink ? ' · ' : null}
            </>
          ) : null}
          {catalogLink ? <Link to="/catalog">Catalog</Link> : null}
        </p>
      ) : null}
    </div>
  )
}
