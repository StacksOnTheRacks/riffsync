import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { exchangeStaffAuthorizationCode, popStaffReturnPath } from '../../auth/staffHostedUiPkce'

export function StaffAuthCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const code = params.get('code')
  const state = params.get('state')
  const oauthErr = params.get('error')
  const oauthErrDesc = params.get('error_description')
  const missing = !code || !state

  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!code || !state) return undefined
    let cancelled = false
    void exchangeStaffAuthorizationCode(code, state)
      .then(() => {
        if (cancelled) return
        const next = popStaffReturnPath()
        navigate(next, { replace: true })
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Operator sign-in failed')
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
        <h1>Operator sign-in</h1>
        <p>{detail ?? 'Missing OAuth code or state.'}</p>
        <p>
          <a href="/admin/login">Try operator sign-in again</a>
        </p>
      </div>
    )
  }

  if (err) {
    return (
      <div className="container" role="alert">
        <h1>Operator sign-in</h1>
        <p>{err}</p>
        <p>
          <a href="/admin/login">Try operator sign-in again</a>
        </p>
      </div>
    )
  }

  return (
    <div className="container">
      <p>Completing operator sign-in…</p>
    </div>
  )
}
