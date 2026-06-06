# Domain model

Business concepts and rules (language-agnostic). UI maps here via **`docs/architecture.frontend.md`**.

## Core entities

- **Episode (catalog row):** a stable **`id`** and **`experimentNumber`**, MST-flavored **`title`/`era`**, YouTube linkage, enrichment from TMDB and optional YouTube thumb URL.
- **Room:** shared viewing session on **`/room/:id`** with a **mutable current catalog episode** (**`catalogEpisodeId`** / **`videoId`** on the room document — seeded when the **signed-in** host creates the room, then changeable via **in-room picker**); the host (**room admin**) renders **embedded YouTube** for that selection and may **publish** a captured **`MediaStream`** to guests over **WebRTC**; guests consume that stream—**not** parallel iframe timelines kept in sync server-side. The room also carries **host-authoritative layout policy**: **`roomMode`** (**Theater** default | **Video Chat**) and **`avDisabled`** (room-wide participant A/V kill switch), both **durable** on the room document and returned on snapshot/join.
- **Participant A/V (camera / microphone):** optional **signed-in fan** publish of **`getUserMedia`** streams over the same SFU path as host capture; **default off** until the fan explicitly enables each control. **Anonymous guests** may **subscribe** to participant A/V when **`avDisabled`** is false but **must not publish** participant camera or microphone. Participant A/V is **parallel** to host tab-capture movie broadcast—not a replacement for embed/capture lawful playback.
- **Participant:** **`sessionId`** + display name (**anonymous**) or **`sub`** (**signed-in optional**) with optional **`avatarUrl`** (public HTTPS, one image per **`sub`**).
- **Chat message (ephemeral):** room-scoped broadcast with **`messageId`**, kind **`text`** | **`gif`**, sender identity, timestamp; **not** persisted server-side.
- **Chat reaction (ephemeral):** emoji on a **`messageId`**; toggle per signed-in sender; **not** persisted server-side.
- **Room admin:** signed-in participant whose **fan-pool Cognito `sub`** equals the room’s **`hostSub`** — **exclusive authority** to drive the **embedded player**, **start/stop broadcast capture**, select **`roomMode`**, operate the room-wide **`avDisabled`** kill switch, and mutate durable room playback metadata. **Anonymous users cannot host.** **Guest promotion** and token-based **admin reclaim** beyond normal Cognito re-login for the same user are **out of scope** for MVP. When the room admin enables a **participant camera**, they appear in Theater strip and Video Chat grid **like other signed-in fans** (not as a separate host-only surface).
- **Operator (staff):** invite-only principal in the **staff** Cognito pool, provisioned **out-of-band** (console, CLI, or IaC). When authorized, carries **`cognito:groups`** including **`admin`** and/or **`curator`**. **Distinct** from **Participant** and **Room admin** — operator identity does **not** grant fan **`hostSub`** authority, room publisher role, or participant chat identity unless the same person also holds a separate **fan** session.

## Identity modes and trust boundary

Three coexisting modes (see **`integration/authorization.md`**):

| Mode | Pool / credential | Satisfies |
| --- | --- | --- |
| **Anonymous guest** | **`sessionId`** (no JWT) | Public catalog read, guest room join, chat read |
| **Signed-in fan (host-capable)** | **Fan** pool JWT | Room create/host, publisher paths, chat send/react, avatar |
| **Operator (staff)** | **Staff** pool JWT | **`/v1/admin/*`** only in this slice |

**Rules:**

1. **Separate pools:** Staff tokens **must not** satisfy fan-gated routes. Fan tokens **must not** satisfy **`/v1/admin/*`**.
2. **Dual sessions:** Fan and staff sessions **may coexist** in one browser with **separate token stores**; authorities do **not** merge (signing in as operator does not make someone room admin, and hosting as fan does not grant admin API access).
3. **Invite-only staff:** No self-service operator registration in MVP; group assignment is out-of-band.
4. **Group gate (MVP auth slice):** Valid staff JWT with **`admin`** **or** **`curator`** suffices for admin API probe routes; **no route-level split** between those groups until catalog/list handlers ship.
5. **Room domain unchanged:** **Room admin** remains **`JWT.sub === hostSub`** on the **fan** pool only. Staff auth does not add operator room takeover or bypass **lost admin / stale room** rules.

## Enumerations

- **`playbackExpectation`:** **`premium`** | **`free-ad-supported`** — **advisory**; not verified subscription state.
- **`roomMode`:** **`theater`** (default on room open) | **`videoChat`** — host-authoritative layout policy; one current value per room; fan-out to all connected participants and late joiners via durable room document + realtime sync.

## Invariants

1. **Lawful playback:** app never hosts MST episode files as a communal CDN; the **admin** uses **official embeds** (or future lawful backends), and guests receive **browser-mediated realtime media** derived from that viewing surface—not a separate licensed file library operated by RiffSync.
2. **Admin control:** guests cannot assume **publisher** role (host tab-capture **or** participant camera/mic) or change **authoritative** room metadata (except leave room / chat per policy). Only **`JWT.sub === hostSub`** may change **`roomMode`**, **`avDisabled`**, tab-capture, and durable playback metadata. Signed-in non-host fans may publish **participant A/V only**.
3. **Participant A/V eligibility:** only **signed-in fans** with active room presence may publish participant camera/microphone. Anonymous guests remain **subscribe-only** for participant A/V.
4. **Room mode vs kill switch:** while **`avDisabled`** is true, the room behaves as **Theater-equivalent movie + text chat** (pre-initiative participant A/V behavior); **Video Chat** selection is **unavailable or inert** until A/V is re-enabled. Server enforces kill switch: deny new participant producer grants, tear down active participant producers, broadcast authoritative disabled state.
5. **Theater layout:** shared **host movie stream** (tab-capture or embed-derived WebRTC) stays **primary** in the stage. A **vertical participant strip** immediately right of the video lists **video-on** participants only. **Microphone-only** participants are **audible** alongside movie audio but **not shown** in the strip.
6. **Video Chat layout:** the movie player region is **replaced** by a **grid of video-on participants** only. **Microphone-only** participants are **audible** but **not shown** in the grid (identity via People tab and chat). Entering **Video Chat** **fully stops** active host tab-capture (not suspend); returning to **Theater** requires the room admin to start **Share Source Tab** again.
7. **Reconnect privacy:** after refresh or disconnect, each signed-in fan’s camera and microphone **default off**; the fan must manually re-enable.
8. **Catalog title:** never replaced by TMDB **`title`** / **`original_title`**.
9. **Public catalog read** does not require authentication.

## Decisions (answered)

| Question | Decision |
| --- | --- |
| Vote-to-skip ads? | **Out of scope** — no server-side ad manipulation. |
| Multiple simultaneous episodes in one room / split-screen? | **Out of scope** MVP — **one stream / one current episode** at a time; **switching** that episode **in-session** **is** in scope for the room admin. |
| Guest promotion / admin reclaim token? | **Out of scope** MVP — admin is **`JWT.sub === hostSub`**; **lost admin** = timeout + ended room (**`error_state.md`**). |
| GIF provider? | **Giphy** — server search, Giphy CDN renditions in chat; no RiffSync-hosted GIF uploads. |
| Anonymous reactions? | **No** — reactions require fan JWT (same gate as send). |
| Avatar visibility? | **Public HTTPS** URLs so anonymous guests can render avatars in chat. |
| Staff vs room admin? | **Separate** — operator identity does not grant room admin; room admin remains fan **`JWT.sub === hostSub`**. |
| Operator onboarding (MVP)? | **Invite-only** — manual Cognito console invite and group assignment acceptable; no in-app “request access” flow. |
| `admin` vs `curator` on routes? | **Deferred** until catalog/list handlers — auth slice treats either group as authorized for staff API probe. |
| Operator moderation of rooms? | **Out of scope** for auth slice; when it ships, remains a **staff** capability separate from **room admin** capture authority. |
| Who may publish participant camera/mic? | **Signed-in fans only** — anonymous guests subscribe-only for participant A/V. |
| Theater mic audio while movie plays? | **Yes** — participant microphones audible alongside host movie stream when **`avDisabled`** is false. |
| Room mode durability? | **Durable** on room document — host **`PATCH`**; snapshot/join returns current mode; survives refresh and late join. |
| AV kill switch durability? | **Durable** on room document — late joiners and refresh inherit disabled until host re-enables. |
| AV kill switch enforcement? | **Server-enforced** — deny participant producer tokens, tear down active participant producers, broadcast **`avDisabled`**. |
| Video Chat tab-capture transition? | **Fully stop** capture on Video Chat entry; Theater return requires **Share Source Tab** again (no warm-resume). |
| Mic-only in Theater strip / Video Chat grid? | **Excluded** from visual surfaces; audio still heard. |
| Host in participant strip/grid? | **Yes** when host participant camera is on (same as other signed-in fans). |
| Reconnect participant A/V state? | **Default off** — manual re-enable after refresh/disconnect. |
| Participant AV recording / per-participant host mute / participant screen-share? | **Out of scope** for this slice (room-wide kill switch only). |

## Open implementation decisions

- **Room document field names:** exact attribute keys for **`roomMode`** and **`avDisabled`** on the room item (data/integration own persistence shape; business rule is durable host-admin fields on snapshot/join).
- **Participant tile identity:** map strip/grid tiles to **`sessionId`** vs **`sub`** when one fan has multiple tabs; dedupe rules for concurrent publishes from the same fan.
- **Theater audio mixing:** client-side gain/ducking when movie audio and multiple participant mics are active; behavior when kill switch is off but host tab-capture is not active.
- **Mode transition edge cases:** UX when switching to **Video Chat** with no video-on participants; when switching to **Theater** before host has ever started tab-capture.

- Domain services colocated with Lambda packages when implemented.
