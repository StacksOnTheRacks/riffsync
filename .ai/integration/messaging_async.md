# Messaging & async integration

Scheduled work, durable events, and side effects that are not synchronous request/response.

## EventBridge / Scheduler → Lambda

| Job | Purpose |
| --- | --- |
| **Stale room / lobby sweeper** | Hide or TTL rooms past **`lastActivityAt`** thresholds (**`architecture.server.md`**). |
| **Catalog reconcile** | Batch TMDB fetch + optional YouTube thumbnail resolution; Dynamo catalog updates (**`architecture.catalog-images.md`**). |

**Contract:** jobs are **idempotent** per catalog row / room id; safe to retry; emit **CloudWatch custom metrics** (`RiffSync/Reconcile`, etc.).

## Realtime fan-out (WebSocket)

- Not "async messaging" in the Kafka sense: **Lambda** completes **`PostToConnection`** after **Dynamo** write on **chat / durability-required paths** as implemented. **Mesh WebRTC signaling relay is removed** — SFU signaling is direct to **`RiffSyncTurn`** EC2.
- **Bounded chat retention (room plane):** **`chat`**, **`chat_gif`**, and active **`react`** rows write to **RoomChat** before fan-out. **`presence_request`** also posts requester-only **`chat_history`** (capped messages + aggregated reactions) while broadcasting **`presence`**. **Typing** (**`typing_start`** / **`typing_stop`**) and join/leave **`chat_system`** lines fan out **without** **RoomChat** writes — ephemeral control-plane only.
- **1:1 DM (social plane):** Durable DM messages use the same **write-then-fan-out** class (persist, then push to connected peer(s)). Clients also **sync history on open**. Retention is **account-lifetime** (distinct from TTL-bounded **RoomChat**; data domain owns store shape). DM traffic is **not** stored in **RoomChat** and is **not** room-scoped fan-out by **`roomId`**. **`ChatSession`** remains the room chat/presence/control module; DM realtime must not silently share that **`roomId`** channel without an explicit shared-topology note (**`api_contracts.md`**).
- **Presence active rehydration:** qualifying inbound routes (**`typing_start`**, **`chat`**, **`chat_gif`**, **`react`**, **`ping`** inside the active window) update **`lastActiveAt`** on the sender's **RoomPresence** row **before** **`presence`** fan-out so late joiners and **`presence_request`** see accurate **`active`** badges after reconnect.
- **Typing fan-out:** **`typing_start`** broadcasts a room-wide **`typing`** envelope (who is composing); **`typing_stop`** clears that sender's typing flag. Multiple concurrent typers are allowed. Typing state is **not** stored in Dynamo — reconnect clears local typing UI until a new **`typing_start`** arrives.
- **Join/leave fan-out:** on **RoomPresence** row create/delete for connections with **`fanSub`**, emit ephemeral **`chat_system`** (**`join`** \| **`leave`**) to room members. Guest connections (no **`fanSub`**) produce **no** join/leave line.
- **`presence` roster wire (#377):** Each member in the **`presence`** broadcast may include optional **`fanSub`** (Cognito **`sub`**) when the connection is a signed-in fan. **Omit** **`fanSub`** for anonymous guest connections. Clients use **`fanSub`** only for friendship invite from **People** roster — not for display. **Do not** expose guest **`sessionId`** as a substitute for **`fanSub`** in invite flows.
- **Room layout and AV control:** **`roomMode`** and **`avDisabled`** are **durable on the room item** via host **`PATCH`**, then **`room-patch` Lambda** **`PostToConnection`** to all connections in **`roomId`** (#103). **No inbound WebSocket routes** for these fields (contrast **`share_state`**, which is ephemeral fan-out over WS). Late joiners read authoritative values from room snapshot/join; realtime events cover connected clients.
- **Viewer-local Cast:** Cast start, active, stop, unavailable, failed-start, receiver-disconnected, receiver-playback-blocked, stop-failed, and cleaned-up state is **not** room fan-out traffic. It is not a room WebSocket route, not a **`share_state`** variant, not a durable event, and not replayed to late joiners. For #273, sender-to-receiver presentation snapshots and chat-overlay updates travel only over the local Google Cast sender/receiver channel and are not RiffSync room messaging. For #304, receiver render-confirmation acknowledgements such as **`receiver_rendered`** also stay on the local Google Cast channel and never become room WebSocket fan-out, room activity, late-join replay, presence, chat, or SFU messages. For #277 / #278, local Cast lifecycle must not enqueue, broadcast, or synthesize any room message that could change another participant's playback, controls, drawer status, chat state, presence, SFU permissions, or layout.
- **`share_state: stopped` side effects:** ephemeral fan-out only. **Guests detach `host_screen` consumers**; **must not** trigger full SFU session teardown or participant A/V consumer removal. Host unpublishes **`host_screen`** locally. See **`api_contracts.md`** (Realtime hardening).
- **Chat vs SFU lifecycle decoupling:** room WS reconnect, disconnect, and **`share_state`** handlers **must not** call SFU session **`close()`** without explicit media policy. Chat send failures (**`CHAT_SEND_DROPPED`**) are independent of SFU health when room WS is up. SFU signaling outage **must not** block outbound **`chat`**, **`chat_gif`**, or **`react`** when room WS is **`open`** (**#149**). Each drawer reconnects independently (**`api_contracts.md`**).
- **AV kill switch side effects:** when **`avDisabled`** becomes true, control plane broadcasts disabled state; SFU integration must **tear down participant producers** (participant class only — not host screen share). Token mint denial prevents re-publish until re-enabled.
- **Failure handling:** log + metric; optional dead-letter pattern for repeated **`PostToConnection`** failures (implementation detail).

## Optional: EventBridge custom bus / Dynamo streams

- **Product analytics or audit:** **`PutEvents`** to **EventBridge**, or **Dynamo Streams** → Lambda → **aggregated `PutMetricData`** so dashboards stay **CloudWatch-first** (**`architecture.admin.md`**).
- **Not required** for MVP if logs + custom metrics suffice.

## Decisions (answered)

| Question | Decision |
| --- | --- |
| SQS between API and fan-out? | **Not** baseline; API Gateway WebSocket + Lambda direct pattern first. |
| Reconcile on every catalog read? | **No**; scheduled/batch only. |
| Room mode / AV kill switch ordering? | **Durable room write before fan-out** when persisted; best-effort delivery order across connections (same as playback **`PATCH`** + chat). |
| Chat reconnect tears down SFU? | **No** — orthogonal drawer lifecycles; room WS recovery must not close SFU session without media policy. |
| `share_state: stopped` tears down SFU for guests? | **No** — **`host_screen` consumer detach only**; preserve SFU session and **`participant_av`**. |
| Chat outbound retry before **`CHAT_SEND_DROPPED`**? | **No retry queue** — first failed send while chat plane unavailable emits **`CHAT_SEND_DROPPED`** (**#140** / **`api_contracts.md`**). |
| Cast fan-out? | **No.** Cast is local client state and never posted to room members. #277 verifies this across start, active, stop, failure, disconnect, and cleanup paths. |
| Cast fan-out verification for #279? | Lifecycle and cleanup tests must assert no room message, durable event, late-join replay, **`share_state`** variant, presence update, drawer status update, or SFU permission message is produced by local Cast paths. |
| DM delivery class? | **History sync on open** + **realtime push while connected**; serverless **write-then-fan-out** (persist then fan-out). No new SQS / process fabric as baseline. |
| DM vs RoomChat messaging? | **Separate** logical plane and store; DMs are not **RoomChat** rows and not room-wide **`roomId`** broadcasts. |
| DM vs **`ChatSession`**? | Room **`ChatSession`** unchanged; DM uses a distinct social/DM plane (exact WS vs HTTP topology open). |
| Friends online signal? | Derived from existing **RoomPresence** (open presence in **any** room) — query/derive across rooms; not a new browsing-presence bus and not SFU. |
| SQS for DM fan-out? | **Not** baseline — same direct Lambda **`PostToConnection`** (or equivalent push) class as room chat unless later cost forces a queue. |
| DM send HTTP path? | **`POST /v1/dm/threads/{pairKey}/messages`** — persist **DirectMessage** then fan-out to peer **`fanSub`** connections (#360). |
| DM realtime transport? | **Separate Fan DM WebSocket API** + **`FanConnections`** table (GSI on **`fanSub`**). **Not** room **`Connections`** / **`roomId`** map. Reuses WebSocket + Lambda + **`PostToConnection`** **machinery class** only — explicit shared-topology note in **`api_contracts.md`**. |
| DM push envelope? | Outbound **`type: dm_message`**, **`schemaVersion: 1`** (#360). |
| DM push failure after persist? | **Best-effort** + log/metric; **no** outbound retry queue. Recipient syncs on next history fetch. |
| DM send client drop code? | **`DM_SEND_DROPPED`** when HTTP POST fails after client retry budget. |
| DM push plane status code? | **`DM_PUSH_UNAVAILABLE`** when Fan DM WS not **`open`**; HTTP send/history unaffected. |

## Decisions (answered — presence and AV maturity)

| Question | Decision |
| --- | --- |
| Typing persistence? | **Ephemeral fan-out only** — no **RoomChat** / Dynamo row; lost on disconnect. |
| Typing vs **active**? | **`typing_start`** contributes to **active** via **`lastActiveAt`** update — not display-only. |
| Join/leave lines? | **Signed-in fans only**; ephemeral WS fan-out; excluded from **`chat_history`**. |
| **`lastActiveAt` write timing?** | Update on qualifying control-plane routes **before** **`presence`** / typing fan-out (same Lambda turn as inbound handler). |
| **`ping`** and idle viewers? | Heartbeats inside the **2-minute** window count toward **active** — watching without chatting can remain **active** while heartbeats continue. |

## Decisions (answered — M22 messaging)

| Topic | Decision |
| --- | --- |
| Re-hydration after reconnect | Reuse existing **`presence`** broadcast (with **`active`** + **`lastActiveAt`**) plus requester-only **`chat_history`** on **`presence_request`** — unchanged shape, enriched member fields. |
| **`typing` fan-out shape** | Per-event **`type: typing`** envelope with **`action`**, **`sessionId`**, optional **`displayName`**, **`ts`** — not a full-room typing set. |
| Server coalesce | Drop duplicate **`typing_start`** from same **`sessionId`** within **1s** before fan-out. |
| Join/leave copy | **`{displayName} joined`** / **`{displayName} left`** — muted system-line styling in chat log. |
| Reconnect join | **No** **`join`** line when same **`fanSub`** reconnects within **30s** of prior disconnect. |

## Decisions (answered — People roster invite #377)

| Topic | Decision |
| --- | --- |
| **`fanSub` on `presence` wire?** | Include optional **`fanSub`** on signed-in fan members only; omit for guests. |
| Invite transport | **`POST /v1/friends/requests`** with **`recipientSub`** from roster row **`fanSub`**. |
| Discovery UX | **People** roster context menu + keyboard **More actions** overflow — no Friend ID paste field. |

## Open implementation decisions

- Whether **`PostToConnection`** failure during **`share_state`** fan-out requires client-side poll of room snapshot for **`broadcastCaptureActive`**.

### friends-and-dm-delivery-topology
- No open decisions remain for unread-clear transport (#361). **`POST /v1/dm/threads/{pairKey}/read`** is the durable write; **best-effort `dm_unread`** Fan DM WS push notifies the recipient's other sessions to refresh badges.

## Decisions (answered — DM unread #361)

| Topic | Decision |
| --- | --- |
| Read acknowledgment transport | **HTTP `POST .../read`** is source of truth; **best-effort `dm_unread`** push to recipient **`FanConnections`** after cursor advance. |
| **`dm_unread` envelope** | **`{ "type": "dm_unread", "schemaVersion": 1, "pairKey", "hasUnread", "lastReadSentAt", "lastReadMessageId" }`**. Recipient-only fan-out (same as **`dm_message`**). |
| Push failure | Log + metric; **no** retry queue. Other tabs refresh on next **`GET /v1/friends`** or inbound **`dm_message`**. |
| Inbound unread | Send persist sets recipient **`hasUnread: true`** on **DmUnread** row (#361); separate from **`dm_message`** push. |

## Decisions (answered — DM history sync #359)

| Topic | Decision |
| --- | --- |
| History sync HTTP | **`GET /v1/dm/threads/{pairKey}/messages`** with **`limit`** + optional **`before`** cursor; newest-first pages. |
| Thread ensure HTTP | **`PUT /v1/dm/threads/{peerSub}`** before first history fetch when thread metadata may not exist. |
| Cursor encoding | base64url JSON **`{"sentAt", "messageId"}`** for exclusive older pagination. |
| Not RoomChat | DM history **Query** targets **DirectMessages** table only — never **RoomChat** **`roomId`** partition. |

## Decisions (answered — DM realtime send/receive #360)

| Topic | Decision |
| --- | --- |
| Send path | **`POST /v1/dm/threads/{pairKey}/messages`** with fan JWT. Body: client **`messageId`** (UUID), **`kind: text`**, trimmed **`body`** (max **2000**). **201** echoes persisted row fields. |
| Persist-then-push | **PutItem** **DirectMessages** first; then query peer **`fanSub`** on **`FanConnections`** GSI and **`PostToConnection`** **`dm_message`** envelope to each open connection. |
| Fan DM WebSocket | **Separate** API Gateway WebSocket API from room **ChatSession**. **`$connect`** requires fan JWT; stores **`fanSub`** on **`FanConnections`**. Routes: **`$connect`**, **`$disconnect`**, **`ping`** only — **no** inbound **`dm_send`**. |
| Connection map | **`FanConnections`** Dynamo: PK **`connectionId`**, attribute **`fanSub`**, sparse GSI PK **`fanSub`** for 1:1 fan-out. **Not** keyed by **`roomId`**. |
| Shared topology note | Same **serverless class** (API Gateway WS + Lambda + **`execute-api:ManageConnections`**) as room chat; **distinct** WS API, handler entrypoints, and connection table. DM bodies **never** **`PostToConnection`** on room **`roomId`** membership. |
| Push envelope | **`{ "type": "dm_message", "schemaVersion": 1, "pairKey", "messageId", "senderSub", "kind", "body", "sentAt", "displayName?", "avatarUrl?" }`**. |
| Push failure | Log + metric; **no** retry queue. Message remains durable; peer loads via **`GET .../messages`**. |
| Client codes | **`DM_SEND_DROPPED`** — HTTP send failed after retry budget. **`DM_PUSH_UNAVAILABLE`** — Fan DM WS not **`open`** (realtime paused). Friends/DM drawer only — **no** **`ChatSession`** / SFU teardown. |
| Send throttle | **20/min** per caller **`fanSub`**; **429 `rate_limited`**. |

## Kill-switch side-effect ordering (#102 / #103 split)

| Step | Owner | Contract |
| --- | --- | --- |
| 1 | **#101 / room `PATCH` Lambda** | Conditional Dynamo write sets **`avDisabled: true`**. |
| 2 | **#102** | Synchronous **`POST /admin/teardown-producers`** on SFU (participant class only). |
| 3 | **#103** | **`PostToConnection`** **`av_disabled`** fan-out from **room `PATCH` handler only** (not duplicate WS inbound route). **`room_mode`** fan-out uses the same **`room-patch`** path when **`roomMode`** changes. |
| 4 | **#102** | Deny new **`participant_av`** producer tokens at **`webrtc-sfu-token`**. |

- **`PostToConnection`** failures during kill-switch fan-out: **best-effort** + log/metric; late joiners read **`avDisabled`** from room snapshot.

## Primary code pointers (optional)

- EventBridge rules / Scheduler groups in IaC; reconcile Lambda entrypoint.
