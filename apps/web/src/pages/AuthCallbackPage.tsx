import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { completeFanAuthCallback } from '../auth/fanHostedUiPkce'

export function AuthCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const code = params.get('code')
  const state = params.get('state')
  const oauthErr = params.get('error')
  const oauthErrDesc = params.get('error_description')
  const missing = !code && !oauthErr

  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!code) return undefined
    let cancelled = false
    void completeFanAuthCallback(code, state)
      .then(({ nextPath }) => {
        if (cancelled) return
        navigate(nextPath, { replace: true })
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Sign-in failed')
      })
    return () => {
      cancelled = true
    }
  }, [navigate, code, state])

  if (missing) {
    const detail =
      oauthErr || oauthErrDesc
        ? [oauthErr, oauthErrDesc?.replace(/\+/g, ' ')].filter(Boolean).join(' — ')
        : null
    return (
      <div className="container" role="alert">
        <h1>Sign-in</h1>
        <p>{detail ?? 'Missing OAuth code or state.'}</p>
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
