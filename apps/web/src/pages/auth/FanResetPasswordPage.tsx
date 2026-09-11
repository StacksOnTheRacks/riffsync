import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { buildFanAuthUrl, normalizeFanReturnTo, readReturnToFromQuery } from '../../auth/fanAuthNavigation'
import {
  buildStrippedResetSearch,
  readFanResetQueryPrefill,
  resetQueryHasSecrets,
} from '../../auth/fanResetQuery'
import {
  FanAuthError,
  FAN_PASSWORD_POLICY_HINT,
  confirmFanPasswordReset,
  meetsFanPasswordPolicy,
  readFanResetUsernameFromSession,
} from '../../auth/fanSrpAuth'

export function FanResetPasswordPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [returnTo, setReturnTo] = useState(() =>
    normalizeFanReturnTo(readReturnToFromQuery(searchParams.toString()) ?? undefined),
  )
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const emailId = useId()
  const codeId = useId()
  const newPasswordId = useId()
  const confirmPasswordId = useId()
  const policyHintId = useId()
  const formErrorId = useId()

  const emailRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  const newPasswordRef = useRef<HTMLInputElement>(null)
  const confirmPasswordRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const search = location.search
    const prefill = readFanResetQueryPrefill(search)
    setReturnTo(prefill.returnTo)

    if (prefill.email) setEmail(prefill.email)
    else {
      const stored = readFanResetUsernameFromSession()
      if (stored) setEmail(stored)
    }
    if (prefill.code) setCode(prefill.code)

    if (resetQueryHasSecrets(search)) {
      const strippedSearch = buildStrippedResetSearch(prefill.returnTo)
      const nextUrl = `${location.pathname}${strippedSearch}${location.hash}`
      window.history.replaceState(window.history.state, '', nextUrl)
      navigate({ pathname: location.pathname, search: strippedSearch, hash: location.hash }, { replace: true })
    }
  }, [location.pathname, location.search, location.hash, navigate])

  function focusFirstInvalid(errors: Record<string, string>) {
    if (errors.email) emailRef.current?.focus()
    else if (errors.code) codeRef.current?.focus()
    else if (errors.newPassword) newPasswordRef.current?.focus()
    else if (errors.confirmPassword) confirmPasswordRef.current?.focus()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFieldErrors({})
    setFormError(null)

    const nextErrors: Record<string, string> = {}
    const trimmedEmail = email.trim()
    const trimmedCode = code.trim()

    if (!trimmedEmail) nextErrors.email = 'Enter your email address.'
    if (!trimmedCode) nextErrors.code = 'Enter the reset code from your email.'
    if (!newPassword) nextErrors.newPassword = 'Enter a new password.'
    else if (!meetsFanPasswordPolicy(newPassword)) nextErrors.newPassword = FAN_PASSWORD_POLICY_HINT
    if (!confirmPassword) nextErrors.confirmPassword = 'Confirm your new password.'
    else if (newPassword !== confirmPassword) nextErrors.confirmPassword = 'Passwords do not match.'

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors)
      focusFirstInvalid(nextErrors)
      return
    }

    setSubmitting(true)
    try {
      await confirmFanPasswordReset({
        username: trimmedEmail,
        confirmationCode: trimmedCode,
        newPassword,
      })
      const signInHref = buildFanAuthUrl('/auth/sign-in', returnTo)
      navigate(signInHref, { replace: true })
    } catch (err) {
      if (err instanceof FanAuthError) {
        if (err.code === 'INVALID_PARAMETER' || err.code === 'INVALID_PASSWORD') {
          const key =
            err.code === 'INVALID_PASSWORD' && newPassword && !meetsFanPasswordPolicy(newPassword)
              ? 'newPassword'
              : err.message.includes('code')
                ? 'code'
                : err.message.includes('email')
                  ? 'email'
                  : 'newPassword'
          setFieldErrors({ [key]: err.message })
          focusFirstInvalid({ [key]: err.message })
        } else {
          setFormError(err.message)
        }
      } else {
        setFormError('Unable to reset password. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const signInHref = buildFanAuthUrl('/auth/sign-in', returnTo)

  return (
    <form data-testid="fan-reset-password-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
      <h1>Reset Password</h1>
      <p className="riffsync-fan-auth__helper">Enter the code from your email and choose a new password.</p>

      {formError ? (
        <p id={formErrorId} className="riffsync-fan-auth__form-error" data-testid="fan-auth-error" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="riffsync-fan-auth__field">
        <label htmlFor={emailId}>Email</label>
        <input
          ref={emailRef}
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={fieldErrors.email ? `${emailId}-error` : undefined}
          disabled={submitting}
        />
        {fieldErrors.email ? (
          <p id={`${emailId}-error`} className="riffsync-fan-auth__field-error" data-testid="fan-auth-error">
            {fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div className="riffsync-fan-auth__field">
        <label htmlFor={codeId}>Reset code</label>
        <input
          ref={codeRef}
          id={codeId}
          name="code"
          type="text"
          autoComplete="one-time-code"
          inputMode="numeric"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          aria-invalid={fieldErrors.code ? true : undefined}
          aria-describedby={fieldErrors.code ? `${codeId}-error` : undefined}
          disabled={submitting}
        />
        {fieldErrors.code ? (
          <p id={`${codeId}-error`} className="riffsync-fan-auth__field-error" data-testid="fan-auth-error">
            {fieldErrors.code}
          </p>
        ) : null}
      </div>

      <div className="riffsync-fan-auth__field">
        <label htmlFor={newPasswordId}>New password</label>
        <div className="riffsync-fan-auth__password-row">
          <input
            ref={newPasswordRef}
            id={newPasswordId}
            name="newPassword"
            type={showNewPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            aria-invalid={fieldErrors.newPassword ? true : undefined}
            aria-describedby={`${policyHintId}${fieldErrors.newPassword ? ` ${newPasswordId}-error` : ''}`}
            disabled={submitting}
          />
          <button
            type="button"
            className="riffsync-fan-auth__toggle-password"
            aria-pressed={showNewPassword}
            aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
            onClick={() => setShowNewPassword((value) => !value)}
          >
            {showNewPassword ? 'Hide' : 'Show'}
          </button>
        </div>
        <p id={policyHintId} className="riffsync-fan-auth__hint">
          {FAN_PASSWORD_POLICY_HINT}
        </p>
        {fieldErrors.newPassword ? (
          <p id={`${newPasswordId}-error`} className="riffsync-fan-auth__field-error" data-testid="fan-auth-error">
            {fieldErrors.newPassword}
          </p>
        ) : null}
      </div>

      <div className="riffsync-fan-auth__field">
        <label htmlFor={confirmPasswordId}>Confirm password</label>
        <div className="riffsync-fan-auth__password-row">
          <input
            ref={confirmPasswordRef}
            id={confirmPasswordId}
            name="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            aria-invalid={fieldErrors.confirmPassword ? true : undefined}
            aria-describedby={fieldErrors.confirmPassword ? `${confirmPasswordId}-error` : undefined}
            disabled={submitting}
          />
          <button
            type="button"
            className="riffsync-fan-auth__toggle-password"
            aria-pressed={showConfirmPassword}
            aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
            onClick={() => setShowConfirmPassword((value) => !value)}
          >
            {showConfirmPassword ? 'Hide' : 'Show'}
          </button>
        </div>
        {fieldErrors.confirmPassword ? (
          <p
            id={`${confirmPasswordId}-error`}
            className="riffsync-fan-auth__field-error"
            data-testid="fan-auth-error"
          >
            {fieldErrors.confirmPassword}
          </p>
        ) : null}
      </div>

      <div className="riffsync-fan-auth__actions">
        <button
          type="submit"
          className="riffsync-fan-auth__primary"
          disabled={submitting}
          aria-busy={submitting || undefined}
        >
          Reset password
        </button>
        <Link className="riffsync-fan-auth__secondary-link" to={signInHref}>
          Back to sign in
        </Link>
      </div>
    </form>
  )
}
