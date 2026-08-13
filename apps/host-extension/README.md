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
  manifest.json              # MV3; permissions: sidePanel only
  background.js              # opens host control panel on toolbar action
  host-control-panel.html    # host control panel UI shell
  README.md
```

Follow-on media-tab, library, title, and JWT work (#428–#430) lands in this
package without relocating it.

## Related

- Epic: https://github.com/StacksOnTheRacks/riffsync/issues/426
- Product spec: `product/specs/host-chrome-extension.spec.md`
