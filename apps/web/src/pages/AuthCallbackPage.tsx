import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { exchangeFanAuthorizationCode, popReturnPath } from '../auth/fanHostedUiPkce'

export function AuthCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const code = params.get('code')
  const state = params.get('state')
  const missing = !code || !state

  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!code || !state) return undefined
    let cancelled = false
    void exchangeFanAuthorizationCode(code, state)
      .then(() => {
        if (cancelled) return
        const next = popReturnPath()
        navigate(next, { replace: true })
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Sign-in failed')
      })
    return () => {
      cancelled = true
    }
  }, [navigate, code, state])

  if (missing) {
    return (
      <div className="container" role="alert">
        <h1>Sign-in</h1>
        <p>Missing OAuth code or state.</p>
        <p>
          <a href="/catalog">← Catalog</a>
        </p>
      </div>
    )
  }

  if (err) {
    return (
      <div className="container" role="alert">
        <h1>Sign-in</h1>
        <p>{err}</p>
        <p>
          <a href="/catalog">← Catalog</a>
        </p>
      </div>
    )
  }

  return (
    <div className="container">
      <p>Completing sign-in…</p>
    </div>
  )
}
