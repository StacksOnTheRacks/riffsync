import { Link } from 'react-router-dom'
import { CATALOG_HUB_ENTRY_LINKS } from '../../catalog/catalogBrowseIa'

export function CatalogHubEntryLinks() {
  return (
    <nav className="riffsync-catalog-hub-entry-links" aria-label="Catalog categories">
      <ul className="riffsync-catalog-hub-entry-links__list">
        {CATALOG_HUB_ENTRY_LINKS.map(({ label, href }) => (
          <li key={href}>
            <Link className="riffsync-catalog-hub-entry-links__link" to={href}>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
