import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { buildFanAuthUrl, resolveFanAuthSuccessDestination } from '../../auth/fanAuthNavigation'
import {
  FanAuthError,
  clearFanVerifyUsername,
  confirmFanSignUp,
  readFanVerifyUsernameFromSession,
  resendFanConfirmationCode,
  writeFanVerifyUsername,
} from '../../auth/fanSrpAuth'
import { getFanAccessToken } from '../../auth/fanTokens'
import {
  buildStrippedVerifySearch,
  consumeFanVerifyBootstrapPrefill,
  readFanVerifyQueryPrefill,
  verifyQueryHasSecrets,
} from '../../auth/fanVerifyQuery'

function readInitialVerifyState(search: string) {
  const prefill = readFanVerifyQueryPrefill(search)
  const bootstrap = consumeFanVerifyBootstrapPrefill()
  const sessionEmail = readFanVerifyUsernameFromSession()
  const email = bootstrap.email ?? prefill.email ?? sessionEmail ?? ''
  if (email && !sessionEmail) {
    writeFanVerifyUsername(email)
  }
  return {
    returnTo: prefill.returnTo,
    email,
    code: bootstrap.code ?? prefill.code ?? '',
  }
}

export function FanVerifyEmailPage() {
  const location = useLocation()
  const navigate = useNavigate()

  const [initial] = useState(() => readInitialVerifyState(location.search))
  const returnTo = initial.returnTo
  const carriedEmail = initial.email

  const [code, setCode] = useState(initial.code)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendSent, setResendSent] = useState(false)

  const codeId = useId()
  const formErrorId = useId()
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const search = location.search
    if (!verifyQueryHasSecrets(search)) return

    const prefill = readFanVerifyQueryPrefill(search)
    const strippedSearch = buildStrippedVerifySearch(prefill.returnTo)
    const nextUrl = `${location.pathname}${strippedSearch}${location.hash}`
    window.history.replaceState(window.history.state, '', nextUrl)
    navigate({ pathname: location.pathname, search: strippedSearch, hash: location.hash }, { replace: true })
  }, [location.pathname, location.search, location.hash, navigate])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFieldError(null)
    setFormError(null)
    setResendSent(false)

    const trimmedCode = code.trim()
    if (!carriedEmail) {
      setFormError('We need your email to verify this code. Sign in or create an account to continue.')
      return
    }
    if (!trimmedCode) {
      setFieldError('Enter the verification code from your email.')
      codeRef.current?.focus()
      return
    }

    setSubmitting(true)
    try {
      await confirmFanSignUp(carriedEmail, trimmedCode)
      clearFanVerifyUsername()
      if (getFanAccessToken()) {
        const destination = resolveFanAuthSuccessDestination(location.search)
        navigate(destination, { replace: true })
      } else {
        navigate(buildFanAuthUrl('/auth/sign-in', returnTo), { replace: true })
      }
    } catch (err) {
      if (err instanceof FanAuthError) {
        if (err.code === 'CODE_MISMATCH' || err.code === 'EXPIRED_CODE' || err.code === 'INVALID_PARAMETER') {
          setFieldError(err.message)
          codeRef.current?.focus()
        } else {
          setFormError(err.message)
        }
      } else {
        setFormError('Unable to verify email. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResend() {
    setFieldError(null)
    setFormError(null)
    setResendSent(false)

    if (!carriedEmail) {
      setFormError('We need your email to resend a verification code. Sign in or create an account to continue.')
      return
    }

    setResending(true)
    try {
      await resendFanConfirmationCode(carriedEmail)
      setResendSent(true)
    } catch (err) {
      if (err instanceof FanAuthError) {
        setFormError(err.message)
      } else {
        setFormError('Unable to resend the verification code. Please try again later.')
      }
    } finally {
      setResending(false)
    }
  }

  const signInHref = buildFanAuthUrl('/auth/sign-in', returnTo)
  const signUpHref = buildFanAuthUrl('/auth/sign-up', returnTo)
  const missingEmail = !carriedEmail

  if (missingEmail) {
    return (
      <div data-testid="fan-verify-email-form">
        <h1>Verify Email</h1>
        <p className="riffsync-fan-auth__helper">We sent a verification code to your email. Enter it below.</p>
        <p
          id={formErrorId}
          className="riffsync-fan-auth__form-error"
          data-testid="fan-auth-error"
          role="alert"
        >
          We need your email to verify this code. Sign in or create an account to continue.
        </p>
        <div className="riffsync-fan-auth__inline-links">
          <Link className="riffsync-fan-auth__secondary-link" to={signInHref}>
            Sign in
          </Link>
          <Link className="riffsync-fan-auth__secondary-link" to={signUpHref}>
            Create account
          </Link>
        </div>
      </div>
    )
  }

  return (
    <form data-testid="fan-verify-email-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
      <h1>Verify Email</h1>
      <p className="riffsync-fan-auth__helper">We sent a verification code to your email. Enter it below.</p>

      {formError ? (
        <p id={formErrorId} className="riffsync-fan-auth__form-error" data-testid="fan-auth-error" role="alert">
          {formError}
        </p>
      ) : null}

      {resendSent ? (
        <p
          className="riffsync-fan-auth__status"
          data-testid="fan-verify-email-resend-sent"
          role="status"
          aria-live="polite"
        >
          A new verification code was sent. Check your email.
        </p>
      ) : null}

      <div className="riffsync-fan-auth__field">
        <label htmlFor={codeId}>Verification code</label>
        <input
          ref={codeRef}
          id={codeId}
          name="code"
          type="text"
          autoComplete="one-time-code"
          inputMode="numeric"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? `${codeId}-error` : undefined}
          disabled={submitting || resending}
        />
        {fieldError ? (
          <p id={`${codeId}-error`} className="riffsync-fan-auth__field-error" data-testid="fan-auth-error">
            {fieldError}
          </p>
        ) : null}
      </div>

      <div className="riffsync-fan-auth__actions">
        <button
          type="submit"
          className="riffsync-fan-auth__primary"
          disabled={submitting || resending}
          aria-busy={submitting || undefined}
        >
          Verify email
        </button>
        <button
          type="button"
          className="riffsync-fan-auth__secondary-action"
          onClick={() => void handleResend()}
          disabled={submitting || resending}
        >
          Resend code
        </button>
        <Link className="riffsync-fan-auth__secondary-link" to={signInHref}>
          BACK TO Sign in
        </Link>
      </div>
    </form>
  )
}
