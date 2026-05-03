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
| **`hostSub`** | Cognito **`sub`** of the user who **`POST /v1/rooms`** — immutable host binding for MVP; only this principal may **publish WebRTC** / mutate authoritative playback fields. |
| **`lastActivityAt`** | Updated on meaningful traffic: signaling traffic if counted, chat, join, **`ping`**, admin embed control events as implemented. |

## Connection (WebSocket mapping)

Ephemeral **`connectionId` → roomId`** (+ **`sessionId`** metadata) for **`PostToConnection`** targeting—see **`architecture.server.md`**.

## Curated list (when shipped)

| Entity | Contract |
| --- | --- |
| **List** | **`slug`**, **`title`**, **`visibility`** (draft/public), **`sortRule`**. |
| **Membership** | Ordered **`catalogEpisodeId`** references — referential integrity on write. |

## Optional: profile, audit events

**`USER#sub`**, **`EVT#...`** patterns per admin/observability docs—defer until needed.

## Decisions (answered)

| Question | Decision |
| --- | --- |
| Store TMDB `original_title`? | **No**. |
| Single table vs multi-table Dynamo? | **Multiple tables** (physical separation for clarity, IAM, and TTL): at minimum **`Catalog`**, **`Rooms`**, **`Connections`** (WebSocket **`connectionId → roomId`** mapping). Add **`Lists`** (and optional **`Events`** / **`Profiles`**) when those features ship—see **`persistence_abstractions.md`** and **`docs/architecture.server.md`**. |

## Primary code pointers (optional)

- **`data/catalog/catalog.schema.json`** (git seed subset).
