# Presentation

UI-level contract for layout states, honest failure surfaces, and **cost-conscious** defaults (no commercial **SLA** narrative—operators rely on **CloudWatch** + community best effort).

## Global expectations

| Concern | Contract |
| --- | --- |
| **Catalog loading** | Skeleton or **in-catalog placeholders** for rows; avoid blocking the whole shell on **`GET /v1/catalog`** when possible (progressive render). |
| **Empty catalog** | Clear **“nothing to show yet”** copy for operators/contributors—never a silent blank. |
| **Signed-in host / solo room** | **WebSocket** + **JWT** for admin paths; embed errors surface **embed blocked** + **open on YouTube** escape hatch (**`error_state.md`**). |
| **Room / lobby** | **Room-admin** controls only when **`JWT.sub === hostSub`**; anonymous guests see **read-only** player/chat chrome (**picker hidden**, subscribe-only WebRTC). |
| **Theater fullscreen** | Optional **wrapper fullscreen** ( **`requestFullscreen`** on a container that includes **player + overlaid chat**, e.g. **right-side rail**) — **not** YouTube iframe-native fullscreen, which cannot show RiffSync chrome. |
| **Share** | **Copy `/room/:id` URL**; show advisory **`playbackExpectation`** near share affordance. |
| **Rate / caps** | Server may return **429** / **WS business `error`** when limits hit (**`api_contracts.md`**); toast or inline message—**no** infinite retry storms. |

## Chat & scrollback (watch party room)

- **Surface:** **`/room/:roomId`** sidebar **Chat** tab (not solo watch).
- **Layout:** Message list occupies a **bounded flex region** inside the sidebar; **only the log scrolls** (`overflow-y: auto`). Compose toolbar and tabs stay fixed. **Stick-to-bottom:** new messages auto-scroll when the user is within **48px** of the bottom (same threshold as implementation in bounded-log work). **Jump to latest:** when the user has scrolled up beyond that threshold, show a **button** above the compose bar after one or more lines arrive while they are reading history; label **"New messages"** (append **`(N)`** when **N > 1** pending). Activating the control scrolls to the latest line, clears the pending count, and hides the control. Manual scroll back within **48px** of the bottom also clears pending without requiring the button. Programmatic scroll uses **`behavior: 'smooth'`** unless **`prefers-reduced-motion: reduce`**, then **`'auto'`**.
- **Ephemeral** chat: **in-memory / UI scrollback** capped (~**100** recent messages in client; align with **`docs/architecture.frontend.md`**). **No durable transcript** from server—reload clears messages, reactions, and GIF posts (**storage cost**).
- **Rich content (signed-in send):** **Unicode emoji** via compose picker; **Giphy GIF** posts (inline render, bounded dimensions); **emoji reactions** aggregated per message. **Anonymous guests** may **view** all rich content but **cannot** send or react (**`authorization.md`**).
- **Avatars:** Signed-in fans may upload **one** profile image (server-retained). Chat rows show a **thumbnail beside display name** using a **public HTTPS** avatar URL when set; guests without avatars use a neutral fallback glyph.
- Optionally **typing** / **presence** later—do not imply message archive.

## Watch party participant AV (`/room/:roomId`)

### Shell boundaries

- **`riffsync-room-page__stage`** holds shared movie playback, participant video surfaces (strip or grid), host tab-capture chrome, and **video-relay** drawer status.
- **`riffsync-room-page__chat-column`** holds sidebar tabs (**Chat**, **People**, **Room**, **Profile**), participant AV toggles, message log, compose, and **chat** drawer status.
- **Theater room mode** (host layout policy) is distinct from **theater fullscreen** (wrapper **`requestFullscreen`**). UI copy must not conflate the two.
- **`RoomPage`** is a **thin shell**; realtime drawers are owned by **`ChatSession`**, **`SfuMediaSession`**, and **`TheaterPlayback`** (**`runtime/execution_model.md`**). Presentation contracts describe what users see regardless of module wiring.

### Media path (SFU-only)

- **All environments** (local dev, CI, prod) use the **mediasoup SFU** path for host screen-share and participant A/V. **No mesh WebRTC UI** — remove production mesh warnings, mesh negotiation status strings, and mesh-only guest playback affordances.
- Missing SFU/TURN configuration surfaces an **honest deployment/configuration error** (not a fallback path selector). Stable codes **`SFU_RELAY_URL_MISSING`**, **`LOCAL_SFU_UNREACHABLE`**, **`SFU_RELAY_UNREACHABLE`** map to page **`role="alert"`** and video-relay status (**#137**, **`error_state.md`**). Errors persist through reconnect backoff until signaling **`session.ready`** succeeds.

### Realtime drawer status (separate surfaces)

Chat (room WebSocket) and video relay (SFU signaling + consumers) expose **independent, simultaneous** status when lifecycles diverge. **Do not** consolidate into one banner that implies both planes failed (e.g. avoid combined copy like "Reconnecting chat… Video may pause briefly." when only chat is down).

| Drawer | Placement | When shown | Copy pattern (template) |
| --- | --- | --- | --- |
| **Chat** | Top of **`riffsync-room-page__chat-column`**, above tabs/toolbar (reuse **`riffsync-room-page__ws-banner`** styling) | **`ChatSession`** is **`reconnecting`** or chat send is blocked by chat-plane outage | **"Chat reconnecting…"** (final string tier TW) |
| **Video relay** | Stage playback region — guest **`riffsync-muted`** status line and/or host **`riffsync-room-page__share-status`** / host feedback area | **`SfuMediaSession`** is **`reconnecting`**, ICE/TURN recovery in progress, or host-screen consumer attach pending after **`share_state`** | **"Video relay reconnecting…"** (final string tier TW) |

- **Both banners may appear at once** when each drawer is independently unhealthy; each clears when **that** drawer returns to **`connected`** (or equivalent healthy state per **`getDiagnostics()`**).
- **Hard failures** stay drawer-scoped: chat-plane errors near chat/compose; SFU/toggle failures at AV toggles or stage **`role="alert"`** per **`error_state.md`** — not merged into a single realtime toast.
- **Host screen-share idle/negotiating** states (guest waiting for host share) use the **video-relay** surface, not the chat banner.

### Host control bar (below stage)

- Visible only when **`JWT.sub === hostSub`**.
- Flex row directly below the stage: **room layout** segmented control (**Theater** default, **Video Chat** alternate) on the left; **Disable room A/V** kill switch on the right. Wraps on narrow widths; extension point for future host share controls.
- When **AV kill switch** is on, **Video Chat** selection is unavailable or inert until AV is re-enabled.

### Participant camera/microphone toggles

- Two controls (**Camera**, **Microphone**) sit **above chat compose** in the sidebar when the viewer has a **fan JWT** (signed-in fan or host using participant A/V).
- **Not rendered** for **anonymous guests** — no toggle chrome and no sign-in overlay at this placement; guests remain subscribe-only for participant AV and use chat compose's existing **Sign In to Chat** overlay only for chat send.
- When rendered, toggles stay **visible on every sidebar tab** (**Chat**, **People**, **Room**, **Profile**) — session-level AV controls, not tab-scoped.
- Each control pairs an icon with a visible text label and reflects explicit on/off state for the local publisher.
- When the host has disabled room AV, toggles **remain visible but disabled** with explanation copy: **"The host turned room A/V off."** (associated via **`aria-describedby`**).

### Theater room mode

- Shared movie player (host tab-capture / guest inbound screen-share stream) stays **primary**.
- On viewports **≥ 992px**, a **vertical participant strip** sits **immediately right of the video** within the stage region (not in the chat column).
- Strip lists **video-on** participants only, ordered by **stable roster join order** (same source as **People** tab); **no speaking/active border hints** in MVP.
- **Mic-only** participants are audible but **not** shown in the strip (identity via **People** tab and chat). **No** avatar chips, audible-only badges, or speaking-border chrome this milestone.
- The **local publisher** appears in the strip when their camera is on, labeled **You** (live preview tile).
- The **host** appears in the strip when their camera is on, same as other signed-in fans.
- When zero video-on participants, the strip container is **not rendered** (no empty chrome).
- Participant **microphones** are audible alongside movie audio while AV is enabled.

### Video Chat room mode

- The movie player region is **replaced** by a **grid** of **video-on** participants on viewports **≥ 992px** (`auto-fill` tiles, **16:9**, scroll when overflow).
- **Mic-only** participants are **excluded** from the grid; audio is still heard; identity via **People** tab and chat. **No** supplementary stage chrome for mic-only this milestone.
- The **local publisher** appears in the grid when their camera is on, labeled **You**.
- The **host** appears in the grid when their camera is on.
- When zero video-on participants, show centered copy: **"No cameras on yet. Mic-only participants are still audible."**
- Entering **Video Chat** **fully stops** active host tab-capture; returning to **Theater** requires the host to activate **Share Source Tab** again (no warm-resume). Reuse the existing host feedback/status region in stage chrome for **Share Source Tab** prompt when capture is inactive after a Theater return.

### Layout authority and fan-out

- Only the host may change **room mode** or **AV kill switch**; changes are **host-authoritative** and reflected immediately for all participants (no guest confirm step).
- Non-host participants see the active layout but cannot change mode; they **infer mode from layout** — no read-only mode badge or pill in stage chrome in MVP.
- During Theater ↔ Video Chat swap, show brief inline status **"Updating room layout…"** in the stage until consumer attachment reflects the new mode or **3s** elapses (then show empty/sparse state). Cross-fade **200ms** opacity on swap unless **`prefers-reduced-motion: reduce`**, then **instant cut**.

### Participant video tile lifecycle

- Strip/grid tiles exist **only** while a **live video** consumer is attached for **`participant_av`** at that **`sessionId`**.
- On **`producerClosed`** for video (camera off, leave, kill switch, session teardown): **remove the tile promptly** — detach **`<video>`**, clear tile state, do **not** leave a **frozen last frame**. Frozen frames are a **contract violation**.
- **Mic-only** after camera-off: no tile; audio continues per mode (theater client mix or Video Chat audio path). Visibility rules **unchanged** from pre-hardening contracts.
- **`share_state: stopped`:** guests lose **host-screen** attachment only; participant tiles and mic audio **persist** when SFU plane is healthy (**`interaction_flow.md`**).

### Theater audio (client-side default)

- **Theater** participant microphones and host movie audio are mixed **client-side** via **Web Audio API** at equal gain (**1.0**) — server-side mix is **deferred**.
- **`AudioContext`** suspend / autoplay fragility is a known runtime risk (**`runtime/execution_model.md`** **`THEATER_AUDIO_SUSPENDED`**). Recovery affordance (implicit gesture vs explicit control) is tier TW below.

### Errors and limits

- Device permission denied, missing devices, and SFU/relay failures use **inline recoverable** messaging consistent with existing host **`captureErr`** / guest status patterns — no silent failure.
- When SFU publisher caps block publish, show a **visible hard-fail** error on toggle (no auto-degrade in MVP).

### Viewport scope

- **Desktop (≥ 992px):** vertical Theater strip beside movie; Video Chat uses full-stage grid; host control bar uses full flex row.
- **Narrow (< 992px):** honest **reduced** layout — participant video surfaces render as a **single horizontal scroll row** of tiles positioned **below** the movie primary region (Theater) or **below** the grid primary region (Video Chat). Toggles and host bar remain usable; do not imply desktop layout parity.

### Theater fullscreen with participant AV

- When participant AV surfaces are active, custom fullscreen **includes stage participant strip or grid** alongside the shared movie or grid primary region.
- The **host control bar** may remain **outside** the fullscreen wrapper.

## Accessibility & motion (baseline)

- Prefer **semantic headings** and **focus order** that match visual flow; **keyboard** paths for **Play**, **share**, **lobby join** before shipping broadly.
- Respect **`prefers-reduced-motion`** for non-critical animations (see sibling **`accessibility.md`**).

## Operator framing

- **Charts / health:** direct maintainers to **AWS CloudWatch** dashboards—**no in-app uptime SLA** promises for the OSS deployment.

## Open implementation decisions

- **Tile removal animation** on **`producerClosed`:** instant DOM detach vs short fade-out; whether **`prefers-reduced-motion: reduce`** forces instant removal for remote tiles.
- **Drawer status final strings:** exact copy for chat vs video-relay **`reconnecting`**, **`degraded`**, and post-recovery clear. Guest **host-screen** playback-region copy is normative in **`interaction_flow.md`** (SFU three-state model); video-relay drawer status covers SFU signaling health separately from that playback strip.
- **Theater audio resume control:** implicit resume on first user gesture vs persistent **Enable party audio** (or equivalent) in stage chrome when **`THEATER_AUDIO_SUSPENDED`** — label, placement, dismiss behavior.
- **Mode-transition copy variants:** whether **"Updating room layout…"** varies by Theater ↔ Video Chat direction or sparse-state follow-up when **3s** elapses without consumers attached.
- **Frozen-frame regression AC wording** for **`/refine-issue`** (e.g. max visible stale frame duration, mic-only tile absence checks) — harness-visible assertions.
- **Telemetry / UX story event names** for layout transition timeout, tile lifecycle failures, and per-drawer reconnect.

## Primary code pointers (optional)

- SPA layout, design system, and route-level **loading/error** boundaries once scaffolded.
- **`apps/web/src/pages/RoomPage.tsx`** — thin shell composing session modules; stage + chat-column layout unchanged.
- **`apps/web/src/room/stage/participantAvConsumers.ts`**, **`stageParticipantTiles.ts`** — tile attach/detach on **`newProducer`** / **`producerClosed`**.
