import { Link } from 'react-router-dom'
import { getPublicOrigin } from '../config/publicOrigin'

export function HomePage() {
  return (
    <>
      <h1>RiffSync</h1>
      <p>
        M2 scaffold — fan SPA placeholder. Catalog and rooms are stubs until later
        milestones.
      </p>
      <p>
        <Link to="/catalog">Go to catalog stub →</Link>
      </p>
      <p className="riffsync-scaffold-note">
        Canonical origin for this build: <code>{getPublicOrigin()}</code>
        <br />
        Override with <code>VITE_PUBLIC_ORIGIN</code> (see <code>.env.example</code>).
      </p>
    </>
  )
}
