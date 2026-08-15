import { useEffect } from 'react'
import { SITE_DOCUMENT_TITLE } from '../config/documentTitle'

export function HowToHostWatchPartyPage() {
  useEffect(() => {
    const previous = document.title
    document.title = `How to Host a Watch Party - ${SITE_DOCUMENT_TITLE}`
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <div className="riffsync-legal">
      <div className="container">
        <h1>How to host a watch party</h1>
        <p className="riffsync-legal__meta text-muted">
          Sharing your screen with RiffSync — step by step and common fixes.
        </p>

        <section>
          <h2>What hosting means here</h2>
          <p>
            As the host, you run the official YouTube player in a separate browser tab and{' '}
            <strong>share that tab</strong> back into the watch party room. Guests see the same picture
            and hear the same audio as that tab—including ads or buffering—without running their own
            YouTube player in sync.
          </p>
        </section>

        <section>
          <h2>Before you start</h2>
          <ul>
            <li>
              <strong>Sign in</strong> with the same account that created the room (the party creator).
            </li>
            <li>
              Open your room at <code>/room/…</code> in a normal tab — not in a tiny pop-out that blocks
              screen sharing.
            </li>
            <li>
              Use a recent <strong>Chrome</strong> or <strong>Edge</strong> if you can; tab sharing is
              most reliable there. Other browsers may work but are less tested.
            </li>
          </ul>
        </section>

        <section>
          <h2>Steps</h2>
          <ol>
            <li>
              <strong>Open the source tab.</strong> In the room, use <strong>Open Source Tab</strong>.
              That opens the episode player in a new tab (solo watch layout).
            </li>
            <li>
              <strong>Start playback there.</strong> Get the episode playing with sound in that tab — the
              tab you will share is the one guests should experience.
            </li>
            <li>
              <strong>Share that tab into the room.</strong> Back on the watch party room tab, choose{' '}
              <strong>Share Source Tab</strong>. When the browser asks what to share, pick the{' '}
              <strong>player tab</strong> (the one with the video), <strong>not</strong> the watch party
              room tab.
            </li>
            <li>
              <strong>Check the preview.</strong> The large frame on the room page should show what
              guests will see. If it is wrong, stop sharing and pick the correct tab again.
            </li>
            <li>
              <strong>Stop when you are done.</strong> Use your browser&apos;s{' '}
              <strong>Stop sharing</strong> control (often a banner or chip at the top of the tab while
              sharing). You can close or refresh the source tab when you are finished.
            </li>
          </ol>
        </section>

        <section>
          <h2 id="host-extension">Install the Host extension</h2>
          <p>
            The <strong>Room</strong> tab is the host control panel. Opening and retargeting the media
            tab in the background (without leaving the party) needs the unpacked{' '}
            <strong>RiffSync Host</strong> Chrome extension. Without it, the Room tab still works for
            copy link, rename, visibility, and the stage Open / Share Source Tab flow.
          </p>
          <ol>
            <li>
              Use <strong>Chrome</strong> on desktop (Developer mode).
            </li>
            <li>
              Open <code>chrome://extensions</code>, turn on <strong>Developer mode</strong>, then{' '}
              <strong>Load unpacked</strong>.
            </li>
            <li>
              Select the <code>apps/host-extension/</code> folder from the RiffSync repo (the folder that
              contains <code>manifest.json</code>).
            </li>
            <li>
              Reload your party page. Open the <strong>Room</strong> tab — you should see Open Media
              Source Tab, Next Up, and Catalog instead of Install Host Extension.
            </li>
          </ol>
          <p>
            There is no Chrome Web Store listing yet. Installed PWAs work: host UI lives in the page, not
            in a Chrome side panel.
          </p>
        </section>

        <section>
          <h2>FAQ</h2>

          <h3>I hear double audio or an echo while hosting</h3>
          <p>
            You are probably hearing the same audio twice: once from the <strong>shared player tab</strong>{' '}
            and once from the <strong>watch party room tab</strong> (which previews what you are sending).
          </p>
          <p>
            <strong>Do this:</strong> mute or turn down the <strong>Watch Party room tab</strong> — the
            preview <code>&lt;video&gt;</code> on the room page — <strong>not</strong> the shared YouTube
            tab. If you mute the tab you are sharing, your guests often lose that audio on their side.
          </p>
          <p>
            Headphones help a lot: they stop your microphone from picking up speakers and feeding echo into
            chat or recordings.
          </p>

          <h3>Guests see a black screen or &ldquo;Play video&rdquo; forever</h3>
          <p>
            Confirm you are still sharing the correct tab, you did not mute the wrong surface, and the
            episode is actually playing in the source tab. Ask guests to refresh once. See the project
            docs if you are on strict networks — WebRTC may need relay (TURN) in some environments.
          </p>

          <h3>The browser will not share or permissions failed</h3>
          <p>
            Check site permissions for screen capture, try another browser, and make sure you are not on
            a managed device that blocks <code>getDisplayMedia</code>.
          </p>

          <h3>I picked the wrong tab in the picker</h3>
          <p>
            Stop sharing, then start <strong>Share Source Tab</strong> again and choose the tab that shows
            the YouTube player.
          </p>

          <h3>Do I need two monitors?</h3>
          <p>
            No, but it can be convenient: one screen for the room + chat and one for the player. A
            single monitor works if you switch tabs or stack windows.
          </p>
        </section>
      </div>
    </div>
  )
}
