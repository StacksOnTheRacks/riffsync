# Input Handling

Keyboard, pointer, and permission input contract for room and catalog surfaces.

## Baseline (all surfaces)

- Interactive controls are **reachable by keyboard** (Tab order follows visual flow left-to-right, top-to-bottom within each region).
- Primary actions use native **`<button>`** (or equivalent with **`role="button"`** + keyboard activation) — not pointer-only divs.
- **Focus visibility** must remain perceptible on all themes; do not remove outlines without an equivalent focus indicator.

## Public catalog browse (hub, subcategory, nav)

- **Catalog parent link:** keyboard-activatable navigation to **`/catalog`** (native link semantics).
- **Catalog dropdown / disclosure:** trigger is keyboard-reachable; **Enter** / **Space** opens or toggles the subcategory list; **Escape** closes and returns focus to the trigger; subcategory destinations are native focusable links (**`/catalog/mst3k`**, **`/catalog/community`**, **`/catalog/riff-material`**, **`/catalog/movie-night`**) in logical tab order. Pointer hover must not be the sole open path.
- **Mobile:** subcategory links remain keyboard-reachable inside the existing hamburger / collapse menu after the menu is opened.
- **Hub entry links (on `/catalog`):** the four large horizontal subcategory entry links in the page-header subtitle slot are keyboard-reachable native links (or equivalent) in visual order; **Enter** / **Space** (for button-styled links) or standard link activation navigates to the subcategory route.
- **Subcategory subtitles:** route-fixed subtitle text is non-interactive copy under the page heading; it is not a breadcrumb or focus target.
- **Search / sort chrome:** title-search and sort controls remain keyboard-reachable on **`/catalog`** and on all four subcategory routes (same chrome; subcategory pages scope results to the route-fixed `catalogs` set).
- **Focus after hub / dropdown navigation:** after activating a hub entry link or Catalog dropdown (or accordion) destination, use browser-default focus for the destination document (document start / natural focus). Do not invent a restore-to-site-header focus pattern unless an existing site-wide pattern already requires it.

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

### Room tab lobby visibility (host only)

- **Placement:** **Room** sidebar tab, below **Rename Party** and above **Hosting Guide** (after **Copy Party Link**).
- **Control:** two-option **`role="radiogroup"`** — **Show in lobby** (**`public`**) and **Link only** (**`private`**).
- **Activation:** click or keyboard (**Enter** / **Space**) patches **`visibility`** via host **`PATCH`**; no secondary confirm.
- **Disabled state:** both options **`disabled`** while a visibility patch is in flight; **`aria-busy`** on the radiogroup when busy.
- **Touch targets:** minimum **44×44** CSS px on each option button.
- **Guests and signed-in non-host fans:** control **not rendered** — not in tab order.

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
- **Implementation:** the overlay reuses the interactive room chat plane without rendering `.riffsync-room-page__tabs`; standard sidebar tabs return immediately after exit. Do not substitute the Chromecast receiver read-only overlay for regular Expanded View (#318).

## Chromecast Cast controls

- **Cast to TV** is keyboard-operable when rendered and appears only in normal room view after sender support is detected.
- In #272, **Cast to TV** is part of the normal-view **Room** sidebar action group. It follows the existing action-button tab order near **Copy Party Link** and **Leave Party** and uses the same minimum **44×44** CSS px target size as other room controls.
- Unsupported, unknown, or platform-blocked sender support omits the control from the tab order. If the implementation needs to explain a late unavailable result, the explanatory text is readable near the Cast surface but does not add a required keyboard action.
- Expanded view must not expose a Cast start control in the tab order. If implementation leaves a Cast affordance mounted for layout reasons, it is inert and unavailable to assistive technology while expanded.
- During Cast start, focus remains on **Cast to TV** while the custom receiver launches unless the user explicitly moves focus. Start status is announced through a visible local status region and does not require focus.
- Failed start returns focus to **Cast to TV** when it is still rendered; otherwise it returns focus to the nearest normal-view Room action.
- After successful Cast start, the sender's stage exposes a keyboard-reachable stop control associated with the **`Now Casting`** state.
- Stop Cast activation by click, **Enter**, or **Space** returns the sender to normal in-page playback without trapping focus or moving focus into a hidden video surface.
- Chat compose, jump-to-latest, sidebar tabs, and participant A/V toggles keep their existing keyboard paths while local Cast is active.
- When successful Cast start replaces the stage and focus is still on the initiating **Cast to TV** action, move focus to **Stop Cast** so keyboard users retain an immediate escape from the active Cast state. If the user moved focus elsewhere during startup, do not steal focus.
- While local Cast is active, the expanded-view toggle is not rendered or is inert and unavailable to assistive technology. **Stop Cast** remains the primary stage action and uses the same minimum **44×44** CSS px target posture as other room controls.
- After successful Stop Cast, if focus is still on **Stop Cast** or on stage-local stopping status, move focus to the restored normal stage's first meaningful control or back to the normal-view Room action group near **Cast to TV**. If the viewer moved focus into chat, sidebar tabs, participant A/V controls, or another room control while stopping, do not steal focus.
- Post-stop focus restoration must not focus a hidden Cast source, a detached video element, a removed **`Now Casting`** panel, or an expanded-view control that is not currently available.
- #279 verification covers click, **Enter**, and **Space** activation for rendered Cast controls; tab-order absence when Cast is unsupported, unknown, expanded, or inactive; focus transfer from **Cast to TV** to **Stop Cast** only when appropriate; focus preservation when the viewer moves elsewhere; and focus safety after failed, ended, blocked, stop-failed, cleanup, room leave, navigation, and reload paths.

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### chromecast-input-handling
- No open implementation decisions remain for M25 Cast input verification. See **Chromecast Cast controls** and #279 verification requirements above.

### catalog-sub-pages
- No open decisions remain for M32 catalog subcategory browse IA (#340). Focus after hub/dropdown navigation is browser default (see **Public catalog browse** above). Search/sort keyboard reachability on subcategory routes is settled in **`presentation.md`** → **Decisions (M32 — catalog subcategory browse IA — #340)**.

## Primary code pointers (optional)

- **`apps/web/src/room/RoomVisibilityControl.tsx`** — host **Room** tab lobby visibility radiogroup.
- **`apps/web/src/pages/RoomPage.tsx`** — thin shell; AV toggles and host bar extend existing chat-column and stage handlers.
