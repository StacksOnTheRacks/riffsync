# Domain model

Business concepts and rules (language-agnostic). UI maps here via **`docs/architecture.frontend.md`**.

## Core entities

- **Episode (catalog row):** a stable **`id`** and **`experimentNumber`**, MST-flavored **`title`/`era`**, YouTube linkage, enrichment from TMDB and optional YouTube thumb URL.
- **Room:** shared viewing session on **`/room/:id`** with a **mutable current catalog episode** (**`catalogEpisodeId`** / **`videoId`** on the room document — seeded when the **signed-in** host creates the room, then changeable via **in-room picker**); the host (**room admin**) renders **embedded YouTube** for that selection and may **publish** a captured **`MediaStream`** to guests over **WebRTC**; guests consume that stream—**not** parallel iframe timelines kept in sync server-side. The room also carries **host-authoritative layout policy**: **`roomMode`** (**Theater** default | **Video Chat**) and **`avDisabled`** (room-wide participant A/V kill switch), both **durable** on the room document and returned on snapshot/join.
- **Participant A/V (camera / microphone):** optional **signed-in fan** publish of **`getUserMedia`** streams over the same SFU path as host capture; **default off** until the fan explicitly enables each control. **Anonymous guests** may **subscribe** to participant A/V when **`avDisabled`** is false but **must not publish** participant camera or microphone. Participant A/V is **parallel** to host tab-capture movie broadcast—not a replacement for embed/capture lawful playback.
- **Participant:** **`sessionId`** + display name (**anonymous**) or **`sub`** (**signed-in optional**) with optional **`avatarUrl`** (public HTTPS, one image per **`sub`**).
- **Presence (online vs active):** every open room WebSocket connection holds a **RoomPresence** roster row. **Online** means the connection is live on the roster (connected participant). **Active** is a derived engagement signal: the participant had at least one **qualifying control-plane action** within the **active idle window** (**2 minutes**). Qualifying actions (union): **typing start**, **chat send**, **GIF post**, **reaction toggle**, and **qualifying ping** within the window. **Typing start** contributes to **active** (not display-only). Idle viewers who keep heartbeating remain **active** while pings continue inside the window. **`lastActiveAt`** (epoch seconds) is **durable on RoomPresence**, updated on each qualifying route; **`presence_request`** and roster fan-out **rehydrate active** for late joiners and refresh after reconnect. Clients derive **`active`** as **`now - lastActiveAt < 120s`** (or the server precomputes a boolean at broadcast time — tier TW in Phase D).
- **Room join/leave lines:** ephemeral **system chat lines** on the room WebSocket when a **signed-in fan** joins or leaves. **Anonymous guests** connect and disconnect **silently** (no system line). Lines are **not persisted** in **RoomChat** and do not appear in scrollback replay on **`presence_request`**.
- **Speaking indicator:** client-side affordance when a participant's microphone energy crosses a threshold while their mic producer is unmuted. **Video-on** participants show speaking state on **Theater strip** and **Video Chat grid** tiles. **Mic-only** participants show speaking state on **People** tab roster rows **only** (no new stage chrome for audible-only participants).
- **Chat message (bounded retention):** room-scoped broadcast with **`messageId`**, kind **`text`** | **`gif`**, sender identity, timestamp; persisted in **RoomChat** for capped replay on join.
- **Chat reaction (bounded retention):** emoji on a **`messageId`**; toggle per signed-in sender; active reaction rows persisted in **RoomChat** and replayed as aggregated chips in **`chat_history`**.
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
8. **Single SFU signaling session per tab:** one SFU signaling WebSocket per browser tab with **mandatory per-class send transport isolation**, **per-kind unpublish** for partial teardown, and an explicit **prohibition of session-level `close()`** for class-scoped failures. Reliability is met by operational isolation within one session (one video-relay reconnect surface, lower ICE/TURN friction) — not a second signaling socket that would duplicate reconnect UX and connection setup cost.
9. **Server-side theater audio mix:** **deferred** to a follow-on initiative. Client Web Audio equal-gain mix remains normative until then.

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
- **`roomMode`:** **`theater`** (default on room open) | **`videoChat`** — host-authoritative layout policy; one current value per room; fan-out to all connected participants and late joiners via durable room document + realtime sync. While **`avDisabled`** is false, **Video Chat** remains selectable in the host control bar with an explicit **Beta** / **Experimental** label (A/V maturity disclaimer — not a separate product mode).

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
| Participant AV publish gate vs chat WS? | Client gate uses **`fanToken`** + **`!avDisabled`** only (**#148**); chat WS flap does not disable toggles or clear publish intent when SFU is healthy. |
| SFU reconnect vs publish intent? | Recoverable signaling blip **preserves** camera/mic intent; **`syncPublish`** on re-**`attachSession`** — not **`resetOnReconnect`** full teardown (**#148**). |
| Mic-only stage visibility? | **Keep off** strip/grid; harden tile lifecycle only (prompt detach on video producer close); no supplementary audible-only chrome this milestone. |
| Chat vs video-relay status UX? | **Separate** simultaneous status surfaces (e.g. chat reconnecting vs video relay reconnecting). |
| Server-side theater audio mixing? | **Deferred** — client-side equal-gain Web Audio mix remains default; document fragility and mitigations in contracts. |
| CI conformance harness? | **PR-blocking** when web or SFU service paths change; runs against **isolated** ephemeral SFU + TURN; **no** prod footprint touch. |
| Chat send while SFU degraded? | **Orthogonal** — room WS outbound chat (text, GIF, react) succeeds when chat plane is **`open`**; SFU signaling outage does **not** block send or set **`CHAT_SEND_DROPPED`** (**#149**). |

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

## Decisions (`share_state` behavior matrix — #146)

| Role | **`roomMode`** | **`state`** | **`host_screen`** SFU action | **`participant_av`** | Theater guest playback |
| --- | --- | --- | --- | --- | --- |
| **Host** | **`theater`** | **`stopped`** | **`unpublishHostScreen`** locally; emit **`share_state: stopped`** | **Preserve** producers/consumers | N/A (publisher) |
| **Host** | **`theater`** | **`started`** | Publish tab-capture stream when live; emit **`share_state: started`** | **Preserve** | N/A |
| **Host** | **`videoChat`** | **`stopped`** | **`unpublishHostScreen`** if any; no guest host-screen attach | **Preserve** | N/A |
| **Host** | **`videoChat`** | **`started`** | **No** **`host_screen`** attach (mode rule) | **Preserve** | N/A |
| **Guest** | **`theater`** | **`stopped`** | **`detachConsumerClass('host_screen')`** only — **no** SFU session **`close()`** | **Preserve** tiles/consumers/mic mix | Clear guest remote stream; FSM **`idle`**; honest not-sharing placeholder |
| **Guest** | **`theater`** | **`started`** | **No forced reconnect** — attach/resume via inbound SFU **`newProducer`** when host publishes | **Preserve** | FSM **`verifying_media`** until live video track; then **`running`** |
| **Guest** | **`videoChat`** | **`stopped`** | Detach stray **`host_screen`** consumers if present | **Preserve** | Guest remote cleared; host-screen chrome idle |
| **Guest** | **`videoChat`** | **`started`** | **Idle** — do not attach **`host_screen`** per mode contract | **Preserve** | No host-screen playback region |

**Prohibited on any `share_state` handler:** full **`SfuMediaSession.disconnect()`**, **`handleAvDisabledKillSwitch()`**, **`detachConsumerClass('participant_av')`**, or **`participantAv.teardownPublishing()`** unless a separate media policy applies (**`avDisabled`**, room leave).

**Wiring:** **`ChatSession`** fan-out → **`SfuMediaSession.handleShareStateStopped(isPublisher)`** on **`stopped`** only; **`TheaterPlayback.setGuestRemote(null)`** via **`onRemoteStream`** chain. **`started`** does not call a symmetric detach — consumer attach follows SFU signaling.

### `share_state: stopped` QA matrix (#146)

| Scenario | SFU session | `participant_av` tile | Participant mic | Chat WS |
| --- | --- | --- | --- | --- |
| Guest in Theater; host stops share | **Open** | **Persists** (if camera on) | **Audible** | **Unchanged** |
| Guest mic-only; host stops share | **Open** | No tile (unchanged) | **Audible** | **Unchanged** |
| Guest in Video Chat; host stops share | **Open** | Grid tiles **persist** | **Audible** | **Unchanged** |
| Host stops share while publishing participant mic | **Open** | Host tile **persists** if camera on | **Audible** | **Unchanged** |

## Decisions (M19 tile lifecycle — #152)

| Topic | Decision |
| --- | --- |
| **M19 ship gate** | Parent **#152** tracks M19 milestone exit for mic-only strip/grid rule preservation + tile attach/detach hardening only — **no** new mic-only stage chrome. |
| **Implementation parent** | Executable work ships under peer parent **#142** and sub-issues **#188–#190** on shared branch **`feature/issue-142`**. **#152** does not duplicate sub-issues (single GitHub sub-issue parent). |
| **Mic-only visibility** | Unchanged — off strip, grid, and narrow row; audible via theater mix or Video Chat audio path; identity via **People** tab and chat. |

### Camera-off tile removal QA matrix (#152 / #142)

| Scenario | Theater strip | Video Chat grid | Narrow row | Expected |
| --- | --- | --- | --- | --- |
| Remote camera off, mic on | Tile removed | Tile removed | Tile removed | No frozen frame; mic audible; no tile |
| Remote camera off, mic off | Tile removed | Tile removed | Tile removed | No tile; no audio |
| Local **You** camera off | **You** tile removed | **You** tile removed | **You** tile removed | Preview cleared |
| Roster member, no video consumer | No tile | No tile | No tile | Mic-only unchanged (off strip/grid) |

## Decisions (answered — presence and AV maturity)

| Question | Decision |
| --- | --- |
| Active signal set? | **Union** — typing start, chat send, GIF post, reaction toggle, and qualifying ping within the active window all mark **active**. |
| Active idle window? | **2 minutes** after last qualifying signal. |
| Active on reconnect? | **Yes** — persist **`lastActiveAt`** on **RoomPresence** so **`presence_request`** and roster fan-out rehydrate **active** for late joiners and refresh. |
| Typing vs active badge? | **Typing start** contributes to **active** (not display-only). |
| Ping within window? | **Counts toward active** — idle viewers watching without chatting remain **active** while heartbeats continue. |
| Join/leave system chat lines? | **Signed-in fans only** — guests connect silently; named signed-in fans get ephemeral join/leave lines on room WebSocket (**not** persisted in **RoomChat**). |
| Speaking indicator scope? | **Video tiles plus People tab** — speaking on Theater strip and Video Chat grid when video is on; **mic-only** speaking state on **People** roster rows only. |
| Video Chat mode while A/V matures? | **Keep** in host control bar with explicit **Beta** / **Experimental** label when **`avDisabled`** is false. |
| SFU decoupling depth? | **Single SFU signaling WebSocket per tab** with mandatory per-class send transport isolation, per-kind unpublish, and prohibition of session-level **`close()`** for class-scoped failures. |
| Server-side theater audio mix? | **Later phase** — decoupling, presence, typing, and speaking ship first; client Web Audio equal-gain mix remains normative. |

## Open implementation decisions

- **Session state machines:** formal substates and transitions for **ChatSession**, **SfuMediaSession**, and **TheaterPlayback** (connected / reconnecting / degraded / torn-down) and allowed cross-session side effects — **#140** (extraction #138 ships module files with minimal lifecycle flags only).
- **Mode transition empty-state UX:** copy and layout when switching to **Video Chat** with zero video-on participants, or **Theater** before host has started tab-capture (**`interface/presentation.md`**).
- **`active` boolean at broadcast:** server precomputes **`active`** on **`presence`** fan-out vs client derives from **`lastActiveAt`** — tier TW in Phase D.
- **Speaking threshold calibration:** mic energy / VAD sensitivity and debounce for tile vs People row affordance — tier TW.
- **Typing indicator TTL:** how long **typing** ellipsis persists after last **`typing_start`** without **`typing_stop`** — tier TW.

## Decisions (theater mic mix on host_screen close — #145)

| Question | Decision |
| --- | --- |
| Mix graph scope on **`host_screen`** close? | Remove only **`hostScreenConsumers`** entries in **`theaterAudioMix`**; **`participantConsumers`** nodes stay connected at **1.0** gain until their producer closes, **`avDisabled`**, or room leave. |
| Guest trigger paths? | **`share_state: stopped`** → **`SfuMediaSession.handleShareStateStopped`** → **`detachConsumerClass('host_screen')`**; SFU **`producerClosed`** / consumer **`detach`** for **`host_screen`** audio routes the same mix detach via **`TheaterPlayback`**. |
| Host trigger paths? | **`unpublishHostScreen`** / tab-capture stop closes **`host_screen`** producers only; **must not** tear down **`participant_av`** producers or clear participant mix nodes. |
| **`AudioContext`** lifecycle? | **Stay open** while any participant mic node remains attached; **do not** call **`mix.dispose()`** or **`teardownMix()`** on host-screen stop alone. |
| Video element fallback? | After last **`host_screen`** consumer detaches, **`syncHostElementSource()`** may attach movie audio from the guest **`<video>`** element when bound; participant mic nodes remain parallel sources. |
| Forbidden side effects? | **`clearParticipantConsumers()`**, **`detachConsumerClass('participant_av')`**, full SFU session **`close()`**, **`handleAvDisabledKillSwitch()`** from share-stop handlers. |

### Partial teardown QA matrix — theater mic mix on host_screen close (#145)

| Scenario | Guest participant mic | Host participant mic (if publishing) | Expected |
| --- | --- | --- | --- |
| Guest hears fan mic + host movie; host stops share (`share_state: stopped`) | **Audible** | N/A (guest path) | Host movie/video gone; mic continues |
| Guest hears two fan mics; host stops share | **Both audible** | N/A | Same |
| Fan A camera off mic on + host movie; host stops share | **Audible (mic-only)** | N/A | No tile; mic continues |
| Host publishing participant mic + tab capture; host stops capture | N/A | **Audible** | Host screen gone; host mic continues |
| `avDisabled` after share stop | **Inaudible** (kill switch) | **Inaudible** | Out of #145 scope — intentional |

## Decisions (participant AV runtime — #104)

| Question | Decision |
| --- | --- |
| Participant tile identity? | Strip/grid tiles keyed by **`sessionId`** + **`producerClass`** from SFU metadata. One fan with two tabs may appear twice when both publish camera — no **`fanSub`** dedupe in MVP. |
| Theater audio mixing? | **Equal-gain** client-side mix (Web Audio **1.0** per source). Movie audio and participant mics play in parallel; **no** automatic ducking in MVP. When host tab-capture is inactive, participant mic audio still mixes normally. |
| Kill switch client reaction? | Immediate local teardown on authoritative **`avDisabled`** WebSocket event — stop **`getUserMedia`**, close producers, tear down participant consumers. |

- Domain services colocated with Lambda packages when implemented.
