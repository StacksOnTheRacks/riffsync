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

## Open implementation decisions

- Whether **`PostToConnection`** failure during **`share_state`** fan-out requires client-side poll of room snapshot for **`broadcastCaptureActive`**.

### friends-and-dm-delivery-topology
- Exact DM realtime transport: new WebSocket application routes, fan-scoped connection map (not **`roomId`**-keyed), HTTP sync with optional push, or hybrid sharing infrastructure with room WS **only if** documented explicitly — **#360**.
- Outbound/inbound DM envelope **`type`** / **`schemaVersion`** discriminators for realtime push — **#360**.
- Whether unread-clear acknowledgment is HTTP-only or also pushed to the viewer's other sessions — **#361**.
- DM send failure client **`code`** when push plane unavailable (analogue of **`CHAT_SEND_DROPPED`**); retry budget remains **no outbound retry queue** unless a later decision changes room-chat precedent — **#360**.
- Cross-room **RoomPresence** query pattern for friends online (GSI vs fan-out index vs scan-by-sub) — physical access pattern with data/IaC; messaging only requires derive-from-presence semantics (GSI decided #357).

## Decisions (answered — DM history sync #359)

| Topic | Decision |
| --- | --- |
| History sync HTTP | **`GET /v1/dm/threads/{pairKey}/messages`** with **`limit`** + optional **`before`** cursor; newest-first pages. |
| Thread ensure HTTP | **`PUT /v1/dm/threads/{peerSub}`** before first history fetch when thread metadata may not exist. |
| Cursor encoding | base64url JSON **`{"sentAt", "messageId"}`** for exclusive older pagination. |
| Not RoomChat | DM history **Query** targets **DirectMessages** table only — never **RoomChat** **`roomId`** partition. |

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
