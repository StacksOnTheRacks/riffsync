# API contracts

Normative boundaries for client ↔ RiffSync backend. Repo detail: **`docs/architecture.server.md`**, **`docs/architecture.frontend.md`**, **`docs/architecture.admin.md`**.

## Versioning

- **HTTP:** path prefix **`/v1`** for all shipped JSON APIs. Breaking changes bump major version or introduce a parallel prefix; non-breaking additive fields allowed on existing resources.
- **WebSocket:** every application payload carries a **`schemaVersion`** or **`type`** discriminator so clients can evolve without silent mis-parse.

## HTTP (API Gateway HTTP API)

| Surface | Auth | Purpose |
| --- | --- | --- |
| **`GET /v1/catalog`** | None required (public). | Canonical episode rows: curator fields + TMDB-derived + optional **`youtubeThumbnailUrl`** when implemented. **Caching:** **`Cache-Control`** with deployment-appropriate **max-age**; **`ETag`** weak validator derived from a **catalog generation** counter or **`max(updatedAt)`** in Dynamo so clients can **`If-None-Match`** (reduces egress cost when paired with CloudFront). **SPA subcategory browse** (`/catalog/mst3k`, `/catalog/community`, `/catalog/riff-material`, `/catalog/movie-night`) reuses this public full list with **client-side** catalog filtering; it does **not** add **`catalog`** / **`catalogs`** query parameters. Wire **`catalog`** values stay unchanged (**`riff_material`** remains on the wire for Riff Material). |
| **`GET /v1/lists`**, **`GET /v1/lists/{slug}`** | None (public) when shipped. | Curated collections; **`slug`** URL-safe. |
| **`POST /v1/rooms` (create)** | **Fan Cognito JWT** — **`hostSub`** on new room **= JWT `sub`**. **`sessionId`** optional telemetry only—**not** host binding. | Mint **`roomId`**, seed **`catalogEpisodeId`** / visibility / **`playbackExpectation`** per payload. Server sets **`roomMode: theater`** and **`avDisabled: false`** on the Dynamo item; **`201`** echoes both. |
| **`GET /v1/rooms/{roomId}`** | **`sessionId`** via **`X-Session-Id`** optional; no JWT required for read. | Room snapshot including **`roomMode`**, **`avDisabled`**, **`broadcastCaptureActive`**, and **`version`**. Legacy rows missing AV attributes default **`theater`** / **`false`**. |
| **`GET /v1/lobby`**, lobby joins | **`sessionId`** via **`X-Session-Id`** (guest); optional JWT if viewer signs in. | Lobby rows for discovery/join validation — **no** **`roomMode`** or **`avDisabled`** on listing payload (#101). |
| **`PATCH /v1/rooms/{roomId}`** | **Fan JWT**; **`JWT.sub === room.hostSub`**. | **Mutable current episode**, advisory labels, visibility flags—conditional **`version`** writes (**`409`** on stale **`version`**). Same host-only gate for durable **`roomMode`** (**`theater`** \| **`videoChat`**) and **`avDisabled`** (boolean kill switch). Partial body: omit keys to leave fields unchanged; **`roomMode`** / **`avDisabled`** reject **`null`** (**`400`**). **`broadcastCaptureActive`** retains existing boolean or **`null`**-clear semantics. One request may atomically update **`roomMode`**, **`avDisabled`**, and **`broadcastCaptureActive`** (#109). **`200`** echoes **`roomMode`**, **`avDisabled`**, **`broadcastCaptureActive`**, and bumped **`version`**. |
| **`POST /v1/webrtc/sfu-token`** | **`X-Session-Id`** required; active room WebSocket presence row; **`Authorization`** fan JWT for **producer** grants. | Mint short-lived mediasoup join JWT (**900s** TTL today). **Host screen** producer when **`JWT.sub === room.hostSub`**. **Participant A/V** producer when **`fanSub`** on connection, **`avDisabled`** false, signed-in (not anonymous). **Consumer** role for others. Returns **`wsUrl`**, **`role`**, **`expiresInSeconds`**. **403** when prerequisites missing or kill switch active. |
| **`GET /v1/health`** | None. | **Normative** liveness path (matches **`/v1`** versioning). Smoke: process up + critical dependencies **best-effort** (Dynamo **DescribeTable** or shallow read—**IaC** chooses depth vs cold-start cost). |
| **`GET /v1/fans/me`**, **`PATCH /v1/fans/me`** | **Fan Cognito JWT**. | Read/update **`displayName`** on **FanProfiles** row keyed by **`sub`**; **`GET`** also returns optional **`avatarUrl`** / **`avatarUpdatedAt`**. |
| **`POST /v1/fans/me/avatar`** *(multipart body; presigned PUT deferred)* | **Fan Cognito JWT**. | Upload/replace **one** avatar image; persists **`avatarUrl`** + **`avatarUpdatedAt`** on FanProfiles; object in **S3** served via **public HTTPS** (see **`data_model.md`**). |
| **`GET /v1/giphy/search`** | **Fan Cognito JWT**. | Server-side **Giphy** search proxy; returns normalized GIF candidates for compose UI; **API key never in browser**. |
| **Friends lifecycle (invite / accept / decline / list pending / remove)** | **Fan Cognito JWT** only. | Signed-in fans create **pending** friendship requests, **accept** or **decline** inbound requests, **cancel** outbound pending, and list pending inbound/outbound. **Remove** accepted friendship is **#358**. Durable friendship exists only after accept. Paths under **`/v1/friends/*`** (see **Friendship HTTP routes**). Main-site and room Friends surfaces call the **same** fan-gated APIs when UI ships (**M36**). |
| **DM thread / history / send / unread clear** | **Fan Cognito JWT** only. | 1:1 DM between two fan **`sub`s** with an **active friendship**. History is **account-lifetime durable** (distinct from TTL-bounded **RoomChat**). **Thread ensure** and **history page** paths decided **#359**; send and unread clear **#360** / **#361**. Delivery: **history sync on open** plus **realtime push while connected** (write-then-fan-out class — **`messaging_async.md`**). After mutual remove-friend, **both** parties lose send and history access on that thread (**`authorization.md`**). |
| **`/v1/admin/*`** | **Staff-only** Cognito JWT (separate pool or app client). | Full route surface aligned with **`docs/architecture.admin.md`** (summary below). **CloudWatch** remains the primary ops chart layer. **No** staff route grants DM body read or friendship mutation for this product slice. |

**Admin HTTP (normative summary — detail in `docs/architecture.admin.md`):**

| Verb / path | Purpose |
| --- | --- |
| **`GET /v1/admin/session`** | **Auth-slice probe** (staff JWT): returns operator identity from JWT claims (**`sub`**, **`email`**, **`groups`**). Proves staff authorizer + group check path end-to-end before catalog handlers ship. **403** when JWT is valid but caller lacks required **`cognito:groups`** membership; **401** when authorizer rejects token (wrong pool/audience/expiry). |
| **`POST`**, **`PATCH`**, **`DELETE /v1/admin/catalog/episodes/:id`** | Catalog CRUD; payload compatible with **`data/catalog/catalog.schema.json`** (+ Dynamo-only fields per **`docs/architecture.catalog-images.md`**). |
| **`POST /v1/admin/catalog/import`** | Bulk import before promoting catalog (**multipart** or **S3**-referenced payload—see admin doc). |
| **`POST`**, **`PATCH /v1/admin/lists`** | Create/update curated list meta (**`slug`**, **`title`**, **`visibility`**, **`sortRule`**, optional hero). |
| **`PUT /v1/admin/lists/{slug}/order`** | Replace membership ordering. |
| **`POST /v1/admin/lists/{slug}/members`** | Add/remove/reorder entries; **referential integrity** on **`catalogEpisodeId`**. |
| **`GET /v1/admin/reporting/...`** *(optional)* | CSV/UI drill-down; **not** required for core KPIs (**CloudWatch** first). |

## WebSocket (API Gateway WebSocket API)

- **Routes:** **`$connect`**, **`$disconnect`**, and application routes for **`chat`** (text/emoji and **Giphy GIF** posts), **`react`** (emoji reaction add/remove on a **`messageId`**), **`rename`** (signed-in fan updates their presence display name **in place** — writes both connection and presence rows, then re-broadcasts **`presence`**; no reconnect, media untouched), **`ping`** (liveness for **`lastActivityAt`** and qualifying **active** signal when within the active window), **`typing_start`** / **`typing_stop`** (ephemeral compose indicators — see **Presence and typing** below), **`share_state`** (host screen-share lifecycle). **Mesh WebRTC `signaling` route (SDP / ICE relay over API Gateway) is removed** — media uses **SFU signaling WebSocket only** (see **Realtime hardening** below). **Durable** **`roomMode`** and **`avDisabled`** changes use **HTTP `PATCH` only** — no inbound **`room_mode`** / **`av_disabled`** WebSocket application routes; **`room-patch` Lambda** fans out outbound **`room_mode`** / **`av_disabled`** broadcasts after Dynamo commit (#103).
- **Chat payloads (broadcast):** discriminated by **`type`** — e.g. **`chat`** (text/unicode emoji), **`chat_gif`** (**`giphyId`**, rendition URL, optional title/dimensions), **`chat_reaction`** (**`messageId`**, emoji, **`action`**: add | remove, **`sessionId`** / sender identity). Each chat line carries client-generated **`messageId`** (UUID) within scrollback. Server enriches with **`displayName`** and optional **`avatarUrl`** for signed-in senders.
- **Room control fan-out (broadcast):** discriminated by **`type`** — **`share_state`** (**`state`**: **`started`** \| **`stopped`**, optional **`shareGeneration`**); **`room_mode`** (**`roomMode`**: **`theater`** \| **`videoChat`**, **`roomId`**, **`sessionId`**, **`ts`**, optional **`version`**); **`av_disabled`** (**`avDisabled`**: boolean, **`roomId`**, **`sessionId`**, **`ts`**, optional **`version`**). **`share_state`** is host-inbound over WebSocket; **`room_mode`** / **`av_disabled`** are **outbound-only** from **`room-patch`** after host **`PATCH`** succeeds (**`JWT.sub === hostSub`** on HTTP caller).
- **Send auth:** **`chat`**, **`chat_gif`**, and **`react`** require **fan JWT** on the connection (or per-action validation); anonymous **`sessionId`** connections are **receive-only** for chat fanout.
- **Connect context:** **`roomId`** required; **`sessionId`** for guest envelope; fan JWT at **`$connect`** (**query `accessToken`** or **`Authorization`**) stores **`fanSub`** and marks host publisher when **`sub === hostSub`**.
- **Room-admin only:** durable playback-intent updates, **`roomMode`**, **`avDisabled`**, and **host screen-share** signaling; server validates **`JWT.sub === hostSub`** before accepting host control envelopes or mutating authoritative room fields.
- **Broadcast:** Lambda uses **`execute-api:ManageConnections`** **`PostToConnection`** to room members after durable room write succeeds for persisted fields (**`roomMode`**, **`avDisabled`**, playback); ordering best-effort (see **`messaging_async.md`**).
- **Viewer-local Cast:** Cast unavailable, start failure, active receiver disconnect, receiver playback blocked, stop failure, and cleaned-up state are client-only sender lifecycle states. They are not HTTP request fields, room snapshot fields, lobby fields, WebSocket inbound routes, WebSocket fan-out payloads, **`share_state`** variants, SFU token claims, or room diagnostics drawer fields.

### Presence and typing (control plane)

**Online vs active:** **Online** = member has an open room WebSocket **RoomPresence** row (existing roster model). **Active** = recently engaged via control-plane signals — **not** SFU publish state, sidebar tab focus, or profile-tab telemetry.

**Qualifying active signals (union):** **`typing_start`**, outbound **`chat`** / **`chat_gif`**, **`react`** (add or remove), and **`ping`** when the heartbeat falls inside the **2-minute** active idle window. Each qualifying inbound route updates durable **`lastActiveAt`** on the sender's **RoomPresence** row (epoch seconds) before fan-out so reconnect and **`presence_request`** rehydrate accurate People badges.

**`presence` broadcast member shape:** each roster entry includes existing identity fields plus:

| Field | Contract |
| --- | --- |
| **`active`** | Boolean — participant engaged within the **2-minute** active window. Server **precomputes** at broadcast time from roster **`lastActiveAt`** (max per **`sessionId`** when multiple tabs). Clients treat server **`active`** as authoritative; may verify with **`now - lastActiveAt < 120`**. |
| **`lastActiveAt`** | Optional epoch **seconds** — durable engagement timestamp on **RoomPresence** (max across tabs sharing **`sessionId`** on roster collapse); omitted when never engaged this session. |

**Typing routes:**

| Route | Auth | Contract |
| --- | --- | --- |
| **`typing_start`** | **Fan JWT** required (same gate as **`chat`** send). | Ephemeral fan-out only — **no** **RoomChat** write. Marks sender **active** (updates **`lastActiveAt`**) and broadcasts a **`typing`** envelope to room members. |
| **`typing_stop`** | **Fan JWT** required. | Clears sender typing state; **does not** by itself clear **active** (idle window governs badge). Ephemeral fan-out only. |

**Join / leave system lines:** When a **signed-in fan** (**`fanSub`** present) opens or closes a room WebSocket presence slot, the server **may** fan out ephemeral **`chat_system`** lines (**`join`** \| **`leave`**) on the room WebSocket. **Anonymous guests** connect and disconnect **silently** — no system line. These lines are **not** persisted in **RoomChat** and **must not** appear in **`chat_history`** scrollback on **`presence_request`**.

**Prohibited scope:** no fine-grained presence (selected sidebar tab, profile tab, cursor position). Typing and **active** stay on the room WebSocket — never on SFU signaling.

## Friends and direct messaging (social plane)

Friends and 1:1 DMs are a **fan social plane** beside watch-party room chat. They reuse fan Cognito identity and the shared HTTP API authorizer family; they do **not** replace room **People** / **RoomPresence** roster contracts.

### Friendship HTTP lifecycle

| Step | Contract |
| --- | --- |
| **Invite** | **`POST /v1/friends/requests`** with body **`{ "recipientSub": "<cognito-sub>" }`**. Caller **`sub`** is requester. Creates **`pending`** row; returns **`201`** with **`requestId`**, **`requesterSub`**, **`recipientSub`**, **`createdAt`**. Same-direction pending → idempotent **`200`** with existing request. |
| **List pending** | **`GET /v1/friends/requests`** returns **`{ "inbound": [...], "outbound": [...] }`** of pending requests for caller (each entry: **`requestId`**, **`requesterSub`**, **`recipientSub`**, **`createdAt`**). Does **not** include accepted friends (**#357**). |
| **Accept** | **`POST /v1/friends/requests/{requestId}/accept`**. **Recipient only**. Creates **Friendship** **`pairKey`** item; **hard-deletes** all pending requests for that unordered pair. **`200`** with **`pairKey`**, **`fanSubA`**, **`fanSubB`**, **`createdAt`**. |
| **Decline** | **`POST /v1/friends/requests/{requestId}/decline`**. **Recipient only**. Hard-deletes request. **`204`**. |
| **Cancel** | **`DELETE /v1/friends/requests/{requestId}`**. **Requester only**. Hard-deletes pending request. **`204`**. |
| **Remove** | **`DELETE /v1/friends/{pairKey}`** — **#358**. Either party; hard-delete **Friendship**; soft-close **DmThread** when present. |
| **List accepted friends** | **`GET /v1/friends`** — **#357**. Returns **`{ "friends": [ ... ] }`** for caller's accepted edges only. |

Anonymous guests have **no** friends lifecycle routes. Staff JWT does **not** authorize friendship mutations.

### Friendship HTTP deny codes (#356)

| **`code`** | HTTP | When |
| --- | --- | --- |
| **`cannot_friend_self`** | **400** | **`recipientSub === caller sub`**. |
| **`fan_auth_required`** | **401** | Missing/invalid fan JWT. |
| **`friend_request_not_recipient`** | **403** | Accept/decline by non-recipient. |
| **`friend_request_not_requester`** | **403** | Cancel by non-requester. |
| **`friend_request_not_found`** | **404** | Unknown or non-pending **`requestId`**. |
| **`already_friends`** | **409** | **`pairKey`** friendship exists. |
| **`friend_request_inbound_exists`** | **409** | Opposite pending exists. |
| **`rate_limited`** | **429** | Throttle exceeded. |

### Friends-list online (RoomPresence-derived)

| Topic | Contract |
| --- | --- |
| **Meaning** | A friend row is **online** when that friend's fan **`sub`** has an **open RoomPresence** row in **any** RiffSync room. |
| **Not** | Platform-wide browsing presence, last-seen timestamp product, same-room-only, or People **active** engagement. Room **People** **online** vs **active** semantics inside a room are **unchanged**. |
| **Derivation** | For each peer **`fanSub`**, query sparse **RoomPresence** GSI (**PK `fanSub`**, **SK `roomId#presenceKey`**) with **`Limit: 1`**. Any item ⇒ **`online: true`**. OR across rooms and tabs. |
| **Disconnect** | Rows delete on **`$disconnect`**; TTL **`expiresAt`** is orphan cleanup. GSI reads are eventually consistent. |
| **Wire (GET /v1/friends entry)** | **`fanSub`**, **`pairKey`**, **`displayName`**, optional **`avatarUrl`**, **`online`** (boolean), **`createdAt`** (epoch ms). No **`active`**, **`lastActiveAt`**, or **`roomId`**. |
| **Display** | **`displayName`** / **`avatarUrl`** from **FanProfiles**; **`displayName`** fallback **`"Friend"`** when profile missing or empty. |
| **Sort** | Case-insensitive **`displayName`**, then lexicographic **`pairKey`**. |
| **Main site** | Viewer does **not** need to join a room to load the list. No SFU signal. |

### Friends-list HTTP (#357)

| Step | Contract |
| --- | --- |
| **List** | **`GET /v1/friends`**. Fan JWT required. **`200`** body **`{ "friends": [ { "fanSub", "pairKey", "displayName", "avatarUrl"?, "online", "createdAt" } ] }`**. Pending requests excluded. |
| **Auth** | **`401 fan_auth_required`** without valid fan JWT. Guests and staff tokens denied. |
| **Rate limit** | **60**/min per caller **`fanSub`**; **`429 rate_limited`**. |

### Remove-friend HTTP (#358)

| Step | Contract |
| --- | --- |
| **Remove** | **`DELETE /v1/friends/{pairKey}`**. **`pairKey`** is canonical **`min(subA,subB)#max(subA,subB)`** (same as **Friendship** PK). Caller **`sub`** must be one of the two encoded subs. |
| **Outcome** | **Hard-delete** the **Friendship** item. **Immediately mutual** — no one-sided edge. When a **DmThread** row exists for the pair, set **`status: closed`** and **`closedAt`** (epoch ms) in the **same TransactWrite**. **Do not** delete **DirectMessage** bodies on unfriend; M35 routes deny read/send for both parties. |
| **Success** | **`200`** body **`{ "pairKey", "removedAt" }`** where **`removedAt`** is epoch ms. |
| **Idempotency** | Second **`DELETE`** after edge gone → **404 `friendship_not_found`**. |
| **Auth** | Fan JWT required; guests and staff tokens denied (**401 `fan_auth_required`**). |
| **Rate limit** | **30**/min per caller **`fanSub`**; **`429 rate_limited`**. |
| **Notification** | **Silent** at API layer — no push/email to the other party (#358). M36 owns in-app copy if any. |

### Remove-friend HTTP deny codes (#358)

| **`code`** | HTTP | When |
| --- | --- | --- |
| **`fan_auth_required`** | **401** | Missing/invalid fan JWT. |
| **`friendship_not_member`** | **403** | Caller **`sub`** is not a member of **`pairKey`**. |
| **`friendship_not_found`** | **404** | No **Friendship** row for **`pairKey`** (includes repeat remove). |
| **`rate_limited`** | **429** | Throttle exceeded. |

### Post-remove DM deny codes (M35 routes; defined for race coordination)

| **`code`** | HTTP | When |
| --- | --- | --- |
| **`friendship_not_active`** | **403** | No active **Friendship** between the principals (includes after remove). |
| **`dm_thread_closed`** | **403** | **DmThread** **`status: closed`** (explicit closed state after unfriend). |

Handlers for DM history/send **must** re-check friendship (and closed thread when the item exists) **immediately before** durable write so an in-flight send loses to a concurrent remove.

### DM thread open and history HTTP (#359)

| Step | Contract |
| --- | --- |
| **Ensure / open thread** | **`PUT /v1/dm/threads/{peerSub}`**. Fan JWT required. **`peerSub`** is the friend's Cognito **`sub`**. Server computes canonical **`pairKey = min(callerSub, peerSub)#max(callerSub, peerSub)`**. Requires active **Friendship** row for **`pairKey`**. |
| **Ensure outcome** | When no **DmThread** item exists, **PutItem** with **`status: open`**, **`openedAt`** / **`updatedAt`** (epoch ms), **`subA`**, **`subB`**. When item exists and **`status: open`**, idempotent **`200`**. When **`status: closed`** or friendship absent, deny (see codes). |
| **Ensure success body** | **`200`** **`{ "pairKey", "peerSub", "status", "openedAt" }`**. |
| **Page history** | **`GET /v1/dm/threads/{pairKey}/messages`**. Fan JWT required; caller must be a member of **`pairKey`**. Query params: **`limit`** (default **50**, max **100**), optional **`before`** opaque cursor for older messages. |
| **History success body** | **`200`** **`{ "messages": [ { "messageId", "senderSub", "kind", "body", "sentAt" } ], "nextCursor": string \| null }`**. Messages ordered **newest-first** in the array. **`kind`** is **`text`** in M35 v1. |
| **History cursor** | **`before`** is base64url-encoded JSON **`{"sentAt": number, "messageId": string}`** referencing the oldest message in the prior page; next page returns rows strictly older than that tuple. **`nextCursor`** uses the same encoding for the oldest message in the current page, or **`null`** when exhausted. |
| **Auth** | **`401 fan_auth_required`** without fan JWT. Guests and staff tokens denied. |
| **Rate limit** | **60**/min per caller **`fanSub`** combined on **`PUT .../threads/{peerSub}`** and **`GET .../messages`**; **`429 rate_limited`**. |

### DM thread open / history deny codes (#359)

| **`code`** | HTTP | When |
| --- | --- | --- |
| **`fan_auth_required`** | **401** | Missing/invalid fan JWT. |
| **`cannot_dm_self`** | **400** | **`peerSub === caller sub`**. |
| **`dm_not_member`** | **403** | Caller **`sub`** is not a member of path **`pairKey`**. |
| **`friendship_not_active`** | **403** | No active **Friendship** for the pair (includes after remove). |
| **`dm_thread_closed`** | **403** | **DmThread** **`status: closed`**. |
| **`dm_thread_not_found`** | **404** | History requested for **`pairKey`** with no **DmThread** item (empty thread — client should **`PUT`** ensure first). |
| **`rate_limited`** | **429** | Throttle exceeded. |

### DM plane vs room `ChatSession`

| Plane | Owner / scope | Contract |
| --- | --- | --- |
| **Room chat / presence / control** | **`ChatSession`** + room WebSocket keyed by **`roomId`** | Public (party) chat, **RoomPresence**, typing, join/leave, **`share_state`**, room control fan-out. Unchanged by friends/DM. |
| **1:1 DM** | Distinct **DM plane** (HTTP history + realtime push while connected) | Private account-lifetime history between friend pair. **Must not** be implied by reusing room-chat UX language. Prefer **not** overloading the room **`ChatSession` `roomId` channel** for DM bodies; if a future implementation shares transport machinery, the contract **must** note the shared topology explicitly and keep authz/thread identity separate from **`roomId`**. |

**Delivery class:** durable DM write, then fan-out to connected peers (**write-then-fan-out** analogue of room chat); clients also **sync history on open** via **`GET /v1/dm/threads/{pairKey}/messages`** (#359). Exact WebSocket vs HTTP long-poll / hybrid topology, route keys, and **`type` / `schemaVersion`** discriminators for realtime push remain open (**#360**).

**Unread:** server-authoritative per recipient; clears when the viewer **views** those messages. Badge aggregation (per-friend vs aggregate) wire shape is open (**#361**).

**Surfaces:** main-site person-icon friends flow and watch-party Friends pane share the same fan-gated APIs.

## HTTP idempotency & abuse (cost-first OSS)

| Concern | MVP decision |
| --- | --- |
| **Room create** | Clients **SHOULD** send **`Idempotency-Key`** (opaque UUID) on **`POST /v1/rooms`**; server **SHOULD** dedupe per key within a short TTL **when practical** (Dynamo or Lambda-scale cache) to avoid duplicate rooms on retries. |
| **Other writes** | **Conditional writes** / **`version`** on room metadata updates; retries that collide return **409** (client refreshes snapshot). |

## Limits (defaults — tune in IaC)

| Limit | Staging / prod default |
| --- | --- |
| **Participants per room** | **50** hard cap (reject join / WS connect with clear error). |
| **Lobby listing** | **50** rows per page; clients paginate (caps total listed rooms if needed for cost). |
| **Chat** | **20** chat actions per **minute** per **`sessionId`** (text, GIF post, and reaction add/remove each count; HTTP/WS enforced). Bodies persist in **RoomChat** with **bounded TTL** retention (not account-lifetime inbox); do not log raw bodies at INFO — see **`operations/security.md`** and **`data/persistence_abstractions.md`**. |
| **Typing indicators** | **30** **`typing_start`** + **`typing_stop`** pairs per **minute** per **`sessionId`** (WS enforced; over-cap **`typing_start`** / **`typing_stop`** **drops silently** — no business **`error`** envelope to client). Counts toward the same abuse posture as chat compose; does **not** bypass chat send limits. |
| **Giphy search** | **30** search requests per **minute** per **`sub`** (HTTP; tune in IaC). |
| **Friend-request send** | **10** **`POST /v1/friends/requests`** per **minute** per **`fanSub`** (HTTP; API Gateway + Lambda guard). |
| **Friend-request accept / decline / cancel** | **30** combined actions per **minute** per **`fanSub`**. |
| **Remove friend** | **30** **`DELETE /v1/friends/{pairKey}`** per **minute** per **`fanSub`**. |
| **Friends list read** | **60** **`GET /v1/friends`** per **minute** per **`fanSub`**. |
| **Participant A/V publishers** | **8** concurrent signed-in AV publishers per room (hard ceiling; tune in IaC / SFU env). **403** or visible client error when cap hit — no auto-degrade in MVP. |
| **WebSocket** | Subject to **API Gateway** account/service quotas; design for **≤50 concurrent connections per room** under normal use (matches participant cap). |

## Decisions (answered)

| Question | Decision |
| --- | --- |
| Single BFF vs split admin API? | **Start:** one HTTP API with **`/v1/admin/*`**; split later for blast radius (**`architecture.admin.md`**). |
| Public catalog without auth? | **Yes** for **`GET /v1/catalog`** (and public lists). |
| Catalog subcategory SPA routes? | **No new HTTP/WS contract.** Subcategory pages call the same public **`GET /v1/catalog`** and filter catalogs in the client; no server-side **`catalog`** / **`catalogs`** query params for this browse IA. |
| WebSocket auth for guests? | **sessionId** sufficient for MVP; JWT optional enhancement for abuse resistance. |
| Admin verification MVP? | **`JWT.sub === room.hostSub`** for **`POST /v1/rooms`**, **`PATCH`/`PUT`**, and publisher signaling; **anonymous guests** never satisfy this check. |
| Staff auth end-to-end check? | **`GET /v1/admin/session`** under **`/v1/admin/*`** with staff JWT; validates authorizer + **`cognito:groups`** before catalog admin routes ship. |
| GIF provider? | **Giphy** only for this product slice; server-side search + Giphy CDN renditions in messages (**`external_systems.md`**). |
| Guest chat send / react? | **Fan JWT required** to send text/emoji/GIF and to add/remove reactions; guests **view only**. |
| Participant AV publish? | **Signed-in fans only**; **SFU path in all environments** (local dev, CI, production). **Mesh WebRTC removed** this milestone. |
| Room mode + AV kill switch durability? | **Durable** on room document; host **`PATCH`**; returned on snapshot/join; fan-out over WebSocket after write. |
| AV kill switch enforcement? | **Server-enforced** — deny participant producer tokens, SFU tears down participant producers, broadcast **`avDisabled`**. |
| Theater participant audio? | **Client-side mixing** — consumers attach multiple SFU audio consumers (host movie + participant mics); no server-side mixer in MVP. |
| Video Chat vs host screen? | Clients **stop consuming** host screen producer in **`videoChat`** mode; host **fully stops** tab-capture on enter (resume requires **Share Source Tab** again). |
| Client vs CDK mesh retirement order? | **#134** removes SPA mesh handlers and modules first; **#135** removes API Gateway **`signaling`** route. After **#134** the SPA ignores inbound **`signaling`** envelopes; orphaned route is harmless until **#135**. |
| Chromecast room API? | **None.** Viewer-local Cast state does not add HTTP fields, WebSocket routes, `share_state` payload fields, SFU token claims, lobby fields, or room snapshot fields. |
| Chromecast side effects for #277? | **None.** Local Cast lifecycle paths must not call **`PATCH /v1/rooms/{roomId}`**, add room snapshot fields, emit room WebSocket payloads, alter **`share_state`**, request different SFU token claims, or change other participants' room diagnostics/status through integration surfaces. |
| Chromecast verification for #279? | Tests must assert Cast lifecycle, failure, and cleanup paths keep Cast out of HTTP room fields, lobby payloads, room WebSocket routes/fan-out, **`share_state`**, SFU token claims, **`activeErrorCodes`**, and **`RoomRealtimeSdk.getDiagnostics().drawers.*`**. |

## Decisions (answered — friends and direct messaging)

| Question | Decision |
| --- | --- |
| Friendship creation APIs? | **Invite / accept / decline** — pending request then durable edge on accept. Fan JWT HTTP lifecycle; guests out. |
| Friends-list online? | **RoomPresence-derived:** friend is online if they have an open presence in **any** room. Not platform browsing presence; not last-seen; not same-room-only. |
| DM durability vs RoomChat? | **Account-lifetime durable** until explicit delete or account closure. Distinct retention class from TTL-bounded **RoomChat**. |
| DM delivery? | **History sync on open** + **realtime push while connected** (serverless write-then-fan-out class). Exact WS vs HTTP topology open. |
| DM vs **`ChatSession`**? | **`ChatSession`** stays the **room** plane. DM is a separate social/DM plane; do not silently overload room **`roomId`** channel. |
| Remove-friend access? | **Mutual** teardown; **both** parties lose DM send and history access. Encode on DM list/send/history authz. |
| Staff DM body access? | **None** for this slice — fan JWT only; no **`/v1/admin/*`** DM body read. |
| Shared API surfaces? | Main site and room Friends pane use the **same** fan-gated friends/DM APIs. |

## Decisions (answered — friendship invite/accept lifecycle #356)

| Question | Decision |
| --- | --- |
| Friendship HTTP prefix? | **`/v1/friends/*`** on fan JWT authorizer (alongside **`/v1/fans/*`**). |
| Pending list vs friends list? | **`GET /v1/friends/requests`** = pending only; accepted friends list is **`GET /v1/friends`** (**#357**). |
| Invite idempotency? | Same-direction pending → **200** with existing request. |
| Pair conflict? | Opposite pending → **409 `friend_request_inbound_exists`**. |
| Request terminal storage? | **Hard-delete** on accept, decline, cancel. |

## Decisions (answered — friends list and online #357)

| Question | Decision |
| --- | --- |
| **Friends list route?** | **`GET /v1/friends`** on fan JWT authorizer. |
| **Response shape?** | **`friends`** array; each entry includes **`fanSub`**, **`pairKey`**, **`displayName`**, optional **`avatarUrl`**, **`online`**, **`createdAt`**. |
| **Online field?** | Boolean **`online`** only — derived from **RoomPresence** **`fanSub`** GSI; no **`roomId`** or **`active`**. |
| **Profile fallback?** | **`displayName: "Friend"`** when **FanProfiles** missing or empty. |
| **List ordering?** | **`displayName`** (case-insensitive), then **`pairKey`**. |
| **Read rate limit?** | **60/min** per **`fanSub`**. |

## Decisions (answered — #101 HTTP room AV)

| Question | Decision |
| --- | --- |
| Create seeds AV fields? | **`roomMode: theater`**, **`avDisabled: false`** on Dynamo write; echoed in **`201`**. |
| Snapshot read path? | **`GET /v1/rooms/{roomId}`** returns **`roomMode`**, **`avDisabled`**, **`broadcastCaptureActive`**, **`version`**. |
| Lobby listing? | **`GET /v1/lobby`** omits **`roomMode`** and **`avDisabled`**. |
| Host PATCH partial body? | **`roomMode`** / **`avDisabled`** omit-only (no **`null`**); may combine with **`broadcastCaptureActive`** in one atomic write. |
| SPA types? | **`apps/web/src/api/roomsApi.ts`** extended in #109. |

## Decisions (answered — lobby host display #257)

| Question | Decision |
| --- | --- |
| Lobby row host label? | Each returned **`GET /v1/lobby`** room object **includes** **`hostDisplayName`** (string, max **48** chars). |
| Name source? | **`FanProfiles.displayName`** for the room's immutable **`hostSub`** only — **not** live **RoomPresence** labels and **not** in-room WS **`rename`**. |
| Missing / empty profile name? | **Omit the entire room row** from the lobby response — no generic fallback line and no partial row without **`hostDisplayName`**. |
| Privacy on lobby JSON? | **Never** expose raw **`hostSub`** on **`GET /v1/lobby`**. |
| Read path? | **`lobby-get`** batch-reads **FanProfiles** (deduped **`hostSub`** across the page); no new durable attribute on the **Rooms** item. |
| IaC? | **`lobby-get`** receives **`FAN_PROFILES_TABLE_NAME`** and read grant on **FanProfiles** (same table as **`/v1/fans/me`**). |

## Decisions (answered — host reconnect and lobby index #239 / #257)

| Question | Decision |
| --- | --- |
| Sweeper removed **`lobbyPk`**? | When the **room admin** opens a room WebSocket on a **public** room whose **Rooms** item lacks **`lobbyPk`** (e.g. after **`lobby-sweeper`** **`removeRoomFromPublicLobby`**), **`ws-connect`** **restores** **`lobbyPk`** + **`lobbySk`** and clears **`lobbyCleanupAfter`** / **`hostLastDisconnectedAt`** — same outcome as **`clearLobbyCleanupPending`** today plus re-index. |
| Host **`isHost`** on People? | **RoomPresence** / **Connections** rows for the admin connection **must** carry **`hostSub`** whenever **`JWT.sub === room.hostSub`** at **`$connect`** so roster fan-out keeps **`isHost: true`**. |
| SFU token while host connected? | Host with valid fan JWT + open room WebSocket **must** receive **`host_screen`** producer grants; spurious **`not_host`** / **`unknown_session`** denials while the host tab is connected are **bugs** to fix under #239. |
| Existing host disconnect grace? | **`lobbyCleanupAfter`** / **`HOST_DISCONNECT_GRACE_MS`** behavior **unchanged** — temporary hide during grace; re-index on admin reconnect after sweeper removal. |

## `POST /v1/webrtc/sfu-token` response (#102)

| Field | Contract |
| --- | --- |
| **`token`** | HMAC join JWT embedding **`SfuJoinClaims`** (see **`authorization.md`**). |
| **`role`** | **`producer`** or **`consumer`**. |
| **`producerClass`** | Present when **`role === producer`**: **`host_screen`** or **`participant_av`**. |
| **`wsUrl`** | Public SFU signaling URL. |
| **`expiresInSeconds`** | **900** today. |

- **Cap enforcement:** **Both** Lambda (mint-time estimate + **`avDisabled`** gate) **and** SFU service **`SFU_MAX_*`** at **`produce`**.
- **Token refresh:** Re-mint on SFU signaling reconnect or **~60s before `exp`** while tracks remain active (#104 implements client timer).

## Decisions (answered — #103 WebSocket fan-out)

| Question | Decision |
| --- | --- |
| Unified **`room_av_control`** vs separate types? | **Separate outbound `type`** values **`room_mode`** and **`av_disabled`** — not a unified action. |
| Inbound WebSocket routes for durable fields? | **No** — host **`PATCH /v1/rooms/{roomId}`** only; avoids duplicate mutation paths. |
| Fan-out trigger? | **`room-patch` Lambda** after successful conditional Dynamo write; SPA **does not** send follow-up WS actions for **`roomMode`** / **`avDisabled`**. |
| **`room_mode`** payload? | **Minimal** — **`roomMode`**, **`roomId`**, **`sessionId`**, **`ts`** (epoch ms), optional **`version`**; not a full room snapshot. |
| **`av_disabled`** payload? | **Minimal** — boolean **`avDisabled`**, **`roomId`**, **`sessionId`**, **`ts`**, optional **`version`**. |
| **`sessionId` on fan-out?** | From host **`X-Session-Id`** on **`PATCH`** when present; clients treat field values as authoritative regardless. |

## Realtime hardening — media plane contracts

### SFU-only media path

- **All environments** (local dev, CI, production) use **mediasoup SFU** + **coturn**. **Mesh WebRTC** signaling over API Gateway WebSocket is **deprecated and removed** this milestone (client mesh branches and **`signaling`** WS route).
- Local dev and CI spin up **disposable SFU + TURN** profiles matching production topology. **Integration conformance harness** requirements live in **`operations/build_packaging.md`**; integration contract summary in **`external_systems.md`**.

### Single SFU signaling session with per-class transport isolation

| Decision | Contract |
| --- | --- |
| **Signaling sockets per tab** | **One** SFU signaling WebSocket per browser tab — **not** dual signaling sockets for **`host_screen`** vs **`participant_av`**. |
| **Blast-radius isolation** | **Mandatory per-class send transport isolation** within that session: separate mediasoup send transports (or equivalent) per **`producerClass`**. **`host_screen`** producer/consumer failures **must not** tear down **`participant_av`** producers or consumers. |
| **Partial teardown** | Per-kind **`unpublishProducerKind`** and per-class pause/close rules in **Partial producer teardown** below — **explicit prohibition** of session-level **`close()`** for class-scoped media failures (host screen stop, camera-off-with-mic-on, guest **`share_state: stopped`**). |
| **Rationale** | One video-relay reconnect surface, lower ICE/TURN friction, faster join; reliability is met by **operational isolation within one session**, not a second signaling socket that duplicates reconnect UX and connection setup cost. |

### `share_state: stopped` — host vs guest

| Actor | On **`share_state: stopped`** (broadcast or local stop) |
| --- | --- |
| **Host (publisher)** | Unpublish **`host_screen`** producers locally; may emit **`share_state: stopped`** after capture ends. **Does not** close the SFU signaling session or tear down **`participant_av`**. |
| **Guest / non-host consumer** | **Detach `host_screen` consumers only** (e.g. **`detachConsumerClass('host_screen')`**). **Preserve** SFU signaling WebSocket, **`participant_av`** tiles/consumers, and theater mic mix. **Must not** call full SFU session **`close()`** solely because of this chat-plane event. |
| **Both** | **`share_state`** remains ephemeral chat/control-plane fan-out; no Dynamo mutation. Distinct from durable **`room_mode`** / **`broadcastCaptureActive`** HTTP **`PATCH`**. |

Entering **`videoChat`** still fully stops host tab-capture and **`host_screen`** per existing product contract. **`share_state: stopped`** is the realtime hint for guests when the host stops share in **theater** mode.

### `share_state: started` — host vs guest (#146)

| Actor | **`roomMode`** | On **`share_state: started`** (broadcast or local start) |
| --- | --- | --- |
| **Host (publisher)** | **`theater`** | Apply tab-capture **`MediaStream`**; **`syncHostScreenPublish`** publishes **`host_screen`** on the existing SFU session when tracks are live. **Does not** tear down **`participant_av`**. |
| **Host (publisher)** | **`videoChat`** | **No** **`host_screen`** publish — mode keeps host-screen consumers detached. |
| **Guest / non-host consumer** | **`theater`** | **No SFU session rebuild.** Wait for host **`host_screen`** **`newProducer`** / consumer attach on the healthy signaling socket. Guest playback FSM may show **`verifying_media`** until a live video track arrives. |
| **Guest / non-host consumer** | **`videoChat`** | **Ignore** for host-screen attach — participant grid only. |
| **Both** | either | Ephemeral fan-out only; optional **`shareGeneration`** monotonic int on host outbound messages. |

### `host_screen` close — theater participant mic mix (#145)

| Trigger | Theater mix behavior |
| --- | --- |
| Guest **`share_state: stopped`** | Detach **`host_screen`** mediasoup consumers; emit consumer **`detach`** for **`host_screen`** audio; **`theaterAudioMix`** removes **`hostScreenConsumers`** only — **`participantConsumers`** unchanged. |
| SFU **`producerClosed`** (**`host_screen`**, audio) | Same consumer **`detach`** → mix path as row above. |
| Host capture stop / **`unpublishHostScreen`** | Close **`host_screen`** producers locally; participant **`participant_av`** producers and mix nodes **persist**. |
| **`avDisabled`** / room leave | Participant mix teardown per kill-switch / leave contracts — **not** a **`host_screen`**-only stop. |

### Partial producer teardown (`participant_av`)

| Action | Contract |
| --- | --- |
| **Mic mute, camera on** | **`producer.pause()`** / **`resume()`** on the audio producer only; video producer and remote tile remain. |
| **Camera off, mic on** | Close the **video** producer only (**per-kind** teardown); SFU broadcasts **`producerClosed`** with **`kind: video`**. Remote clients remove strip/grid **video** tile promptly (no frozen frame). **Audio** producer continues; theater mix retains mic. **Must not** use class-wide **`unpublishProducerClass('participant_av')`** for camera-off when mic remains on. |
| **Both off** | Close all **`participant_av`** producers for the session; full **`producerClosed`** sequence. |
| **Re-publish after partial close** | May **`produce`** new tracks on the existing send transport without full SFU session rebuild when **`supportsPublish`** is true. |

**Client publish orchestration (#143):** **`participantAvSession.syncPublish`** and **`disableCamera` / `disableMic`** implement the table above. **`disableCamera`** with mic on **must** call **`unpublishProducerKind('participant_av', 'video')`** (or close the live video producer directly) — **not** **`publishStream`**, which historically called **`unpublishProducerClass`** first (**#144** removes that coupling). **`disableMic`** with camera on closes audio only. **`toggleMicMute`** uses **`pauseProducerKind` / `resumeProducerKind`** only.

**`mediasoupSharing` session handle (#144):**

| Method | Contract |
| --- | --- |
| **`unpublishProducerKind(producerClass, kind)`** | Send **`closeProducer`** for the single live server producer in the tuple, then close the local mediasoup-client producer; SFU broadcasts **`producerClosed`** from the server producer close. No-op if absent. |
| **`unpublishProducerClass(producerClass)`** | Close **all** producers for the class — session teardown, both axes off, kill switch only. |
| **`publishStream(stream, producerClass)`** | Incremental produce: per track, skip if same track id already live; else replace that **kind** only. **Does not** close kinds missing from **`stream`**. |
| **`pauseProducerKind` / `resumeProducerKind`** | Unchanged — mic mute with camera on. |

**SFU service:** **`upsertProducer`** replaces the prior producer for the same **`(sessionId, producerClass, kind)`** tuple. When replace occurs, consumers observe **`producerClosed`** for the old **`producerId`** before **`newProducer`** for the replacement.

### Typed error catalog (by drawer)

Beyond participant A/V publish errors (**`error_state.md`**, **`authorization.md`**), clients **must** map failures to stable **`code`** values per drawer:

| Drawer | **`code`** | Typical source | Client surface |
| --- | --- | --- | --- |
| **Connectivity** | **`TURN_RELAY_REQUIRED`** | Relay mandatory for the deployment profile but no relay candidate available | Video relay status |
| **Connectivity** | **`ICE_FAILED`** | ICE connection state **`failed`** after TURN exhausted | Video relay status |
| **Signaling (SFU WS)** | **`SIGNALING_TIMEOUT`** | SFU WebSocket connect or request-ack timeout | Video relay status; maps to **`sfu_signaling_failed`** at publish toggles when blocking |
| **Media lifecycle** | **`PRODUCER_CLOSED`** | Inbound SFU **`producerClosed`** event | Stage tile detach, theater audio mix (informational at consumer boundary) |
| **Chat (room WS)** | **`CHAT_SEND_DROPPED`** | Outbound chat/react failed after client retry budget; room WS unavailable | Chat compose / chat status |

- **Separate status surfaces** for chat vs video relay (**`interface/presentation.md`**); integration assigns **`code`** values to planes, not consolidated chrome.
- Observability: **`RiffSync/Realtime`** and **`RiffSync/Media`** metrics with **`drawer`** and **`code`** dimensions (**`operations/observability.md`**).

### Chat reconnect vs SFU lifecycle (decoupling)

| Rule | Contract |
| --- | --- |
| **Orthogonal lifecycles** | Room WebSocket (chat, presence, **`share_state`**) and SFU signaling WebSocket **recover independently**. A healthy plane **keeps running** while the other reconnects. |
| **Prohibited coupling** | Room WS handlers (**including **`share_state`**) **must not** invoke SFU session **`close()`** without an explicit **media policy** (user leave, AV kill switch, intentional unpublish). Chat disconnect **must not** reset participant AV publish state when the SFU WS remains connected. |
| **Publish gate (server)** | **`POST /v1/webrtc/sfu-token`** still requires an active room WS **presence row** + **`X-Session-Id`**. After room WS reconnect, the client re-establishes presence before re-mint when needed. |
| **Publish gate (client — #148)** | **`canParticipantAvPublish`** uses **`fanToken`** + **`!avDisabled`** only — **no `wsOpen`**. Chat disconnect **must not** reset participant AV publish intent when SFU signaling stays connected. SFU signaling reconnect **must not** call **`resetOnReconnect`** teardown that clears toggle intent; preserve intent and **`syncPublish`** on re-**`attachSession`**. |
| **Chat send while SFU degraded** | SFU outage **does not** block chat send when room WS is **`open`**. **`ChatSession.send`** returns **`false`** (surfacing **`CHAT_SEND_DROPPED`**) only on chat-plane failure. **No** outbound retry queue. Compose draft **retained** on drop (**#149**). |

### Application SDK boundary (integration surface)

Hardening extracts **ChatSession**, **SfuMediaSession**, and **TheaterPlayback** from monolithic room orchestration. **Normative public integration surface** for code outside **`apps/web/src/room/sessions/`**:

| Method | Responsibility |
| --- | --- |
| **`join(roomId, options)`** | Bootstrap per **`startup_bootstrap.md`**: construct session modules, open room WS, warm ICE, connect SFU consumer baseline, init **`TheaterPlayback`** when Theater layout. **`options`** include pre-fetched **`RoomSnapshot`**, **`sessionId`**, display name, optional fan JWT, API/WS URLs, host role hint. Returns **`RoomRealtimeSdk`** — no raw sockets. |
| **`publishAv({ camera, mic })`** | Participant A/V produce path on **`SfuMediaSession`**; idempotent partial unpublish. |
| **`subscribe(handlers)`** | Register **`hostScreen`** / **`participantAv`** handler groups; SFU consumer attach + theater mix wiring. |
| **`getDiagnostics()`** | **`RoomRealtimeDiagnostics`** snapshot (see below). |
| **`teardown()`** | Intentional room leave: torn-down all drawers, release media handles. |

Implementation: **`apps/web/src/room/sessions/RoomRealtimeSdk.ts`**. Internal session modules **must not** cross-call destructive teardown across drawers without explicit media policy.

#### `RoomRealtimeDiagnostics` shape (#139)

Stable JSON field names for PR harness assertions and fan-visible status mapping (**`execution_model.md`**):

| Field | Type | Notes |
| --- | --- | --- |
| **`roomId`** | string | Canonical room id |
| **`sessionId`** | string | Guest **`sessionId`** for this tab |
| **`asOf`** | string | ISO-8601 snapshot time |
| **`drawers.chat`** | object | **`{ state, lastErrorCode? }`** — maps to chat sidebar status |
| **`drawers.sfuSignaling`** | object | Signaling WS lifecycle + nested maintainer health (**#158**); see below |
| **`drawers.theaterPlayback`** | object | **`{ state, lastErrorCode?, audioContextState?, guestShareFsm? }`** — theater mix / iframe drawer |
| **`activeErrorCodes`** | string[] | User-visible blocking codes only (**#141**) — excludes informational **`PRODUCER_CLOSED`** |

**`drawers.sfuSignaling` shape:**

| Field | Type | Notes |
| --- | --- | --- |
| **`state`** | enum | Signaling WebSocket lifecycle — maps to video-relay banner |
| **`lastErrorCode?`** | string | Signaling-class codes (**`SIGNALING_TIMEOUT`**, config errors, **`SFU_TOKEN_DENIED`**) |
| **`role?`** | `'producer' \| 'consumer'` | Active SFU join role when signaling **`open`** |
| **`health.connectivity`** | object | **`{ state, lastErrorCode?, iceConnectionState? }`** — ICE/TURN transport health (**#158**) |
| **`health.produceConsume`** | object | **`{ state, lastErrorCode?, producerCount?, consumerCount?, hostScreenAttached?, participantAvPublishActive? }`** — mediasoup producer/consumer plane (**#158**) |

**`iceConnectionState`** when present mirrors **`RTCPeerConnection.iceConnectionState`**: **`new`**, **`checking`**, **`connected`**, **`completed`**, **`failed`**, **`disconnected`**, **`closed`**.

**`state`** on every drawer and health object: **`connected` \| `reconnecting` \| `degraded` \| `torn-down`**. UI reads **`drawers.chat`** and **`drawers.sfuSignaling.state`** **independently** — health sub-objects are for harness, support, and logs alignment (**#157**), not new fan banners.

**Dev-only:** **`realtimeDiagnostics.ts`** timeline (`?diag=1`) is **not** **`getDiagnostics()`** — maintainers use it for WS counters and role probes.

## Decisions (typed errors — #141)

| Topic | Decision |
| --- | --- |
| **Chat send before `CHAT_SEND_DROPPED`** | **No outbound retry queue** (aligned with #140 drop policy). Emit **`CHAT_SEND_DROPPED`** on first failed send when room WS is not **`open`** or send throws while chat plane is unhealthy. |
| **`SIGNALING_TIMEOUT` deadline** | **15 seconds** wall clock for SFU signaling connect and per-RPC request-ack (join, produce, consume). |
| **`ICE_FAILED` timing** | Surface immediately on ICE **`failed`**. On ICE **`disconnected`**, surface **`ICE_FAILED`** after **10 seconds** without recovery to **`connected`**. |
| **`PRODUCER_CLOSED` UX** | **Tile-only** — not listed in **`activeErrorCodes`**; no standalone status chrome (**`error_state.md`**). |
| **`activeErrorCodes` scope** | User-visible blocking codes only — excludes lifecycle pseudo-codes (**`CHAT_RECONNECTING`**) and informational **`PRODUCER_CLOSED`**. |

## Decisions (answered — presence and AV maturity)

| Question | Decision |
| --- | --- |
| Active signal set? | **Union** — **`typing_start`**, **`chat`** / **`chat_gif`**, **`react`**, and qualifying **`ping`** within the active window all mark a participant **active**. |
| Active idle window? | **2 minutes** after last qualifying signal. |
| **`lastActiveAt` durability? | **Yes** — persist on **RoomPresence**; **`presence_request`** and roster fan-out rehydrate **active** for late joiners and refresh after reconnect. |
| Join/leave chat lines? | **Signed-in fans only** — ephemeral room WebSocket fan-out; **not** **RoomChat**; guests connect silently. |
| Video Chat mode while A/V matures? | **Keep** in host control bar without **Beta** or **Experimental** labeling when **`avDisabled`** is false. |
| Server-side theater audio mix? | **Later phase** — client Web Audio equal-gain mix remains normative until a follow-on initiative. |
| Speaking indicator scope? | **Video tiles plus People tab** — speaking affordance on Theater strip and Video Chat grid when video is on; **mic-only** participants show speaking state on **People** roster rows only (no new stage chrome). |
| SFU decoupling depth? | **Single SFU signaling WebSocket per tab** with **mandatory per-class send transport isolation** — not dual signaling WebSockets. |

## Open implementation details

- Concrete **OpenAPI** / generated types land with first implementation.
- **Rate limits:** start with **API Gateway throttles** + optional **WAF rate-based rules** on hot public routes; **no fixed commercial SLA**—operators tune for **cost vs abuse** (see **`operations/observability.md`**).

## Open implementation decisions

- **Server-side catalog `catalog` / `catalogs` query params:** **Out of scope** for catalog subcategory SPA browse. If a future initiative moves catalog filtering to the API (for payload size or cache variants), that is a new contract change; do not treat subcategory routes as requiring it now.

### friends-and-direct-messaging (paths, envelopes, codes)

- DM send HTTP path, realtime push topology, and send failure **`code`** — **#360**.
- Unread wire: per-friend count vs boolean, aggregate badge field(s), clear-on-view acknowledgment body shape — **#361**.
- Rate-limit numeric thresholds for DM send (friend-request bands decided above).
- IaC / env names for DM unread table or co-located unread items — **#361** ( **`DM_THREADS_TABLE_NAME`** / **`DIRECT_MESSAGES_TABLE_NAME`** decided #359).

## Decisions (answered — M22 presence routes)

| Topic | Decision |
| --- | --- |
| **`typing` outbound envelope** | **`type: typing`** with **`action`**: **`start`** \| **`stop`**, **`sessionId`**, optional **`displayName`**, **`ts`** (epoch ms). One sender per event — not a full-room typing set snapshot. |
| **`chat_system` outbound envelope** | **`type: chat_system`** with **`event`**: **`join`** \| **`leave`**, **`sessionId`**, **`displayName`**, **`ts`** (epoch ms). No **`avatarUrl`** on system lines in MVP. |
| **`presence` member fields** | Include **both** server-precomputed **`active`** and optional **`lastActiveAt`** (epoch seconds) on each roster member after M22. |
| **API Gateway route keys** | **`typing_start`**, **`typing_stop`** registered in **`api-catalog-stack.ts`** with **`ws-route.ts`** handler (same integration as **`chat`** / **`react`**). |
| **Server typing coalesce** | Ignore duplicate **`typing_start`** from the same **`sessionId`** within **1s** before **`PostToConnection`**. |
| **Client typing stop triggers** | **`typing_stop`** on message send, compose blur, or **3s** compose idle without keystroke; **300ms** trailing debounce before emitting **`typing_start`**. |
| **Reconnect join line** | **No** duplicate **`join`** when the same **`fanSub`** reconnects within **30s** of prior disconnect (connect-handler cooldown). |

## Primary code pointers (optional)

- When added: `openapi.yaml` or CDK route definitions.
- **`apps/web/src/room/sfu/participantAvSession.ts`** — **`syncPublish`**, **`disableCamera`**, **`disableMic`** per-kind teardown (**#143**).
- **`apps/web/src/room/sfu/mediasoupSharing.ts`** — **`unpublishProducerKind`**, incremental **`publishStream`** (**#144**).
- **WebSocket route keys (post-#135):** **`$connect`**, **`$disconnect`**, **`ping`**, **`presence_request`**, **`chat`**, **`chat_gif`**, **`react`**, **`typing_start`**, **`typing_stop`**, **`share_state`**, **`leave`**, **`$default`** — defined in **`infra/cdk/lib/api-catalog-stack.ts`**; handlers in **`infra/cdk/lambda/ws-route.ts`** (no **`signaling`** route).
