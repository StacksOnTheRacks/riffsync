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
  manifest.json              # MV3; permissions: sidePanel, tabs
  background.js              # host control panel on action; media tab session
  host-control-panel.html    # host control panel UI
  host-control-panel.js      # bind status, media-tab open/not, open trigger
  hostSourceTabUrl.js        # pure host-source URL resolver (SPA parity)
  roomBind.js                # C1 /room/:roomId bind on allowed SPA origins
  mediaTab.js                # inactive create/update + one tracked media tabId
  package.json               # documented test command
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

## Host media tab

With the active tab on `/room/:roomId` at `https://riffsync.tv` or
`http://localhost:5173`, **Open media tab** resolves a fixture catalog row to an
absolute host-source URL and opens or reuses one media tab with `active: false`
so the party tab stays focused. The panel reports **Open** vs **Not open** for
the current hosting session.

Follow-on library, title, and JWT work (#429–#430) lands in this package
without relocating it.

## Related

- Epic: https://github.com/StacksOnTheRacks/riffsync/issues/426
- Product spec: `product/specs/host-chrome-extension.spec.md`
