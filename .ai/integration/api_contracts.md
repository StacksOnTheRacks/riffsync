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
| **`POST /v1/rooms` (create)** | **Fan Cognito JWT** — **`hostSub`** on new room **= JWT `sub`**. **`sessionId`** optional telemetry only—**not** host binding. | Mint **`roomId`**, seed **`catalogEpisodeId`** / visibility / **`playbackExpectation`** per payload. |
| **`GET /v1/rooms/:id`**, **`GET /v1/lobby`**, lobby joins | **`sessionId`** via **`X-Session-Id`** (guest); optional JWT if viewer signs in. | Read snapshots for lobby/detail/join validation. |
| **`PATCH` / `PUT` … room playback metadata** | **Fan JWT**; **`JWT.sub === room.hostSub`**. | **Mutable current episode**, advisory labels, visibility flags—conditional **`version`** writes. |
| **`GET /v1/health`** | None. | **Normative** liveness path (matches **`/v1`** versioning). Smoke: process up + critical dependencies **best-effort** (Dynamo **DescribeTable** or shallow read—**IaC** chooses depth vs cold-start cost). |
| **`GET /v1/fans/me`**, **`PATCH /v1/fans/me`** | **Fan Cognito JWT**. | Read/update **`displayName`** on **FanProfiles** row keyed by **`sub`**; **`GET`** also returns optional **`avatarUrl`** / **`avatarUpdatedAt`**. |
| **`POST /v1/fans/me/avatar`** *(multipart body; presigned PUT deferred)* | **Fan Cognito JWT**. | Upload/replace **one** avatar image; persists **`avatarUrl`** + **`avatarUpdatedAt`** on FanProfiles; object in **S3** served via **public HTTPS** (see **`data_model.md`**). |
| **`GET /v1/giphy/search`** | **Fan Cognito JWT**. | Server-side **Giphy** search proxy; returns normalized GIF candidates for compose UI; **API key never in browser**. |
| **`/v1/admin/*`** | **Staff-only** Cognito JWT (separate pool or app client). | Full route surface aligned with **`docs/architecture.admin.md`** (summary below). **CloudWatch** remains the primary ops chart layer. |

**Admin HTTP (normative summary — detail in `docs/architecture.admin.md`):**

| Verb / path | Purpose |
| --- | --- |
| **`POST`**, **`PATCH`**, **`DELETE /v1/admin/catalog/episodes/:id`** | Catalog CRUD; payload compatible with **`data/catalog/catalog.schema.json`** (+ Dynamo-only fields per **`docs/architecture.catalog-images.md`**). |
| **`POST /v1/admin/catalog/import`** | Bulk import before promoting catalog (**multipart** or **S3**-referenced payload—see admin doc). |
| **`POST`**, **`PATCH /v1/admin/lists`** | Create/update curated list meta (**`slug`**, **`title`**, **`visibility`**, **`sortRule`**, optional hero). |
| **`PUT /v1/admin/lists/{slug}/order`** | Replace membership ordering. |
| **`POST /v1/admin/lists/{slug}/members`** | Add/remove/reorder entries; **referential integrity** on **`catalogEpisodeId`**. |
| **`GET /v1/admin/reporting/...`** *(optional)* | CSV/UI drill-down; **not** required for core KPIs (**CloudWatch** first). |

## WebSocket (API Gateway WebSocket API)

- **Routes:** **`$connect`**, **`$disconnect`**, and application routes for **WebRTC signaling** (SDP / ICE relay — schemas TBD), **`chat`** (text/emoji and **Giphy GIF** posts), **`react`** (emoji reaction add/remove on a **`messageId`**), **`ping`** (liveness for **`lastActivityAt`**).
- **Chat payloads (broadcast):** discriminated by **`type`** — e.g. **`chat`** (text/unicode emoji), **`chat_gif`** (**`giphyId`**, rendition URL, optional title/dimensions), **`chat_reaction`** (**`messageId`**, emoji, **`action`**: add | remove, **`sessionId`** / sender identity). Each chat line carries client-generated **`messageId`** (UUID) within scrollback. Server enriches with **`displayName`** and optional **`avatarUrl`** for signed-in senders.
- **Send auth:** **`chat`**, **`chat_gif`**, and **`react`** require **fan JWT** on the connection (or per-action validation); anonymous **`sessionId`** connections are **receive-only** for chat fanout.
- **Connect context:** **`roomId`** required; **`sessionId`** for guest envelope; **`Authorization`** **required** when connection assumes **publisher/admin** role — **`JWT.sub`** must equal **`room.hostSub`** after load.
- **Room-admin only:** durable playback-intent updates and **signaling publisher role**; server validates **`JWT.sub === hostSub`** before accepting publisher-bound envelopes or mutating authoritative room fields.
- **Broadcast:** Lambda uses **`execute-api:ManageConnections`** **`PostToConnection`** to room members after durable room write succeeds (ordering: best-effort; see consistency contract).

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
| **WebSocket** | Subject to **API Gateway** account/service quotas; design for **≤50 concurrent connections per room** under normal use (matches participant cap). |

## Decisions (answered)

| Question | Decision |
| --- | --- |
| Single BFF vs split admin API? | **Start:** one HTTP API with **`/v1/admin/*`**; split later for blast radius (**`architecture.admin.md`**). |
| Public catalog without auth? | **Yes** for **`GET /v1/catalog`** (and public lists). |
| WebSocket auth for guests? | **sessionId** sufficient for MVP; JWT optional enhancement for abuse resistance. |
| Admin verification MVP? | **`JWT.sub === room.hostSub`** for **`POST /v1/rooms`**, **`PATCH`/`PUT`**, and publisher signaling; **anonymous guests** never satisfy this check. |
| GIF provider? | **Giphy** only for this product slice; server-side search + Giphy CDN renditions in messages (**`external_systems.md`**). |
| Guest chat send / react? | **Fan JWT required** to send text/emoji/GIF and to add/remove reactions; guests **view only**. |

## Open implementation details

- Concrete **OpenAPI** / generated types land with first implementation.
- **Rate limits:** start with **API Gateway throttles** + optional **WAF rate-based rules** on hot public routes; **no fixed commercial SLA**—operators tune for **cost vs abuse** (see **`operations/observability.md`**).

## Primary code pointers (optional)

- When added: `openapi.yaml` or CDK route definitions; WebSocket route keys.
