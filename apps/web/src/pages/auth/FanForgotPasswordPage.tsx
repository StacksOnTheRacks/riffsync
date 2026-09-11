import { useId, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { buildFanAuthUrl, normalizeFanReturnTo, readReturnToFromQuery } from '../../auth/fanAuthNavigation'
import { FanAuthError, requestFanPasswordReset } from '../../auth/fanSrpAuth'

export function FanForgotPasswordPage() {
  const [searchParams] = useSearchParams()
  const returnTo = normalizeFanReturnTo(readReturnToFromQuery(searchParams.toString()) ?? undefined)

  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  const emailId = useId()
  const emailErrorId = useId()
  const formErrorId = useId()
  const emailRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFieldError(null)
    setFormError(null)

    const trimmed = email.trim()
    if (!trimmed) {
      setFieldError('Enter your email address.')
      emailRef.current?.focus()
      return
    }

    setSubmitting(true)
    try {
      await requestFanPasswordReset(trimmed)
      setSent(true)
    } catch (err) {
      if (err instanceof FanAuthError) {
        if (err.code === 'INVALID_PARAMETER') {
          setFieldError(err.message)
          emailRef.current?.focus()
        } else {
          setFormError(err.message)
        }
      } else {
        setFormError('Unable to send reset instructions. Please try again later.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const signInHref = buildFanAuthUrl('/auth/sign-in', returnTo)
  const resetHref = buildFanAuthUrl('/auth/reset-password', returnTo)

  if (sent) {
    return (
      <div data-testid="fan-forgot-password-success" role="status" aria-live="polite">
        <h1>Forgot Password</h1>
        <p className="riffsync-fan-auth__helper">
          If an account exists for that email, a reset code is on the way. Check your email and continue on this site.
        </p>
        <div className="riffsync-fan-auth__actions">
          <Link className="riffsync-fan-auth__primary-link" to={resetHref}>
            Enter reset code
          </Link>
          <Link className="riffsync-fan-auth__secondary-link" to={signInHref}>
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <form data-testid="fan-forgot-password-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
      <h1>Forgot Password</h1>
      <p className="riffsync-fan-auth__helper">Enter your email and we will send reset instructions.</p>

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
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? emailErrorId : undefined}
          disabled={submitting}
        />
        {fieldError ? (
          <p id={emailErrorId} className="riffsync-fan-auth__field-error" data-testid="fan-auth-error">
            {fieldError}
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
          Send reset link
        </button>
        <Link className="riffsync-fan-auth__secondary-link" to={signInHref}>
          Back to sign in
        </Link>
      </div>
    </form>
  )
}
