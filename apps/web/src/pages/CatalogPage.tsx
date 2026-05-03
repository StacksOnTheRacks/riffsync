import { Link } from 'react-router-dom'

export function CatalogPage() {
  return (
    <div className="container">
      <h1>Catalog</h1>
      <p>M2 scaffold — browse flow and GET /v1/catalog wiring come in M4.</p>
      <p>
        <Link to="/">← Home</Link>
      </p>
    </div>
  )
}
