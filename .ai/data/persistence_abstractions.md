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
| **RoomChat** | Bounded room chat retention keyed **`roomId`** + **`sk`**. Message rows use **`m#<ts>#<messageId>`**; active reaction rows use **`r#<messageId>#<emoji>#<sessionId>`**. **TTL** **`expiresAt`**. Queried on **`presence_request`** to post requester-only **`chat_history`**. |
| **Lists** *(when shipped)* | Curated list meta + membership rows (**`docs/architecture.admin.md`**). |
| **FanProfiles** | **`sub`** → **`displayName`**, optional **`avatarUrl`** / timestamps (signed-in fan continuity). |
| **FriendshipRequests** *(logical)* | Durable pending invite rows (**`requestId`**, **`requesterSub`**, **`recipientSub`**, **`status: pending`**, **`pairKey`**, **`createdAt`**) before a friendship edge. **Hard-deleted** on accept, decline, or cancel. |
| **Friendships** *(logical)* | Durable mutual edges keyed **`pairKey`** until remove-friend / account lifecycle. GSI on **`fanSub`** for list-my-friends. |
| **DmThreads** / **DirectMessages** *(logical)* | Account-lifetime 1:1 DM thread metadata and message bodies — **distinct** from **RoomChat**. **No** RoomChat-style TTL on DM bodies. |
| **FanConnections** *(logical)* | Ephemeral **Fan DM WebSocket** **`connectionId` → fanSub** mapping for **`PostToConnection`** to a fan's open DM push connections — **distinct** from room **`Connections`** (**`roomId`**-scoped). |
| **DmUnread** *(logical)* | Per-recipient read cursors for DM threads — dedicated table (#361). PK **`recipientSub`**, SK **`pairKey`**; attributes **`lastReadSentAt`**, **`lastReadMessageId`**, **`hasUnread`**, **`updatedAt`**. |
| **Events** *(optional)* | Append-only audit per admin docs—add when needed. |

Exact CloudFormation resource names are **IaC**; logical keys/GSIs follow **access pattern contracts** below. Friends/DM physical table names and GSIs remain open implementation decisions.

## System of record

| Store | Holds |
| --- | --- |
| **DynamoDB** | Tables above — **catalog**, **rooms**, **websocket connections**, **room presence**, **room chat**, **fan profiles**, **friendship requests**, **friendships**, **DM threads/messages**, **DM unread**, optional **lists**, **append-only events**. **No new RDBMS** for friends/DM. |
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
| **RoomPresence roster** | **Query** all rows for **`roomId`** (strongly consistent read for token mint); **TransactWrite** with **Connections** on connect; delete matching **`presenceKey`** on disconnect; **TTL** cleanup for stale rows. **`broadcastRoomPresence`** collapses multiple rows sharing **`sessionId`** (multi-tab): host flag dominates; outbound **`presence`** roster is sorted **host first**, then **`displayName`** case-insensitive **`localeCompare`** — stable on connect/disconnect churn. |
| **SFU producer registry** | In-memory per **`env:roomId`**; migrate from **`producersByKind`** (one slot per **`kind`**) to **multi-producer** registry keyed by producer id with participant identity metadata. |
| **List my friends** | Query durable **Friendship** edges for the caller's **`fanSub`**; resolve display/avatar via **FanProfiles**. |
| **Pending friendship requests** | Query open **FriendshipRequest** rows by recipient and/or requester **`sub`**. |
| **Open 1:1 DM thread** | Resolve **DmThread** for unordered fan pair via **ensure-on-open** (**`PUT /v1/dm/threads/{peerSub}`** — #359); require active **Friendship**. |
| **Page DM history** | **Query** **DirectMessages** by **`pairKey`**, **`ScanIndexForward: false`**, paginated with **`before`** cursor (#359). Account-lifetime retention (no TTL window). |
| **DM unread** | **GetItem** / **BatchGetItem** **DmUnread** by recipient **`fanSub`** + friend **`pairKey`** for **`GET /v1/friends`**. **UpdateItem** on send (set **`hasUnread: true`**) and on **`POST .../read`** (monotonic cursor + **`hasUnread`** recompute). |
| **Friends online (derived)** | For each friend **`fanSub`**, treat as online if any **RoomPresence** row exists for that **`fanSub`** in any room. Query sparse **RoomPresence** GSI **`fanSub`** + **`roomId#presenceKey`** with **`Limit: 1`** per peer (#357). Not a durable friends-presence table; not last-seen. |
| **Remove-friend** | **TransactWrite** (preferred when **DmThreads** table wired): **DeleteItem** **Friendship** by **`pairKey`** + **UpdateItem** **DmThread** **`status: closed`**, **`closedAt`**. Until **DmThreads** exists, friendship-only **DeleteItem** is sufficient; M35 denies DM routes on missing friendship. **DirectMessage** bodies are **not** deleted on unfriend. |

## Decisions (answered)

| Question | Decision |
| --- | --- |
| S3 as catalog source of truth? | **No** for live app — **Dynamo** (JSON seed imports only). |
| Event sourcing for rooms? | **No** MVP — snapshot document + optional streams for analytics only. |
| Participant A/V bytes in Dynamo? | **No** — SFU runtime only; toggle intent not on **RoomPresence**. |

## Decisions (answered — realtime hardening)

| Question | Decision |
| --- | --- |
| **`broadcastRoomPresence`** roster sort on churn? | **Host first**, then **`displayName`** case-insensitive **`localeCompare`**; collapse duplicate **`sessionId`** rows with host flag dominance before sort. |

## Decisions (answered — friends and direct messaging)

| Question | Decision |
| --- | --- |
| Friends/DM SoR? | **DynamoDB** only — same class as **FanProfiles** / **RoomChat**; **no new RDBMS** or external social SaaS. |
| DM vs RoomChat tables? | **Distinct logical persistence** — DM history is not stored as **RoomChat** room-partitioned rows. |
| DM body TTL? | **None** for account-lifetime retention (RoomChat keeps **`expiresAt`** TTL). Purge on explicit delete / account closure only. |
| Pending requests durable? | **Yes** — **FriendshipRequest** rows exist before the edge; **hard-deleted** on terminal transitions (#356). |
| Friends online materialization? | **Ephemeral derivation** from **RoomPresence**; do not add durable last-seen attributes for this product meaning. |

## Decisions (answered — friendship invite/accept lifecycle #356)

| Question | Decision |
| --- | --- |
| **Physical tables** | Dedicated **`FriendshipRequests`** and **`Friendships`** Dynamo tables (env-suffixed names in IaC). |
| **FriendshipRequests keys** | PK **`requestId`**; GSI **`recipientSub`** + **`createdAt`**; GSI **`requesterSub`** + **`createdAt`**; sparse GSI **`pairKey`** for pending uniqueness. |
| **Friendships keys** | PK **`pairKey`**; GSI **`fanSub`** + SK **`pairKey`**. |
| **Env vars** | Lambdas receive **`FRIENDSHIP_REQUESTS_TABLE_NAME`**, **`FRIENDSHIPS_TABLE_NAME`**. Friends-list handler also receives **`FAN_PROFILES_TABLE_NAME`**, **`ROOM_PRESENCE_TABLE_NAME`**. |

## Decisions (answered — friends list and online #357)

| Question | Decision |
| --- | --- |
| **RoomPresence GSI for online?** | **Yes** — sparse GSI PK **`fanSub`**, SK **`roomId#presenceKey`** on existing **RoomPresence** table. |
| **GSI projection / TTL?** | Project keys needed for existence check; base-table **`expiresAt`** TTL unchanged. |
| **Friends-list Lambda grants?** | Read **Friendships** (GSI **`fanSub`**), batch **FanProfiles**, query **RoomPresence** GSI per peer (or bounded parallel queries). |

## Decisions (answered — mutual remove-friend #358)

| Question | Decision |
| --- | --- |
| **Remove write shape?** | **TransactWrite** when **DmThreads** table exists: delete **Friendship** + update **DmThread** closed fields. Friendship-only delete until M35 creates threads. |
| **Message body delete on unfriend?** | **No** — retain **DirectMessage** rows; access closed via authz. |
| **Remove-friend Lambda env** | Receives **`FRIENDSHIPS_TABLE_NAME`**; **`DM_THREADS_TABLE_NAME`** when M35 table ships (optional until then). |

## Decisions (answered — DM thread open and history #359)

| Question | Decision |
| --- | --- |
| **Physical tables** | Dedicated **`DmThreads`** and **`DirectMessages`** Dynamo tables (env-suffixed names in IaC). Dedicated **`DmUnread`** table (#361). |
| **DmThreads keys** | PK **`pairKey`** (`min(subA)#max(subB)`). Attributes: **`subA`**, **`subB`**, **`status`**, **`openedAt`**, optional **`closedAt`**, **`updatedAt`**. |
| **DirectMessages keys** | PK **`pairKey`**, SK **`m#<sentAtMs>#<messageId>`** (13-digit zero-padded ms). Query newest-first for history page. |
| **Open thread pattern** | **ensure-on-open** via **`PUT /v1/dm/threads/{peerSub}`** after **Friendship** check; **PutItem** when missing. |
| **History page pattern** | **`Query`** on **`DirectMessages`** by **`pairKey`**, **`ScanIndexForward: false`**, **`Limit`**, **`ExclusiveStartKey`** from **`before`** cursor. |
| **DM Lambda env** | **`DM_THREADS_TABLE_NAME`**, **`DIRECT_MESSAGES_TABLE_NAME`**, **`FRIENDSHIPS_TABLE_NAME`**. Remove-friend handler also receives **`DM_THREADS_TABLE_NAME`**. |

## Decisions (answered — DM realtime send/receive #360)

| Question | Decision |
| --- | --- |
| **FanConnections table** | Dedicated Dynamo table (env-suffixed). PK **`connectionId`**. Attributes: **`fanSub`**, **`connectedAt`**, optional **`sessionId`**. Sparse GSI PK **`fanSub`**, SK **`connectionId`**. |
| **Write path** | Fan DM WS **`$connect`** **PutItem**; **`$disconnect`** **DeleteItem**. |
| **Fan-out query** | On send, **Query** GSI by recipient **`fanSub`**; **`PostToConnection`** each **`connectionId`**. |
| **Send Lambda env** | **`DM_THREADS_TABLE_NAME`**, **`DIRECT_MESSAGES_TABLE_NAME`**, **`FRIENDSHIPS_TABLE_NAME`**, **`FAN_CONNECTIONS_TABLE_NAME`**, **`FAN_PROFILES_TABLE_NAME`**, **`DM_UNREAD_TABLE_NAME`** (recipient **`hasUnread`** on persist — #361), Fan DM WS **`execute-api:ManageConnections`** grant. |
| **Not room Connections** | DM push **must not** query room **`Connections`** by **`roomId`**. |

## Decisions (answered — DM unread #361)

| Question | Decision |
| --- | --- |
| **DmUnread table keys** | PK **`recipientSub`**, SK **`pairKey`**. Attributes: **`lastReadSentAt`**, **`lastReadMessageId`**, **`hasUnread`**, **`updatedAt`**. |
| **Env var** | **`DM_UNREAD_TABLE_NAME`** on friends-list, send, and read Lambdas. |
| **Friends-list reads** | After **Friendships** GSI query, **BatchGetItem** **DmUnread** for **`(callerSub, pairKey)`** pairs; default missing rows to **`hasUnread: false`**. |
| **Send side-effect** | After **DirectMessage** persist, **UpdateItem** recipient row **`hasUnread: true`** (create row if absent with cursor **`(0,"")`**). |
| **Read side-effect** | **`POST .../read`** monotonic max cursor; recompute **`hasUnread`** against latest **DirectMessage** SK for **`pairKey`**. |

## Open implementation decisions

- **RoomPresence** vs **Connections** disconnect path: confirm both rows are removed atomically on **`$disconnect`** at party scale.
- SFU **`listProducerSummaries`** (or successor) wire shape for layout hardening: **`sessionId`** and **`producerClass`** are in runtime today; confirm whether **`fanSub`** belongs on the summary JSON for Theater/Video Chat without a roster round-trip — see **`data_model.md`** / **`serialization.md`** (tier-TW; no Dynamo field).
- SFU multi-producer registry structure (map key, **`tearDownSession`** per-session vs room-wide wipe) and idle room close when only consumers remain.
- Kill-switch enforcement storage touchpoints: read **`avDisabled`** on **`POST /v1/webrtc/sfu-token`**, SFU **`produce`**, and whether Lambda triggers SFU admin tear-down vs client-only close.
- IaC env wiring already passes **`ROOM_PRESENCE_TABLE_NAME`** to WS and SFU-token Lambdas — document any additional consumers (e.g. layout fan-out Lambda).

## Primary code pointers (optional)

- CDK/SAM table definitions.
