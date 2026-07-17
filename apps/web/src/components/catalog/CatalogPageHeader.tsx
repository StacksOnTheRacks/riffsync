import { Link } from 'react-router-dom'

export interface CatalogPageHeaderProps {
  title: string
  subcategoryLabel?: string
}

export function CatalogPageHeader({ title, subcategoryLabel }: CatalogPageHeaderProps) {
  return (
    <div
      className="gen-breadcrumb riffsync-catalog-page-header"
      style={{ backgroundImage: "url('/design/images/background/asset-25.jpeg')" }}
    >
      <div className="container">
        <div className="row align-items-center">
          <div className="col-lg-12">
            <nav aria-label="breadcrumb">
              <div className="gen-breadcrumb-title">
                <h1>{title}</h1>
              </div>
              <div className="gen-breadcrumb-container">
                <ol className="breadcrumb">
                  <li className="breadcrumb-item">
                    <Link to="/">
                      <i className="fas fa-home mr-2" aria-hidden />
                      Home
                    </Link>
                  </li>
                  {subcategoryLabel ? (
                    <>
                      <li className="breadcrumb-item">
                        <Link to="/catalog">Catalog</Link>
                      </li>
                      <li className="breadcrumb-item active" aria-current="page">
                        {subcategoryLabel}
                      </li>
                    </>
                  ) : (
                    <li className="breadcrumb-item active" aria-current="page">
                      Catalog
                    </li>
                  )}
                </ol>
              </div>
            </nav>
          </div>
        </div>
      </div>
    </div>
  )
}
