import type { ReactNode } from 'react'

export interface CatalogPageHeaderProps {
  title: string
  subtitle: ReactNode
}

export function CatalogPageHeader({ title, subtitle }: CatalogPageHeaderProps) {
  return (
    <div className="gen-breadcrumb riffsync-catalog-page-header">
      <div className="container">
        <div className="row align-items-center">
          <div className="col-lg-12">
            <div className="gen-breadcrumb-title">
              <h1>{title}</h1>
            </div>
            <div className="riffsync-catalog-page-header__subtitle">{subtitle}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
