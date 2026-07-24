# Friends and Direct Messaging

## Introduction

Signed-in RiffSync fans maintain a durable friends list and exchange private 1:1 direct messages alongside (not instead of) public watch-party room chat. Friends and DMs are a social layer keyed by fan Cognito identity: guests cannot create friendships, manage friends, or send DMs. Entry points are the main-site authenticated person-icon friends dropdown and a watch-party right-pane Friends surface that coexists with Chat and People.

**Related capabilities:** Room chat / **ChatSession** and **RoomPresence** own public-room messaging and in-room People online/active. This capability reuses room-chat interaction language for DM compose/history and derives friends-list online from **any-room** **RoomPresence**, but does not replace People, merge DMs into **RoomChat**, or introduce staff moderation of DM bodies.

## Functional Specification

Friendship forms only through **invite/accept**: one signed-in fan sends a **FriendshipRequest**; a durable **Friendship** edge exists only after the recipient accepts. Decline or cancel leaves no edge. Friends lists show room-derived **online** when the friend currently has presence in **any** RiffSync room (not platform-wide browsing presence, not last-seen, not same-room-only). Online for friends is distinct from People **online** / **active** chips.

Opening and sending on a 1:1 **DmThread** requires an **active friendship**. Threads are exactly two fan principals. DM history is **account-lifetime durable** until explicit delete or account closure, distinct from TTL-bounded **RoomChat**. Unread activity is visible on the friends list and clears when the recipient views those messages.

**Remove-friend** is immediately mutual: both parties lose the friendship at once, and both lose compose and history access to the existing DM thread (closed/hidden for both). Re-friending may create a new edge via invite/accept; prior history remains inaccessible by default.

Main-site chrome: authenticated person icon opens a friends dropdown (online indicators, unread, remove, open DM). Signed-out visitors do not see that affordance. Watch-party compact header does not carry the person icon; a Friends panel/tab in the room right column provides the same capabilities beside public room chat. Anonymous guests do not get Friends manage or DM send. Staff Cognito does not grant friendship/DM authority or DM body read in this capability.

**Non-goals:** group DMs; voice/video between friends; public social profiles/feeds; staff moderation of DMs; replacing the room People roster with Friends.

## Technical Specification

**Identity and AuthZ:** Fan Cognito JWT on the shared HTTP API authorizer family. Guests (`sessionId`) remain out of scope for friends/DM mutations. No staff `/v1/admin/*` path reads DM bodies.

**Data:** DynamoDB system of record (same class as **FanProfiles** / **RoomChat**). Logical entities: **FriendshipRequest**, **Friendship**, **DmThread**, **DirectMessage**, per-recipient unread. **FriendshipRequest** rows use **`status: pending`** only and **hard-delete** on accept, decline, or cancel. **Friendship** items use canonical **`pairKey = min(subA,subB)#max(subA,subB)`**. Dedicated **`FriendshipRequests`** and **`Friendships`** tables (#356). DM bodies are not **RoomChat** rows and do not use RoomChat-style TTL. Soft-hide vs hard-delete after mutual unfriend is an open implementation detail; product-visible access is closed for both.

**HTTP (invite/accept lifecycle #356):** Fan JWT routes under **`/v1/friends/*`**: **`POST /v1/friends/requests`** (invite), **`GET /v1/friends/requests`** (pending inbound/outbound), **`POST .../{requestId}/accept`**, **`POST .../{requestId}/decline`**, **`DELETE .../{requestId}`** (requester cancel). At most one open pending per unordered pair; same-direction re-invite idempotent **200**; opposite pending **409 `friend_request_inbound_exists`**. Accept uses **TransactWrite** to put **Friendship** and delete all pendings for the pair. Friend-request send throttle **10/min** per **`fanSub`**; accept/decline/cancel **30/min**.

**HTTP (accepted friends list #357):** **`GET /v1/friends`** returns **`{ "friends": [ ... ] }`** of accepted **Friendship** edges for the caller only. Each entry: **`fanSub`** (peer), **`pairKey`**, **`displayName`**, optional **`avatarUrl`**, **`online`** (boolean), **`createdAt`** (epoch ms). **`online`** is **true** when the peer has at least one live **RoomPresence** row in any RiffSync room (sparse **`fanSub`** GSI query with **`Limit: 1`**). Does **not** include **`active`**, **`lastActiveAt`**, **`roomId`**, or last-seen. Display fields resolve from **FanProfiles**; **`displayName`** falls back to **`"Friend"`** when profile missing or empty. Sort: case-insensitive **`displayName`**, then **`pairKey`**. Read throttle **60/min** per caller **`fanSub`**.

**Presence:** Friends online is derived from existing **RoomPresence** (friend has an open presence row in any room). No new platform-wide presence plane and no durable last-seen PII class. Does not use the SFU media plane. Multi-tab and multi-room peers are **online** when **any** presence row exists for their **`fanSub`**; rows delete on **`$disconnect`** (TTL is orphan cleanup only).

**Messaging:** History sync on open plus realtime push while connected, in the existing serverless write-then-**`PostToConnection`** class. **`ChatSession`** remains the room chat/presence/control plane; DM traffic must not silently share the room `roomId` channel unless an explicit shared-topology decision is recorded. Friends/DM failure must not tear down healthy **ChatSession** or SFU.

**Runtime envelope:** API Gateway HTTP/WebSocket → Lambda; optional EventBridge/Scheduler → Lambda for account-closure or purge jobs. No new long-lived presence daemon.

**Client surfaces:** Main-site friends bootstrap from fan session + HTTP/API (no room join required). Room Friends pane is additive in the chat column beside Chat / People / Room / Profile.

Relevant web stack versions from `@riffsync/web` package metadata: React `^19.2.5`, React Router `^7.14.2`, TypeScript `~6.0.2`, Vite `^8.0.10`, Vitest `^3.0.2`.

## Testing Strategy

Contract and unit coverage should prove invite/accept lifecycle (pending → accept creates edge; decline and cancel leave no edge; duplicate and reciprocal pending rules), mutual remove closes friendship and blocks DM compose/history for both, friends online true only when any-room **RoomPresence** exists for the peer, DM history survives reload (account-lifetime class), unread clears on view, and fan JWT gates all friends/DM mutations while guests and staff tokens cannot send or read DMs.

**#356 testing focus:** Lambda unit tests for **`POST/GET /v1/friends/requests`**, accept, decline, cancel; assert **401** without fan JWT, **400 `cannot_friend_self`**, **409 `already_friends`**, idempotent same-direction invite, **409 `friend_request_inbound_exists`**, recipient-only accept/decline, requester-only cancel, **TransactWrite** accept clearing reciprocal pendings, and **429 `rate_limited`** at configured thresholds. CDK route wiring smoke optional in same PR.

**#357 testing focus:** Lambda unit tests for **`GET /v1/friends`**: **401** without fan JWT; returns only accepted edges from **Friendships** GSI (no pending requests); **`online: true`** when **RoomPresence** **`fanSub`** GSI returns a row; **`online: false`** when none; multi-tab (two presence rows, same **`fanSub`**) still **`online: true`**; **`displayName`** / **`avatarUrl`** from **FanProfiles** batch read; **`displayName`** fallback **`"Friend"`** when profile missing; stable sort by **`displayName`** then **`pairKey`**; **429 `rate_limited`** at **60/min**. Optional CDK synth assertion for **RoomPresence** **`fanSub`** GSI and route wiring.

Integration tests should cover write-then-fan-out DM delivery to a connected peer, history sync on open, and isolation from room **ChatSession** teardown. UI smoke should cover main-site person-icon dropdown (hidden when signed out) and room Friends pane coexistence with Chat and People. Abuse/rate-limit posture for friend-request and DM send should be verified at the throttle class level (exact bands refined in issues).

## References

- `.ai/business_logic/domain_model.md` — FriendshipRequest, Friendship, DmThread, friends online, remove-friend.
- `.ai/business_logic/user_stories.md` — US-P0-13* friends/DM stories.
- `.ai/data/data_model.md` / `.ai/data/persistence_abstractions.md` — durable entities and retention classes.
- `.ai/integration/api_contracts.md` / `.ai/integration/authorization.md` / `.ai/integration/messaging_async.md` — fan-gated APIs and DM plane.
- `.ai/interface/presentation.md` / `.ai/interface/interaction_flow.md` — header dropdown, room Friends pane, DM≈room chat.
- `.ai/operations/security.md` / `.ai/operations/observability.md` — RoomChat vs DM privacy, no staff DM read.
- `.ai/runtime/execution_model.md` / `.ai/runtime/startup_bootstrap.md` — room-derived online; main-site vs room bootstrap.
