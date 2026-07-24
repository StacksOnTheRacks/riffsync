# Data model

Logical entities and mandatory fields (Dynamo shape may add keys/GSIs). Seed JSON: **`data/catalog/catalog.schema.json`**, **`docs/architecture.catalog-images.md`**, **`docs/architecture.admin.md`**.

## Catalog episode (canonical library row)

Curator + enrichment merged for **`GET /v1/catalog`** output.

| Field group | Fields | Notes |
| --- | --- | --- |
| **Identity** | **`id`**, **`experimentNumber`**, **`title`**, **`catalog`** | **`title`** never overwritten from TMDB. **`catalog`** enum: **`joel`**, **`mike`**, **`jonah`**, **`emily`**, **`community`**, **`movie_night`**, **`riff_material`**, **`other`**. All public-facing catalog displays omit **`other`** (staff curation bucket). Public subcategory browse IA (`mst3k` / `community` / `riff-ready` / `movie-night`) is route/display grouping over this flat enum (no parent/group field; MST3K is a display-time union of **`joel`** / **`mike`** / **`jonah`** / **`emily`**). Display label for persisted **`riff_material`** may be **Riff Material** without changing the stored value. |
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
| **`visibility`** | **`public`** \| **`private`** — **`public`** rooms may appear on **`GET /v1/lobby`** while active; **`private`** rooms are link-only (no lobby index). Host **`PATCH`** may toggle after create; **`POST /v1/rooms`** defaults **`public`** from catalog. Direct **`/room/:roomId`** join is unchanged for either value. |
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
| **`lastActiveAt`** | Epoch seconds — durable last qualifying control-plane engagement for this presence row. Updated on **`typing_start`**, **`chat`** / **`chat_gif`**, **`react`**, and **`ping`** when the signal falls inside the active window. Used to rehydrate **`active`** on **`presence_request`** and roster fan-out after reconnect. |
| **`connectedAt`**, **`lastSeenAt`**, **`expiresAt`** | Housekeeping; **TTL** on **`expiresAt`** (~90m) for stale row cleanup. |
| **GSI `fanSub` + `roomId#presenceKey`** | Sparse index for friends-list **online** derivation (#357): query by peer **`fanSub`** with **`Limit: 1`** to detect any-room presence. Only rows with non-empty **`fanSub`** project into the GSI. TTL on base table unchanged. |

**Active derivation (not a stored field):** **`active`** is **true** when **`now - lastActiveAt < 120`** seconds (2-minute idle window). Qualifying signals that refresh **`lastActiveAt`** are the **union** of **`typing_start`**, outbound **`chat`** / **`chat_gif`**, **`react`**, and **`ping`** while the participant remains connected. **Online** without a recent qualifying signal yields **`active: false`**. Server **may** precompute **`active`** at broadcast time; clients **may** derive from **`lastActiveAt`** — see **`integration/api_contracts.md`**.

**Not on RoomPresence:** participant camera/mic toggle intent — **not persisted**; reconnect defaults both **off** (privacy-first). Runtime truth for active publishes lives in **SFU producer lifecycle** plus optional WebSocket fan-out for UI layout. **Typing compose state** is ephemeral fan-out only — **not** on **RoomPresence**.

## Connection (WebSocket mapping)

Ephemeral **`connectionId` → roomId`** (+ **`sessionId`** metadata) for **`PostToConnection`** targeting room **ChatSession** fan-out—see **`architecture.server.md`**. Written in the same connect transaction as the matching **RoomPresence** row.

## FanConnection (DM push WebSocket mapping)

Ephemeral **`connectionId` → fanSub`** for **Fan DM WebSocket** **`PostToConnection`** targeting—**distinct** from room **`Connections`**. Written on Fan DM WS **`$connect`** when fan JWT validates; deleted on **`$disconnect`**. **No** **`roomId`** on this row. GSI on **`fanSub`** enables 1:1 peer fan-out (#360).

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

## FriendshipRequest (pending invite)

Durable **pending** social request between two signed-in fans. Exists **before** a **Friendship** edge. Guests never appear as requester or recipient.

| Concept | Contract |
| --- | --- |
| **Participants** | Cognito fan **`sub`** pair: **`requesterSub`**, **`recipientSub`**. |
| **Lifecycle** | Created on invite send with **`status: pending`**. Terminal on **accept** (edge created, request row **hard-deleted**), **decline** (hard-deleted), or **cancel** by requester (hard-deleted). No tombstone attribute on requests for MVP. |
| **Uniqueness** | At most one open pending request per **unordered** fan pair (either direction), keyed by canonical **`pairKey`**. Same-direction re-invite while pending is idempotent (returns existing **`requestId`**). |
| **`requestId`** | UUID primary identifier for accept/decline/cancel routes. |
| **`createdAt`** | Epoch ms on create. |
| **Not a friendship** | Pending requests do **not** authorize DM compose or friends-list membership. |

## Friendship (durable edge)

Mutual social relationship between two signed-in fans. Durable until **remove-friend** or normal account lifecycle teardown. Orthogonal to ephemeral **RoomPresence** / room **People** roster.

| Concept | Contract |
| --- | --- |
| **Participants** | Unordered pair of Cognito fan **`sub`s**. |
| **`pairKey`** | **`min(subA, subB) + '#' + max(subA, subB)`** (lexicographic on **`sub`** strings). Primary key for the **Friendships** item. |
| **`createdAt`** | Epoch ms when the edge formed (accept time). |
| **Created when** | Recipient **accepts** a **FriendshipRequest**. Instant mutual-add without accept is out of scope. |
| **Remove-friend** | **Immediately mutual**: both parties lose the edge at once. No one-sided lingering friendship. |
| **DM eligibility** | Active **Friendship** is required to open/send on the pair’s 1:1 DM. |
| **Display** | Friend-row labels resolve from **FanProfiles** (`displayName`, `avatarUrl`), not from room presence labels alone. |
| **Online indicator** | **Derived**, not stored on the friendship: friend is **online** when that **`fanSub`** has at least one live **RoomPresence** row in **any** RiffSync room. Not platform-wide browsing presence, not durable last-seen, not same-room-only. |

## DmThread (1:1 conversation)

Logical **1:1** conversation for an unordered fan pair. Distinct from room-scoped **RoomChat**.

| Concept | Contract |
| --- | --- |
| **Cardinality** | One logical thread per unordered fan pair once messaging is allowed. No group DMs. |
| **Partition key** | **`pairKey = min(subA, subB) + '#' + max(subA, subB)`** — same canonical encoding as **Friendship** (#356). |
| **Participants** | Two Cognito fan **`sub`s** stored as **`subA`** / **`subB`** (min/max order). |
| **Status** | **`open`** while an active **Friendship** exists and the thread is in use. **`closed`** after mutual remove-friend (#358) with **`closedAt`** (epoch ms). |
| **Access while friends** | Both parties may compose and read history while an active **Friendship** exists and thread is **`open`**. |
| **After remove-friend** | Thread is **closed/hidden for both**: both lose compose and history access immediately. Handler sets durable **`status: closed`** and **`closedAt`** (epoch ms) on the **DmThread** item (#358). **DirectMessage** rows **remain in storage**; access is denied via authz (M35). Re-friending creates a **new** **Friendship** edge via invite/accept; prior thread history stays **inaccessible** (default product). |
| **Retention class** | Account-lifetime durable until explicit delete or account closure — **not** RoomChat TTL. |

## DirectMessage (DM body)

Individual message in a **DmThread**.

| Concept | Contract |
| --- | --- |
| **Identity** | Stable client-generated **`messageId`** (UUID) within the thread. |
| **Sender** | Cognito fan **`sub`** of the author (must be a thread participant with active friendship at send time). |
| **Body / kind** | M35 v1: **`kind: text`** only — **`body`** is trimmed non-empty string, max **2000** characters (room **`chat`** precedent); unicode emoji allowed inline in **`body`**. **`gif`** and reaction kinds are **out of scope** for M35 v1 (#359/#360). |
| **Ordering** | **`sentAt`** epoch ms on write; Dynamo SK **`m#<sentAtMs>#<messageId>`** (13-digit zero-padded ms in SK). History pages query **newest-first** (**`ScanIndexForward: false`**). |
| **Retention** | Account-lifetime in Dynamo until explicit delete / account closure. **No TTL** on DM body rows for the RoomChat-style bounded window. |
| **Storage** | Distinct logical store from **RoomChat** (not room-partitioned message rows). |

## DmUnread (per-recipient watermark)

Server-authoritative unread state for DM activity. Survives refresh and device change. Cleared when the recipient **views** the relevant messages (#361).

| Concept | Contract |
| --- | --- |
| **Scope** | Per recipient **`fanSub`**, keyed to a **DmThread** via canonical **`pairKey`**. |
| **Storage keys** | PK **`recipientSub`**, SK **`pairKey`** on dedicated **DmUnread** Dynamo table (env-suffixed in IaC). |
| **Cursor (source of truth)** | **`lastReadSentAt`** (epoch ms) and **`lastReadMessageId`** (UUID). A **DirectMessage** is unread for the recipient when **`(sentAt > lastReadSentAt)`** OR **`(sentAt === lastReadSentAt && messageId > lastReadMessageId)`** (lexicographic UUID tie-break). |
| **List denormalization** | **`hasUnread`** boolean on the **DmUnread** item — updated on inbound send (set **`true`** for recipient) and on **`POST .../read`** when cursor advances past the thread tip. Avoids per-friend latest-message queries on **`GET /v1/friends`**. |
| **Missing row** | No **DmUnread** item ⇒ cursor **`(0, "")`**, **`hasUnread: false`** until the first inbound message for that recipient sets **`hasUnread: true`**. |
| **Clear** | Explicit **`POST /v1/dm/threads/{pairKey}/read`** with **`{ lastReadSentAt, lastReadMessageId }`**. Server applies **monotonic max** only (concurrent tabs safe). **`GET .../messages`** does **not** implicitly clear. Client sends read ack when the user **views** messages (not on thread open alone — M36 stick-to-bottom rules). |
| **Not client-only** | Badge state is not ephemeral browser-only; server owns truth for list badges. |
| **Aggregation wire** | **`GET /v1/friends`** exposes per-friend **`hasUnread`** and response **`anyUnread`** (OR across friends). Header/tab aggregate badge chrome is **M36** presentation. |

## Optional: audit events

**`EVT#...`** patterns per admin/observability docs—defer until needed.

## Decisions (answered)

| Question | Decision |
| --- | --- |
| Store TMDB `original_title`? | **No**. |
| Single table vs multi-table Dynamo? | **Multiple tables** (physical separation for clarity, IAM, and TTL): at minimum **`Catalog`**, **`Rooms`**, **`Connections`**, **`RoomPresence`**, **`FanProfiles`**. Add **`Lists`** (and optional **`Events`**) when those features ship—see **`persistence_abstractions.md`** and **`docs/architecture.server.md`**. Friends/DM may add further tables or co-located social items; exact split is open implementation (still Dynamo, not a new RDBMS). |
| Participant camera/mic toggle persistence? | **No** — not on **Rooms** or **RoomPresence**; reconnect defaults **off**; SFU runtime holds active producers. |
| Room mode / AV kill switch durability? | **Yes** — **`roomMode`** and **`avDisabled`** on **Rooms** item; host **`PATCH`** with **`version`** optimistic lock. |

## Decisions (answered — #101 HTTP / Rooms item)

| Question | Decision |
| --- | --- |
| Dynamo attribute + JSON wire names? | **`roomMode`** and **`avDisabled`** — camelCase on Dynamo **Rooms** item and HTTP JSON, same precedent as **`broadcastCaptureActive`**. |
| Create defaults? | **`room-create.ts`** writes **`roomMode: theater`** and **`avDisabled: false`** on every new item; create response echoes both. Clients cannot override on **`POST /v1/rooms`** in MVP. |
| Legacy read defaults? | **`room-get.ts`** / **`room-patch.ts`** responses default missing attributes to **`theater`** / **`false`** without error. |
| Lobby exposure? | **`GET /v1/lobby`** rows **omit** **`roomMode`** and **`avDisabled`** — only **`GET /v1/rooms/{roomId}`** (and host **`PATCH`** **`200`**) carry authoritative AV layout fields. |
| Video Chat + active tab capture? | **Single atomic host `PATCH`** may set **`roomMode: videoChat`** and clear **`broadcastCaptureActive`** in one conditional write (#109); not two sequenced HTTP calls. |

## Decisions (answered — presence and AV maturity)

| Question | Decision |
| --- | --- |
| **`lastActiveAt` on RoomPresence?** | **Yes** — epoch seconds; updated on qualifying WS routes; enables reconnect-accurate **active** badges. |
| Active signal set? | **Union** — **`typing_start`**, **`chat`** / **`chat_gif`**, **`react`**, **`ping`** (within window). |
| Active idle window? | **120 seconds** after **`lastActiveAt`**. |
| Store **active** boolean on row? | **No** — derive at read/broadcast time from **`lastActiveAt`** unless server chooses to denormalize (tier TW). |
| Typing in Dynamo? | **No** — ephemeral fan-out only. |
| Join/leave in **RoomChat**? | **No** — signed-in fan join/leave lines are WS-only ephemera. |

## Decisions (answered — M22 `lastActiveAt`)

| Topic | Decision |
| --- | --- |
| Wire unit | Epoch **seconds** on Dynamo **RoomPresence** and **`presence`** broadcast JSON **`lastActiveAt`**. |
| Multi-tab roster | When collapsing multiple **`presenceKey`** rows per **`sessionId`**, roster uses **max(`lastActiveAt`)** for that session's badge. |
| Update expression | **`SET lastActiveAt = :ts`** where **`:ts = max(if_not_exists(lastActiveAt, 0), nowSec)`** on qualifying inbound routes; **`rename`** and **`lastActiveAt`** updates are independent fields on the same row. |
| Disconnect | Row delete on **`$disconnect`** — no tombstone **`lastActiveAt`**; late joiners read remaining connections only. |

## Decisions (answered — lobby host display #257)

| Question | Decision |
| --- | --- |
| Store host display name on **Rooms**? | **No** — resolve **`hostDisplayName`** at **`GET /v1/lobby`** read time from **FanProfiles** keyed by **`hostSub`**. |
| Lobby eligibility? | Public **Rooms** rows whose **`hostSub`** has no non-empty **FanProfiles.displayName** are **excluded** from lobby listing results (not returned with a placeholder). |
| In-room rename vs lobby? | WS **`rename`** updates **RoomPresence** / **Connections** only; lobby continues to show **FanProfiles** name. |

## Decisions (answered — friends and direct messaging)

| Question | Decision |
| --- | --- |
| Friendship creation? | **Invite/accept** — durable **FriendshipRequest** before **Friendship** edge; edge only after accept. |
| Friendship edge lifetime? | **Durable until remove-friend** (and account lifecycle); not time-bounded soft-expiry. |
| Friends-list online? | **Derived from RoomPresence** — friend **`fanSub`** present in **any** room; no durable last-seen on friendship/DM entities. |
| DM storage vs RoomChat? | **Distinct logical store** — not room-partitioned **RoomChat** rows. |
| DM retention class? | **Account-lifetime durable** in Dynamo until explicit delete / account closure. RoomChat remains TTL-bounded. |
| DM TTL attribute? | **N/A** for DM body retention window (unlike RoomChat **`expiresAt`**). Account-closure / explicit-delete purge paths are separate. |
| Remove-friend edge? | **Immediately mutual** teardown. |
| Remove-friend DM access? | **Both** parties lose compose and history access (thread closed/hidden for both). |
| Identity keys? | Cognito fan **`sub`** only; no guest friends/DM rows. |
| System of record? | Existing **DynamoDB** class; **no new RDBMS**. |

## Decisions (answered — friendship invite/accept lifecycle #356)

| Question | Decision |
| --- | --- |
| **FriendshipRequest terminal retention?** | **Hard-delete** on accept, decline, and cancel. |
| **Pending pair uniqueness?** | **Unordered** — one open pending per **`pairKey`** (either direction). |
| **Canonical pair key?** | **`min(subA, subB) + '#' + max(subA, subB)`** for **Friendship** PK and pending **`pairKey`** GSI. |
| **Physical tables (this slice)?** | Dedicated **`FriendshipRequests`** and **`Friendships`** Dynamo tables. |
| **FriendshipRequests access** | PK **`requestId`**; GSI **`recipientSub`** (inbound pending), GSI **`requesterSub`** (outbound pending), sparse GSI **`pairKey`** (pending uniqueness). |
| **Friendships access** | PK **`pairKey`**; GSI **`fanSub`** + SK **`pairKey`** for list-my-friends (#357). |

## Decisions (answered — friends list and online #357)

| Question | Decision |
| --- | --- |
| **Cross-query for friends online?** | **RoomPresence** sparse GSI on **`fanSub`** (PK) + **`roomId#presenceKey`** (SK). Per peer: query with **`Limit: 1`**; any hit ⇒ **`online: true`**. No denormalized friends-presence table. |
| **Multi-tab / multi-room?** | OR semantics — multiple rows sharing **`fanSub`** still yield **`online: true`** while any row exists. |
| **Stored online on Friendship?** | **No** — derived at read time only. |
| **Friend row labels?** | **FanProfiles** **`displayName`** / **`avatarUrl`**; fallback name **`"Friend"`** when profile missing or empty. |
| **List sort?** | **`displayName`** case-insensitive, then **`pairKey`**. |

## Decisions (answered — mutual remove-friend #358)

| Question | Decision |
| --- | --- |
| **Remove HTTP route?** | **`DELETE /v1/friends/{pairKey}`** — caller must be a member of the encoded pair. |
| **Friendship on remove?** | **Hard-delete** row — immediately mutual. |
| **DmThread on remove?** | **Soft-close** — **`status: closed`**, **`closedAt`** (epoch ms) when item exists; same **TransactWrite** as friendship delete when table wired. |
| **DirectMessage on remove?** | **Retain** bodies; no unfriend purge (#358). Access denied via authz (M35). |
| **Re-friend history restore?** | **Default inaccessible** — new edge does not restore prior thread history. |
| **Other-party notification?** | **Silent** at API; M36 owns presentation. |
| **Remove rate limit?** | **30**/min per **`fanSub`**. |
| **Concurrent remove vs DM send?** | DM handlers re-check before write; remove wins → **403** `friendship_not_active` / **`dm_thread_closed`**. |

## Decisions (answered — DM unread watermark #361)

| Question | Decision |
| --- | --- |
| **Watermark representation?** | **Last-read cursor** — **`lastReadSentAt`** + **`lastReadMessageId`** on **DmUnread** items. **Not** count-only storage. Denormalized **`hasUnread`** boolean for friends-list reads. |
| **Physical table?** | Dedicated **`DmUnread`** Dynamo table (env-suffixed). PK **`recipientSub`**, SK **`pairKey`**. |
| **Set unread on inbound?** | **`dm-messages-send`** (#360) sets recipient **`hasUnread: true`** after **DirectMessage** persist (sender ≠ recipient). Does not advance recipient read cursor. |
| **Clear trigger?** | **View-based** — **`POST /v1/dm/threads/{pairKey}/read`**. History **GET** does not auto-clear. |
| **Multi-tab races?** | Read POST applies **monotonic max** cursor; concurrent tabs safe. |
| **Other sessions?** | After read write, **best-effort** **`dm_unread`** Fan DM WS push to recipient's other **`FanConnections`** (HTTP remains source of truth). |
| **Friends list wire?** | **`GET /v1/friends`** adds per-entry **`hasUnread`** and response **`anyUnread`**. No per-friend numeric count in #361. |
| **Remove-friend?** | Orphan **DmUnread** rows acceptable when friendship edge deleted; friends list no longer surfaces the peer. |

## Decisions (answered — DM thread open and history #359)

| Question | Decision |
| --- | --- |
| **Physical tables?** | Dedicated **`DmThreads`** and **`DirectMessages`** Dynamo tables (env-suffixed in IaC) — not co-located on **FanProfiles**. |
| **DmThreads keys?** | PK **`pairKey`** only (no GSI required for v1 open-by-peer — server computes **`pairKey`** from caller **`sub`** + **`peerSub`**). |
| **DirectMessages keys?** | PK **`pairKey`**, SK **`m#<sentAtMs>#<messageId>`** (13-digit zero-padded **`sentAtMs`**). **No** **`expiresAt`** TTL. |
| **Thread ensure timing?** | **ensure-on-open** — **`PUT /v1/dm/threads/{peerSub}`** creates metadata when active **Friendship** exists; idempotent when already **`open`**. |
| **History page order?** | **Newest-first** on initial sync; **`before`** cursor for older pages (**#359** API). |
| **DirectMessage v1 kinds?** | **`text` only**; GIF/reactions deferred post-M35. |
| **Account-closure / explicit delete purge?** | **Out of scope** for #359 — future ops/EventBridge slice; unfriend retain-on-storage decided #358. |

## Open implementation decisions

- SFU **`listProducerSummaries`** (or successor) payload fields for Theater strip / Video Chat grid (**`sessionId`**, **`fanSub`**, producer class) beyond today's **`{ producerId, kind }`** — **#102** / layout runtime (#104/#105).
- Future scaling (out of scope for catalog subcategory browse IA): if the full catalog bundle grows large enough that client-side fetch + `filterCatalogEntries({ catalogs })` becomes a performance concern, consider a server-side **`catalog`** / **`catalogs`** query parameter on **`GET /v1/catalog`**. Current access pattern remains full-bundle fetch with client Set-membership filter; hub mixed grid uses no catalog constraint (`catalogs: []`).
- Account-closure cascade and explicit per-message user delete jobs relative to retained-after-unfriend bodies — future ops slice (not #359).

## Primary code pointers (optional)

- **`data/catalog/catalog.schema.json`** (git seed subset).
