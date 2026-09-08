import type { ReactNode } from 'react'

export interface CatalogPageHeaderProps {
  title: string
  subtitle: ReactNode
  /** When true, the page title is exposed only to assistive tech (sr-only h1). */
  srOnlyHeading?: boolean
}

export function CatalogPageHeader({ title, subtitle, srOnlyHeading = false }: CatalogPageHeaderProps) {
  return (
    <div className="gen-breadcrumb riffsync-catalog-page-header">
      <div className="container">
        <div className="row align-items-center">
          <div className="col-lg-12">
            <div className="gen-breadcrumb-title">
              {srOnlyHeading ? (
                <h1 className="sr-only">{title}</h1>
              ) : (
                <h1>{title}</h1>
              )}
            </div>
            <div className="riffsync-catalog-page-header__subtitle">{subtitle}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
