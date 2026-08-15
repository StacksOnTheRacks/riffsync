# RiffSync Host extension

Unpacked Chrome MV3 package that helps room hosts open and control a **media
tab in the background** without leaving the watch-party tab. The **host
control panel UI lives in the party Room tab** (SPA). This package does not
ship a Chrome Side Panel.

This extension **does not capture** media and does **not** supply `host_screen`.
Page `getDisplayMedia` remains the share / capture source of truth (SPA to
RoomMediaEngine to SFU). The extension does not use `tabCapture`,
desktopCapture, or offscreen capture.

There is no Chrome Web Store listing for this MVP. Use unpacked load only.

## What this package does

- Answers a page-initiated presence ping so the Room tab can detect the
  extension (works in normal Chrome and in the installed desktop PWA).
- Binds the party tab when its URL is `/room/:roomId` on an allowed SPA origin
  (**C1**), preferring the content-script sender tab.
- Opens or navigates a tracked **media tab** with `active: false` so the party
  tab stays focused.
- Reports whether that media tab is open and whether play/pause is available
  (RiffSync party-capture embed URLs only — not direct youtube.com tabs).
- Relays play/pause to the media tab and hosts the JWT A content-script bridge
  for any remaining extension-initiated title-change paths.

The SPA named window `riffsync-host-source` is the **no-extension** fallback.
When the extension is present, the Room tab drives media-tab open via this
package.

## What this package does not do

- **No Chrome Side Panel / host control panel HTML.** Host UI is the Room tab.
- **No capture.** Share still starts from the party page `getDisplayMedia`
  prompt (Room tab **Start Broadcasting** or stage Share Source Tab without
  the extension).
- **No return-to-share.** Find/focus the room tab and return-to-share are
  Icebox.
- **No SFU / control-plane media.**
- **No Firefox, Safari, or mobile Chrome.**
- **No Web Store** listing.

## Prerequisites

- Chrome desktop (Chromium-based Chrome with Developer mode).
- A signed-in **host** account on an allowed SPA origin.
- The public HTTP API origin for that environment (same meaning as SPA
  `VITE_PUBLIC_API_BASE_URL`) when using any SW API helpers.

No build step. Load the package root `apps/host-extension/` (this directory).

## Configure the public API origin

Set `PUBLIC_API_BASE_URL` in `config.js` to the same HTTPS origin as the SPA
env `VITE_PUBLIC_API_BASE_URL`. Update `manifest.json` `host_permissions` to
that same origin with path `/*`. Keep them in sync across environments.

## Load unpacked in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this directory: `apps/host-extension/` (the folder that contains
   `manifest.json`).

The toolbar action opens a short popup that points hosts to the party **Room**
tab. Pin the extension if you want the icon visible.

## Hosting with the Room tab

1. Sign in as the room host on `https://riffsync.tv` (or local
   `http://localhost:5173`) — normal tab or installed PWA.
2. Open `/room/:roomId` and open the **Room** sidebar tab.
3. With this extension loaded, use **Open Media Source Tab**, then **Start
   Broadcasting**. Use Next Up / Catalog to queue titles; fast-forward plays
   the next queued item.
4. Without the extension, Room tab shows **Install Host Extension** and the
   stage still offers Open Source Tab / Share Source Tab.

See also `/how-to-host-a-watchparty#host-extension`.

## Bridge (`riffsync-host-bridge` v1)

- Extension→page: JWT A (`HOST_JWT_REQUEST` / `HOST_JWT_RESPONSE`) and media
  play/pause on party-capture tabs.
- Page→extension: `HOST_EXTENSION_PING` / `HOST_EXTENSION_PONG`, media-tab
  get-state / open, and playback commands (content script ↔ service worker).
- Allowed SPA origins: `https://riffsync.tv/*`, `http://localhost:5173/*`.
- No `externally_connectable`.

## Layout

```text
apps/host-extension/
  manifest.json              # MV3; tabs; API host_permissions; SPA content_scripts
  background.js              # media tab + playback + optional changeTitle
  action-popup.html          # points hosts to the Room tab
  host-bridge-content.js     # page↔SW relay + presence ping
  config.js                  # PUBLIC_API_BASE_URL
  ... helpers / tests ...
  README.md
```

## Test

```bash
npm test --prefix apps/host-extension
```

## Related

- Epic (tracking): https://github.com/StacksOnTheRacks/riffsync/issues/426
