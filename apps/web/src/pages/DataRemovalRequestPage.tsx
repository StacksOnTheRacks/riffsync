import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { submitPrivacyRemovalRequest } from '../api/privacyRemovalApi'

const BASE_TITLE = 'RiffSync'

export function DataRemovalRequestPage() {
  const [contactEmail, setContactEmail] = useState('')
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const previous = document.title
    document.title = `Data removal request — ${BASE_TITLE}`
    return () => {
      document.title = previous
    }
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErrorMessage(null)
    setStatus('sending')
    const result = await submitPrivacyRemovalRequest({
      contactEmail: contactEmail.trim(),
      message: message.trim(),
      website,
    })
    if ('error' in result) {
      setStatus('error')
      setErrorMessage(result.error)
      return
    }
    setStatus('success')
    setMessage('')
    setContactEmail('')
    setWebsite('')
  }

  return (
    <div className="riffsync-legal">
      <div className="container">
        <p className="riffsync-legal__meta">
          <Link to="/privacy">← Back to Privacy Policy</Link>
        </p>
        <h1>Personal information / data removal request</h1>
        <p className="riffsync-legal__meta text-muted">
          Use this form to ask us to delete or anonymize personal information we hold about you in
          connection with RiffSync (including data tied to a sign-in account). We may contact you to verify
          your identity before completing a request.
        </p>

        {status === 'success' ? (
          <p role="status">
            Thanks — your request was submitted. If you do not hear back within a reasonable time, you may
            follow up by opening an issue on{' '}
            <a href="https://github.com/StacksOnTheRacks/riffsync" rel="noopener noreferrer">
              GitHub
            </a>
            .
          </p>
        ) : (
          <form className="riffsync-legal-form" onSubmit={onSubmit} noValidate>
            <div className="riffsync-honeypot" aria-hidden="true">
              <label htmlFor="privacy-removal-website">Website</label>
              <input
                id="privacy-removal-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(ev) => setWebsite(ev.target.value)}
              />
            </div>

            <label htmlFor="privacy-removal-email">Your email (for replies)</label>
            <input
              id="privacy-removal-email"
              name="contactEmail"
              type="email"
              required
              autoComplete="email"
              value={contactEmail}
              onChange={(ev) => setContactEmail(ev.target.value)}
            />

            <label htmlFor="privacy-removal-message">Describe your request</label>
            <textarea
              id="privacy-removal-message"
              name="message"
              required
              rows={6}
              minLength={10}
              maxLength={8000}
              value={message}
              onChange={(ev) => setMessage(ev.target.value)}
              placeholder="Example: Please delete my RiffSync account and hosting history tied to my email …"
            />

            {status === 'error' && errorMessage ? (
              <p className="riffsync-legal-form__error" role="alert">
                {errorMessage}
              </p>
            ) : null}

            <button type="submit" className="btn btn-primary mt-3" disabled={status === 'sending'}>
              {status === 'sending' ? 'Sending…' : 'Submit request'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
