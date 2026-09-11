import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { buildFanAuthUrl } from '../../auth/fanAuthNavigation'
import { getFanAccessToken } from '../../auth/fanTokens'
import {
  changePassword,
  FanAuthError,
  FAN_PASSWORD_POLICY_HINT,
  meetsFanPasswordPolicy,
} from '../../auth/fanSrpAuth'

export function FanChangePasswordPage() {
  const navigate = useNavigate()
  const accessToken = getFanAccessToken()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const currentId = useId()
  const newId = useId()
  const confirmId = useId()
  const newHintId = useId()
  const formErrorId = useId()

  const currentRef = useRef<HTMLInputElement>(null)
  const newRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!accessToken) {
      navigate(buildFanAuthUrl('/auth/sign-in', '/account'), { replace: true })
    }
  }, [accessToken, navigate])

  function focusFirstInvalid(errors: Record<string, string>) {
    if (errors.currentPassword) currentRef.current?.focus()
    else if (errors.newPassword) newRef.current?.focus()
    else if (errors.confirmPassword) confirmRef.current?.focus()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFieldErrors({})
    setFormError(null)

    if (!getFanAccessToken()) {
      navigate(buildFanAuthUrl('/auth/sign-in', '/account'), { replace: true })
      return
    }

    const nextErrors: Record<string, string> = {}
    if (!currentPassword) nextErrors.currentPassword = 'Enter your current password.'
    if (!newPassword) nextErrors.newPassword = 'Enter a new password.'
    else if (!meetsFanPasswordPolicy(newPassword)) {
      nextErrors.newPassword = FAN_PASSWORD_POLICY_HINT
    } else if (currentPassword && newPassword === currentPassword) {
      nextErrors.newPassword = 'New password must be different from your current password.'
    }
    if (!confirmPassword) nextErrors.confirmPassword = 'Confirm your new password.'
    else if (newPassword && confirmPassword !== newPassword) {
      nextErrors.confirmPassword = 'Passwords do not match.'
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors)
      focusFirstInvalid(nextErrors)
      return
    }

    setSubmitting(true)
    try {
      await changePassword(currentPassword, newPassword)
      navigate('/account?passwordReset=1', { replace: true })
    } catch (err) {
      if (err instanceof FanAuthError) {
        if (err.code === 'UNAUTHENTICATED') {
          navigate(buildFanAuthUrl('/auth/sign-in', '/account'), { replace: true })
          return
        }
        if (err.code === 'NOT_AUTHORIZED') {
          setFormError(err.message)
          currentRef.current?.focus()
          return
        }
        if (err.code === 'INVALID_PASSWORD') {
          setFieldErrors({ newPassword: err.message })
          newRef.current?.focus()
          return
        }
        if (err.code === 'INVALID_PARAMETER') {
          const key = err.message.toLowerCase().includes('current') ? 'currentPassword' : 'newPassword'
          setFieldErrors({ [key]: err.message })
          focusFirstInvalid({ [key]: err.message })
          return
        }
        setFormError(err.message)
        return
      }
      setFormError('Unable to change password. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!accessToken) {
    return null
  }

  const newDescribedBy = [
    newHintId,
    fieldErrors.newPassword ? `${newId}-error` : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <form
      data-testid="fan-change-password-form"
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
    >
      <h1>Change Password</h1>
      <p className="riffsync-fan-auth__helper">Update your password while signed in.</p>

      {formError ? (
        <p
          id={formErrorId}
          className="riffsync-fan-auth__form-error"
          data-testid="fan-auth-error"
          role="alert"
        >
          {formError}
        </p>
      ) : null}

      <div className="riffsync-fan-auth__field">
        <label htmlFor={currentId}>Current password</label>
        <input
          ref={currentRef}
          id={currentId}
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          aria-invalid={fieldErrors.currentPassword ? true : undefined}
          aria-describedby={fieldErrors.currentPassword ? `${currentId}-error` : undefined}
          disabled={submitting}
        />
        {fieldErrors.currentPassword ? (
          <p
            id={`${currentId}-error`}
            className="riffsync-fan-auth__field-error"
            data-testid="fan-auth-error"
          >
            {fieldErrors.currentPassword}
          </p>
        ) : null}
      </div>

      <div className="riffsync-fan-auth__field">
        <label htmlFor={newId}>New password</label>
        <input
          ref={newRef}
          id={newId}
          name="newPassword"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          aria-invalid={fieldErrors.newPassword ? true : undefined}
          aria-describedby={newDescribedBy || undefined}
          disabled={submitting}
        />
        <p id={newHintId} className="riffsync-fan-auth__hint">
          {FAN_PASSWORD_POLICY_HINT}
        </p>
        {fieldErrors.newPassword ? (
          <p
            id={`${newId}-error`}
            className="riffsync-fan-auth__field-error"
            data-testid="fan-auth-error"
          >
            {fieldErrors.newPassword}
          </p>
        ) : null}
      </div>

      <div className="riffsync-fan-auth__field">
        <label htmlFor={confirmId}>Confirm password</label>
        <input
          ref={confirmRef}
          id={confirmId}
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          aria-invalid={fieldErrors.confirmPassword ? true : undefined}
          aria-describedby={fieldErrors.confirmPassword ? `${confirmId}-error` : undefined}
          disabled={submitting}
        />
        {fieldErrors.confirmPassword ? (
          <p
            id={`${confirmId}-error`}
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
          Update password
        </button>
        <Link className="riffsync-fan-auth__secondary-link" to="/account">
          Back to account
        </Link>
      </div>
    </form>
  )
}
