import { Link } from 'react-router-dom'

export interface CatalogBreadcrumbsProps {
  subcategoryLabel: string
}

export function CatalogBreadcrumbs({ subcategoryLabel }: CatalogBreadcrumbsProps) {
  return (
    <nav className="riffsync-catalog-breadcrumb" aria-label="Breadcrumb">
      <ol>
        <li>
          <Link to="/">Home</Link>
        </li>
        <li>
          <Link to="/catalog">Catalog</Link>
        </li>
        <li aria-current="page">
          {subcategoryLabel}
        </li>
      </ol>
    </nav>
  )
}
