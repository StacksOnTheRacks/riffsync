import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { normalizeStaffReturnPath, startStaffHostedUiSignIn } from '../../auth/staffHostedUiPkce'

function staffEnvConfigured(): boolean {
  const domain = import.meta.env.VITE_STAFF_COGNITO_HOSTED_UI_DOMAIN?.trim()
  const clientId = import.meta.env.VITE_STAFF_COGNITO_CLIENT_ID?.trim()
  return Boolean(domain && clientId)
}

export function AdminLoginPage() {
  const [params] = useSearchParams()
  const returnTo = useMemo(
    () => normalizeStaffReturnPath(params.get('returnTo') ?? undefined),
    [params],
  )
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const envReady = staffEnvConfigured()

  const onSignIn = async () => {
    setErr(null)
    if (!envReady) {
      setErr(
        'Staff Cognito env vars are missing. Copy VITE_STAFF_COGNITO_HOSTED_UI_DOMAIN and VITE_STAFF_COGNITO_CLIENT_ID from apps/web/.env.example into .env.development (see RiffSyncStaffAuth-prod outputs).',
      )
      return
    }
    setBusy(true)
    try {
      await startStaffHostedUiSignIn(returnTo)
    } catch (e: unknown) {
      setBusy(false)
      setErr(e instanceof Error ? e.message : 'Could not start operator sign-in')
    }
  }

  return (
    <div className="container">
      <h1>Operator sign-in</h1>
      <p>Sign in with your staff account to access operator tools.</p>
      {!envReady ? (
        <p className="riffsync-scaffold-note" role="alert">
          Configure <code>VITE_STAFF_COGNITO_HOSTED_UI_DOMAIN</code> and{' '}
          <code>VITE_STAFF_COGNITO_CLIENT_ID</code> in <code>.env.development</code> (see{' '}
          <code>apps/web/.env.example</code>).
        </p>
      ) : null}
      {err ? (
        <p role="alert" className="riffsync-scaffold-note">
          {err}
        </p>
      ) : null}
      <p>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onSignIn()}>
          {busy ? 'Redirecting…' : 'Operator sign-in'}
        </button>
      </p>
    </div>
  )
}
