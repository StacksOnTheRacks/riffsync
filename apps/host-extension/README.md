# RiffSync Host extension

Unpacked Chrome MV3 package for the **host control panel**. Load this directory
from `chrome://extensions` (Developer mode, then Load unpacked).

This extension **does not capture** media and does not supply `host_screen`.
Capture remains out of this package (ADR-001).

The Chrome Side Panel API hosts the UI. Product-facing copy uses **host control
panel**.

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
  roomBind.js                # C1 /room/:roomId bind on allowed SPA origins
  mediaTab.js                # inactive create/update + one tracked media tabId
  hostBridge.js              # riffsync-host-bridge v1 envelope
  hostJwt.js                 # ephemeral SW access-token cache + JWT request
  package.json               # documented test command
  README.md
```

## Public API origin

Set `PUBLIC_API_BASE_URL` in `config.js` to the same HTTPS origin as the SPA
env `VITE_PUBLIC_API_BASE_URL` for the target environment (trailing slash is
stripped). Update `manifest.json` `host_permissions` to that same origin with
path `/*` (for example `https://{api-id}.execute-api.{region}.amazonaws.com/*`).

Do not add SPA origins, YouTube, `https://*/*`, or capture permissions. The
placeholder default matches the example execute-api shape; replace both values
before using a real environment. The panel loads the public catalog with
anonymous `GET {base}/v1/catalog` and now playing with anonymous
`GET {base}/v1/rooms/{roomId}` under that host permission (no CORS allowlist
change for `chrome-extension://`).

## JWT bridge

Title change uses a host-authenticated `PATCH /v1/rooms/{roomId}` with body
`{ catalogEpisodeId }`. The fan **access** JWT comes from the party SPA tab
via a content-script bridge (`riffsync-host-bridge` v1):

- The host must be signed in on the party SPA tab (`https://riffsync.tv` or
  `http://localhost:5173`).
- The service worker asks the content script on that tab; the SPA responds
  with an access token only. Refresh tokens never enter the extension.
- Tokens stay in service-worker memory for the session. They are not written
  to `chrome.storage` or disk.
- Content scripts match those SPA origins only. SPA origins are not added to
  `host_permissions`.

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

## Host media tab and title change

With the active tab on `/room/:roomId` at `https://riffsync.tv` or
`http://localhost:5173`, the panel binds that room, shows now playing, and
lets the host apply a selected library title. After PATCH 200, the extension
opens or reuses one media tab with `active: false` so the party tab stays focused.

**Open media tab** still resolves a fixture catalog row for the current bind
without mutating the room.

## Related

- Epic: https://github.com/StacksOnTheRacks/riffsync/issues/426
- Product spec: `product/specs/host-chrome-extension.spec.md`
