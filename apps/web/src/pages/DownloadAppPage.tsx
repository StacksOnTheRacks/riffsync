import { useEffect, useState } from 'react'
import { SITE_DOCUMENT_TITLE } from '../config/documentTitle'
import { usePwaInstallPrompt } from '../pwa/usePwaInstallPrompt'

export function DownloadAppPage() {
  const { canPrompt, isInstalled, promptInstall } = usePwaInstallPrompt()
  const [installAccepted, setInstallAccepted] = useState(false)

  useEffect(() => {
    const previous = document.title
    document.title = `Install the RiffSync app - ${SITE_DOCUMENT_TITLE}`
    return () => {
      document.title = previous
    }
  }, [])

  const onInstall = async () => {
    const accepted = await promptInstall()
    setInstallAccepted(accepted)
  }

  return (
    <div className="riffsync-legal riffsync-download-app">
      <div className="container">
        <h1>Install the RiffSync app</h1>
        <p className="riffsync-legal__meta text-muted">
          Add RiffSync to your phone, tablet, dock, or taskbar for a focused watch-party window.
        </p>

        {isInstalled ? (
          <section aria-live="polite">
            <h2>You are using the installed app</h2>
            <p>
              RiffSync is already running in app mode. Open it from your home screen, dock, or taskbar
              next time you want to browse the catalog or join a watch party.
            </p>
          </section>
        ) : (
          <section>
            <h2>What installing does</h2>
            <p>
              Installing RiffSync adds a launcher icon and opens the site in a standalone app window.
              Your account, rooms, catalog, chat, and watch-party links stay the same. RiffSync still
              needs an internet connection for YouTube playback, room chat, and realtime video sharing.
            </p>
            {canPrompt ? (
              <button type="button" className="gen-button" onClick={() => void onInstall()}>
                Install RiffSync
              </button>
            ) : null}
            {installAccepted ? (
              <p className="riffsync-download-app__status" role="status">
                RiffSync was added. Open it from your app launcher next time.
              </p>
            ) : null}
          </section>
        )}

        <section>
          <h2>Chrome or Edge on desktop</h2>
          <ol>
            <li>Open <strong>riffsync.tv</strong> in Chrome or Edge.</li>
            <li>
              If this page shows an <strong>Install RiffSync</strong> button, use it.
            </li>
            <li>
              Otherwise, look for the install icon in the address bar or open the browser menu and
              choose <strong>Install RiffSync</strong> or <strong>Apps</strong>.
            </li>
            <li>Launch RiffSync from your dock, Start menu, taskbar, or app launcher.</li>
          </ol>
        </section>

        <section>
          <h2>iPhone or iPad Safari</h2>
          <ol>
            <li>Open <strong>riffsync.tv</strong> in Safari.</li>
            <li>Tap the <strong>Share</strong> button.</li>
            <li>Choose <strong>Add to Home Screen</strong>.</li>
            <li>Tap <strong>Add</strong>, then open RiffSync from your home screen.</li>
          </ol>
        </section>

        <section>
          <h2>Mac Safari</h2>
          <ol>
            <li>Open <strong>riffsync.tv</strong> in Safari.</li>
            <li>Use <strong>File</strong> then <strong>Add to Dock</strong>.</li>
            <li>Open RiffSync from your Dock when you want the app-style window.</li>
          </ol>
        </section>

        <section>
          <h2>Firefox and other browsers</h2>
          <p>
            Some browsers do not offer the same app install prompt. If your browser does not show an
            install option, use Chrome, Edge, or Safari for the easiest RiffSync app experience.
          </p>
        </section>

        <section>
          <h2>Troubleshooting</h2>
          <h3>I do not see an install option</h3>
          <p>
            Make sure you are on <strong>https://riffsync.tv</strong>, refresh the page, and check your
            browser menu. Some browsers hide the option after you dismiss it.
          </p>

          <h3>Will rooms work offline?</h3>
          <p>
            No. The installed app is still connected to the live RiffSync service. Rooms, chat, YouTube
            playback, and video sharing need the network.
          </p>

          <h3>Can I still use normal browser tabs?</h3>
          <p>
            Yes. Installing the app does not change the website. Links to rooms and catalog pages keep
            working in regular browser tabs.
          </p>
        </section>
      </div>
    </div>
  )
}
