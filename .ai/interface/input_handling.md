# Input Handling

Keyboard, pointer, and permission input contract for room and catalog surfaces.

## Baseline (all surfaces)

- Interactive controls are **reachable by keyboard** (Tab order follows visual flow left-to-right, top-to-bottom within each region).
- Primary actions use native **`<button>`** (or equivalent with **`role="button"`** + keyboard activation) — not pointer-only divs.
- **Focus visibility** must remain perceptible on all themes; do not remove outlines without an equivalent focus indicator.

## Watch party room (`/room/:roomId`)

### Realtime drawer status (non-interactive)

- **Chat** and **video relay** status banners are **informational only** — not in the primary action tab order as buttons; use **`role="status"`** (or **`role="alert"`** for blocking hard failures per drawer).
- **Placement:** chat drawer status precedes sidebar tabs in DOM order; video-relay status lives in the stage playback region (**`presentation.md`**). Banners **do not** trap focus or intercept keyboard activation.
- When both drawers show **`reconnecting`**, focus order is unchanged: toggles → compose → tabs remain reachable; status text is discoverable via reading order without requiring a dismiss action.
- **No keyboard shortcut** to force drawer reconnect in MVP.

### Participant camera/microphone toggles

- **Placement:** above chat compose when fan JWT present; **omitted entirely** for anonymous guests (not in tab order, no overlay).
- When rendered: **always** in tab order regardless of active sidebar tab (**Chat**, **People**, **Room**, **Profile**).
- **Activation:** click or keyboard (**Enter** / **Space**) toggles local publish intent when enabled.
- **Disabled state (host AV kill switch):** control receives focus but does not activate; **`aria-disabled="true"`** or native **`disabled`** with explanation text associated via **`aria-describedby`**.
- **No keyboard shortcuts** (e.g. mute hotkey) in MVP.
- **Touch targets:** minimum **44×44** CSS px on toggles.
- **Focus on sidebar tab change:** focus moves to the active tab panel; toggles remain earlier in tab order and reachable via Tab.

### Host control bar

- **Room mode** selector and **AV kill switch** are keyboard-operable when **`JWT.sub === hostSub`**.
- Mode change does not require a secondary confirm in MVP; host action is immediate.
- When **AV kill switch** is on, **Video Chat** mode control is inert (no spurious focus traps).

### Device permissions

- First camera/mic enable triggers browser **`getUserMedia`** permission prompt; denial surfaces **inline recoverable** copy (retry when user changes browser permission).
- No silent retry loops on permission or SFU errors.

### Sidebar and compose

- Existing chat compose, emoji picker, and tab switching behavior unchanged; AV toggles sit **above** compose and precede it in focus order within the chat column.
- **Jump to latest** control remains keyboard-activatable above compose when scrollback is not at bottom.
- **Chat plane unhealthy:** disable compose **keyboard submit** (**Enter** in textarea) **and** show inline compose **`role="status"`** at **`#riffsync-chat-compose-status`** with **`CHAT_SEND_DROPPED`** copy in addition to the chat drawer banner (**`presentation.md`**).

### iOS software keyboard (text focus, #240)

- Focusing any room **text input** that opens the **iOS software keyboard** must **not** displace the **video stage** off the visual viewport (**`presentation.md`** iOS virtual keyboard table).
- **In scope:** chat compose **`<input>`**, **Profile** tab text fields, **room rename modal** input, and equivalent native text controls on the room page.
- **Focus scroll-into-view:** browser default document scroll that hides the player is **disallowed** — contain scroll to chat-column internals and adjust layout from **`visualViewport`** when the keyboard is visible.
- **Physical keyboard** (iPad with hardware keyboard, no software keyboard) follows baseline focus order; no special viewport shrink applies.

## Theater fullscreen

- Fullscreen enter/exit control remains keyboard-accessible.
- When participant AV is in fullscreen scope, strip/grid tiles do not steal focus from fullscreen exit on open.

## Primary code pointers (optional)

- **`apps/web/src/pages/RoomPage.tsx`** — thin shell; AV toggles and host bar extend existing chat-column and stage handlers.
