# Presentation

UI-level contract for layout states, honest failure surfaces, and **cost-conscious** defaults (no commercial **SLA** narrative—operators rely on **CloudWatch** + community best effort).

## Global expectations

| Concern | Contract |
| --- | --- |
| **Catalog loading** | Skeleton or **in-catalog placeholders** for rows; avoid blocking the whole shell on **`GET /v1/catalog`** when possible (progressive render). |
| **Empty catalog** | Clear **“nothing to show yet”** copy for operators/contributors—never a silent blank. |
| **Signed-in host / solo room** | **WebSocket** + **JWT** for admin paths; embed errors surface **embed blocked** + **open on YouTube** escape hatch (**`error_state.md`**). |
| **Room / lobby** | **Room-admin** controls only when **`JWT.sub === hostSub`**; anonymous guests see **read-only** player/chat chrome (**picker hidden**, subscribe-only WebRTC). |
| **Theater fullscreen** | Optional **wrapper fullscreen** ( **`requestFullscreen`** on a container that includes the player, optional Theater camera row, and RiffSync chrome) — **not** YouTube iframe-native fullscreen, which cannot show RiffSync chrome. |
| **Share** | **Copy `/room/:id` URL**; show advisory **`playbackExpectation`** near share affordance. |
| **Rate / caps** | Server may return **429** / **WS business `error`** when limits hit (**`api_contracts.md`**); toast or inline message—**no** infinite retry storms. |

## Chat & scrollback (watch party room)

- **Surface:** **`/room/:roomId`** sidebar **Chat** tab (not solo watch).
- **Layout:** Message list occupies a **bounded flex region** inside the sidebar; **only the log scrolls** (`overflow-y: auto`). Compose toolbar and tabs stay fixed. **Stick-to-bottom:** new messages auto-scroll when the user is within **48px** of the bottom (same threshold as implementation in bounded-log work). **Jump to latest:** when the user has scrolled up beyond that threshold, show a **button** above the compose bar after one or more lines arrive while they are reading history; label **"New messages"** (append **`(N)`** when **N > 1** pending). Activating the control scrolls to the latest line, clears the pending count, and hides the control. Manual scroll back within **48px** of the bottom also clears pending without requiring the button. Programmatic scroll uses **`behavior: 'smooth'`** unless **`prefers-reduced-motion: reduce`**, then **`'auto'`**.
- **Ephemeral** chat: **in-memory / UI scrollback** capped (~**100** recent messages in client; align with **`docs/architecture.frontend.md`**). **No durable transcript** from server—reload clears messages, reactions, and GIF posts (**storage cost**).
- **Rich content (signed-in send):** **Unicode emoji** via compose picker; **Giphy GIF** posts (inline render, bounded dimensions); **emoji reactions** aggregated per message. **Anonymous guests** may **view** all rich content but **cannot** send or react (**`authorization.md`**).

### Compose media picker (emoji / GIF tabs, #258)

Tabbed popover on chat compose (**`ChatComposeMediaPicker`**) — **Emojis** and **GIF** tabs share one shell above the compose row.

| Concern | Contract |
| --- | --- |
| **Stable outer height** | Popover **outer height must not change** when switching tabs or when Giphy transitions between empty, loading, error, and results states. Tab switches must not jitter the compose row. |
| **Fixed tab body** | Content below the tab bar uses a **fixed height of 16.5rem** (matches **`emoji-picker`** body). Both tab panels fill this region. |
| **Giphy scroll** | Search field, status copy, attribution, and results grid render **inside** the fixed panel; the results grid **scrolls internally** (`overflow: auto`) — it must **not** expand the popover when results load. |
| **Viewport cap** | Shell keeps **`width: min(100vw - 1rem, 18.5rem)`** and **`max-height: min(70vh, 24rem)`**; fixed body height must fit within the cap on typical viewports. |
| **Out of scope** | Message **reaction** emoji popover (**`ChatReactionPicker`**) — separate component; not governed by this table. |
- **Avatars:** Signed-in fans may upload **one** profile image (server-retained). Chat rows show a **thumbnail beside display name** using a **public HTTPS** avatar URL when set; guests without avatars use a neutral fallback glyph.
- **Typing indicator:** When a signed-in fan sends **`typing_start`** on the room WebSocket, other participants see an **ellipsis** affordance associated with that sender in the chat log (e.g. **"DisplayName is typing…"** or inline ellipsis row). **Typing start** also marks the sender **active** on the **People** tab. Indicator clears on send, **`typing_stop`**, disconnect, or TTL expiry (exact TTL tier TW). **Do not** imply message archive — typing is ephemeral like chat scrollback.
- **Join/leave system lines:** When a **signed-in fan** connects or disconnects, other participants see a muted **system line** in the chat log (e.g. **"DisplayName joined"** / **"DisplayName left"**). **Anonymous guests** produce **no** system line. Lines are **ephemeral** (in-memory scrollback only) and **not** replayed from server on refresh or **`presence_request`**.
- **People tab presence:** Each roster row shows **online** (connected) by default. Rows also show an **active** badge when server **`active`** is true (derived from **`lastActiveAt`** within the **2-minute** window). **Host** row follows the same badge rules. **Active badge visual:** muted green dot plus **Active** text chip (same visual weight as **Host** badge); **`aria-label`** includes active state. Badges are **visual only** on **People** — not duplicated as stage chrome for mic-only participants except **speaking** (below).
- **People tab producer state (M23):** Each roster row shows **camera** and **microphone** affordances derived from live SFU producer lifecycle per **`sessionId`**: cam **on** when video producer live; mic **on** when audio producer live; mic **muted** when audio producer **`paused`**; mic **off** when no audio producer. Updates within one React commit of **`newProducer`** / **`producerClosed`**. Not persisted server-side.

## Watch party participant AV (`/room/:roomId`)

### Shell boundaries

- **`riffsync-room-page__stage`** holds shared movie playback, participant video surfaces (Theater camera row or Video Chat grid), host tab-capture chrome, and **video-relay** drawer status.
- **`riffsync-room-page__chat-column`** holds sidebar tabs (**Chat**, **People**, **Room**, **Profile**), participant AV toggles, message log, compose, and **chat** drawer status.
- **Theater room mode** (host layout policy) is distinct from **theater fullscreen** (wrapper **`requestFullscreen`**) and from **expanded view** (in-page stage layout). UI copy must not conflate the three.
- **`RoomPage`** is a **thin shell**; realtime drawers are owned by **`ChatSession`**, **`SfuMediaSession`**, and **`TheaterPlayback`** (**`runtime/execution_model.md`**). Presentation contracts describe what users see regardless of module wiring.

### Media path (SFU-only)

- **All environments** (local dev, CI, prod) use the **mediasoup SFU** path for host screen-share and participant A/V. **No mesh WebRTC UI** — remove production mesh warnings, mesh negotiation status strings, and mesh-only guest playback affordances.
- Missing SFU/TURN configuration surfaces an **honest deployment/configuration error** (not a fallback path selector). Stable codes **`SFU_RELAY_URL_MISSING`**, **`LOCAL_SFU_UNREACHABLE`**, **`SFU_RELAY_UNREACHABLE`** map to page **`role="alert"`** and video-relay status (**#137**, **`error_state.md`**). Errors persist through reconnect backoff until signaling **`session.ready`** succeeds.

### Realtime drawer status (separate surfaces)

Chat (room WebSocket) and video relay (SFU signaling + consumers) expose **independent, simultaneous** status when lifecycles diverge. **Do not** consolidate into one banner that implies both planes failed (e.g. avoid combined copy like "Reconnecting chat… Video may pause briefly." when only chat is down).

| Drawer | Placement | When shown |
| --- | --- | --- |
| **Chat** | Top of **`riffsync-room-page__chat-column`**, above tabs/toolbar — **`#riffsync-chat-drawer-status`** (reuse **`riffsync-room-page__ws-banner`** styling) | **`getDiagnostics().drawers.chat.state`** is **`reconnecting`** or **`degraded`**, or chat-plane send is blocked |
| **Video relay** | Stage playback region — **`#riffsync-video-relay-status`** (guest **`riffsync-muted`** status line and/or host **`riffsync-room-page__share-status`**) | **`getDiagnostics().drawers.sfuSignaling.state`** is **`reconnecting`** or **`degraded`**, config-class SFU error active, or guest host-screen FSM is non-**`running`** (see **`interaction_flow.md`**) |

- **Both banners may appear at once** when each drawer is independently unhealthy; each clears when **that** drawer returns to **`connected`** (or equivalent healthy state per **`getDiagnostics()`**).
- **Hard failures** stay drawer-scoped: chat-plane errors near chat/compose; SFU/toggle failures at AV toggles or stage **`role="alert"`** per **`error_state.md`** — not merged into a single realtime toast.

### Drawer status copy (#140 / #150)

Normative fan-visible strings when **`getDiagnostics()`** reports drawer lifecycle states. Guest **host-screen** playback-region copy remains in **`interaction_flow.md`** (SFU three-state model); these strings cover **drawer health** only.

| Drawer | Lifecycle | Copy |
| --- | --- | --- |
| **Chat** | **`reconnecting`** | Reconnecting chat… |
| **Chat** | **`degraded`** | Chat unavailable. Try refreshing the page. |
| **Video relay** | **`reconnecting`** | Video relay reconnecting… |
| **Video relay** | **`degraded`** | Video relay unavailable. Try refreshing the page. |
| **Either** | **`connected`** (recovery) | Clear that drawer's status banner (no success toast). |

- **Both banners may appear at once** when each drawer is independently unhealthy; each clears when **that** drawer returns to **`connected`**.
- **Host screen-share idle/negotiating** states (guest waiting for host share) use the **video-relay** surface, not the chat banner.
- **Anti-pattern (#147 / #150):** video-relay resolvers must **not** branch on chat WS state (e.g. **`chatWsDisconnected`** in **`sfuRelayStatusCopy.ts`**). Retire **"Reconnecting chat… Video may pause briefly."** — chat reconnect belongs on the chat banner only.

### M19 room shell ship gate (#150)

Milestone **M19** verifies the separate surfaces above ship in the thin **`RoomPage`** shell:

| Surface | Implementation owner | Verification |
| --- | --- | --- |
| Chat drawer banner | **`RoomPageSidebar`** + **`drawerErrorPresentation.ts`** (**#186**, **#207**) | Renders from **`drawers.chat`** only — never from SFU diagnostics |
| Video-relay banner | Stage status hooks + **`sfuRelayStatusCopy.ts`** (**#201**, **#186**) | Renders from **`drawers.sfuSignaling`** + config errors + guest host-screen FSM — **no** chat WS input |
| Simultaneous display | **`RoomPage`** / hooks | Both banners visible when each drawer is independently unhealthy; each clears on that drawer's recovery |
| Copy source | **`drawerErrorPresentation.ts`** | Lifecycle strings from **Drawer status copy** table above; error codes from **`error_state.md`** |

Peer issues **#201** (retire combined copy), **#207** (chat banner), **#186** (presentation module) implement the wiring; **#150** is the M19 integration parent.

### M19 guest host-screen status ship gate (#151)

Milestone **M19** verifies SFU-only guest host-screen copy in the stage playback region (mesh FSM strings retired):

| Surface | Implementation owner | Verification |
| --- | --- | --- |
| Guest FSM copy | **`sfuRelayStatusCopy.ts`** + **`TheaterPlayback`** snapshot | **`idle`** → **Waiting for host to share…**; **`verifying_media`** → **Connecting to video relay…**; **`running`** → no status line |
| DOM anchor | **`RoomPlaybackPanel.tsx`** | Guest status line exposes **`id="riffsync-video-relay-status"`** with **`role="status"`** |
| Placeholder dedupe | **`RoomPlaybackPanel.tsx`** | No second not-sharing paragraph when FSM idle copy is shown |
| Chat decoupling | Peer **#201** / parent **#150** | **`resolveGuestVideoRelayStatusLine`** has **no** **`chatWsDisconnected`** input |
| Share-stop idle | Peer **#198** / **#146** | After **`share_state: stopped`**, FSM **`idle`** and status line match **`interaction_flow.md`** |

Sub-issues **#210–#212** implement wiring and tests; parent **#151** tracks M19 exit for this surface.

### Chat compose inline feedback (#149)

- When **`getDiagnostics().drawers.chat.lastErrorCode === 'CHAT_SEND_DROPPED'`** or chat drawer is **`reconnecting`** / **`degraded`**, render an inline **`role="status"`** line **below** the compose row (reuse **`riffsync-room-chat-giphy-status`** error styling).
- Copy: **`error_state.md`** **`CHAT_SEND_DROPPED`** template — "Message could not be sent. Check chat connection and try again."
- **Do not** disable compose solely because SFU video-relay status is unhealthy when chat drawer is **`connected`**.
- Clear inline feedback when chat drawer returns **`connected`** without **`lastErrorCode`**.

### Host control bar (below stage)

- Visible only when **`JWT.sub === hostSub`**.
- Flex row directly below the stage: **room layout** segmented control (**Theater** default, **Video Chat** alternate) on the left; **Disable room A/V** kill switch on the right. Wraps on narrow widths; extension point for future host share controls.
- When **`avDisabled`** is false, the **Video Chat** segment carries visible **Beta** text adjacent to the control label (host-only; not a guest-facing mode pill). **`aria-describedby`** / tooltip: **`Video Chat layout is experimental. Participant video quality and reliability are still improving.`** When **AV kill switch** is on, **Video Chat** selection is unavailable or inert until AV is re-enabled (Beta chrome hidden with inert segment).

### Participant camera/microphone toggles

- Two controls (**Camera**, **Microphone**) sit **above chat compose** in the sidebar when the viewer has a **fan JWT** (signed-in fan or host using participant A/V).
- **Not rendered** for **anonymous guests** — no toggle chrome and no sign-in overlay at this placement; guests remain subscribe-only for participant AV and use chat compose's existing **Sign In to Chat** overlay only for chat send.
- When rendered, toggles stay **visible on every sidebar tab** (**Chat**, **People**, **Room**, **Profile**) — session-level AV controls, not tab-scoped.
- Each control pairs an icon with a visible text label and reflects explicit on/off state for the local publisher.
- When the host has disabled room AV, toggles **remain visible but disabled** with explanation copy: **"The host turned room A/V off."** (associated via **`aria-describedby`**).

### Theater room mode

- Shared movie player (host tab-capture / guest inbound screen-share stream) stays **primary**.
- On viewports **≥ 992px**, a **horizontal camera row** sits **directly below the movie** within the stage region (not in the chat column and not over the movie).
- The row lists **video-on** participants only, ordered by **stable roster join order** (same source as **People** tab).
- **Speaking affordance:** when a participant's mic is unmuted and client VAD crosses threshold (**`execution_model.md`** M23 params), show a **speaking border or glow** on that participant's row tile. **Mic-only** participants **do not** get row tiles; their speaking state appears on **People** roster rows only. Under **`prefers-reduced-motion: reduce`**, use a static high-contrast border instead of animated glow.
- **Mic-only** participants are audible but **not** shown in the row (identity via **People** tab and chat). **No** avatar chips or audible-only tile badges.
- The **local publisher** appears in the row when their camera is on, labeled **You** (live preview tile).
- The **host** appears in the row when their camera is on, same as other signed-in fans.
- When zero video-on participants, the row container is **not rendered** (no empty chrome) and the movie uses the available stage height.
- The camera row scrolls horizontally or wraps according to responsive layout rules; it must not overlay or obscure the movie.
- Participant **microphones** are audible alongside movie audio while AV is enabled.

### Video Chat room mode

- The movie player region is **replaced** by a **grid** of **video-on** participants on viewports **≥ 992px** (`auto-fill` tiles, **16:9**, scroll when overflow).
- **Speaking affordance** on grid tiles matches Theater strip rules (border/glow when talking and video is on).
- **Mic-only** participants are **excluded** from the grid; audio is still heard; speaking state on **People** tab rows only. **No** supplementary stage chrome for mic-only.
- The **local publisher** appears in the grid when their camera is on, labeled **You**.
- The **host** appears in the grid when their camera is on.
- When zero video-on participants, show centered copy: **"No cameras on yet. Mic-only participants are still audible."**
- Entering **Video Chat** **fully stops** active host tab-capture; returning to **Theater** requires the host to activate **Share Source Tab** again (no warm-resume). Reuse the existing host feedback/status region in stage chrome for **Share Source Tab** prompt when capture is inactive after a Theater return.

### Layout authority and fan-out

- Only the host may change **room mode** or **AV kill switch**; changes are **host-authoritative** and reflected immediately for all participants (no guest confirm step).
- Non-host participants see the active layout but cannot change mode; they **infer mode from layout** — no read-only mode badge or pill in stage chrome in MVP.
- During Theater ↔ Video Chat swap, show brief inline status **"Updating room layout…"** in the stage until consumer attachment reflects the new mode or **3s** elapses (then show empty/sparse state). Cross-fade **200ms** opacity on swap unless **`prefers-reduced-motion: reduce`**, then **instant cut**.

### Participant video tile lifecycle

- Row/grid tiles exist **only** while a **live video** consumer is attached for **`participant_av`** at that **`sessionId`**.
- On **`producerClosed`** for video (camera off, leave, kill switch, session teardown): **remove the tile promptly** — detach **`<video>`**, clear tile state, do **not** leave a **frozen last frame**. Frozen frames are a **contract violation**.
- **Removal timing (#142):** After consumer **`detach`** updates **`videoConsumers`**, the tile must leave row/grid within **one React commit**. The **`<video>`** element must set **`srcObject = null`** before the next paint (cleanup on unmount or stream change).
- **Removal animation (#142):** **Instant DOM detach** for remote tiles and local **You** preview — no fade-out in MVP. **`prefers-reduced-motion`** does not alter behavior (already instant).
- **Mic-only** after camera-off: no tile; audio continues per mode (theater client mix or Video Chat audio path). Visibility rules **unchanged** from pre-hardening contracts.
- **`share_state: stopped`:** guests lose **host-screen** attachment only; participant tiles and mic audio **persist** when SFU plane is healthy (**`interaction_flow.md`**).

### Theater audio (client-side default)

- **Theater** participant microphones and host movie audio are mixed **client-side** via **Web Audio API** at equal gain (**1.0**) — server-side mix is **deferred**.
- **`AudioContext`** suspend / autoplay fragility is a known runtime risk (**`runtime/execution_model.md`** **`THEATER_AUDIO_SUSPENDED`**). Recovery affordance (implicit gesture vs explicit control) is tier TW below.

### Errors and limits

- Device permission denied, missing devices, and SFU/relay failures use **inline recoverable** messaging consistent with existing host **`captureErr`** / guest status patterns — no silent failure.
- When SFU publisher caps block publish, show a **visible hard-fail** error on toggle (no auto-degrade in MVP).

### Viewport scope

- **Desktop (≥ 992px):** Theater camera row below movie; Video Chat uses full-stage grid; host control bar uses full flex row.
- **Narrow (< 992px):** honest **reduced** layout — participant video surfaces render as a **single horizontal scroll row** of tiles positioned **below** the movie primary region (Theater) or **below** the grid primary region (Video Chat). Toggles and host bar remain usable; do not imply desktop layout parity.

### iOS virtual keyboard (stacked room layout, #240)

When **iOS Safari** (iPad and iPhone) opens the **software keyboard** on **`/room/:roomId`**, the **movie player must remain fully visible** within the **visual viewport** — the complete **16:9** player shell stays on screen, scaling down if needed to fit the space above the keyboard. **Pushing the stage entirely off-screen** is a **contract violation**.

| Concern | Contract |
| --- | --- |
| **Scope** | All **iOS Safari** room surfaces where a native text control triggers the OS keyboard: **chat compose**, **Profile** tab fields, **room rename modal**, and any other room text input added later. |
| **Layout authority** | **`riffsync-room-page__stage`** (video + participant row) stays **pinned** in the visible area above the keyboard; **`riffsync-room-page__chat-column`** and in-column scroll regions **compress** and scroll internally — the room shell does **not** document-scroll to bring compose into view at the expense of the player. |
| **Wide layout (≥ 992px)** | Side-by-side desktop/tablet landscape layout was **not reported** for #240; apply the same **player-visible** rule if keyboard focus reproduces displacement there (regression check). |
| **Keyboard dismiss** | Layout may use a **brief transition** (~**200ms**) when returning to full viewport height; honor **`prefers-reduced-motion: reduce`** with **instant** restore. |
| **Implementation hints** | Prefer **`visualViewport`** height/offset to drive room shell CSS variables; consider **`interactive-widget=resizes-content`** on the document viewport meta where supported. Automated CI cannot simulate iOS keyboard — **manual iOS Safari QA** is required for acceptance. |

### Theater fullscreen with participant AV

- When participant AV surfaces are active, custom fullscreen **includes the Theater camera row or Video Chat grid** alongside the shared movie or grid primary region.
- The **host control bar** may remain **outside** the fullscreen wrapper.

### Expanded view (in-page, #259)

**Expanded view** is an optional **in-page** layout within **`/room/:roomId`** — **not** browser **`requestFullscreen`**, **not** YouTube iframe-native fullscreen, and **not** the same as **theater fullscreen** above. Compact site header and footer remain visible; the **stage region** fills the width available beneath header within the room shell.

| Concern | Contract |
| --- | --- |
| **Availability** | Offered in **Theater** and **Video Chat** room modes when viewport **≥ 992px**. **Hidden or inert** below 992px — standard stacked layout unchanged. |
| **Stage primary** | **Theater:** shared movie player (host capture / guest inbound **`host_screen`**) remains primary inside the expanded stage container. **Video Chat:** participant **video-on** tile grid fills the stage region. |
| **Theater camera row** | When one or more participant cameras are on, the expanded stage container reserves a bottom camera row **beneath** the movie. When zero cameras are on, omit the row and allow the movie to occupy the available expanded stage. Visibility rules for mic-only participants are unchanged. |
| **Chat overlay** | **Transparent** panel **over** the stage, anchored **bottom-right**. Occupies **at most 50% of stage height** and **at most ~40% of stage width** (exact width via CSS **`clamp`** acceptable). **Does not** span the full right column height. |
| **Overlay contents** | **Chat plane only:** chat drawer status, scrollable message log (bounded flex + stick-to-bottom per chat contract), jump-to-latest, participant AV toggles when fan JWT present, compose. **No** sidebar tab strip (**Chat / People / Room / Profile**). **People / Room / Profile** require **exit expanded view**. |
| **Optional polish** | **Top fade gradient** on the overlay zone (video visible through chat background) is **nice-to-have**, not MVP-required. |
| **Toggle** | **Corner control** on the stage (mockup: top-right). **Visible on pointer hover** over the stage; control remains visible while **keyboard focused**. Accessible names: **Expand view** / **Exit expanded view**. |
| **Host control bar** | **Remains below the stage** in expanded and standard layouts (host-only). |
| **State** | **Session-only** client state — **no** `localStorage` persistence; full reload returns to **standard** layout. |
| **Drawers** | Chat and video-relay drawer status rules **unchanged** — chat banner lives inside the overlay; video-relay status stays on the stage playback surface. |
| **Chromecast composition** | The expanded layout's **stage-primary + chat overlay** shell is the presentation model for optional viewer-local Cast. Cast work reuses this model without making expanded view itself the Cast entry point. |

Implementation: `RoomPage.tsx` owns session-only expanded state, `RoomPageSidebar.tsx` renders the shared chat plane as either sidebar or overlay, and `StageParticipantLayout.tsx` renders Theater cameras in a bottom horizontal row (standard and expanded desktop layouts).

### Chromecast Cast view (viewer-local)

Optional Chromecast support is a local room presentation layer for Cast-capable senders. It is **not** a room mode, not host-authoritative, and not visible to other participants unless they independently Cast from their own device.

| Concern | Contract |
| --- | --- |
| **Availability** | Show **Cast to TV** only in **normal room view** when sender support is detected. Cast entry is hidden or inert in expanded view. Missing support must not block normal playback, chat, expanded view, host controls, or room participation. |
| **Start point** | Cast starts from the standard stage/sidebar room layout only. The sender does not need to enter expanded view before starting Cast. |
| **Receiver presentation** | The custom RiffSync Cast receiver must render the expanded-view composition model: stage primary/video plus bottom-right chat overlay. The Cast presentation does **not** include the sidebar tab strip; **People**, **Room**, and **Profile** remain sender-side room surfaces. |
| **Sender active state** | After confirmed Cast start, the sender's normal stage replaces the regular video/playback surface with **`Now Casting`** and a stop affordance. The regular in-page video surface does not remain visible while local Cast is active. |
| **Chat while casting** | Sender chat remains interactive under existing rules: signed-in fans may send text, GIFs, and reactions when chat is healthy; anonymous guests may read and retain the sign-in gate for send. |
| **Stop Cast** | Stop returns the sender to normal in-page playback without clearing chat scrollback, compose state, selected sidebar tab, presence, room membership, or authoritative room snapshot state. |
| **Failure / unavailable** | Cast unavailable, blocked, rejected, or failed start surfaces honest local status and leaves normal in-page playback/chat intact. It never implies the room failed or that other participants changed state. |
| **Other participants (#277)** | Other participants see no Cast status, **`Now Casting`** panel, Stop Cast control, room mode indicator, playback change, drawer status change, chat reset, sidebar reset, participant A/V change, or stage layout change caused by another viewer's local Cast session. |

### Cast stop restoration (#276)

The #276 slice owns the successful intentional Stop Cast return from the active sender stage to the normal room stage.

| Concern | Contract |
| --- | --- |
| **Stopping surface** | The active **`Now Casting`** panel may show brief local stopping copy after Stop Cast activation. Use the same stage-local status surface as active Cast; do not use chat drawer, video-relay status, host feedback, room error boundaries, or global room announcer copy. |
| **Restored stage** | On successful stop cleanup, remove the active Cast panel and restore the normal **`riffsync-room-page__stage`** playback surface for the current room mode. The regular in-page video/playback surface is visible again. |
| **Sidebar preservation** | Sidebar tabs, selected tab, chat scrollback, compose draft, jump-to-latest state, participant A/V controls, People roster, and Profile/Room tab state remain sender-side room state. Stop Cast must not reset the chat column. |
| **Expanded view** | Do not re-enter expanded view automatically after stop, even if stale internal expanded state existed before Cast became active. The normal room layout returns with the expanded-view toggle available only when the standard expanded-view contract allows it. |
| **Other viewers** | Other participants receive no stop status, stage restoration event, room mode change, playback change, or chat/sidebar reset because of this sender's local Stop Cast. |
| **Failure boundary** | Receiver disconnect, SDK-ended active sessions outside successful user stop, failed stop, blocked/unavailable Cast, and retry copy belong to #278. |

### Cast-active sender stage (#274)

The #274 slice starts only after #273 receiver render confirmation.

| Concern | Contract |
| --- | --- |
| **Stage replacement** | Replace the sender's regular stage video/playback surface with a stage-local active Cast panel. The panel includes visible **`Now Casting`** text and short local copy such as **`Casting to TV`**. App-authored copy must not expose the receiver device name. |
| **Stop affordance** | Render a visible **Stop Cast** button/control in the active Cast panel. The control is local to the sender and must not be placed in **`HostControlBar`** or described as room-wide. |
| **Status surface** | The active panel provides a stage-local **`role="status"`** or equivalent polite live region for the Cast-active state. It must not reuse chat drawer status, video-relay status, host feedback, room error boundaries, or **`#riffsync-a11y-announcer`**. |
| **Expanded view while casting** | Expanded view is unavailable while local Cast is active. If stale expanded-view state exists when Cast becomes active, clear it and show the normal room layout with the **`Now Casting`** sender stage. Do not offer an expand control until Cast is no longer active. |
| **Room context** | Sidebar tabs, chat scrollback, compose draft, selected sidebar tab, presence, participant A/V controls, and room membership remain sender-side state. #275 covers broader chat interactivity while Cast is active; #274 must not regress those surfaces while replacing the stage. |
| **Boundary with #276** | #274 owns rendering the Stop Cast control and invoking local stop intent. #276 owns the complete restoration of normal in-page playback after stop completes. |

### Cast start receiver presentation (#273)

The Cast-start slice proves an actual custom receiver view, not just a sender-side launch request.

| Concern | Contract |
| --- | --- |
| **Receiver shell** | Render a receiver route/page that uses the expanded-view shell structure: stage-primary video area plus bottom-right chat overlay. Header/footer/sidebar tab chrome are omitted from the receiver. |
| **Sender-proxied content** | The sender sends the receiver a presentation snapshot and subsequent chat-overlay updates over the Cast channel. The receiver does not fetch room state, join chat, or expose sender-only tabs. |
| **Overlay requirement** | The chat overlay is required on the receiver for #273. A native media-only Cast path, tab mirroring guidance, or receiver view without chat overlay does not satisfy this slice. |
| **Receiver interactions** | Receiver chat overlay is presentation-only. Chat compose, GIF/emoji pickers, reactions, participant A/V toggles, People, Room, and Profile controls remain on the sender. |
| **Start feedback** | While the sender is waiting for receiver render confirmation, keep normal in-page playback visible and use local Cast status near the Cast surface or stage-local Cast status. Do not use chat drawer, video-relay status, room error, or host feedback surfaces. |
| **Success transition** | The sender treats Cast start as confirmed only after the receiver reports that stage-primary video and the bottom-right chat overlay rendered. The #274 slice owns the persistent **`Now Casting`** sender-stage details after confirmation. |

### Cast availability in normal room view (#272)

The first Cast slice exposes availability only after the normal room shell has rendered and local sender support is confirmed.

| Concern | Contract |
| --- | --- |
| **Primary placement** | Place **Cast to TV** in the normal-view **Room** sidebar action group near existing room actions such as **Copy Party Link** and **Leave Party**. It is a viewer-local room action, not a host-authoritative control. |
| **Host control separation** | Do **not** place Cast availability in **`HostControlBar`** or gate it on **`JWT.sub === hostSub`**. Room admins and guests follow the same local sender-support rule. |
| **Expanded view** | Do not render a Cast start action in expanded view. If normal-view state changes while expanded, the expanded toggle and overlay remain unchanged; the viewer exits expanded view before using Cast. |
| **Unsupported sender default** | When sender support is absent, unknown, blocked by platform policy, or still checking, omit **Cast to TV**. Normal playback, chat, expanded view, host controls, and participant A/V remain unchanged. |
| **Explainable unavailable state** | If an implementation briefly renders or evaluates the Cast affordance and then learns Cast is unavailable, show a local status line at the Cast surface with copy such as **Cast is not available in this browser or device.** Do not use the chat drawer banner, video-relay status, room error, or host feedback surfaces. |
| **Stage impact** | #272 does not replace the stage, hide the player, or show **`Now Casting`**. The regular **`RoomPlaybackPanel`** remains the active playback surface until a later start-Cast slice confirms a Cast session. |

## Accessibility & motion (baseline)

- Prefer **semantic headings** and **focus order** that match visual flow; **keyboard** paths for **Play**, **share**, **lobby join** before shipping broadly.
- Respect **`prefers-reduced-motion`** for non-critical animations (see sibling **`accessibility.md`**).

## Operator framing

- **Charts / health:** direct maintainers to **AWS CloudWatch** dashboards—**no in-app uptime SLA** promises for the OSS deployment.

## Decisions (answered — presence and AV maturity)

| Question | Decision |
| --- | --- |
| Typing in chat? | **In scope** — ellipsis indicator; typing start marks **active**; ephemeral (not archived). |
| People badges? | **Online** (connected) + **active** (2-minute window) on roster rows; host row included. |
| Speaking on tiles? | **Yes** — border/glow on Theater strip and Video Chat grid when video on and mic unmuted. |
| Mic-only speaking? | **People tab rows only** — no stage tile or audible-only chrome. |
| Video Chat label? | **Beta** on host control bar segment when **`avDisabled`** is false; tooltip per host control bar section. |
| People cam/mic icons? | **Yes** — live SFU producer state per **`sessionId`**; mic muted vs off distinct. |
| Speaking VAD? | **`fftSize` 512**, RMS **≥ 0.02**, **150ms** attack, **300ms** hang — **`execution_model.md`**. |
| Separate chat vs video-relay drawers? | **Unchanged** — independent banners per **`getDiagnostics().drawers`**; no combined copy. |

## Decisions (answered — M23 layout polish #242)

| Topic | Decision |
| --- | --- |
| **Layout timeout copy** | After **3s** without consumers attached, keep direction-neutral sparse state — **do not** append alternate **Updating room layout…** variants. |
| **Video Chat empty grid** | **`No cameras on yet. Mic-only participants are still audible.`** |
| **Theater before capture** | Host **Share Source Tab** prompt in existing stage status region. |

## Decisions (answered — lobby host line #257)

| Topic | Decision |
| --- | --- |
| **Placement** | On **`/lobby`**, each list row shows **`Hosted by {hostDisplayName}`** on a line **directly below** the episode **title** (`h2`) and **above** the stats row (activity, connections, playback badge). |
| **Copy** | Sentence case **`Hosted by …`**; **`hostDisplayName`** verbatim from API (already trimmed server-side, max **48**). |
| **Styling** | Muted secondary text — reuse **`riffsync-muted`** or an adjacent lobby stat class; not a second heading. |
| **Missing name** | Rows without **`hostDisplayName`** are **not rendered** — the API omits them; SPA does not synthesize fallback copy. |
| **Private rooms** | Unchanged — only **public** rooms appear on **`/lobby`**. |

## Decisions (answered — compose media picker #258)

| Topic | Decision |
| --- | --- |
| **Tab body height** | **16.5rem** fixed below tab bar for both **Emojis** and **GIF** panels. |
| **GIF results growth** | Results grid scrolls inside fixed panel — popover does **not** grow when results appear. |
| **Tab switch jitter** | **Contract violation** if outer popover height changes on tab switch. |

## Decisions (answered — Theater camera placement #261)

| Topic | Decision |
| --- | --- |
| **Standard Theater cameras** | Video-on participants render in a horizontal row directly beneath the movie, not in a right-side rail and not over the movie. |
| **Expanded Theater cameras** | Expanded stage includes the movie plus optional bottom camera row; when the row is empty, the movie may use the full expanded stage. |
| **Chat in expanded Theater** | Chat remains the bottom-right transparent overlay from **#259** and is not displaced by cameras. |
| **Video Chat** | Participant grid remains primary; mic-only and grid visibility rules are unchanged. |

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### existing-room-polish
- **Theater audio resume control:** persistent **Enable party audio** chrome when **`THEATER_AUDIO_SUSPENDED`** — deferred; current room runtime uses implicit gesture resume per **`execution_model.md`**.
- **Telemetry / UX story event names** for layout transition timeout — deferred; per-drawer reconnect and tile lifecycle client log **`event`** names are normative in **`operations/observability.md`** Decisions.

### chromecast-presentation
- **Resolved for #274:** persistent Cast-active sender stage uses a stage-local **`Now Casting`** panel with Stop Cast, no receiver-device naming, and no room-wide framing.
- **Resolved for #274:** expanded view is unavailable while local Cast is active; stale expanded-view state is cleared when active Cast begins.
- **Resolved for #276:** successful intentional Stop Cast removes the active Cast panel, restores the normal room stage playback surface, and preserves sender sidebar/chat state without notifying other viewers.
- **Resolved for #277:** Cast presentation state is never rendered from room snapshot fields, room WebSocket payloads, SFU diagnostics, or another participant's local Cast controller. Remote participants keep their current room presentation and status surfaces unchanged.
- **Out of #276 scope:** disconnected, blocked, SDK-ended active sessions outside successful user stop, and stop-failure recovery copy belongs to #278.

## Primary code pointers (optional)

- **`apps/web/src/room/ChatComposeMediaPicker.tsx`**, **`ChatEmojiPicker.tsx`**, **`ChatGiphyPicker.tsx`** — compose emoji/GIF tabbed popover (#258 stable height).
- SPA layout, design system, and route-level **loading/error** boundaries once scaffolded.
- **`apps/web/src/room/RoomPlaybackPanel.tsx`** — guest **`#riffsync-video-relay-status`** host-screen status line.
- **`apps/web/src/pages/RoomPage.tsx`** — thin room shell composing session modules; stage + chat-column layout; expanded-view toggle and overlay wiring (**#259**).
- **`apps/web/src/room/RoomPageSidebar.tsx`** — sidebar tabs + chat; chat/compose subtree reused inside expanded overlay.
- **`apps/web/src/room/stage/participantAvConsumers.ts`**, **`stageParticipantTiles.ts`** — tile attach/detach on **`newProducer`** / **`producerClosed`**.
