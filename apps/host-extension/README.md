# RiffSync Host extension

Unpacked Chrome MV3 package for the **host control panel**. A host (or
contributor) can load this directory in Chrome desktop, bind the active party
tab, and complete one title-change session without leaving that tab.

This extension **does not capture** media and does **not** supply `host_screen`.
Page `getDisplayMedia` remains the share / capture source of truth (SPA to
RoomMediaEngine to SFU). The extension does not use `tabCapture`,
desktopCapture, or offscreen capture.

Chrome hosts the UI with the Side Panel API. Product-facing copy and this
guide use **host control panel**. Do not brand the UX as "side panel."

There is no Chrome Web Store listing for this MVP. Use unpacked load only.

## What this package does

- Binds the **active** party tab when its URL is `/room/:roomId` on an allowed
  SPA origin (**C1**).
- Opens the **host control panel** from the extension toolbar action
  (`sidePanel` + `openPanelOnActionClick`).
- Reports whether a tracked host **media tab** is open, and can open or
  navigate that tab with `active: false` so the party tab stays focused.
- Shows **now playing** for the bound room (anonymous `GET /v1/rooms/{roomId}`).
- Browses the **full public catalog** library (**B1**; anonymous
  `GET /v1/catalog`).
- Changes the room title: host-authenticated `PATCH /v1/rooms/{roomId}` with
  body `{ catalogEpisodeId }`, then navigates or reuses the media tab (**A1**).

The SPA named window `riffsync-host-source` is SPA-only. The extension tracks
its own media `tabId` and does not use that window name.

## What this package does not do

These are explicit non-goals for the MVP. Do not expect them from this
extension:

- **No capture.** The extension does not capture or publish `host_screen`.
  Share still starts from the party page `getDisplayMedia` prompt.
- **No return-to-share.** Find/focus the room tab and return-to-share are
  Icebox, not the MVP path.
- **No SFU / control-plane media.** The extension must not inject
  MediaStreams, mint SFU tokens, open an SFU WebSocket, or emit `share_state`.
- **No staff catalog CRUD** from the panel.
- **No Firefox, Safari, or mobile Chrome.**
- **No Web Store** listing polish or published-extension distribution.

## Prerequisites

- Chrome desktop (Chromium-based Chrome with Developer mode).
- A signed-in **host** account on an allowed SPA origin (same Cognito host
  authority as the SPA: `JWT.sub` must equal the room `hostSub`). Anonymous
  visitors cannot mutate the room.
- The public HTTP API origin for that environment (same meaning as SPA
  `VITE_PUBLIC_API_BASE_URL`).

No build step. `package.json` ships `npm test` only. Load the package root
`apps/host-extension/` (this directory). There is no `dist/` output.

## Configure the public API origin

Set `PUBLIC_API_BASE_URL` in `config.js` to the same HTTPS origin as the SPA
env `VITE_PUBLIC_API_BASE_URL` for the target environment. Use an HTTPS
origin with a host, and no trailing slash (the helper strips a trailing
slash). Update `manifest.json` `host_permissions` to that same origin with
path `/*` (for example
`https://{api-id}.execute-api.{region}.amazonaws.com/*`).

The placeholder default in older checkouts matched the example execute-api
shape. This package ships the prod `HttpApiUrl` origin used by riffsync.tv;
keep `config.js` and `host_permissions` in sync when targeting another
environment.

Do not add SPA origins, YouTube, `https://*/*`, or capture permissions.
Allowed SPA origins for the JWT bridge are listed only under
`content_scripts.matches`, not `host_permissions`. The panel calls the public
API under that host permission (no CORS allowlist change for
`chrome-extension://`).

## Load unpacked in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this directory: `apps/host-extension/` (the folder that contains
   `manifest.json`). Do not select a `dist/` folder; this package has none.

The toolbar action title is **Open host control panel**. Pin the extension if
you want the icon visible.

## One host control panel session

Walk this once after unpacked load.

1. In Chrome, sign in as the room host on an allowed SPA origin
   (`https://riffsync.tv` or local `http://localhost:5173`).
2. Open the party tab at `/room/:roomId` and **keep that tab active**. Bind
   is **C1**: the extension reads the active tab URL only.
3. Click the extension toolbar action. The **host control panel** opens.
4. Confirm bind: the panel shows `Bound to room {roomId}`. If it says
   `Not bound to a room`, the active tab is not `/room/:roomId` on an allowed
   origin.
5. Check **Media tab**: `Open` or `Not open`. Optional: **Open media tab**
   opens or reuses the tracked media tab for the **bound room's current
   catalog title** (same host-source URL rules as the SPA **Open Source
   Tab**) without mutating the room. The new or reused tab is created or
   updated with `active: false`, so the party tab stays focused.
   **Play** / **Pause** control the party-capture YouTube embed in that
   media tab. They stay disabled for direct YouTube tabs and when the
   media tab is closed.
6. Check **Now playing** (anonymous `GET /v1/rooms/{roomId}`). Retry if the
   public API origin is wrong or the room is missing.
7. Under **Library**, browse the full public catalog (**B1**). Select another
   title (not the current now-playing row if you want a visible change).
8. Click **Change room title**. The extension:
   - requests a fan **access** JWT from the party SPA tab (JWT A, below);
   - sends host-authenticated `PATCH /v1/rooms/{roomId}` with
     `{ catalogEpisodeId }`;
   - on PATCH 200, opens or navigates the tracked media tab to the host-source
     URL for that title (`active: false`).
9. Confirm the party tab is still focused. Confirm now playing updates to the
   selected title.
10. Start or continue share from the **party page** `getDisplayMedia` prompt.
    The extension does not start capture and does not replace that path.

If title change fails with a host-sign-in error, stay on the party tab, sign
in as that room's host, reload the party page if the bridge is missing, and
retry.

## JWT bridge (JWT A)

Title change needs a host access token. The service worker asks the **bound
party tab**. A content script on allowed SPA origins relays an
origin-checked `window.postMessage` channel:

- Channel: `riffsync-host-bridge` version `1`
- Types: `HOST_JWT_REQUEST` / `HOST_JWT_RESPONSE` (plus ping/pong)
- The SPA returns a fan **access** token only. Refresh tokens never enter
  the extension. The SPA owns Cognito refresh.
- The token is ephemeral in service-worker memory for the session. It is not
  written to `chrome.storage` or disk.
- Allowed SPA origins (as shipped in `manifest.json` `content_scripts.matches`
  and the content-script allowlist):
  - `https://riffsync.tv/*`
  - `http://localhost:5173/*`
- MVP does **not** use `externally_connectable` or a hardcoded extension id.

Anonymous callers can read catalog and room now playing. Only the signed-in
host (`JWT.sub === hostSub`) can PATCH the room.

## Layout

```text
apps/host-extension/
  manifest.json              # MV3; sidePanel, tabs; API host_permissions; SPA content_scripts
  background.js              # host control panel on action; media tab; title PATCH
  host-control-panel.html    # host control panel UI
  host-control-panel.js      # bind, media-tab, library, now playing, title change
  host-bridge-content.js     # SPA origin-checked JWT bridge relay
  config.js                  # PUBLIC_API_BASE_URL (match SPA API origin)
  publicApiBaseUrl.js        # HTTPS origin helper (trim, strip trailing slash)
  catalogApi.js              # anonymous GET /v1/catalog + normalize
  roomsApi.js                # anonymous GET /v1/rooms/{id}; host PATCH catalogEpisodeId
  hostSourceTabUrl.js        # pure host-source URL resolver (SPA parity)
  boundHostSourceTabUrl.js   # resolve media URL from bound room + library
  roomBind.js                # C1 /room/:roomId bind on allowed SPA origins
  mediaTab.js                # inactive create/update + one tracked media tabId
  hostBridge.js              # riffsync-host-bridge v1 envelope
  hostJwt.js                 # ephemeral SW access-token cache + JWT request
  package.json               # test command only (no build)
  README.md
```

## Test

From this directory:

```bash
npm test
```

From the riffsync repo root:

```bash
npm test --prefix apps/host-extension
```

That runs `node --test` on this package only. Helpers are local to
`apps/host-extension` and do not import `apps/web`.

## Related

- Epic (tracking): https://github.com/StacksOnTheRacks/riffsync/issues/426
