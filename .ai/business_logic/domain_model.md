# Domain model

Business concepts and rules (language-agnostic). UI maps here via **`docs/architecture.frontend.md`**.

## Core entities

- **Episode (catalog row):** a stable **`id`** and **`experimentNumber`**, MST-flavored **`title`/`catalog`**, YouTube linkage, enrichment from TMDB and optional YouTube thumb URL.
- **Room:** shared viewing session on **`/room/:id`** with a **mutable current catalog episode** (**`catalogEpisodeId`** / **`videoId`** on the room document — seeded when the **signed-in** host creates the room, then changeable via **in-room picker**); the host (**room admin**) renders **embedded YouTube** for that selection and may **publish** a captured **`MediaStream`** to guests over **WebRTC**; guests consume that stream—**not** parallel iframe timelines kept in sync server-side. The room also carries **host-authoritative layout policy**: **`roomMode`** (**Theater** default | **Video Chat**) and **`avDisabled`** (room-wide participant A/V kill switch), both **durable** on the room document and returned on snapshot/join.
- **Local Cast session:** optional per-viewer Chromecast viewing state for Cast-capable senders. It is **session-only** client state, entered only from the normal room view, and never persisted on the room document, replayed on join, or fanned out as room state. A local Cast session launches the custom RiffSync receiver presentation, reusing the expanded-view stage-primary plus chat-overlay composition while the sender remains joined as the same participant. Native media-only Cast or YouTube-only Cast is not the current RiffSync Cast maturity behavior.
- **Participant A/V (camera / microphone):** optional **signed-in fan** publish of **`getUserMedia`** streams over the same SFU path as host capture; **default off** until the fan explicitly enables each control. **Anonymous guests** may **subscribe** to participant A/V when **`avDisabled`** is false but **must not publish** participant camera or microphone. Participant A/V is **parallel** to host tab-capture movie broadcast—not a replacement for embed/capture lawful playback.
- **Participant:** **`sessionId`** + display name (**anonymous**) or **`sub`** (**signed-in optional**) with optional **`avatarUrl`** (public HTTPS, one image per **`sub`**).
- **Presence (online vs active):** every open room WebSocket connection holds a **RoomPresence** roster row. **Online** means the connection is live on the roster (connected participant). **Active** is a derived engagement signal: the participant had at least one **qualifying control-plane action** within the **active idle window** (**2 minutes**). Qualifying actions (union): **typing start**, **chat send**, **GIF post**, **reaction toggle**, and **qualifying ping** within the window. **Typing start** contributes to **active** (not display-only). Idle viewers who keep heartbeating remain **active** while pings continue inside the window. **`lastActiveAt`** (epoch seconds) is **durable on RoomPresence**, updated on each qualifying route; **`presence_request`** and roster fan-out **rehydrate active** for late joiners and refresh after reconnect. Clients derive **`active`** as **`now - lastActiveAt < 120s`** (or the server precomputes a boolean at broadcast time — tier TW in Phase D).
- **Room join/leave lines:** ephemeral **system chat lines** on the room WebSocket when a **signed-in fan** joins or leaves. **Anonymous guests** connect and disconnect **silently** (no system line). Lines are **not persisted** in **RoomChat** and do not appear in scrollback replay on **`presence_request`**.
- **Speaking indicator:** client-side affordance when a participant's microphone energy crosses a threshold while their mic producer is unmuted. **Video-on** participants show speaking state on **Theater strip** and **Video Chat grid** tiles. **Mic-only** participants show speaking state on **People** tab roster rows **only** (no new stage chrome for audible-only participants).
- **Chat message (bounded retention):** room-scoped broadcast with **`messageId`**, kind **`text`** | **`gif`**, sender identity, timestamp; persisted in **RoomChat** for capped replay on join.
- **Chat reaction (bounded retention):** emoji on a **`messageId`**; toggle per signed-in sender; active reaction rows persisted in **RoomChat** and replayed as aggregated chips in **`chat_history`**.
- **FriendshipRequest (pending):** invite from one signed-in fan Cognito **`sub`** to another. Exists while the recipient has not yet accepted or declined. A durable **Friendship** edge does **not** exist until accept. Decline ends that request without creating an edge. Anonymous guests cannot send, receive, accept, or decline friendship requests.
- **Friendship:** durable undirected social edge between exactly two signed-in fan Cognito **`sub`s**. Forms only when a **FriendshipRequest** is accepted. Remains until **remove friend** or normal account closure. Orthogonal to ephemeral **RoomPresence** / room **People** roster. No time-based soft expiry of the edge.
- **DmThread:** private 1:1 conversation between an unordered pair of fan Cognito **`sub`s**. Not room-partitioned and not stored in **RoomChat**. Opening or sending requires an **active Friendship** between those two principals. Multi-party / group threads are out of scope.
- **DirectMessage:** private message in a **DmThread** with sender identity and timestamp. Retention class is **account-lifetime durable** until explicit delete or account closure. Distinct from TTL-bounded **RoomChat** public room history.
- **DmUnread:** per-recipient outcome that newer **DirectMessage** content from a friend has not yet been **viewed**. Viewing those messages clears unread for them. Server-authoritative so the outcome survives refresh and device change.
- **Friends online (room-derived):** on a friends-list row, **online** means the friend currently holds **RoomPresence** in **any** RiffSync room. It is **not** platform-wide browsing presence, **not** last-seen, and **not** same-room-only relative to the viewer. Distinct from room **People** roster **online** / **active** badges, which remain room-scoped.
- **Room admin:** signed-in participant whose **fan-pool Cognito `sub`** equals the room’s **`hostSub`** — **exclusive authority** to drive the **embedded player**, **start/stop broadcast capture**, select **`roomMode`**, operate the room-wide **`avDisabled`** kill switch, and mutate durable room playback metadata. **Anonymous users cannot host.** **Guest promotion** and token-based **admin reclaim** beyond normal Cognito re-login for the same user are **out of scope** for MVP. When the room admin enables a **participant camera**, they appear in Theater strip and Video Chat grid **like other signed-in fans** (not as a separate host-only surface).
- **Operator (staff):** invite-only principal in the **staff** Cognito pool, provisioned **out-of-band** (console, CLI, or IaC). When authorized, carries **`cognito:groups`** including **`admin`** and/or **`curator`**. **Distinct** from **Participant** and **Room admin** — operator identity does **not** grant fan **`hostSub`** authority, room publisher role, participant chat identity, friendship management, or DM authority unless the same person also holds a separate **fan** session.
- **Public discoverable surface:** the subset of routes that represent durable, indexable fan-facing content for search engines and social sharing, distinct from ephemeral, authenticated, or receiver-only surfaces that must stay out of search.

  | Indexable | Not indexed (`noindex`) |
  | --- | --- |
  | **`/`**, **`/catalog`**, **`/catalog/mst3k`**, **`/catalog/community`**, **`/catalog/riff-material`**, **`/catalog/movie-night`**, **`/download`**, **`/watch/:catalogEpisodeId`**, **`/how-to-host-a-watchparty`**, **`/terms`**, **`/privacy`** | **`/room/:roomId`** (and **`/room/:roomId/experimental/:experimental`**), **`/lobby`**, **`/account`**, **`/admin/*`**, **`/cast/receiver`**, **`/privacy/data-removal`**, **`/auth/callback`**, **`/admin/auth/callback`** |

  Ephemeral, authenticated, and receiver-only routes carry no durable identity worth surfacing to crawlers — this mirrors the existing **Identity modes** boundary below, not a new access rule. **`/watch/:catalogEpisodeId`** is indexable only for episodes satisfying the existing lawful-playback YouTube-link filter (**Invariant 1**) — an episode without a live YouTube link has no lawful surface to summarize or link to and is excluded from indexing and the sitemap until a link exists.

  **Catalog browse IA:** Hub **`/catalog`** is the mixed (all-titles) catalog browse entry. Subcategory routes own filtered views: **MST3K**, **Community**, **Riff Material**, and **Movie Night**. **`/catalog/mst3k`** is a browse-IA aggregation over the existing host-catalog values **`joel`**, **`mike`**, **`jonah`**, and **`emily`** — not a new Episode field, enum value, or persisted grouping. **Riff Material** is the public label and route slug only; the persisted **`catalog`** value remains **`riff_material`**. Each episode retains a single discrete **`catalog`**, so a title appears in at most one subcategory grid. Per-subcategory visual customization is out of scope for this surface (shared shell only).

## Realtime session jurisdictions (watch-party client)

Three orthogonal client compartments own distinct realtime concerns. Each has its own connection lifecycle, failure domain, and recovery policy. A **thin room shell** coordinates them but does **not** merge their internal state machines.

| Compartment | Owns | Does not own |
| --- | --- | --- |
| **ChatSession** | Room WebSocket for ephemeral chat, reactions, presence, and host-authoritative control events (`share_state`, `roomMode`, `avDisabled` fan-out). Chat send failure and chat reconnect. | SFU signaling, producer registry, ICE/TURN, theater tile layout, Web Audio mix. **Friendship**, **DmThread**, and **DirectMessage** delivery (friends/DM are a separate social plane; room chat UX patterns may be reused without merging jurisdiction). |
| **SfuMediaSession** | SFU signaling WebSocket; mediasoup join; publish/unpublish for **`host_screen`** and **`participant_av`**; consumer attach/detach per producer class; SFU token refresh and reconnect. | Chat message delivery, scrollback, compose validation. Friends/DM. |
| **TheaterPlayback** | Host movie presentation (embed or tab-capture-derived stream); **Theater** strip and **Video Chat** grid of **video-on** participants; equal-gain client-side Web Audio mix of movie audio and participant microphones. | Chat transport; SFU token mint; durable room document writes. Friends/DM. |

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
| **Signed-in fan (host-capable)** | **Fan** pool JWT | Room create/host, publisher paths, chat send/react, avatar, friendship manage, 1:1 DM open/send |
| **Operator (staff)** | **Staff** pool JWT | **`/v1/admin/*`** only in this slice |

**Rules:**

1. **Separate pools:** Staff tokens **must not** satisfy fan-gated routes. Fan tokens **must not** satisfy **`/v1/admin/*`**.
2. **Dual sessions:** Fan and staff sessions **may coexist** in one browser with **separate token stores**; authorities do **not** merge (signing in as operator does not make someone room admin, and hosting as fan does not grant admin API access).
3. **Invite-only staff:** No self-service operator registration in MVP; group assignment is out-of-band.
4. **Group gate (MVP auth slice):** Valid staff JWT with **`admin`** **or** **`curator`** suffices for admin API probe routes; **no route-level split** between those groups until catalog/list handlers ship.
5. **Room domain unchanged:** **Room admin** remains **`JWT.sub === hostSub`** on the **fan** pool only. Staff auth does not add operator room takeover or bypass **lost admin / stale room** rules.
6. **Friends and DM gate:** Friendship and DM principals are fan Cognito **`sub`** only. Anonymous guests cannot manage friends or send DMs. Staff identity does not grant friendship or DM authority without a separate fan session. Staff moderation of DM bodies is out of scope.

## Enumerations

- **`playbackExpectation`:** **`premium`** | **`free-ad-supported`** — **advisory**; not verified subscription state.
- **`roomMode`:** **`theater`** (default on room open) | **`videoChat`** — host-authoritative layout policy; one current value per room; fan-out to all connected participants and late joiners via durable room document + realtime sync. While **`avDisabled`** is false, **Video Chat** remains selectable in the host control bar as a normal A/V room mode, not a **Beta** or **Experimental** mode.

## Invariants

1. **Lawful playback:** app never hosts MST episode files as a communal CDN; the **admin** uses **official embeds** (or future lawful backends), and guests receive **browser-mediated realtime media** derived from that viewing surface—not a separate licensed file library operated by RiffSync.
2. **Admin control:** guests cannot assume **publisher** role (host tab-capture **or** participant camera/mic) or change **authoritative** room metadata (except leave room / chat per policy). Only **`JWT.sub === hostSub`** may change **`roomMode`**, **`avDisabled`**, tab-capture, and durable playback metadata. Signed-in non-host fans may publish **participant A/V only**.
3. **Participant A/V eligibility:** only **signed-in fans** with active room presence may publish participant camera/microphone. Anonymous guests remain **subscribe-only** for participant A/V.
4. **Room mode vs kill switch:** while **`avDisabled`** is true, the room behaves as **Theater-equivalent movie + text chat** (pre-initiative participant A/V behavior); **Video Chat** selection is **unavailable or inert** until A/V is re-enabled. Server enforces kill switch: deny new participant producer grants, tear down active participant producers, broadcast authoritative disabled state.
5. **Theater layout:** shared **host movie stream** (tab-capture or embed-derived WebRTC) stays **primary** in the stage. A **vertical participant strip** immediately right of the video lists **video-on** participants only. **Microphone-only** participants are **audible** alongside movie audio but **not shown** in the strip. When a participant turns **camera off**, their strip tile **removes immediately** for all remotes; **mic-only** audio continues without a visual tile.
6. **Video Chat layout:** the movie player region is **replaced** by a **grid of video-on participants** only. **Microphone-only** participants are **audible** but **not shown** in the grid (identity via People tab and chat). Camera-off removes grid tiles promptly; no frozen last-frame tiles. Entering **Video Chat** **fully stops** active host tab-capture (not suspend); returning to **Theater** requires the room admin to start **Share Source Tab** again.
7. **Cast locality:** Chromecast is a viewer-local optional presentation. Cast start, stop, failure, unavailability, or receiver disconnect must not mutate **`roomMode`**, **`avDisabled`**, **`share_state`**, durable room playback fields, SFU permissions, host authority, participant roster authority, or any other participant's room experience.
8. **Reconnect privacy:** after refresh or disconnect, each signed-in fan’s camera and microphone **default off**; the fan must manually re-enable.
9. **Catalog title:** never replaced by TMDB **`title`** / **`original_title`**. This extends to public search and share metadata — page titles, meta descriptions, and Open Graph/Twitter tags for **`/watch/:catalogEpisodeId`** always source the catalog **`title`** field, never TMDB's **`title`** or **`original_title`**.
10. **Public catalog read** does not require authentication (hub **`/catalog`** and all catalog subcategory routes alike).
11. **Public discoverability boundary:** only the durable public surfaces listed under **Public discoverable surface** - including the catalog hub, its subcategory browse routes, and the app install instructions page - are indexable. Ephemeral per-instance state (**rooms**, **lobby**) and authenticated or receiver-only surfaces (**account**, **admin**, **Cast receiver**, **auth callbacks**) never carry indexable metadata or sitemap entries, regardless of the rendering or build mechanism that produces them.
12. **Friendship create path:** a durable **Friendship** forms only via **invite/accept**. One signed-in fan sends a **FriendshipRequest**; the recipient accepts or declines. Pending requests are part of the lifecycle. No durable edge exists before accept.
13. **DM eligibility:** opening a **DmThread** and sending a **DirectMessage** require an **active Friendship** between the two fan **`sub`s**. Stranger and guest DMs are out of scope.
14. **Remove friend is immediately mutual:** when either party removes the other, both lose the **Friendship** at once. The existing **DmThread** becomes closed/hidden for **both**: neither may compose nor access history. Re-friending creates a **new** **Friendship** edge; prior thread history remains inaccessible unless a later product decision restores it. Teardown verb is **remove friend** (no separate block product in this surface).
15. **Friends vs People:** the friends list is a durable social relationship store. It does **not** replace the room **People** roster. Both may coexist in a watch-party session (public room chat alongside private 1:1 DM).
16. **DM retention class:** **DirectMessage** history is account-lifetime durable until explicit delete or account closure, and must not reuse **RoomChat** TTL / capped-replay semantics.

## Friends and direct messaging

Signed-in fans maintain friendships and exchange private 1:1 messages as a social layer alongside public room chat.

### Friendship lifecycle

| Phase | Outcome |
| --- | --- |
| **Invite** | Requester (signed-in fan) creates a **FriendshipRequest** toward a recipient fan **`sub`**. Edge does not exist yet. |
| **Pending** | Recipient may **accept** or **decline**; requester may **cancel**. At most one open pending request per unordered fan pair (either direction). Same-direction re-invite while pending is idempotent (**200** with existing request). Opposite-direction invite while a pending exists returns **409** so the caller handles inbound first. **Accept** creates the edge and clears all pendings between the pair. |
| **Accept** | Durable **Friendship** edge exists between the two **`sub`s**. DM open/send becomes eligible. |
| **Decline** | Request ends without a **Friendship**. No DM eligibility from that request alone. |
| **Remove friend** | Immediately mutual: edge gone for both. Existing **DmThread** closed/hidden for both (no compose, no history access). |
| **Re-friend** | New invite/accept may create a new **Friendship**. Prior DM history stays inaccessible by default. |

### Friends online vs room People presence

| Signal | Scope | Meaning |
| --- | --- | --- |
| Room **People** **online** | Single room **RoomPresence** roster | Live connection on that room WebSocket |
| Room **People** **active** | Single room | Engagement within the 2-minute idle window |
| Friends-list **online** | Any RiffSync room | Friend currently has **RoomPresence** in at least one room |

Friends online is room-presence-derived and aggregate across rooms. It is not a separate SFU-plane signal and does not imply the friend is in the viewer's current room.

### DM thread access

- **Eligible:** active **Friendship** between the two fan **`sub`s**.
- **Ineligible after remove:** both parties lose compose and history access; thread is closed/hidden for both.
- **Retention:** messages remain in the account-lifetime durable class until explicit delete or account closure; access policy after unfriend is independent of physical retention (history may still exist in storage while remaining inaccessible to both parties).
- **Coexistence:** public **RoomChat** and private **DmThread** messaging may both be available during a watch party without leaving the room.

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
| Public catalog SEO indexing scope? | Catalog hub, catalog subcategory browse routes, app install instructions, episode landing, host-help, and legal pages are indexable; rooms, lobby, account, admin, Cast receiver, and auth callbacks stay **`noindex`** - mirrors the existing lawful-playback and identity-mode boundaries, not a new access rule. |
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
| Video Chat mode while A/V matures? | **Keep** in host control bar without **Beta** or **Experimental** labeling when **`avDisabled`** is false. |
| SFU decoupling depth? | **Single SFU signaling WebSocket per tab** with mandatory per-class send transport isolation, per-kind unpublish, and prohibition of session-level **`close()`** for class-scoped failures. |
| Server-side theater audio mix? | **Later phase** — decoupling, presence, typing, and speaking ship first; client Web Audio equal-gain mix remains normative. |

## Decisions (answered — M22 presence)

| Topic | Decision |
| --- | --- |
| **`active` at broadcast** | Server precomputes **`active`** on each **`presence`** member and includes **`lastActiveAt`** when set; clients use server **`active`** for People badges. |
| **Typing indicator TTL** | Client clears ellipsis **5s** after last inbound **`typing_start`** without **`typing_stop`**; server does not persist typing state. |

## Decisions (answered — M23 participant A/V reliability #242)

| Topic | Decision |
| --- | --- |
| **Per-class send transport isolation** | **`host_screen`** and **`participant_av`** each own a send transport on the same SFU signaling socket; class-scoped failure or partial unpublish **must not** session **`close()`** or tear down the sibling class. |
| **`host_screen` survival** | Participant camera/mic toggle, partial unpublish, or recoverable device errors **must not** stop host tab-capture or unpublish **`host_screen`** unless explicit media policy applies (**`room_mode`**, **`avDisabled`**, room leave). |
| **People cam/mic state** | Client derives per-**`sessionId`** cam on, mic on, mic muted (**audio `paused`**) from live SFU producer registry — not persisted on **RoomPresence**. |
| **Speaking VAD** | Client **`AnalyserNode`**: **`fftSize` 512**, normalized RMS **≥ 0.02** enter, **150ms** attack smoothing, **300ms** hang before clear; no speaking when audio producer **`paused`**. |
| **Mode transition empty-state** | **Video Chat** zero cameras: **`No cameras on yet. Mic-only participants are still audible.`** **Theater** before capture: host **Share Source Tab** prompt in stage chrome. After **3s** layout timeout: keep sparse copy — **do not** vary **Updating room layout…** by direction. |

## Decisions (answered - Chromecast)

| Question | Decision |
| --- | --- |
| Who does Cast affect? | **Only the viewer who starts it.** A room admin cannot Cast for everyone; if the admin starts Cast, it remains local to that admin sender and receiver. |
| Is Cast a room mode or durable field? | **No.** Cast is session-only client state. It does not write the room document, alter **`roomMode`**, change **`share_state`**, or fan out over room WebSocket. |
| Where can Cast start? | **Normal room view only** when sender support is available. Expanded view may provide the reusable presentation composition, but it is not a Cast entry point. |
| What does the sender show while casting? | After confirmed Cast start, the normal stage replaces the regular video surface with **`Now Casting`** and a stop affordance. Chat, presence, sidebar state, and room membership remain intact. |
| What does stop Cast do? | Stop returns the sender to normal in-page playback and the latest authoritative room snapshot/realtime state without clearing room session or chat state. |
| What does #274 own? | The persistent sender-local active Cast state after receiver render confirmation: perceivable **`Now Casting`** stage copy, a visible Stop Cast control, no receiver-device naming in app-authored copy, and no room-authority side effects. Full post-stop playback restoration remains the #276 slice. |
| Does active Cast emit diagnostics or telemetry? | **No aggregate telemetry or drawer diagnostics for #274.** Local controller state and test-only hooks may prove active/stop behavior, but Cast must not appear in **`RoomRealtimeSdk.getDiagnostics().drawers.*`**, room activity metrics, or receiver-identifying logs. |
| What does #277 own? | Guardrails and regression coverage that prove local Cast does not mutate **`roomMode`**, **`avDisabled`**, **`share_state`**, durable room playback fields, host authority, SFU permissions, participant roster authority, or any other participant's room experience. |
| What does #278 own? | Sender-local recovery when Cast is unavailable, start fails after support was shown, an active receiver disconnects or ends externally, receiver playback becomes blocked, or Stop Cast fails. Recovery keeps room participation, chat, SFU, and authoritative room state intact while restoring or keeping normal in-page playback visible whenever the sender is no longer actively casting. |
| What does #279 own? | Milestone-wide Cast verification across #272-#278. It proves local Cast lifecycle paths, accessibility/focus/status behavior, and sender cleanup preserve the viewer-local boundary without adding new product behavior. |
| #279 lifecycle coverage | Cover availability, start, active, stop, unavailable, failed-start, receiver-ended, playback-blocked, stop-failed, cleanup completion, room leave, navigation, and reload paths at the most practical automated or manual layer for browser Cast constraints. |
| #279 negative side effects | Verification must prove Cast lifecycle and cleanup do not write room state, mutate **`roomMode`**, **`avDisabled`**, **`share_state`**, alter host authority, change SFU permission or token state, fan out room messages, affect participant roster authority, or change any other participant's room presentation. |

## Decisions (answered - Cast verification #279)

| Topic | Decision |
| --- | --- |
| Verification posture | #279 is a verification umbrella for M25 Cast behavior. It adds test and review coverage for existing contracts rather than introducing a room-wide Cast mode or new authority surface. |
| Test boundary | Tests may use controller-local state hooks, fake Cast sender clients, receiver-channel stubs, and manual Cast-capable device checks. These verification hooks must remain local to Cast surfaces and must not appear in room diagnostics, active realtime error codes, or room authority payloads. |
| Completion signal | #279 is complete when lifecycle, accessibility, and cleanup coverage collectively prove the sender-local Cast contract across peer issues #272-#278 and no stale **`Now Casting`**, sender handles, listeners, timers, receiver bindings, or room side effects remain after cleanup paths. |

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

## Decisions (answered — friends and direct messaging)

| Question | Decision |
| --- | --- |
| Friendship creation model? | **Invite/accept** — durable **Friendship** only after the recipient accepts a **FriendshipRequest**. Pending requests are part of the lifecycle. |
| Friends-list online meaning? | Friend is currently present in **any** RiffSync room (**RoomPresence**-derived). Not platform-wide, not last-seen, not same-room-only. |
| DM retention class? | **Account-lifetime durable** until explicit delete or account closure. Distinct from TTL-bounded **RoomChat**. |
| Remove-friend semantics? | **Immediately mutual**. Existing **DmThread** closed/hidden for **both** (no compose, no history access). Re-friend creates a new edge; prior history remains inaccessible by default. |
| DM eligibility? | **Active Friendship** required to open or send. |
| Thread shape? | Exactly **1:1** between two fan **`sub`s**. |
| Group DMs / voice-video friends / public feeds / staff DM moderation / replace People? | **Out of scope**. |
| Separate block product? | **No** — teardown verb is **remove friend**. |
| Friends vs room People? | Orthogonal durable social store; does not replace **People**. |

## Decisions (answered — friendship invite/accept lifecycle #356)

| Question | Decision |
| --- | --- |
| **FriendshipRequest status while row exists?** | **`pending`** only. Terminal transitions **hard-delete** the row (accept, decline, cancel). No tombstone attribute on requests for MVP. |
| **Friendship edge "active"?** | Implied by durable **Friendship** row keyed by canonical unordered **`pairKey`**. **Remove friend** deletes the row (#358). No separate edge status enum. |
| **Pair uniqueness (pending)?** | At most **one** open pending per unordered fan pair (either direction). Enforced via sparse **`pairKey`** on pending rows. |
| **Same-direction duplicate invite?** | **Idempotent 200** returning the existing pending **`requestId`**. |
| **Opposite-direction invite while pending?** | **409 `friend_request_inbound_exists`** — caller should accept/decline inbound instead of creating a reverse pending. |
| **Accept authority?** | **Recipient only** on **`POST .../accept`**. Creates **Friendship** and deletes **all** pending requests between the pair (both directions). |
| **Decline authority?** | **Recipient only**; hard-deletes that request. |
| **Cancel authority?** | **Requester only** on **`DELETE .../requests/{requestId}`**; hard-deletes that request. |
| **Already friends?** | **409 `already_friends`** on new invite. |
| **Self-invite?** | **400 `cannot_friend_self`**. |
| **Accept-after-remove / after decline?** | Allowed via a **new** invite/accept cycle. Prior DM history stays inaccessible (#358 default). |
| **Instant mutual-add without accept?** | **Out of scope** — reciprocal pendings still require **accept** on an inbound request. |

## Decisions (answered — friends list and online #357)

| Question | Decision |
| --- | --- |
| **Friends-list API?** | **`GET /v1/friends`** — accepted **Friendship** edges only; fan JWT required. Pending requests stay on **`GET /v1/friends/requests`**. |
| **Online aggregation?** | **`online: true`** when peer **`fanSub`** has **≥1** live **RoomPresence** row in **any** room (OR across tabs and rooms). No durable online flag on **Friendship**. |
| **Disconnect / stale rows?** | Row **hard-deleted** on **`$disconnect`**; TTL **`expiresAt`** is orphan cleanup. GSI reads eventually consistent; brief post-disconnect **`online: true`** acceptable for MVP. |
| **Friends online vs People active?** | Friends list exposes **`online`** boolean only — **not** **`active`**, **`lastActiveAt`**, or **`roomId`**. People roster semantics unchanged. |
| **Display labels?** | **`displayName`** and optional **`avatarUrl`** from **FanProfiles** keyed by peer **`fanSub`**. Fallback **`displayName`**: **`"Friend"`** when profile row missing or name empty. |
| **List ordering?** | Case-insensitive **`displayName`**, then lexicographic **`pairKey`**. |
| **Presence access path?** | Sparse **RoomPresence** GSI on **`fanSub`** + **`roomId#presenceKey`**; per-peer query **`Limit: 1`** for online boolean. |

## Decisions (answered — mutual remove-friend #358)

| Question | Decision |
| --- | --- |
| **Remove route?** | **`DELETE /v1/friends/{pairKey}`** — either party; hard-delete **Friendship**. |
| **DmThread on remove?** | Soft-close **`status: closed`**, **`closedAt`** when thread exists; **DirectMessage** bodies retained, access denied. |
| **Re-friend history?** | Prior **DmThread** history stays inaccessible (default). |
| **Notification?** | Silent API (#358); M36 presentation. |

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### friends-and-direct-messaging
- Whether **DirectMessage** supports the same message kinds as room chat (text, emoji, Giphy GIF, reactions) or a reduced v1 set — **M35**.
- Account-closure cascade and explicit user delete of DM history relative to retained-after-unfriend bodies — future ops / M35 slice (unfriend retain decided #358).

- Domain services colocated with Lambda packages when implemented.
