import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { startFanHostedUiSignIn } from '../auth/fanHostedUiPkce'
import { useFanSession } from '../auth/useFanSession'

export function YourPartiesPage() {
  const { fanToken } = useFanSession()

  useEffect(() => {
    if (!fanToken) {
      void startFanHostedUiSignIn('/your-parties').catch(console.error)
    }
  }, [fanToken])

  if (!fanToken) {
    return (
      <div className="container riffsync-your-parties riffsync-your-parties--signed-out">
        <h1>Your Parties</h1>
        <p role="status">Redirecting to sign in…</p>
      </div>
    )
  }

  return (
    <div className="container riffsync-your-parties">
      <h1>Your Parties</h1>
      <p className="riffsync-muted">
        Your hosted watch parties will appear here. Room lists are coming soon.
      </p>
      <p>
        <Link to="/catalog">Browse catalog</Link>
      </p>
    </div>
  )
}
