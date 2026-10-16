# RiffSync Host extension

Chrome MV3 package that helps room hosts open and control a **media tab in the
background** without leaving the watch-party tab. The **host control panel UI
lives in the party Room tab** (SPA). This package does not ship a Chrome Side
Panel.

This extension **does not capture** media and does **not** supply `host_screen`.
Page `getDisplayMedia` remains the share / capture source of truth (SPA to
RoomMediaEngine to SFU). The extension does not use `tabCapture`,
desktopCapture, or offscreen capture.

## Install (Chrome Web Store)

Install **RiffSync Host** from the Chrome Web Store once the listing is
published (public URL recorded at publish time — see repo issues **#479** /
**#480**). That is the default install path for hosts on `https://riffsync.tv`.

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

## Prerequisites

- Chrome desktop (Chromium-based Chrome).
- A signed-in **host** account on `https://riffsync.tv`.
- The public HTTP API origin for that environment (same meaning as SPA
  `VITE_PUBLIC_API_BASE_URL`) when using any SW API helpers.

## Hosting with the Room tab

1. Sign in as the room host on `https://riffsync.tv` — normal tab or installed
   PWA.
2. Open `/room/:roomId` and open the **Room** sidebar tab.
3. With this extension installed, use **Open Media Source Tab**, then **Start
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
- Store build content scripts: `https://riffsync.tv/*` only. Unpacked dev load
  may also include `http://localhost:5173/*`.
- No `externally_connectable`.

## Chrome Web Store packaging (operators)

Release operators produce a deterministic upload zip from this package (no
runtime behavior change vs the shipped MV3 sources):

```bash
npm run package:store --prefix apps/host-extension
```

Output: `apps/host-extension/dist/riffsync-host-{manifestVersion}.zip` (version
from `manifest.json`, currently `0.2.0`). The zip includes manifest, service
worker, content script, popup HTML, `config.js`, and toolbar/listing icons
(16/48/128). It excludes `*.test.js`, `node_modules`, `dist`, and other
non-runtime files. The packaged `manifest.json` uses production-only
`content_scripts.matches` (`https://riffsync.tv/*`).

**Manual upload (not automated in CI):**

1. Open the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Create or select the **RiffSync Host** item.
3. Upload `dist/riffsync-host-{version}.zip` as a new package version.
4. Complete listing fields, privacy disclosures, and submit for review per
   Google policy. Record the published listing URL for downstream env wiring
   (see repo issue #479).

## Developer: load unpacked

For local SPA development on `http://localhost:5173`, use an unpacked load of
**this source tree** (not the store zip):

1. Set `PUBLIC_API_BASE_URL` in `config.js` and matching `host_permissions` in
   `manifest.json` for your target API environment.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load
   unpacked**, and select `apps/host-extension/` (the folder containing
   `manifest.json`).

The toolbar action opens a short popup that points hosts to the party **Room**
tab.

## Layout

```text
apps/host-extension/
  manifest.json              # MV3; tabs; API host_permissions; SPA content_scripts
  background.js              # media tab + playback + optional changeTitle
  action-popup.html          # points hosts to the Room tab
  host-bridge-content.js     # page↔SW relay + presence ping
  config.js                  # PUBLIC_API_BASE_URL
  icons/                     # 16/48/128 store + toolbar icons
  scripts/package-store-zip.mjs
  dist/                      # generated store zip (gitignored)
  ... helpers / tests ...
  README.md
```

## Test

```bash
npm test --prefix apps/host-extension
```

## Related

- Epic (tracking): https://github.com/StacksOnTheRacks/riffsync/issues/426
