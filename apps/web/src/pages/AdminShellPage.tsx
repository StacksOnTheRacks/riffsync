import { useLocation } from 'react-router-dom'

/**
 * Operator-only admin surface is deferred (auth + API per architecture.admin.md).
 * This route exists so /admin/* is a stable shell for future nested admin pages.
 */
export function AdminShellPage() {
  const { pathname } = useLocation()

  return (
    <div className="container">
      <h1>Admin</h1>
      <p>M2 scaffold — gated operator UX (roster, reporting, catalog editors) is not implemented.</p>
      <p className="riffsync-scaffold-note">
        Current path: <code>{pathname}</code>
        <br />
        See <code>docs/architecture.admin.md</code> for the full admin contract.
      </p>
    </div>
  )
}
