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

- **`riffsync-room-page__stage`** holds shared movie playback, participant video surfaces (strip or grid), and host tab-capture chrome.
- **`riffsync-room-page__chat-column`** holds sidebar tabs (**Chat**, **People**, **Room**, **Profile**), participant AV toggles, message log, and compose.
- **Theater room mode** (host layout policy) is distinct from **theater fullscreen** (wrapper **`requestFullscreen`**). UI copy must not conflate the two.

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
- **Mic-only** participants are audible but **not** shown in the strip (identity via **People** tab and chat).
- The **local publisher** appears in the strip when their camera is on, labeled **You** (live preview tile).
- The **host** appears in the strip when their camera is on, same as other signed-in fans.
- When zero video-on participants, the strip container is **not rendered** (no empty chrome).
- Participant **microphones** are audible alongside movie audio while AV is enabled.

### Video Chat room mode

- The movie player region is **replaced** by a **grid** of **video-on** participants on viewports **≥ 992px** (`auto-fill` tiles, **16:9**, scroll when overflow).
- **Mic-only** participants are **excluded** from the grid; audio is still heard; identity via **People** tab and chat.
- The **local publisher** appears in the grid when their camera is on, labeled **You**.
- The **host** appears in the grid when their camera is on.
- When zero video-on participants, show centered copy: **"No cameras on yet. Mic-only participants are still audible."**
- Entering **Video Chat** **fully stops** active host tab-capture; returning to **Theater** requires the host to activate **Share Source Tab** again (no warm-resume). Reuse the existing host feedback/status region in stage chrome for **Share Source Tab** prompt when capture is inactive after a Theater return.

### Layout authority and fan-out

- Only the host may change **room mode** or **AV kill switch**; changes are **host-authoritative** and reflected immediately for all participants (no guest confirm step).
- Non-host participants see the active layout but cannot change mode; they **infer mode from layout** — no read-only mode badge or pill in stage chrome in MVP.
- During Theater ↔ Video Chat swap, show brief inline status **"Updating room layout…"** in the stage until consumer attachment reflects the new mode or **3s** elapses (then show empty/sparse state). Cross-fade **200ms** opacity on swap unless **`prefers-reduced-motion: reduce`**, then **instant cut**.

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

## Primary code pointers (optional)

- SPA layout, design system, and route-level **loading/error** boundaries once scaffolded.
- **`apps/web/src/pages/RoomPage.tsx`** — stage + chat-column shell; participant AV and host bar extend this layout.
