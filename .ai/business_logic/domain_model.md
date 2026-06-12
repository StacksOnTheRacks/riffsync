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

## Realtime session jurisdictions (watch-party client)

Three orthogonal client compartments own distinct realtime concerns. Each has its own connection lifecycle, failure domain, and recovery policy. A **thin room shell** coordinates them but does **not** merge their internal state machines.

| Compartment | Owns | Does not own |
| --- | --- | --- |
| **ChatSession** | Room WebSocket for ephemeral chat, reactions, presence, and host-authoritative control events (`share_state`, `roomMode`, `avDisabled` fan-out). Chat send failure and chat reconnect. | SFU signaling, producer registry, ICE/TURN, theater tile layout, Web Audio mix. |
| **SfuMediaSession** | SFU signaling WebSocket; mediasoup join; publish/unpublish for **`host_screen`** and **`participant_av`**; consumer attach/detach per producer class; SFU token refresh and reconnect. | Chat message delivery, scrollback, compose validation. |
| **TheaterPlayback** | Host movie presentation (embed or tab-capture-derived stream); **Theater** strip and **Video Chat** grid of **video-on** participants; equal-gain client-side Web Audio mix of movie audio and participant microphones. | Chat transport; SFU token mint; durable room document writes. |

**Narrow public SDK (behavioral):** Outward room realtime operations are **`RoomRealtimeSdk.join`**, **`publishAv`**, **`subscribe`**, **`getDiagnostics`**, and **`teardown`** (**`apps/web/src/room/sessions/RoomRealtimeSdk.ts`**). The room shell delegates to compartments via the SDK only; cross-compartment side effects follow **Decoupled lifecycles** below, not implicit handler coupling.

## Decoupled lifecycles

1. **Orthogonal reconnect:** When one plane fails, the healthy plane keeps running. Chat WebSocket reconnect does not tear down SFU signaling unless room leave, **`avDisabled`**, or explicit media policy requires SFU teardown. SFU WebSocket reconnect does not close the room chat socket unless protocol policy requires full room rejoin.
2. **`share_state: stopped`:** Guests detach **`host_screen`** consumers only. SFU signaling session, **`participant_av`** publish/subscribe, theater mic mix, and participant tiles (for video-on) **persist**. No full SFU session close for guests on this event.
3. **`share_state: started`:** Guests attach or resume **`host_screen`** consumption per current **`roomMode`** (**Theater** primary stage; **Video Chat** keeps host screen consumers detached per mode rules).
4. **Partial producer teardown:** Disabling **camera** while **microphone** stays on closes the **video** producer, broadcasts **`producerClosed`** for video, and removes the participant from strip/grid **promptly**. Remote participants must **not** retain a frozen last-frame tile after video producer close. **Audio** producer continues (or is republished) without full SFU session rebuild when publish is already established.
5. **Mic mute vs camera off:** Microphone mute uses **pause/resume** on the audio producer where supported. Camera off **closes** the video producer and detaches video consumers; the behaviors are not interchangeable.
6. **SFU-only media path:** All environments use SFU topology (disposable SFU + TURN in local dev and CI). Mesh WebRTC is **not** a supported media fallback.
7. **Publish idempotency:** Camera/mic toggles reuse the existing SFU send transport when publish is already supported; no full session rebuild per toggle that would drop unrelated producers or consumers.

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
5. **Theater layout:** shared **host movie stream** (tab-capture or embed-derived WebRTC) stays **primary** in the stage. A **vertical participant strip** immediately right of the video lists **video-on** participants only. **Microphone-only** participants are **audible** alongside movie audio but **not shown** in the strip. When a participant turns **camera off**, their strip tile **removes immediately** for all remotes; **mic-only** audio continues without a visual tile.
6. **Video Chat layout:** the movie player region is **replaced** by a **grid of video-on participants** only. **Microphone-only** participants are **audible** but **not shown** in the grid (identity via People tab and chat). Camera-off removes grid tiles promptly; no frozen last-frame tiles. Entering **Video Chat** **fully stops** active host tab-capture (not suspend); returning to **Theater** requires the room admin to start **Share Source Tab** again.
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

## Decisions (answered — #101)

| Question | Decision |
| --- | --- |
| Room document field names? | **`roomMode`** and **`avDisabled`** on the **Rooms** Dynamo item and HTTP snapshot — camelCase, durable host-admin fields returned on **`GET /v1/rooms/{roomId}`** and host **`PATCH`**. |

## Decisions (answered — realtime hardening)

| Question | Decision |
| --- | --- |
| Structural module split in scope? | **Yes** — extract **ChatSession**, **SfuMediaSession**, **TheaterPlayback**; thin room shell; narrow SDK (**`join`**, **`publishAv`**, **`subscribe`**, **`getDiagnostics`**). |
| SFU in all environments? | **Mandatory** — remove mesh WebRTC paths; local dev and CI use disposable SFU + TURN matching prod topology. |
| `share_state: stopped` guest teardown? | Detach **`host_screen`** consumers only; **no** full SFU session teardown; participant A/V and theater mic mix **persist**. |
| Drawer-independent reconnect? | Healthy plane keeps running while the failed plane reconnects alone; chat and SFU lifecycles are **orthogonal**. |
| Mic-only stage visibility? | **Keep off** strip/grid; harden tile lifecycle only (prompt detach on video producer close); no supplementary audible-only chrome this milestone. |
| Chat vs video-relay status UX? | **Separate** simultaneous status surfaces (e.g. chat reconnecting vs video relay reconnecting). |
| Server-side theater audio mixing? | **Deferred** — client-side equal-gain Web Audio mix remains default; document fragility and mitigations in contracts. |
| CI conformance harness? | **PR-blocking** when web or SFU service paths change; runs against **isolated** ephemeral SFU + TURN; **no** prod footprint touch. |

## Decisions (partial teardown publish path — #143)

| Question | Decision |
| --- | --- |
| Camera off, mic on — publisher path? | **`participantAvSession.disableCamera`** closes the **video** producer only via **`unpublishProducerKind('participant_av', 'video')`** (or equivalent). **Must not** call **`unpublishProducerClass('participant_av')`** or **`publishStream`** paths that class-wide unpublish first. |
| Mic off, camera on — publisher path? | **`disableMic`** closes the **audio** producer only; video producer and remote tile remain. |
| Mic mute, camera on? | **`toggleMicMute`** uses **`pauseProducerKind` / `resumeProducerKind`** on audio only — already implemented; out of #143 scope except regression guard. |
| Both axes off? | Class-wide **`unpublishProducerClass('participant_av')`**, stop local **`getUserMedia`**, clear publish intent — unchanged (kill switch, room leave, **`syncPublish`** idle). |
| **`syncPublish` after partial disable? | **Kind-aware incremental sync:** produce tracks for enabled axes only; unpublish kinds no longer desired; **never** class-wide unpublish when one axis stays enabled. |
| Dependency on **#144**? | **`mediasoupSharing`** exposes **`unpublishProducerKind`** and incremental produce; **#143** wires **`participantAvSession`** only. Same **`feature/issue-143`** branch may carry both. |

## Decisions (mediasoupSharing per-kind API — #144)

| Question | Decision |
| --- | --- |
| Root defect? | **`publishStream`** historically called **`unpublishProducerClass`** before every produce, dropping the surviving kind during partial teardown. |
| **`unpublishProducerKind` contract?** | Close one **`(producerClass, kind)`** producer; SFU **`producerClosed`** fan-out per existing server registry. |
| **`publishStream` with subset stream? | Producing an audio-only **`MediaStream`** for **`participant_av`** must **not** close an existing video producer (and vice versa). |
| Who calls per-kind unpublish? | **`participantAvSession`** (#143) for toggle-off paths; **`mediasoupSharing`** only exposes the handle API. |
| Branch pairing with **#143**? | **`feature/issue-143`** may include both; **#144** sub-issues are independently testable before **#191–#193** wire-up. |

## Open implementation decisions

- **Session state machines:** formal substates and transitions for **ChatSession**, **SfuMediaSession**, and **TheaterPlayback** (connected / reconnecting / degraded / torn-down) and allowed cross-session side effects — **#140** (extraction #138 ships module files with minimal lifecycle flags only).
- **`share_state` behavior matrix:** per-role (**host** / **guest**) and **`roomMode`** detail for **`started`** vs **`stopped`** — which consumer classes attach, detach, or stay idle beyond the normative **`host_screen`-only** guest detach on **`stopped`** (**#146** / M18).
- **Partial teardown — remaining M17 peers:** concurrent **`newProducer`** / **`producerClosed`** consumer attach (**#142**); theater mic mix when **`host_screen`** closes (**#145**).

### Partial teardown QA matrix — camera-off tile removal (#142)

| Scenario | Theater strip | Video Chat grid | Narrow row | Expected |
| --- | --- | --- | --- | --- |
| Remote camera off, mic on | Tile removed | Tile removed | Tile removed | No frozen frame; mic audible; no tile |
| Remote camera off, mic off | Tile removed | Tile removed | Tile removed | No tile; no audio |
| Local **You** camera off | **You** tile removed | **You** tile removed | **You** tile removed | Preview cleared |
| Roster member, no video consumer | No tile | No tile | No tile | Mic-only unchanged (off strip/grid) |
- **Mode transition empty-state UX:** copy and layout when switching to **Video Chat** with zero video-on participants, or **Theater** before host has started tab-capture (**`interface/presentation.md`**).

## Decisions (participant AV runtime — #104)

| Question | Decision |
| --- | --- |
| Participant tile identity? | Strip/grid tiles keyed by **`sessionId`** + **`producerClass`** from SFU metadata. One fan with two tabs may appear twice when both publish camera — no **`fanSub`** dedupe in MVP. |
| Theater audio mixing? | **Equal-gain** client-side mix (Web Audio **1.0** per source). Movie audio and participant mics play in parallel; **no** automatic ducking in MVP. When host tab-capture is inactive, participant mic audio still mixes normally. |
| Kill switch client reaction? | Immediate local teardown on authoritative **`avDisabled`** WebSocket event — stop **`getUserMedia`**, close producers, tear down participant consumers. |

- Domain services colocated with Lambda packages when implemented.
