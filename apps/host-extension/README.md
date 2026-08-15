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
  manifest.json              # MV3; sidePanel, tabs; host_permissions for public API
  background.js              # host control panel on action; media tab session
  host-control-panel.html    # host control panel UI
  host-control-panel.js      # bind, media-tab, catalog library browse/select
  config.js                  # PUBLIC_API_BASE_URL (match SPA API origin)
  publicApiBaseUrl.js        # HTTPS origin helper (trim, strip trailing slash)
  catalogApi.js              # anonymous GET /v1/catalog + normalize
  hostSourceTabUrl.js        # pure host-source URL resolver (SPA parity)
  roomBind.js                # C1 /room/:roomId bind on allowed SPA origins
  mediaTab.js                # inactive create/update + one tracked media tabId
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
anonymous `GET {base}/v1/catalog` under that host permission (no JWT, no CORS
allowlist change for `chrome-extension://`).

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

## Host media tab

With the active tab on `/room/:roomId` at `https://riffsync.tv` or
`http://localhost:5173`, **Open media tab** resolves a fixture catalog row to an
absolute host-source URL and opens or reuses one media tab with `active: false`
so the party tab stays focused. The panel reports **Open** vs **Not open** for
the current hosting session.

The host control panel **Library** section loads the public catalog and stores
a selected title in panel-local state. Title change PATCH and JWT work stay in
#430.

## Related

- Epic: https://github.com/StacksOnTheRacks/riffsync/issues/426
- Product spec: `product/specs/host-chrome-extension.spec.md`
