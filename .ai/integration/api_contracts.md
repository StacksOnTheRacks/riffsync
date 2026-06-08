# API contracts

Normative boundaries for client ↔ RiffSync backend. Repo detail: **`docs/architecture.server.md`**, **`docs/architecture.frontend.md`**, **`docs/architecture.admin.md`**.

## Versioning

- **HTTP:** path prefix **`/v1`** for all shipped JSON APIs. Breaking changes bump major version or introduce a parallel prefix; non-breaking additive fields allowed on existing resources.
- **WebSocket:** every application payload carries a **`schemaVersion`** or **`type`** discriminator so clients can evolve without silent mis-parse.

## HTTP (API Gateway HTTP API)

| Surface | Auth | Purpose |
| --- | --- | --- |
| **`GET /v1/catalog`** | None required (public). | Canonical episode rows: curator fields + TMDB-derived + optional **`youtubeThumbnailUrl`** when implemented. **Caching:** **`Cache-Control`** with deployment-appropriate **max-age**; **`ETag`** weak validator derived from a **catalog generation** counter or **`max(updatedAt)`** in Dynamo so clients can **`If-None-Match`** (reduces egress cost when paired with CloudFront). |
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
| **`/v1/admin/*`** | **Staff-only** Cognito JWT (separate pool or app client). | Full route surface aligned with **`docs/architecture.admin.md`** (summary below). **CloudWatch** remains the primary ops chart layer. |

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

- **Routes:** **`$connect`**, **`$disconnect`**, and application routes for **WebRTC signaling** (SDP / ICE relay — schemas TBD), **`chat`** (text/emoji and **Giphy GIF** posts), **`react`** (emoji reaction add/remove on a **`messageId`**), **`ping`** (liveness for **`lastActivityAt`**), **`share_state`** (host screen-share lifecycle), **`room_mode`** (host layout: **`theater`** \| **`videoChat`**), **`av_disabled`** (host AV kill switch: **`enabled`** \| **`disabled`** or boolean **`avDisabled`**).
- **Chat payloads (broadcast):** discriminated by **`type`** — e.g. **`chat`** (text/unicode emoji), **`chat_gif`** (**`giphyId`**, rendition URL, optional title/dimensions), **`chat_reaction`** (**`messageId`**, emoji, **`action`**: add | remove, **`sessionId`** / sender identity). Each chat line carries client-generated **`messageId`** (UUID) within scrollback. Server enriches with **`displayName`** and optional **`avatarUrl`** for signed-in senders.
- **Room control fan-out (broadcast):** discriminated by **`type`** — **`share_state`** (**`state`**: **`started`** \| **`stopped`**, optional **`shareGeneration`**); **`room_mode`** (**`roomMode`**: **`theater`** \| **`videoChat`**, **`sessionId`**, **`ts`**); **`av_disabled`** (**`avDisabled`**: boolean, **`sessionId`**, **`ts`**). Host-only inbound actions mirror **`share_state`** authority (**`JWT.sub === hostSub`** on connection).
- **Send auth:** **`chat`**, **`chat_gif`**, and **`react`** require **fan JWT** on the connection (or per-action validation); anonymous **`sessionId`** connections are **receive-only** for chat fanout.
- **Connect context:** **`roomId`** required; **`sessionId`** for guest envelope; fan JWT at **`$connect`** (**query `accessToken`** or **`Authorization`**) stores **`fanSub`** and marks host publisher when **`sub === hostSub`**.
- **Room-admin only:** durable playback-intent updates, **`roomMode`**, **`avDisabled`**, and **host screen-share** signaling; server validates **`JWT.sub === hostSub`** before accepting host control envelopes or mutating authoritative room fields.
- **Broadcast:** Lambda uses **`execute-api:ManageConnections`** **`PostToConnection`** to room members after durable room write succeeds for persisted fields (**`roomMode`**, **`avDisabled`**, playback); ordering best-effort (see **`messaging_async.md`**).

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
| **Chat** | **20** chat actions per **minute** per **`sessionId`** (text, GIF post, and reaction add/remove each count; HTTP/WS enforced); ephemeral only (**no durable chat log** in Dynamo—see **`operations/security.md`**). |
| **Giphy search** | **30** search requests per **minute** per **`sub`** (HTTP; tune in IaC). |
| **Participant A/V publishers** | **8** concurrent signed-in AV publishers per room (hard ceiling; tune in IaC / SFU env). **403** or visible client error when cap hit — no auto-degrade in MVP. |
| **WebSocket** | Subject to **API Gateway** account/service quotas; design for **≤50 concurrent connections per room** under normal use (matches participant cap). |

## Decisions (answered)

| Question | Decision |
| --- | --- |
| Single BFF vs split admin API? | **Start:** one HTTP API with **`/v1/admin/*`**; split later for blast radius (**`architecture.admin.md`**). |
| Public catalog without auth? | **Yes** for **`GET /v1/catalog`** (and public lists). |
| WebSocket auth for guests? | **sessionId** sufficient for MVP; JWT optional enhancement for abuse resistance. |
| Admin verification MVP? | **`JWT.sub === room.hostSub`** for **`POST /v1/rooms`**, **`PATCH`/`PUT`**, and publisher signaling; **anonymous guests** never satisfy this check. |
| Staff auth end-to-end check? | **`GET /v1/admin/session`** under **`/v1/admin/*`** with staff JWT; validates authorizer + **`cognito:groups`** before catalog admin routes ship. |
| GIF provider? | **Giphy** only for this product slice; server-side search + Giphy CDN renditions in messages (**`external_systems.md`**). |
| Guest chat send / react? | **Fan JWT required** to send text/emoji/GIF and to add/remove reactions; guests **view only**. |
| Participant AV publish? | **Signed-in fans only**; SFU path in production; mesh dev-only (**`VITE_WEBRTC_USE_MEDIASOU_SFU`** off). |
| Room mode + AV kill switch durability? | **Durable** on room document; host **`PATCH`**; returned on snapshot/join; fan-out over WebSocket after write. |
| AV kill switch enforcement? | **Server-enforced** — deny participant producer tokens, SFU tears down participant producers, broadcast **`avDisabled`**. |
| Theater participant audio? | **Client-side mixing** — consumers attach multiple SFU audio consumers (host movie + participant mics); no server-side mixer in MVP. |
| Video Chat vs host screen? | Clients **stop consuming** host screen producer in **`videoChat`** mode; host **fully stops** tab-capture on enter (resume requires **Share Source Tab** again). |

## Decisions (answered — #101 HTTP room AV)

| Question | Decision |
| --- | --- |
| Create seeds AV fields? | **`roomMode: theater`**, **`avDisabled: false`** on Dynamo write; echoed in **`201`**. |
| Snapshot read path? | **`GET /v1/rooms/{roomId}`** returns **`roomMode`**, **`avDisabled`**, **`broadcastCaptureActive`**, **`version`**. |
| Lobby listing? | **`GET /v1/lobby`** omits **`roomMode`** and **`avDisabled`**. |
| Host PATCH partial body? | **`roomMode`** / **`avDisabled`** omit-only (no **`null`**); may combine with **`broadcastCaptureActive`** in one atomic write. |
| SPA types? | **`apps/web/src/api/roomsApi.ts`** extended in #109. |

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

## Open implementation decisions (#103 / WebSocket)

- **`room_mode`** / **`av_disabled`** vs unified host action (e.g. **`room_av_control`**) and exact inbound JSON field names; align with **`docs/contracts.websocket.md`** when updated.
- Whether host **`PATCH`** alone triggers **`PostToConnection`** fan-out or the SPA sends a follow-up WS action after successful **`PATCH`** (prefer **server fan-out after durable write** — #103).
- **`room_mode`** fan-out payload: include full room snapshot subset vs **`roomMode`** + **`ts`** only.

## Open implementation details

- Concrete **OpenAPI** / generated types land with first implementation.
- **Rate limits:** start with **API Gateway throttles** + optional **WAF rate-based rules** on hot public routes; **no fixed commercial SLA**—operators tune for **cost vs abuse** (see **`operations/observability.md`**).

## Primary code pointers (optional)

- When added: `openapi.yaml` or CDK route definitions; WebSocket route keys.
