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

### Participant video surfaces

- Video tiles in Theater strip and Video Chat grid need **perceivable labels** (display name from roster; local tile **You**).
- **Mic-only** participants not in strip/grid remain discoverable via **People** tab roster (do not rely on video surface alone for identity).
- Empty Video Chat grid exposes accessible status text matching visible copy (**"No cameras on yet…"**).

### Errors

- Permission, device, and SFU errors use **text** associated with the triggering control or a dedicated status region — not toast-only for blocking failures.

## Theater fullscreen

- Fullscreen wrapper including participant strip/grid must preserve **escape** to exit fullscreen and not trap keyboard focus inside video elements.

## Open implementation decisions

- **Captioning / transcription** for participant audio — out of scope in MVP; expanded error/a11y matrices tracked in **#106**.

## Primary code pointers (optional)

- **`apps/web/src/pages/RoomPage.tsx`** — room a11y baseline; AV surfaces extend existing chat and stage patterns.
