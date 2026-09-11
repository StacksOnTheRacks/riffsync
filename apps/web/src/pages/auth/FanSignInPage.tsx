import { useId, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  buildFanAuthUrl,
  normalizeFanReturnTo,
  readReturnToFromQuery,
  resolveFanAuthSuccessDestination,
} from '../../auth/fanAuthNavigation'
import {
  FanAuthError,
  FAN_NEW_PASSWORD_REQUIRED_ERROR,
  FAN_SIGN_IN_GENERIC_ERROR,
  isFanEmailWellFormed,
  signInWithSrp,
  writeFanVerifyUsername,
} from '../../auth/fanSrpAuth'

export function FanSignInPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = normalizeFanReturnTo(readReturnToFromQuery(searchParams.toString()) ?? undefined)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const emailId = useId()
  const passwordId = useId()
  const formErrorId = useId()
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  function focusFirstInvalid(errors: Record<string, string>) {
    if (errors.email) emailRef.current?.focus()
    else if (errors.password) passwordRef.current?.focus()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFieldErrors({})
    setFormError(null)

    const nextErrors: Record<string, string> = {}
    const trimmedEmail = email.trim()
    if (!trimmedEmail) nextErrors.email = 'Enter your email address.'
    else if (!isFanEmailWellFormed(trimmedEmail)) nextErrors.email = 'Enter a valid email address.'
    if (!password) nextErrors.password = 'Enter your password.'

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors)
      focusFirstInvalid(nextErrors)
      return
    }

    setSubmitting(true)
    try {
      await signInWithSrp(trimmedEmail, password)
      const destination = resolveFanAuthSuccessDestination(searchParams.toString())
      navigate(destination, { replace: true })
    } catch (err) {
      if (err instanceof FanAuthError) {
        if (err.code === 'UNCONFIRMED') {
          writeFanVerifyUsername(trimmedEmail)
          navigate(buildFanAuthUrl('/auth/verify-email', returnTo), { replace: true })
          return
        }
        if (err.code === 'NEW_PASSWORD_REQUIRED') {
          setFormError(FAN_NEW_PASSWORD_REQUIRED_ERROR)
          return
        }
        if (err.code === 'NOT_AUTHORIZED') {
          setFormError(FAN_SIGN_IN_GENERIC_ERROR)
          return
        }
        if (err.code === 'INVALID_PARAMETER') {
          const key = err.message.toLowerCase().includes('email') ? 'email' : 'password'
          setFieldErrors({ [key]: err.message })
          focusFirstInvalid({ [key]: err.message })
          return
        }
        setFormError(err.message)
      } else {
        setFormError('Unable to sign in. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const signUpHref = buildFanAuthUrl('/auth/sign-up', returnTo)
  const forgotPasswordHref = buildFanAuthUrl('/auth/forgot-password', returnTo)

  return (
    <form data-testid="fan-sign-in-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
      <h1>Sign In</h1>
      <p className="riffsync-fan-auth__helper">Sign in to host watch parties.</p>

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
        <label htmlFor={passwordId}>Password</label>
        <input
          ref={passwordRef}
          id={passwordId}
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={fieldErrors.password ? true : undefined}
          aria-describedby={fieldErrors.password ? `${passwordId}-error` : undefined}
          disabled={submitting}
        />
        {fieldErrors.password ? (
          <p id={`${passwordId}-error`} className="riffsync-fan-auth__field-error" data-testid="fan-auth-error">
            {fieldErrors.password}
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
          Sign in
        </button>
        <Link className="riffsync-fan-auth__secondary-link" to={signUpHref}>
          Create account
        </Link>
        <Link className="riffsync-fan-auth__secondary-link" to={forgotPasswordHref}>
          Forgot password
        </Link>
      </div>
    </form>
  )
}
