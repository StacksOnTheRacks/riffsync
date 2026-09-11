import { Link, useSearchParams } from 'react-router-dom'
import {
  startFanHostedUiForgotPassword,
  startFanHostedUiSignIn,
  startFanHostedUiSignOut,
} from '../auth/fanHostedUiPkce'
import { useFanSession } from '../auth/useFanSession'
import { ChannelHero } from '../components/channel/ChannelHero'
import { FAN_DISPLAY_NAME_MAX_LEN } from '../session/guestSession'
import {
  ACCOUNT_AVATAR_URL,
  ACCOUNT_COVER_URL,
  ACCOUNT_HEADING,
  ACCOUNT_SUBTITLE,
} from './accountAssets'
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

  return (
    <div className="riffsync-channel-layout riffsync-account-page">
      <ChannelHero
        coverUrl={ACCOUNT_COVER_URL}
        avatarUrl={ACCOUNT_AVATAR_URL}
        avatarVariant="glyph"
        visualTitle={ACCOUNT_HEADING}
        visualTitleAs="h1"
        subtitle={ACCOUNT_SUBTITLE}
      />
      <section className="riffsync-channel-layout__body">
        <div className="container riffsync-channel-layout__container">
          <div className="riffsync-account-page__panel">
            {!fanToken ? (
              <>
                <p className="riffsync-account-page__lede">
                  Sign in to manage your display name, avatar, and password.
                </p>
                <p>
                  <button
                    type="button"
                    className="gen-button"
                    onClick={() => void startFanHostedUiSignIn('/account').catch(console.error)}
                  >
                    Sign In
                  </button>
                </p>
              </>
            ) : (
              <>
                {passwordResetComplete ? (
                  <p className="riffsync-account-page__success" role="status">
                    Your password was updated successfully.
                  </p>
                ) : null}
                {profileLoading ? (
                  <p className="riffsync-account-page__status" role="status">
                    Loading profile…
                  </p>
                ) : null}

                {profileLoadErr ? (
                  <p className="riffsync-account-page__err" role="alert">
                    {profileLoadErr}
                  </p>
                ) : null}

                <section
                  className="riffsync-account-page__card"
                  aria-labelledby="riffsync-account-profile-heading"
                >
                  <h2 id="riffsync-account-profile-heading" className="riffsync-account-page__card-title">
                    Profile
                  </h2>
                  <div className="riffsync-account-page__avatar-block">
                    <span className="riffsync-account-page__label" id="riffsync-account-avatar-label">
                      Avatar
                    </span>
                    <div
                      className="riffsync-account-page__avatar-preview"
                      aria-labelledby="riffsync-account-avatar-label"
                      aria-busy={profileAvatarLoading || profileAvatarUploading}
                    >
                      {profileAvatarUrl ? (
                        <img
                          src={profileAvatarUrl}
                          alt=""
                          className="riffsync-account-page__avatar-img"
                        />
                      ) : (
                        <span className="riffsync-account-page__avatar-placeholder" aria-hidden>
                          ?
                        </span>
                      )}
                    </div>
                    <input
                      ref={profileAvatarInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="riffsync-account-page__avatar-input"
                      onChange={onProfileAvatarSelected}
                    />
                    <button
                      type="button"
                      className="gen-button"
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
                      <p className="riffsync-account-page__err" role="alert">
                        {profileAvatarErr}
                      </p>
                    ) : null}
                  </div>

                  <label className="riffsync-account-page__label" htmlFor="riffsync-account-display-name">
                    Display name
                  </label>
                  <input
                    id="riffsync-account-display-name"
                    className="riffsync-account-page__field"
                    maxLength={FAN_DISPLAY_NAME_MAX_LEN}
                    value={profileDraft}
                    disabled={profileLoading}
                    onChange={(e) => setProfileDraft(e.target.value)}
                    autoComplete="nickname"
                  />
                  {profileSaveErr ? (
                    <p className="riffsync-account-page__err" role="alert">
                      {profileSaveErr}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="gen-button riffsync-account-page__save"
                    disabled={profileSaving || profileLoading}
                    onClick={saveProfileDisplayName}
                  >
                    {profileSaving ? 'Saving…' : 'Save display name'}
                  </button>
                </section>

                <section
                  className="riffsync-account-page__card"
                  aria-labelledby="riffsync-account-security-heading"
                >
                  <h2 id="riffsync-account-security-heading" className="riffsync-account-page__card-title">
                    Security
                  </h2>
                  <p className="riffsync-account-page__lede">
                    Reset your password through email verification. You&apos;ll return here when finished.
                  </p>
                  <div className="riffsync-account-page__actions">
                    <Link
                      to="/auth/change-password"
                      className="gen-button gen-button--ghost"
                      data-testid="fan-account-change-password"
                    >
                      Change password
                    </Link>
                    <button
                      type="button"
                      className="gen-button gen-button--ghost"
                      onClick={() => void startFanHostedUiForgotPassword('/account').catch(console.error)}
                    >
                      Reset password
                    </button>
                    <button type="button" className="gen-button" onClick={() => startFanHostedUiSignOut()}>
                      Log out
                    </button>
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
