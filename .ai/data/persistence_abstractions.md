# Persistence abstractions

Storage responsibilities; physical layout is IaC (**`architecture.server.md`**).

## DynamoDB physical layout (decision)

**Multiple tables** (not a single generic “app” table) to keep access patterns and IAM obvious for contributors and to tune **TTL / billing** per workload:

| Table (conceptual name) | Holds |
| --- | --- |
| **Catalog** | Canonical episode rows served by **`GET /v1/catalog`**; reconcile writers update TMDB-aligned fields. |
| **Rooms** | One authoritative item per **`roomId`** (playback, **`hostSub`**, **`lastActivityAt`**, visibility, advisory **`playbackExpectation`**). |
| **Connections** | Ephemeral **`connectionId → roomId`** (+ **`sessionId`** metadata) for WebSocket fan-out; **TTL** on disconnect/stale rows where useful. |
| **Lists** *(when shipped)* | Curated list meta + membership rows (**`docs/architecture.admin.md`**). |
| **FanProfiles** | **`sub`** → **`displayName`**, optional **`avatarUrl`** / timestamps (signed-in fan continuity). |
| **Events** *(optional)* | Append-only audit per admin docs—add when needed. |

Exact CloudFormation resource names are **IaC**; logical keys/GSIs follow **access pattern contracts** below.

## System of record

| Store | Holds |
| --- | --- |
| **DynamoDB** | Tables above — **catalog**, **rooms**, **websocket connections**, optional **lists**, **profiles**, **append-only events**. |
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
| **Connection map** | Fast **Put/Delete** on connect/disconnect; query by **`roomId`** for fan-out (data model keyed accordingly). |

## Decisions (answered)

| Question | Decision |
| --- | --- |
| S3 as catalog source of truth? | **No** for live app — **Dynamo** (JSON seed imports only). |
| Event sourcing for rooms? | **No** MVP — snapshot document + optional streams for analytics only. |

## Primary code pointers (optional)

- CDK/SAM table definitions.
