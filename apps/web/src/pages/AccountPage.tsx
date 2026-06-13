import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  startFanHostedUiForgotPassword,
  startFanHostedUiSignIn,
  startFanHostedUiSignOut,
} from '../auth/fanHostedUiPkce'
import { useFanSession } from '../auth/useFanSession'
import { SITE_DOCUMENT_TITLE } from '../config/documentTitle'
import { FAN_DISPLAY_NAME_MAX_LEN } from '../session/guestSession'
import { useAccountProfile } from './useAccountProfile'

export function AccountPage() {
  const [searchParams] = useSearchParams()
  const passwordResetComplete = searchParams.get('passwordReset') === '1'
  const { fanToken } = useFanSession()
  const {
    profileDraft,
    setProfileDraft,
    profileSaveErr,
    profileSaving,
    profileLoading,
    profileLoadErr,
    profileAvatarUrl,
    profileAvatarLoading,
    profileAvatarUploading,
    profileAvatarErr,
    profileAvatarInputRef,
    saveProfileDisplayName,
    onProfileAvatarSelected,
  } = useAccountProfile(fanToken)

  useEffect(() => {
    const prev = document.title
    document.title = `Account · ${SITE_DOCUMENT_TITLE}`
    return () => {
      document.title = prev
    }
  }, [])

  if (!fanToken) {
    return (
      <div className="container riffsync-account riffsync-account--signed-out">
        <h1>Account</h1>
        <p className="riffsync-muted">Sign in to manage your display name, avatar, and password.</p>
        <p>
          <button
            type="button"
            className="gen-button"
            onClick={() => void startFanHostedUiSignIn('/account').catch(console.error)}
          >
            Sign In
          </button>
        </p>
        <p>
          <Link to="/catalog">← Catalog</Link>
        </p>
      </div>
    )
  }

  return (
    <div className="container riffsync-account">
      <header className="riffsync-account__header">
        <h1>Account</h1>
        {passwordResetComplete ? (
          <p className="riffsync-account__success" role="status">
            Your password was updated successfully.
          </p>
        ) : null}
        <p className="riffsync-muted riffsync-account__lede">
          Update how you appear in chat and rooms. Password changes use secure email verification through
          Cognito.
        </p>
      </header>

      {profileLoading ? (
        <p className="riffsync-muted" role="status">
          Loading profile…
        </p>
      ) : null}

      {profileLoadErr ? (
        <p className="riffsync-account__err" role="alert">
          {profileLoadErr}
        </p>
      ) : null}

      <section className="riffsync-account__section" aria-labelledby="riffsync-account-profile-heading">
        <h2 id="riffsync-account-profile-heading">Profile</h2>
        <div className="riffsync-account__avatar-block">
          <span className="riffsync-room-page__profile-label" id="riffsync-account-avatar-label">
            Avatar
          </span>
          <div
            className="riffsync-room-page__profile-avatar-preview"
            aria-labelledby="riffsync-account-avatar-label"
            aria-busy={profileAvatarLoading || profileAvatarUploading}
          >
            {profileAvatarUrl ? (
              <img
                src={profileAvatarUrl}
                alt=""
                className="riffsync-room-page__profile-avatar-img"
              />
            ) : (
              <span className="riffsync-room-page__profile-avatar-placeholder" aria-hidden>
                ?
              </span>
            )}
          </div>
          <input
            ref={profileAvatarInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="riffsync-room-page__profile-avatar-input"
            onChange={onProfileAvatarSelected}
          />
          <button
            type="button"
            className="gen-button riffsync-room-page__profile-avatar-btn"
            disabled={profileAvatarLoading || profileAvatarUploading}
            onClick={() => profileAvatarInputRef.current?.click()}
          >
            {profileAvatarUploading
              ? 'Uploading…'
              : profileAvatarUrl
                ? 'Replace image'
                : 'Choose image'}
          </button>
          {profileAvatarErr ? (
            <p className="riffsync-room-page__profile-err" role="alert">
              {profileAvatarErr}
            </p>
          ) : null}
        </div>

        <label className="riffsync-room-page__profile-label" htmlFor="riffsync-account-display-name">
          Display name
        </label>
        <input
          id="riffsync-account-display-name"
          className="riffsync-room-page__profile-field"
          maxLength={FAN_DISPLAY_NAME_MAX_LEN}
          value={profileDraft}
          disabled={profileLoading}
          onChange={(e) => setProfileDraft(e.target.value)}
          autoComplete="nickname"
        />
        {profileSaveErr ? (
          <p className="riffsync-room-page__profile-err" role="alert">
            {profileSaveErr}
          </p>
        ) : null}
        <button
          type="button"
          className="gen-button riffsync-room-page__profile-save"
          disabled={profileSaving || profileLoading}
          onClick={saveProfileDisplayName}
        >
          {profileSaving ? 'Saving…' : 'Save display name'}
        </button>
      </section>

      <section className="riffsync-account__section" aria-labelledby="riffsync-account-security-heading">
        <h2 id="riffsync-account-security-heading">Security</h2>
        <p className="riffsync-muted">
          Reset your password through email verification. You&apos;ll return here when finished.
        </p>
        <div className="riffsync-account__actions">
          <button
            type="button"
            className="gen-button gen-button--ghost"
            onClick={() => void startFanHostedUiForgotPassword('/account').catch(console.error)}
          >
            Reset password
          </button>
          <button
            type="button"
            className="gen-button"
            onClick={() => startFanHostedUiSignOut()}
          >
            Log out
          </button>
        </div>
      </section>
    </div>
  )
}
