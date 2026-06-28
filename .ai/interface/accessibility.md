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
- **Frozen-frame regression (#142 / M19 #152):** after video **`producerClosed`**, the participant **`figure`** must not remain in the stage accessibility tree; no stale **`aria-label`** for that display name on strip/grid/narrow-row surfaces. Unit tests assert tile list empty and **`ParticipantVideoTile`** unmount clears **`srcObject`**.

### Errors

- Permission, device, and SFU errors use **text** associated with the triggering control or a dedicated **`role="status"`** region — **not toast-only** for blocking failures.
- Each toggle's error text is referenced by **`aria-describedby`** when publish fails; errors clear when the user successfully enables or dismisses via a successful retry.
- Stable **`code`** values and copy templates live in **`error_state.md`** (**Participant A/V error taxonomy**).

### Chromecast Cast status

- **Cast to TV** and Stop Cast are semantic controls with visible labels or accessible names.
- For #272 availability, **Cast to TV** is exposed as a normal-view Room sidebar action only after local sender support is confirmed. Unsupported or unknown support omits the control from the accessibility tree.
- If Cast becomes unavailable after the local support check begins or fails, expose the explanation in a visible local status element near the Room sidebar Cast surface, with **`role="status"`** and polite announcement behavior. Do not route this copy through **`#riffsync-a11y-announcer`**, the chat drawer status, or the video-relay status.
- The sender's **`Now Casting`** state is perceivable as text, not color/icon-only, and associated with the Stop Cast control.
- Cast-active status uses a visible stage-local **`role="status"`** or equivalent polite live region. It must not duplicate chat drawer or video-relay drawer reconnect announcements.
- Cast failure/unavailable copy is readable by assistive technology at the local Cast surface and must not imply that the room, host share, chat, or other participants failed.
- The Cast receiver presentation reuses the expanded-view composition model. Chat overlay content is required on the receiver for #273, remains readable presentation only, and must not expose chat input or authenticated send affordances on the receiver.
- Do not expose the receiver device name in accessible descriptions for #273. Use privacy-preserving copy such as **Casting to TV** or **Starting Cast** unless the sender-side Cast SDK requires device naming in browser-owned UI.

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

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### existing-room-accessibility
- **`THEATER_AUDIO_SUSPENDED` a11y:** whether resume uses implicit gesture only or a keyboard-focusable explicit control with accessible name (pairs with **`presentation.md`** theater audio item).

### chromecast-accessibility
- **Resolved for #273:** local Cast starting and start-failed text uses a visible **`role="status"`** with polite announcement near the Cast action or stage-local Cast surface. It must not duplicate chat drawer, video-relay, or global room announcer output.
- **Resolved for #273:** **Cast to TV** has a visible label or accessible name; receiver/device name is omitted from app-authored accessible copy for privacy.
- **Resolved for #273:** failed start returns focus to **Cast to TV** when still rendered, or to the nearest normal-view Room action.
- **Out of #273 scope:** successful stop, receiver disconnect, and persistent active-state focus recovery are owned by #276 / #278 / #274.

## Primary code pointers (optional)

- **`apps/web/src/pages/RoomPage.tsx`** — thin shell; room a11y baseline; AV surfaces extend existing chat and stage patterns.
