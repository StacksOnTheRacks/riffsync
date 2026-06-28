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
- When participant AV is in fullscreen scope, Theater camera row and Video Chat grid tiles do not steal focus from fullscreen exit on open.

## Expanded view (#259)

- **Expand / exit** control is a native **`<button>`** on the stage region — keyboard activatable (**Enter** / **Space**); not pointer-only.
- Control is **revealed on stage hover** for pointer users; **:focus-visible** keeps it visible for keyboard users.
- **Theater camera row (standard and expanded):** participant tiles are informational video surfaces and must not add unexpected tab stops or steal focus when the row appears, scrolls, or wraps. Tile labels and speaking affordances remain available through visible text and accessible names.
- **Tab order in expanded view:** expand/exit toggle → chat overlay (drawer status if present → message log scroll region → jump-to-latest when visible → AV toggles when rendered → compose) → host control bar (host only). **No** sidebar tab strip in tab order while expanded.
- **People / Room / Profile:** reachable only after **exit expanded view** (or via site chrome navigation).
- **Touch targets:** expand/exit control minimum **44×44** CSS px.
- **Not offered < 992px:** toggle absent or **`aria-hidden`** / inert — no expanded keyboard path on narrow viewports in MVP.
- **Implementation:** the overlay reuses the chat plane without rendering `.riffsync-room-page__tabs`; standard sidebar tabs return immediately after exit.

## Chromecast Cast controls

- **Cast to TV** is keyboard-operable when rendered and appears only in normal room view after sender support is detected.
- Expanded view must not expose a Cast start control in the tab order. If implementation leaves a Cast affordance mounted for layout reasons, it is inert and unavailable to assistive technology while expanded.
- During Cast start, focus remains stable unless the implementation moves focus to a visible local status region. Failed start returns focus to the Cast entry or nearby room action surface.
- After successful Cast start, the sender's stage exposes a keyboard-reachable stop control associated with the **`Now Casting`** state.
- Stop Cast activation by click, **Enter**, or **Space** returns the sender to normal in-page playback without trapping focus or moving focus into a hidden video surface.
- Chat compose, jump-to-latest, sidebar tabs, and participant A/V toggles keep their existing keyboard paths while local Cast is active.

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### chromecast-input-handling
- Define whether focus moves to Stop Cast after successful start, returns to **Cast to TV** after stop, or remains on the activating control until the user moves it.
- Define keyboard and pointer behavior for the expanded-view toggle while local Cast is active.
- Define touch target placement and hit area for Cast start/stop on narrow normal-view layouts if Cast is supported there.

## Primary code pointers (optional)

- **`apps/web/src/pages/RoomPage.tsx`** — thin shell; AV toggles and host bar extend existing chat-column and stage handlers.
