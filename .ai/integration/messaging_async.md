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
- **Room layout and AV control:** **`roomMode`** and **`avDisabled`** are **durable on the room item** via host **`PATCH`**, then **`room-patch` Lambda** **`PostToConnection`** to all connections in **`roomId`** (#103). **No inbound WebSocket routes** for these fields (contrast **`share_state`**, which is ephemeral fan-out over WS). Late joiners read authoritative values from room snapshot/join; realtime events cover connected clients.
- **`share_state: stopped` side effects:** ephemeral fan-out only. **Guests detach `host_screen` consumers**; **must not** trigger full SFU session teardown or participant A/V consumer removal. Host unpublishes **`host_screen`** locally. See **`api_contracts.md`** (Realtime hardening).
- **Chat vs SFU lifecycle decoupling:** room WS reconnect, disconnect, and **`share_state`** handlers **must not** call SFU session **`close()`** without explicit media policy. Chat send failures (**`CHAT_SEND_DROPPED`**) are independent of SFU health when room WS is up. Each drawer reconnects independently (**`api_contracts.md`**).
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

## Open implementation decisions

- Whether **`PostToConnection`** failure during **`share_state`** fan-out requires client-side poll of room snapshot for **`broadcastCaptureActive`**.
- Presence re-hydration message shape after room WS reconnect (reuse existing **`presence`** broadcast vs incremental delta).

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
