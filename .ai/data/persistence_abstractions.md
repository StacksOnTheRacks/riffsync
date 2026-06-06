# Persistence abstractions

Storage responsibilities; physical layout is IaC (**`architecture.server.md`**).

## DynamoDB physical layout (decision)

**Multiple tables** (not a single generic “app” table) to keep access patterns and IAM obvious for contributors and to tune **TTL / billing** per workload:

| Table (conceptual name) | Holds |
| --- | --- |
| **Catalog** | Canonical episode rows served by **`GET /v1/catalog`**; reconcile writers update TMDB-aligned fields. |
| **Rooms** | One authoritative item per **`roomId`** (playback, **`hostSub`**, **`lastActivityAt`**, visibility, advisory **`playbackExpectation`**, host admin AV/layout: **`roomMode`**, **`avDisabled`**, **`broadcastCaptureActive`**, **`version`**). |
| **Connections** | Ephemeral **`connectionId`** primary key → **`roomId`** (+ **`sessionId`** metadata) for **`PostToConnection`** reverse lookup on **`$disconnect`**. |
| **RoomPresence** | Ephemeral roster rows keyed **`roomId`** + **`presenceKey`** (**`sessionId#connectionId`**); **`fanSub`** / **`hostSub`**, display metadata, **TTL** **`expiresAt`**. Queried by **`roomId`** for roster broadcast and **consistent-read** SFU token presence checks. |
| **Lists** *(when shipped)* | Curated list meta + membership rows (**`docs/architecture.admin.md`**). |
| **FanProfiles** | **`sub`** → **`displayName`**, optional **`avatarUrl`** / timestamps (signed-in fan continuity). |
| **Events** *(optional)* | Append-only audit per admin docs—add when needed. |

Exact CloudFormation resource names are **IaC**; logical keys/GSIs follow **access pattern contracts** below.

## System of record

| Store | Holds |
| --- | --- |
| **DynamoDB** | Tables above — **catalog**, **rooms**, **websocket connections**, **room presence**, **fan profiles**, optional **lists**, **append-only events**. |
| **SFU process memory** | **mediasoup** routers, transports, producers/consumers per room — **not** Dynamo or S3; authoritative for **active media tracks** until disconnect or kill-switch tear-down. |
| **Secrets Manager** | TMDB credential, **Giphy API key**, Cognito-independent secrets only where needed. |
| **S3** | **Fan avatar** objects (public HTTPS via CDN); catalog/asset buckets per **`docs/architecture.catalog-images.md`**. |

## Cache (optional)

| Store | Holds |
| --- | --- |
| **ElastiCache** (Redis/Valkey-compatible) | **Read-through** full catalog blob and/or lobby denormalization. **Never** authoritative; invalidated on catalog writes / TTL / ETag bump. |

## Access pattern contracts

| Pattern | Requirement |
| --- | --- |
| **Catalog read (hot)** | Prefer O(1) **GetItem**/GSI patterns for single episode; **`GET /v1/catalog`** may **Scan**/export job with cache for full list. |
| **Room write** | Single **authoritative item** per **`roomId`**; conditional writes for host checks when needed. |
| **Connection map** | Fast **Put/Delete** on connect/disconnect; **`GetItem`** by **`connectionId`** on **`$disconnect`**. |
| **RoomPresence roster** | **Query** all rows for **`roomId`** (strongly consistent read for token mint); **TransactWrite** with **Connections** on connect; delete matching **`presenceKey`** on disconnect; **TTL** cleanup for stale rows. |
| **SFU producer registry** | In-memory per **`env:roomId`**; migrate from **`producersByKind`** (one slot per **`kind`**) to **multi-producer** registry keyed by producer id with participant identity metadata. |

## Decisions (answered)

| Question | Decision |
| --- | --- |
| S3 as catalog source of truth? | **No** for live app — **Dynamo** (JSON seed imports only). |
| Event sourcing for rooms? | **No** MVP — snapshot document + optional streams for analytics only. |
| Participant A/V bytes in Dynamo? | **No** — SFU runtime only; toggle intent not on **RoomPresence**. |

## Open implementation decisions

- **RoomPresence** vs **Connections** disconnect path: confirm both rows are removed atomically and **`broadcastRoomPresence`** ordering on churn at party scale.
- SFU multi-producer registry structure (map key, **`tearDownSession`** per-session vs room-wide wipe) and idle room close when only consumers remain.
- Kill-switch enforcement storage touchpoints: read **`avDisabled`** on **`POST /v1/webrtc/sfu-token`**, SFU **`produce`**, and whether Lambda triggers SFU admin tear-down vs client-only close.
- IaC env wiring already passes **`ROOM_PRESENCE_TABLE_NAME`** to WS and SFU-token Lambdas — document any additional consumers (e.g. layout fan-out Lambda).

## Primary code pointers (optional)

- CDK/SAM table definitions.
