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

- **Room mode** changes and **AV kill switch** changes should announce to screen-reader users via a **live region** (polite; avoid interrupting media unnecessarily).
- Local **camera/mic** on/off changes should announce locally (polite) when the user initiated the toggle.

### Participant video surfaces

- Video tiles in Theater strip and Video Chat grid need **perceivable labels** (display name or participant identity from roster); avoid unlabeled generic "video" elements.
- **Mic-only** participants not in strip/grid remain discoverable via **People** tab roster (do not rely on video surface alone for identity).

### Errors

- Permission, device, and SFU errors use **text** associated with the triggering control or a dedicated status region — not toast-only for blocking failures.

## Theater fullscreen

- Fullscreen wrapper including participant strip/grid must preserve **escape** to exit fullscreen and not trap keyboard focus inside video elements.

## Open implementation decisions

- Exact **live region** placement (global announcer vs per-region) for mode/kill-switch fan-out.
- Whether remote participants joining/leaving video surfaces warrant **polite** announcements (risk of chatter at party scale).
- **Captioning / transcription** for participant audio — out of scope unless added later; document absence explicitly in UI if needed.
- Reduced-motion fallback for Theater ↔ Video Chat layout swap (cross-fade vs instant cut).
- Accessible naming for **empty** strip/grid states (zero video-on participants).

## Primary code pointers (optional)

- **`apps/web/src/pages/RoomPage.tsx`** — room a11y baseline; AV surfaces extend existing chat and stage patterns.
