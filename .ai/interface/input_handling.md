# Input Handling

Keyboard, pointer, and permission input contract for room and catalog surfaces.

## Baseline (all surfaces)

- Interactive controls are **reachable by keyboard** (Tab order follows visual flow left-to-right, top-to-bottom within each region).
- Primary actions use native **`<button>`** (or equivalent with **`role="button"`** + keyboard activation) — not pointer-only divs.
- **Focus visibility** must remain perceptible on all themes; do not remove outlines without an equivalent focus indicator.

## Watch party room (`/room/:roomId`)

### Participant camera/microphone toggles

- **Placement:** above chat compose; **always** in tab order regardless of active sidebar tab (**Chat**, **People**, **Room**, **Profile**).
- **Activation:** click or keyboard (**Enter** / **Space**) toggles local publish intent when enabled.
- **Disabled state (host AV kill switch):** control receives focus but does not activate; **`aria-disabled="true"`** or native **`disabled`** with explanation text associated via **`aria-describedby`**.
- **Unsigned / anonymous:** overlay blocks activation; primary action routes to fan sign-in (same interaction pattern as **Sign In to Chat**).

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

## Theater fullscreen

- Fullscreen enter/exit control remains keyboard-accessible.
- When participant AV is in fullscreen scope, strip/grid tiles do not steal focus from fullscreen exit on open.

## Open implementation decisions

- Whether camera/mic toggles expose **keyboard shortcuts** (e.g. mute hotkey) in MVP.
- Focus order when sidebar tab changes while a toggle had focus (restore vs move to tab panel).
- Minimum **touch target** size for toggles and host bar controls on narrow viewports under reduced mobile scope.
- Pointer vs keyboard path for **Sign In to Chat** overlay on AV controls when compose overlay pattern differs slightly.

## Primary code pointers (optional)

- **`apps/web/src/pages/RoomPage.tsx`** — room input surfaces; AV toggles and host bar extend existing chat-column and stage handlers.
