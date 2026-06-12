import { Link } from 'react-router-dom'
import type { TheaterPlaybackSnapshot } from './sessions/TheaterPlayback'
import { RIFFSYNC_THEATER_AUDIO_STATUS_ID, RIFFSYNC_VIDEO_RELAY_STATUS_ID } from './drawerErrorPresentation'

type RoomPlaybackPanelProps = {
  isPublisher: boolean
  captureStream: MediaStream | null
  captureErr: string | null
  patchErr: string | null
  renameModalOpen: boolean
  guestRemote: MediaStream | null
  fanToken: string | null
  theaterPlaybackSnapshot: TheaterPlaybackSnapshot
  videoRelayStatus: string | null
  theaterAudioStatus: string | null
  bindHostCaptureVideo: (element: HTMLVideoElement | null) => void
  bindGuestVideo: (element: HTMLVideoElement | null) => void
  playHostCapturePreview: () => Promise<void>
  playGuestVideo: () => Promise<void>
  startCapture: () => Promise<void>
  openCapturePlayerTab: () => void
}

export function RoomPlaybackPanel({
  isPublisher,
  captureStream,
  captureErr,
  patchErr,
  renameModalOpen,
  guestRemote,
  fanToken,
  theaterPlaybackSnapshot,
  videoRelayStatus,
  theaterAudioStatus,
  bindHostCaptureVideo,
  bindGuestVideo,
  playHostCapturePreview,
  playGuestVideo,
  startCapture,
  openCapturePlayerTab,
}: RoomPlaybackPanelProps) {
  const hideGuestPlaceholder = !guestRemote && Boolean(videoRelayStatus)

  if (isPublisher) {
    return (
      <section className="riffsync-room-page__playback" aria-label="Your shared stream preview">
        {captureStream && theaterPlaybackSnapshot.hostCapturePlayHint ? (
          <p className="riffsync-room-page__guest-actions">
            <button type="button" className="gen-button" onClick={() => void playHostCapturePreview()}>
              Play preview
            </button>
          </p>
        ) : null}
        <div className="riffsync-room-page__player-shell riffsync-room-page__player-shell--guest">
          {captureStream ? (
            <video
              ref={bindHostCaptureVideo}
              className="riffsync-room-page__guest-video"
              playsInline
              controls
              muted={false}
            />
          ) : (
            <div className="riffsync-room-page__host-preview-placeholder">
              <p className="riffsync-room-page__host-preview-intro">
                This is your presentation screen. Whatever appears here is what your guests see in the theater.
              </p>
              <p className="riffsync-room-page__host-preview-intro">
                First open a source media tab by clicking <strong>Open Source Tab</strong>. Then come back to this tab
                and click <strong>Share Source Tab</strong>. In the picker, choose the tab whose title starts with{' '}
                <strong>Share this tab</strong>.
              </p>
              <div className="riffsync-room-page__center-share-buttons">
                <button type="button" className="gen-button" onClick={openCapturePlayerTab}>
                  Open Source Tab
                </button>
                <button type="button" className="gen-button" onClick={() => void startCapture()}>
                  Share Source Tab
                </button>
                <Link
                  className="gen-button"
                  to="/how-to-host-a-watchparty"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Hosting Guide
                </Link>
              </div>
            </div>
          )}
        </div>

        {videoRelayStatus ? (
          <p
            id={RIFFSYNC_VIDEO_RELAY_STATUS_ID}
            className="riffsync-room-page__share-status"
            role="status"
            aria-live="polite"
          >
            {videoRelayStatus}
          </p>
        ) : null}

        {theaterAudioStatus ? (
          <p
            id={RIFFSYNC_THEATER_AUDIO_STATUS_ID}
            className="riffsync-muted"
            role="status"
            aria-live="polite"
          >
            {theaterAudioStatus}
          </p>
        ) : null}

        {captureErr || (patchErr && !renameModalOpen) ? (
          <div className="riffsync-room-page__host-feedback" aria-label="Host notices">
            {patchErr && !renameModalOpen ? (
              <p className="riffsync-room-page__host-feedback-alert" role="alert">
                {patchErr}
              </p>
            ) : null}
            {captureErr ? (
              <p className="riffsync-room-page__host-feedback-alert" role="alert">
                {captureErr}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    )
  }

  return (
    <section className="riffsync-room-page__playback" aria-label="Guest playback">
      <span className="sr-only">
        Watching the shared video stream from this room&apos;s host. If playback stays black, confirm the host is sharing
        in another browser; use Play if prompted. If you hear no audio, check that the video is not muted in the player
        controls.
      </span>
      {videoRelayStatus ? (
        <p
          id={RIFFSYNC_VIDEO_RELAY_STATUS_ID}
          className="riffsync-muted"
          role="status"
          aria-live="polite"
        >
          {videoRelayStatus}
        </p>
      ) : null}
      {theaterAudioStatus ? (
        <p
          id={RIFFSYNC_THEATER_AUDIO_STATUS_ID}
          className="riffsync-muted"
          role="status"
          aria-live="polite"
        >
          {theaterAudioStatus}
        </p>
      ) : null}
      {theaterPlaybackSnapshot.guestPlayHint ? (
        <p className="riffsync-room-page__guest-actions">
          <button type="button" className="gen-button" onClick={() => void playGuestVideo()}>
            Play video
          </button>
        </p>
      ) : null}
      <div className="riffsync-room-page__player-shell riffsync-room-page__player-shell--guest">
        {!guestRemote && !hideGuestPlaceholder ? (
          <div className="riffsync-room-page__guest-video-placeholder" role="status">
            <p>The host is not sharing video right now.</p>
          </div>
        ) : null}
        <video
          ref={bindGuestVideo}
          className="riffsync-room-page__guest-video"
          playsInline
          controls
          muted={false}
          hidden={!guestRemote}
        />
      </div>
      {fanToken ? (
        <p className="sr-only">
          You are signed in as a guest. Only the party creator can rename the room and share video.
        </p>
      ) : (
        <p className="sr-only">
          You can read chat without signing in. Sign in near the chat box to send messages.
        </p>
      )}
    </section>
  )
}
