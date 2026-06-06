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
- Holds **room mode** selector (**Theater** default, **Video Chat** alternate) and **AV kill switch** (disables all room participant AV publish and consumption; room reverts to movie + text chat only).
- Extension point for future host share controls; room mode is the first occupant.
- When **AV kill switch** is on, **Video Chat** selection is unavailable or inert until AV is re-enabled.

### Participant camera/microphone toggles

- Two controls (**camera**, **microphone**) sit **above chat compose** in the sidebar.
- **Always visible** regardless of active sidebar tab (**Chat**, **People**, **Room**, **Profile**) — session-level AV controls, not tab-scoped.
- Icons reflect explicit on/off state for the local publisher.
- Only **signed-in fans** may publish; **anonymous guests** see the same chrome with the existing **Sign In to Chat** overlay pattern at the controls (subscribe-only for participant AV).
- When the host has disabled room AV, toggles **remain visible but disabled** with a short explanation that the host turned room A/V off.

### Theater room mode

- Shared movie player (host tab-capture / guest inbound screen-share stream) stays **primary**.
- A **vertical participant strip** sits **immediately right of the video** within the stage region (not in the chat column).
- Strip lists **video-on** participants only; **mic-only** participants are audible but **not** shown in the strip (identity via **People** tab and chat).
- The **host** appears in the strip when their camera is on, same as other signed-in fans.
- Participant **microphones** are audible alongside movie audio while AV is enabled.

### Video Chat room mode

- The movie player region is **replaced** by a **grid** of **video-on** participants.
- **Mic-only** participants are **excluded** from the grid; audio is still heard; identity via **People** tab and chat.
- The **host** appears in the grid when their camera is on.
- Entering **Video Chat** **fully stops** active host tab-capture; returning to **Theater** requires the host to activate **Share Source Tab** again (no warm-resume).

### Layout authority and fan-out

- Only the host may change **room mode** or **AV kill switch**; changes are **host-authoritative** and reflected immediately for all participants (no guest confirm step).
- Non-host participants see the active layout but cannot change mode.

### Errors and limits

- Device permission denied, missing devices, and SFU/relay failures use **inline recoverable** messaging consistent with existing host **`captureErr`** / guest status patterns — no silent failure.
- When SFU publisher caps block publish, show a **visible hard-fail** error on toggle (no auto-degrade in MVP).

### Viewport scope

- **Desktop-first:** full Theater strip, Video Chat grid, and host control bar layouts are optimized for desktop viewports.
- **Narrow/mobile:** honest **reduced** experience in MVP (participant AV surfaces may simplify or defer); do not imply parity with desktop layouts.

### Theater fullscreen with participant AV

- When participant AV surfaces are active, custom fullscreen **includes stage participant strip or grid** alongside the shared movie or grid primary region.
- The **host control bar** may remain **outside** the fullscreen wrapper.

## Accessibility & motion (baseline)

- Prefer **semantic headings** and **focus order** that match visual flow; **keyboard** paths for **Play**, **share**, **lobby join** before shipping broadly.
- Respect **`prefers-reduced-motion`** for non-critical animations (see sibling **`accessibility.md`**).

## Operator framing

- **Charts / health:** direct maintainers to **AWS CloudWatch** dashboards—**no in-app uptime SLA** promises for the OSS deployment.

## Open implementation decisions

- Labels and icons for camera/mic toggles, room mode selector, AV kill switch, and read-only mode indicator for non-host viewers.
- **Empty / sparse states:** Video Chat grid with zero video-on participants; Theater strip empty; copy while host capture is stopped in Video Chat.
- Strip ordering, grid pagination/scroll, max visible tiles, and speaking/active hints (if any).
- Host control bar layout relative to future share controls; visual grouping and responsive wrapping on narrow viewports.
- **Layout transition** motion and **`prefers-reduced-motion`** behavior when switching Theater ↔ Video Chat.
- **Live region / screen-reader** announcements for room mode changes, kill switch, and local cam/mic state (see **`accessibility.md`**).
- Narrow-viewport specifics for strip/grid/host bar (bottom sheet, collapse, or hide) under desktop-first MVP scope.
- Whether **local self-preview** appears in strip/grid or only remote participants.
- Tab-capture stop / **Share Source Tab** prompt **status line** in stage chrome during Video Chat ↔ Theater transitions.
- Exact disabled-toggle explanation copy when host AV kill switch is on.

## Primary code pointers (optional)

- SPA layout, design system, and route-level **loading/error** boundaries once scaffolded.
- **`apps/web/src/pages/RoomPage.tsx`** — stage + chat-column shell; participant AV and host bar extend this layout.
