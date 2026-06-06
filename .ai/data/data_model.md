# Data model

Logical entities and mandatory fields (Dynamo shape may add keys/GSIs). Seed JSON: **`data/catalog/catalog.schema.json`**, **`docs/architecture.catalog-images.md`**, **`docs/architecture.admin.md`**.

## Catalog episode (canonical library row)

Curator + enrichment merged for **`GET /v1/catalog`** output.

| Field group | Fields | Notes |
| --- | --- | --- |
| **Identity** | **`id`**, **`experimentNumber`**, **`title`**, **`era`** | **`title`** never overwritten from TMDB. |
| **YouTube** | **`youtubeVideoId`**, **`youtubeWatchUrl`** | Nullable when unknown. |
| **TMDB-aligned (nullable keys always on row in seed)** | **`tagline`**, **`posterImageUrl`**, **`backdropImageUrl`**, **`tmdbMovieId`**, **`tmdbArtworkSyncedAt`** | Filled by reconcile; see contracts. |
| **Dynamo-only (optional on seed)** | **`tmdbOverview`**, **`tmdbPopularity`**, raw **`tmdbPosterPath`**, **`tmdbBackdropPath`** | Per **`docs/architecture.catalog-images.md`**. |
| **Thumb (optional)** | **`youtubeThumbnailUrl`** | Resolved from **`img.youtube.com`** in reconcile when enabled. |

## Room (watch party)

Authoritative server state for **room identity**, **catalog selection**, **admin binding**, and **realtime housekeeping**—not frame-perfect multi-iframe sync (exact attribute names are implementation detail).

| Concept | Contract |
| --- | --- |
| **`roomId`** | Stable, shareable (**UUID v4 or equivalent**); never recycled for a different party in confusing ways. |
| **Catalog / playback intent** | **`catalogEpisodeId`** / **`videoId`** — **current** title for the room (**mutable** by **room admin** via picker; seeded at room create). Optional **`currentTime`**, **`playing`**, **`playbackRate`** if persisted for admin reconnect UX—**room admin** mutates via HTTP or WS per contracts; guests do **not** advance timeline via parallel embed state in MVP. Episode **changes** fan-out so lobby/listing metadata can track **Now watching**. |
| **`playbackExpectation`** | Enum **`premium` \| free-ad-supported`** — advisory, admin-set. |
| **`hostSub`** | Cognito **`sub`** of the user who **`POST /v1/rooms`** — immutable host binding for MVP; only this principal may **publish host tab-capture WebRTC** and mutate authoritative room admin fields. |
| **`roomMode`** | Host-authoritative layout policy: **`theater`** (default) \| **`videoChat`**. **Durable** on the room item; host **`PATCH`**; returned on room snapshot/join; late joiners inherit current mode. |
| **`avDisabled`** | Host **room-wide A/V kill switch** — when true, participant camera/mic publish and consumption revert to movie + text chat only. **Durable** on the room item; host **`PATCH`**; late joiners and refresh inherit until host re-enables. |
| **`broadcastCaptureActive`** | Host tab-capture coordination flag (already on room item via host **`PATCH`**). **Video Chat** entry may set false / clear when capture must fully stop; **Theater** return does not auto-resume capture (host must **Share Source Tab** again). |
| **`version`** | Optimistic-lock counter for host admin **`PATCH`** — concurrent conflicting writes return **`409`**. |
| **`lastActivityAt`** | Updated on meaningful traffic: signaling traffic if counted, chat, join, **`ping`**, admin embed control events as implemented. |

## RoomPresence (watch-party roster)

Ephemeral **per-connection** rows in **RoomPresence** Dynamo (distinct from **Connections** **`connectionId`** primary key). Used for roster fan-out and SFU token presence gates.

| Field | Contract |
| --- | --- |
| **`roomId`** | Partition key — room the participant is in. |
| **`presenceKey`** | Sort key — **`sessionId#connectionId`** (one row per open WebSocket). |
| **`sessionId`** | Browser tab session id (**`X-Session-Id`**); ties SFU join token to an open room WebSocket. |
| **`connectionId`** | API Gateway WebSocket connection id for **`PostToConnection`**. |
| **`fanSub`** | Optional Cognito **`sub`** when the connection is a signed-in fan (enables participant producer eligibility checks). |
| **`hostSub`** | Present when this connection slot is the room admin's signed-in session (host tab-capture producer path today). |
| **`displayName`** | Optional roster label at connect time. |
| **`connectedAt`**, **`lastSeenAt`**, **`expiresAt`** | Housekeeping; **TTL** on **`expiresAt`** (~90m) for stale row cleanup. |

**Not on RoomPresence:** participant camera/mic toggle intent — **not persisted**; reconnect defaults both **off** (privacy-first). Runtime truth for active publishes lives in **SFU producer lifecycle** plus optional WebSocket fan-out for UI layout.

## Connection (WebSocket mapping)

Ephemeral **`connectionId` → roomId`** (+ **`sessionId`** metadata) for **`PostToConnection`** targeting—see **`architecture.server.md`**. Written in the same connect transaction as the matching **RoomPresence** row.

## Curated list (when shipped)

| Entity | Contract |
| --- | --- |
| **List** | **`slug`**, **`title`**, **`visibility`** (draft/public), **`sortRule`**. |
| **Membership** | Ordered **`catalogEpisodeId`** references — referential integrity on write. |

## Fan profile (signed-in continuity)

**FanProfiles** Dynamo table — partition key **`sub`** (Cognito subject).

| Field | Contract |
| --- | --- |
| **`displayName`** | Required for PATCH; max **48** chars; shown in chat and presence. |
| **`updatedAt`** | Epoch ms on display-name write. |
| **`avatarUrl`** | Optional **public HTTPS** URL to avatar object in **S3** (+ CDN); **one** image per user; replace on upload. |
| **`avatarUpdatedAt`** | Epoch ms on avatar write. |

Avatar bytes are **not** stored in Dynamo; see **`docs/architecture.catalog-images.md`** for the same **S3 + public read** delivery pattern as catalog art.

## Optional: audit events

**`EVT#...`** patterns per admin/observability docs—defer until needed.

## Decisions (answered)

| Question | Decision |
| --- | --- |
| Store TMDB `original_title`? | **No**. |
| Single table vs multi-table Dynamo? | **Multiple tables** (physical separation for clarity, IAM, and TTL): at minimum **`Catalog`**, **`Rooms`**, **`Connections`**, **`RoomPresence`**, **`FanProfiles`**. Add **`Lists`** (and optional **`Events`**) when those features ship—see **`persistence_abstractions.md`** and **`docs/architecture.server.md`**. |
| Participant camera/mic toggle persistence? | **No** — not on **Rooms** or **RoomPresence**; reconnect defaults **off**; SFU runtime holds active producers. |
| Room mode / AV kill switch durability? | **Yes** — **`roomMode`** and **`avDisabled`** on **Rooms** item; host **`PATCH`** with **`version`** optimistic lock. |

## Open implementation decisions

- Exact Dynamo attribute keys and JSON wire names for **`roomMode`** and **`avDisabled`** (align **`room-get.ts`** / **`room-patch.ts`** response and PATCH body with **`broadcastCaptureActive`** precedent).
- Default/absent-item semantics on room create and backfill for legacy rows missing **`roomMode`** / **`avDisabled`** (expected default **`theater`** / **`false`**).
- Whether **`GET /v1/lobby`** exposes **`roomMode`** / **`avDisabled`** or only full room snapshot does.
- SFU **`listProducerSummaries`** (or successor) payload fields needed for Theater strip / Video Chat grid (**`sessionId`**, **`fanSub`**, producer class) beyond today's **`{ producerId, kind }`**.
- Whether host **`PATCH`** for **`roomMode`** and **`broadcastCaptureActive`** are one atomic write or sequenced client calls on Video Chat entry.

## Primary code pointers (optional)

- **`data/catalog/catalog.schema.json`** (git seed subset).
