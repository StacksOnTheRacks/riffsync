import { useId, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { buildFanAuthUrl, normalizeFanReturnTo, readReturnToFromQuery } from '../../auth/fanAuthNavigation'
import {
  FanAuthError,
  FAN_PASSWORD_POLICY_HINT,
  FAN_USERNAME_EXISTS_ERROR,
  isFanEmailWellFormed,
  meetsFanPasswordPolicy,
  signUpFan,
  writeFanVerifyUsername,
} from '../../auth/fanSrpAuth'

export function FanSignUpPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = normalizeFanReturnTo(readReturnToFromQuery(searchParams.toString()) ?? undefined)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const emailId = useId()
  const passwordId = useId()
  const confirmPasswordId = useId()
  const policyHintId = useId()
  const formErrorId = useId()

  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const confirmPasswordRef = useRef<HTMLInputElement>(null)

  function focusFirstInvalid(errors: Record<string, string>) {
    if (errors.email) emailRef.current?.focus()
    else if (errors.password) passwordRef.current?.focus()
    else if (errors.confirmPassword) confirmPasswordRef.current?.focus()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFieldErrors({})
    setFormError(null)

    const nextErrors: Record<string, string> = {}
    const trimmedEmail = email.trim()
    if (!trimmedEmail) nextErrors.email = 'Enter your email address.'
    else if (!isFanEmailWellFormed(trimmedEmail)) nextErrors.email = 'Enter a valid email address.'
    if (!password) nextErrors.password = 'Enter a password.'
    else if (!meetsFanPasswordPolicy(password)) nextErrors.password = FAN_PASSWORD_POLICY_HINT
    if (!confirmPassword) nextErrors.confirmPassword = 'Confirm your password.'
    else if (password !== confirmPassword) nextErrors.confirmPassword = 'Passwords do not match.'

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors)
      focusFirstInvalid(nextErrors)
      return
    }

    setSubmitting(true)
    try {
      await signUpFan(trimmedEmail, password)
      writeFanVerifyUsername(trimmedEmail)
      navigate(buildFanAuthUrl('/auth/verify-email', returnTo), { replace: true })
    } catch (err) {
      if (err instanceof FanAuthError) {
        if (err.code === 'USERNAME_EXISTS') {
          setFormError(FAN_USERNAME_EXISTS_ERROR)
          return
        }
        if (err.code === 'INVALID_PARAMETER' || err.code === 'INVALID_PASSWORD') {
          const key =
            err.code === 'INVALID_PASSWORD' || err.message === FAN_PASSWORD_POLICY_HINT
              ? 'password'
              : err.message.toLowerCase().includes('email')
                ? 'email'
                : 'password'
          setFieldErrors({ [key]: err.message })
          focusFirstInvalid({ [key]: err.message })
          return
        }
        setFormError(err.message)
      } else {
        setFormError('Unable to create account. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const signInHref = buildFanAuthUrl('/auth/sign-in', returnTo)
  const verifyHref = buildFanAuthUrl('/auth/verify-email', returnTo)

  return (
    <form data-testid="fan-sign-up-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
      <h1>Create Account</h1>
      <p className="riffsync-fan-auth__helper">
        Sign up to host watch parties on RiffSync. RiffSync is 100% Free.
      </p>

      {formError ? (
        <div id={formErrorId} className="riffsync-fan-auth__form-error-block" role="alert">
          <p className="riffsync-fan-auth__form-error" data-testid="fan-auth-error">
            {formError}
          </p>
          {formError === FAN_USERNAME_EXISTS_ERROR ? (
            <div className="riffsync-fan-auth__inline-links">
              <Link className="riffsync-fan-auth__secondary-link" to={signInHref}>
                Sign in
              </Link>
              <Link className="riffsync-fan-auth__secondary-link" to={verifyHref}>
                Verify email
              </Link>
            </div>
          ) : null}
        </div>
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
        <label htmlFor={passwordId}>Password</label>
        <input
          ref={passwordRef}
          id={passwordId}
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={fieldErrors.password ? true : undefined}
          aria-describedby={`${policyHintId}${fieldErrors.password ? ` ${passwordId}-error` : ''}`}
          disabled={submitting}
        />
        <p id={policyHintId} className="riffsync-fan-auth__hint">
          {FAN_PASSWORD_POLICY_HINT}
        </p>
        {fieldErrors.password ? (
          <p id={`${passwordId}-error`} className="riffsync-fan-auth__field-error" data-testid="fan-auth-error">
            {fieldErrors.password}
          </p>
        ) : null}
      </div>

      <div className="riffsync-fan-auth__field">
        <label htmlFor={confirmPasswordId}>Confirm password</label>
        <input
          ref={confirmPasswordRef}
          id={confirmPasswordId}
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          aria-invalid={fieldErrors.confirmPassword ? true : undefined}
          aria-describedby={fieldErrors.confirmPassword ? `${confirmPasswordId}-error` : undefined}
          disabled={submitting}
        />
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
          Create account
        </button>
        <Link className="riffsync-fan-auth__secondary-link" to={signInHref}>
          BACK TO Sign in
        </Link>
      </div>
    </form>
  )
}
