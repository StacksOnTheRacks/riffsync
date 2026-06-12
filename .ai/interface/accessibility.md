# Accessibility

Accessible-by-default contract for presentation and interaction surfaces.

## Baseline

- Use **semantic landmarks** and headings so screen-reader users can navigate catalog, room stage, and sidebar independently.
- Respect **`prefers-reduced-motion: reduce`**: non-critical animations (layout transitions, scroll-to-bottom, mode swap) use instant or minimal motion.
- **Color alone** must not be the only signal for on/off state on camera/mic toggles; pair with iconography and accessible name/state.
- **Focus order** matches visual flow; see **`input_handling.md`**.

## Watch party participant AV

### Camera/microphone toggles

- Each toggle has an **accessible name** reflecting control purpose and state (e.g. microphone on/off).
- State changes update **`aria-pressed`** or equivalent pressed/checked semantics.
- When **disabled** by host AV kill switch, expose **why** via **`aria-describedby`** linking to visible explanation text (not icon-only).

### Room mode and kill switch (host)

- Host **room mode** control exposes current selection to assistive tech (radio group or select semantics).
- **AV kill switch** state is programmatically determinable when toggled.

### Live regions

- Single polite announcer (**`#riffsync-a11y-announcer`**) in the room shell for **room mode** and **AV kill switch** changes received from host fan-out.
- Local **camera/mic** on/off changes announce via the same announcer when the user initiated the toggle.
- **No** polite announcements for remote participants joining or leaving video tiles in MVP (chatter risk at party scale).
- **Drawer reconnect status** uses **dedicated visible `role="status"` regions** (chat column + stage playback) per **`presentation.md`** — **not** the global announcer. Each region's text updates when **that** drawer enters or leaves **`reconnecting`**; when both drawers are unhealthy, both status texts remain independently perceivable (visual + screen reader reading order).
- Drawer status regions use **`aria-live="polite"`** only when the region is mounted for that drawer's status (avoid duplicating the same text in announcer + banner).

### Participant video surfaces

- Video tiles in Theater strip and Video Chat grid need **perceivable labels** (display name from roster; local tile **You**).
- **Mic-only** participants not in strip/grid remain discoverable via **People** tab roster (do not rely on video surface alone for identity).
- Empty Video Chat grid exposes accessible status text matching visible copy (**"No cameras on yet…"**).
- **Camera-off / `producerClosed`:** tile removal must be reflected in the accessibility tree promptly — no stale tile name or **frozen last frame** exposed as an active video surface after video producer ends.
- **Frozen-frame regression (#142):** after video **`producerClosed`**, the participant **`figure`** must not remain in the stage accessibility tree; no stale **`aria-label`** for that display name on strip/grid/narrow-row surfaces. Unit tests assert tile list empty and **`ParticipantVideoTile`** unmount clears **`srcObject`**.

### Errors

- Permission, device, and SFU errors use **text** associated with the triggering control or a dedicated **`role="status"`** region — **not toast-only** for blocking failures.
- Each toggle's error text is referenced by **`aria-describedby`** when publish fails; errors clear when the user successfully enables or dismisses via a successful retry.
- Stable **`code`** values and copy templates live in **`error_state.md`** (**Participant A/V error taxonomy**).

### Keyboard verification matrix (#106)

| Surface | Requirement |
| --- | --- |
| Camera / Microphone toggles | **Tab** reachable on every sidebar tab; **Enter** / **Space** toggles when enabled; **disabled** toggles remain focusable with explanation |
| Host room mode control | Radio-group or select semantics; current mode exposed to assistive tech |
| Host AV kill switch | Pressed/checked state programmatically determinable |
| Live announcer | Mode and kill-switch **remote** changes announce via **`#riffsync-a11y-announcer`** (`aria-live="polite"`) |
| Drawer reconnect status | Separate chat-column and stage **`role="status"`** regions; simultaneous text when both drawers **`reconnecting`**; not routed through announcer |
| Narrow viewport tiles | Horizontal scroll row tiles have per-tile accessible names (**You** / display name); row is not sole identity source |

## Theater fullscreen

- Fullscreen wrapper including participant strip/grid must preserve **escape** to exit fullscreen and not trap keyboard focus inside video elements.

## Out of scope (post-M14)

- **Captioning / live transcription** for participant audio — not in M14; no MVP placeholder UI.
- **Mic-only stage chrome** (avatar chips, audible-only badges, speaking borders) — not this milestone.

## Open implementation decisions

- **`THEATER_AUDIO_SUSPENDED` a11y:** whether resume uses implicit gesture only or a keyboard-focusable explicit control with accessible name (pairs with **`presentation.md`** theater audio TW item).

## Primary code pointers (optional)

- **`apps/web/src/pages/RoomPage.tsx`** — thin shell; room a11y baseline; AV surfaces extend existing chat and stage patterns.
