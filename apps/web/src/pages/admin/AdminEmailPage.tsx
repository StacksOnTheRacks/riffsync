import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAdminSession } from '../../admin/useAdminSession'
import { staffHasAdminGroup } from '../../admin/staffHasAdminGroup'
import { EmailBlockEditor } from '../../admin/email/EmailComposerEditor'
import { useEmailComposerState } from '../../admin/email/useEmailComposerState'
import {
  BROADCAST_CONFIRMATION_PHRASE,
  computeEmailContentHash,
  emailContentHasText,
  emptyEmailContent,
  renderEmailPreviewHtml,
} from '../../admin/email/emailContentModel'
import { refreshStaffTokensIfStale } from '../../auth/staffHostedUiPkce'
import { getStaffAccessToken } from '../../auth/staffTokens'
import {
  fetchStaffEmailAudience,
  sendStaffEmailBroadcast,
  sendStaffEmailTest,
  StaffEmailConflictError,
  StaffEmailDisabledError,
  StaffEmailValidationError,
} from '../../api/staffAdminEmailApi'
import {
  StaffSessionForbiddenError,
  StaffSessionUnauthorizedError,
} from '../../api/staffAdminSessionApi'

type TestState = {
  draftKey: string
  contentHash: string
  testSentAt: string
  testProof: string
  recipient: string
}

export function AdminEmailPage() {
  const { session, loading, error } = useAdminSession()
  const { content, setBlockText, setBlockType, toggleInline, addBlock, removeBlock } =
    useEmailComposerState(emptyEmailContent())

  const [subject, setSubject] = useState('')
  const [audienceCount, setAudienceCount] = useState<number | null>(null)
  const [audienceError, setAudienceError] = useState<string | null>(null)
  const [testState, setTestState] = useState<TestState | null>(null)
  const [confirmationPhrase, setConfirmationPhrase] = useState('')
  const [pageError, setPageError] = useState<string | null>(null)
  const [pageNotice, setPageNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<'test' | 'send' | null>(null)

  const isAdmin = session ? staffHasAdminGroup(session.groups) : false
  const draftKey = useMemo(
    () => JSON.stringify({ subject: subject.trim(), content }),
    [subject, content],
  )

  useEffect(() => {
    if (loading || !session || !isAdmin) {
      return
    }

    let cancelled = false

    async function loadAudience() {
      setAudienceError(null)
      try {
        await refreshStaffTokensIfStale()
        const token = getStaffAccessToken()
        if (!token) {
          throw new StaffSessionUnauthorizedError()
        }
        const res = await fetchStaffEmailAudience(token)
        if (!cancelled) {
          setAudienceCount(res.eligibleCount)
        }
      } catch (e) {
        if (cancelled) return
        if (e instanceof StaffSessionUnauthorizedError) {
          setAudienceError('Session expired. Sign in again.')
        } else if (e instanceof StaffSessionForbiddenError) {
          setAudienceError('Admin group required for email tools.')
        } else {
          setAudienceError(e instanceof Error ? e.message : 'Could not load audience count.')
        }
      }
    }

    void loadAudience()
    return () => {
      cancelled = true
    }
  }, [loading, session, isAdmin])

  const testMatchesDraft = testState !== null && testState.draftKey === draftKey

  const previewHtml = useMemo(
    () => renderEmailPreviewHtml(subject.trim() || 'Subject preview', content),
    [subject, content],
  )

  const canSendTest =
    isAdmin &&
    subject.trim().length > 0 &&
    emailContentHasText(content) &&
    busy === null

  const canSendCustomers =
    isAdmin &&
    testMatchesDraft &&
    audienceCount !== null &&
    confirmationPhrase === BROADCAST_CONFIRMATION_PHRASE &&
    busy === null

  const onSendTest = async () => {
    setPageError(null)
    setPageNotice(null)
    setBusy('test')
    try {
      await refreshStaffTokensIfStale()
      const token = getStaffAccessToken()
      if (!token) {
        throw new StaffSessionUnauthorizedError()
      }
      const res = await sendStaffEmailTest(token, {
        subject: subject.trim(),
        content,
      })
      setTestState({
        draftKey,
        contentHash: res.contentHash,
        testSentAt: res.testSentAt,
        testProof: res.testProof,
        recipient: res.recipient,
      })
      setPageNotice(`Test email sent to ${res.recipient}.`)
    } catch (e) {
      if (e instanceof StaffSessionUnauthorizedError) {
        setPageError('Session expired. Sign in again.')
      } else if (e instanceof StaffSessionForbiddenError) {
        setPageError('Admin group required for email tools.')
      } else if (e instanceof StaffEmailValidationError) {
        setPageError(e.message)
      } else {
        setPageError(e instanceof Error ? e.message : 'Test send failed.')
      }
    } finally {
      setBusy(null)
    }
  }

  const reloadAudience = async () => {
    setAudienceError(null)
    try {
      await refreshStaffTokensIfStale()
      const token = getStaffAccessToken()
      if (!token) {
        throw new StaffSessionUnauthorizedError()
      }
      const res = await fetchStaffEmailAudience(token)
      setAudienceCount(res.eligibleCount)
    } catch (e) {
      if (e instanceof StaffSessionUnauthorizedError) {
        setAudienceError('Session expired. Sign in again.')
      } else if (e instanceof StaffSessionForbiddenError) {
        setAudienceError('Admin group required for email tools.')
      } else {
        setAudienceError(e instanceof Error ? e.message : 'Could not load audience count.')
      }
    }
  }

  const onSendCustomers = async () => {
    if (!testState || audienceCount === null) {
      return
    }
    setPageError(null)
    setPageNotice(null)
    setBusy('send')
    try {
      await refreshStaffTokensIfStale()
      const token = getStaffAccessToken()
      if (!token) {
        throw new StaffSessionUnauthorizedError()
      }
      const contentHash = await computeEmailContentHash(subject.trim(), content)
      const res = await sendStaffEmailBroadcast(token, {
        subject: subject.trim(),
        content,
        confirmationPhrase: BROADCAST_CONFIRMATION_PHRASE,
        contentHash,
        audienceCount,
        testSentAt: testState.testSentAt,
        testProof: testState.testProof,
      })
      setPageNotice(`Broadcast sent to ${res.sentCount} customers (${res.failedCount} failed).`)
      setTestState(null)
      setConfirmationPhrase('')
      await reloadAudience()
    } catch (e) {
      if (e instanceof StaffEmailDisabledError) {
        setPageError('Customer broadcast is disabled in this environment.')
      } else if (e instanceof StaffEmailConflictError) {
        setPageError(e.message)
        if (e.code === 'audience_count_mismatch') {
          await reloadAudience()
        }
      } else if (e instanceof StaffSessionUnauthorizedError) {
        setPageError('Session expired. Sign in again.')
      } else if (e instanceof StaffSessionForbiddenError) {
        setPageError('Admin group required for email tools.')
      } else if (e instanceof StaffEmailValidationError) {
        setPageError(e.message)
      } else {
        setPageError(e instanceof Error ? e.message : 'Broadcast failed.')
      }
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="container riffsync-admin-page">
        <p>Loading operator session…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container riffsync-admin-page">
        <div role="alert" className="riffsync-scaffold-note">
          <p>{error}</p>
          <p>
            <a href="/admin/login">Try operator sign-in again</a>
          </p>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="container riffsync-admin-page">
        <p>
          <Link to="/admin/login">Sign in</Link> to use email tools.
        </p>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="container riffsync-admin-page">
        <h1>Email</h1>
        <div role="alert" className="riffsync-scaffold-note">
          <p>Admin group required for email tools.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container riffsync-admin-page riffsync-admin-email-page">
      <h1>Email</h1>
      <p className="riffsync-admin-email-page__intro">
        Compose a message, send a test to your staff email, then broadcast to verified fan customers.
      </p>

      {pageError ? (
        <div role="alert" className="riffsync-scaffold-note">
          <p>{pageError}</p>
        </div>
      ) : null}
      {pageNotice ? (
        <div role="status" className="riffsync-scaffold-note riffsync-scaffold-note--success">
          <p>{pageNotice}</p>
        </div>
      ) : null}

      <div className="riffsync-admin-email-grid">
        <section aria-labelledby="email-compose-heading">
          <h2 id="email-compose-heading">Compose</h2>
          <label className="riffsync-admin-field">
            <span>Subject</span>
            <input
              type="text"
              value={subject}
              maxLength={200}
              onChange={(e) => {
                setSubject(e.target.value)
                setTestState(null)
              }}
            />
          </label>

          {content.blocks.map((block, index) => (
            <EmailBlockEditor
              key={index}
              index={index}
              block={block}
              canRemove={content.blocks.length > 1}
              onTextChange={(i, text) => {
                setBlockText(i, text)
                setTestState(null)
              }}
              onTypeChange={(i, type) => {
                setBlockType(i, type)
                setTestState(null)
              }}
              onToggleBold={(i) => {
                toggleInline(i, 'bold')
                setTestState(null)
              }}
              onToggleItalic={(i) => {
                toggleInline(i, 'italic')
                setTestState(null)
              }}
              onRemove={(i) => {
                removeBlock(i)
                setTestState(null)
              }}
            />
          ))}

          <p>
            <button type="button" className="btn btn-secondary" onClick={addBlock}>
              Add block
            </button>
          </p>

          <p>
            <button type="button" className="btn btn-primary" disabled={!canSendTest} onClick={() => void onSendTest()}>
              {busy === 'test' ? 'Sending test…' : 'Send test to me'}
            </button>
          </p>
        </section>

        <section aria-labelledby="email-preview-heading">
          <h2 id="email-preview-heading">Preview</h2>
          <div
            className="riffsync-email-preview-shell"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />

          <div className="riffsync-admin-email-audience">
            <h3>Audience</h3>
            {audienceError ? <p role="alert">{audienceError}</p> : null}
            {audienceCount !== null ? <p>Eligible customers: {audienceCount}</p> : <p>Loading audience…</p>}
            <p className="riffsync-admin-email-audience__note">
              Customer email addresses are never shown in the admin UI.
            </p>
          </div>

          <div className="riffsync-admin-email-send-panel">
            <h3>Customer broadcast</h3>
            <p>
              Sender: <strong>RiffSync &lt;noreply@riffsync.tv&gt;</strong>
            </p>
            <p>
              Last test:{' '}
              {testMatchesDraft && testState
                ? `${testState.recipient} at ${new Date(testState.testSentAt).toLocaleString()}`
                : 'Send a test for the current draft first.'}
            </p>
            <label className="riffsync-admin-field">
              <span>
                Type <code>{BROADCAST_CONFIRMATION_PHRASE}</code> to confirm
              </span>
              <input
                type="text"
                value={confirmationPhrase}
                autoComplete="off"
                onChange={(e) => setConfirmationPhrase(e.target.value)}
              />
            </label>
            <p>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canSendCustomers}
                onClick={() => void onSendCustomers()}
              >
                {busy === 'send' ? 'Sending…' : 'Send to customers'}
              </button>
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
