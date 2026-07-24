# Accessibility

Accessible-by-default contract for presentation and interaction surfaces.

## Baseline

- Use **semantic landmarks** and headings so screen-reader users can navigate catalog, room stage, and sidebar independently.
- Respect **`prefers-reduced-motion: reduce`**: non-critical animations (layout transitions, scroll-to-bottom, mode swap) use instant or minimal motion.
- **Color alone** must not be the only signal for on/off state on camera/mic toggles; pair with iconography and accessible name/state.
- **Focus order** matches visual flow; see **`input_handling.md`**.

## Public catalog and marketing surfaces

- **Home route** (**`/`**) renders **exactly one** static, visually-hidden (**`sr-only`**) **`<h1>RiffSync</h1>`** at the top of **`HomePage`** output (including loading/error/empty branches) so the document outline satisfies a landmark heading without changing visible hero markup (**`presentation.md`** → *Home route document outline*).
- **Catalog hub and subcategory routes** (**`/catalog`**, **`/catalog/mst3k`**, **`/catalog/community`**, **`/catalog/riff-material`**, **`/catalog/movie-night`**) extend the same public catalog baselines: keyboard-reachable browse controls, semantic landmarks/headings, poster **`alt={episode.title}`**, and **`prefers-reduced-motion`** for non-critical motion. No new accessibility obligation class beyond these routes.
- **Catalog card images** (**`CatalogGridCard`** on **`/catalog`** and all four subcategory routes) use **`alt={episode.title}`** (catalog **`title`** field) instead of **`alt=""`**.
- **Catalog page heading:** each catalog hub and subcategory route exposes one primary heading with the page display name.
- **Catalog header subtitle:** the hub subtitle contains the four category links as a native link list/nav. Subcategory subtitles are plain text copy under the heading; they do not replace the primary heading or introduce a breadcrumb landmark.
- **Catalog nav dropdown:** the Catalog disclosure exposes **`aria-haspopup`** / **`aria-expanded`** (or equivalent disclosure semantics); opens via keyboard (**Enter** / **Space**) as well as pointer; **Escape** closes and returns focus to the trigger; the four subcategory links are native focusable links in logical tab order (**MST3K**, **Community**, **Riff Material**, **Movie Night**). Hover-open on desktop is progressive enhancement, not the only path. On narrow viewports, Catalog expands as an **inline accordion** inside **`navbar-collapse`** (same four links; not a nested flyout).
- **Hub entry links:** the four large horizontal hub links on **`/catalog`** are native links in the page-header subtitle slot with accessible names matching their destination labels (**MST3K**, **Community**, **Riff Material**, **Movie Night**).
- **`/watch/:catalogEpisodeId`** keeps its existing **`sr-only`** **`<h1>{episode.title}</h1>`** on **`SoloWatchPage`** — unaffected by M30 beyond parallel head-tag work (M29).
- **Ephemeral/authenticated/receiver-only routes** (**`/room/:roomId`**, **`/lobby`**, **`/account`**, **`/admin/*`**, **`/cast/receiver`**) are unaffected — they keep the existing app-shell heading/landmark baseline, not a new accessibility commitment.

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
- For #274, the Stop Cast control has a visible label or accessible name **Stop Cast**, is programmatically associated with the active **`Now Casting`** text, and remains keyboard reachable while local Cast is active.
- If active Cast begins from a still-focused **Cast to TV** control, focus moves to **Stop Cast**. If the viewer moved focus elsewhere before confirmation, do not move it unexpectedly.
- While local Cast is active, expanded-view controls are absent from the accessibility tree or inert. The Cast-active status remains the only stage-local Cast announcement.
- For #277, another viewer's local Cast lifecycle must not create accessible status changes, focus movement, drawer announcements, stage controls, or room-mode announcements for participants who did not start Cast.
- For #276 successful Stop Cast, the restored normal stage playback surface is perceivable as normal room content again and the removed **`Now Casting`** panel is absent from the accessibility tree.
- If focus remains on **Stop Cast** or stage-local stopping status when successful cleanup completes, restore focus to a visible normal-room control near the restored stage or Room action group. If focus moved elsewhere during stopping, preserve that focus.
- Post-stop announcements use the restored stage or local Cast status surface only when useful; they must not duplicate chat drawer, video-relay, host feedback, or global room announcer output.
- For #279 verification, automated and manual checks must cover accessible names for **Cast to TV** and **Stop Cast**, keyboard reachability, local **`role="status"`** / stage-local announcement behavior, focus transfer and restoration across success/failure/cleanup, removal of stale Cast controls from the accessibility tree, and absence of Cast-induced live regions or focus movement for other participants.

### Keyboard verification matrix (#106)

| Surface | Requirement |
| --- | --- |
| Camera / Microphone toggles | **Tab** reachable on every sidebar tab; **Enter** / **Space** toggles when enabled; **disabled** toggles remain focusable with explanation |
| Host room mode control | Radio-group or select semantics; current mode exposed to assistive tech |
| Host AV kill switch | Pressed/checked state programmatically determinable |
| Live announcer | Mode and kill-switch **remote** changes announce via **`#riffsync-a11y-announcer`** (`aria-live="polite"`) |
| Drawer reconnect status | Separate chat-column and stage **`role="status"`** regions; simultaneous text when both drawers **`reconnecting`**; not routed through announcer |
| Narrow viewport tiles | Horizontal scroll row tiles have per-tile accessible names (**You** / display name); row is not sole identity source |

### Friends and direct messaging

- **Main-site friends disclosure:** person-icon trigger exposes **`aria-haspopup`** / **`aria-expanded`** (or equivalent); opens via keyboard (**Enter** / **Space**); **Escape** closes and returns focus to the trigger (same archetype as Catalog nav dropdown).
- **Signed-out:** friends trigger absent from the accessibility tree (not a disabled control announcing “sign in”).
- **Friend row online:** accessible name uses **Online in a watch party** (never People **Active** wording). Color/dot alone is insufficient.
- **Unread:** boolean dot reflected in accessible name (row: **"{displayName}, unread message"**; trigger when **`anyUnread`**: **"Friends, unread messages"**). No numeric counts in MVP.
- **Pending requests:** accept and decline are distinct named controls; pending vs accepted state is programmatically determinable.
- **Remove-friend:** confirm modal **Remove friend?** with **Cancel** / **Remove friend**; focus trap while open.
- **DM panel:** message log and compose follow room-chat accessible patterns (scroll region, compose label). Closed/hidden after remove must not leave a stale “open conversation with {name}” accessible surface.
- **Room Friends tab:** when present, participates in sidebar tab semantics with the other chat-column tabs; does not replace **People** identity discovery for mic-only participants.
- **Expanded View / Cast:** no requirement to expose full Friends tab strip in overlay/receiver; Cast receiver must not expose DM compose.

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
- No open implementation decisions remain for M25 Cast accessibility verification. See **Chromecast Cast status** and #279 verification requirements above.

### public-site-seo
- No open implementation decisions remain. The home **`sr-only`** H1 and catalog **`alt`** text are additive, non-visual fixes with no accessibility ambiguity — see **Public catalog and marketing surfaces** above.

### catalog-sub-pages
- No open decisions remain for M32 catalog subcategory browse IA (#340). Catalog hub subtitle links, subcategory plain-text subtitles, dropdown, and accordion requirements above are settled. See **`presentation.md`** -> **Decisions (M32 - catalog subcategory browse IA - #340)**.

### friends-and-direct-messaging
- No open decisions remain for #363 main-site friends a11y baseline (see **Friends and direct messaging** above). People roster context menu accessible names — **#377**.

## Primary code pointers (optional)

- **`apps/web/src/pages/RoomPage.tsx`** — thin shell; room a11y baseline; AV surfaces extend existing chat and stage patterns.
