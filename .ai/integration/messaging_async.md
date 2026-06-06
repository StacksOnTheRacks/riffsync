# Messaging & async integration

Scheduled work, durable events, and side effects that are not synchronous request/response.

## EventBridge / Scheduler → Lambda

| Job | Purpose |
| --- | --- |
| **Stale room / lobby sweeper** | Hide or TTL rooms past **`lastActivityAt`** thresholds (**`architecture.server.md`**). |
| **Catalog reconcile** | Batch TMDB fetch + optional YouTube thumbnail resolution; Dynamo catalog updates (**`architecture.catalog-images.md`**). |

**Contract:** jobs are **idempotent** per catalog row / room id; safe to retry; emit **CloudWatch custom metrics** (`RiffSync/Reconcile`, etc.).

## Realtime fan-out (WebSocket)

- Not “async messaging” in the Kafka sense: **Lambda** completes **`PostToConnection`** after **Dynamo** write on **signaling relay / chat / durability-required paths** as implemented.
- **Room layout and AV control:** **`roomMode`** and **`avDisabled`** follow the same pattern as **`share_state`**: host-only inbound WebSocket action (or fan-out triggered by successful host **`PATCH`**), durable fields on the room item first, then **`PostToConnection`** to all connections in **`roomId`**. Late joiners read authoritative values from room snapshot/join; realtime events cover connected clients.
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

## Open implementation decisions

- Kill-switch **SFU producer teardown** trigger: synchronous HTTP admin callback from room **`PATCH`** Lambda vs async invoke vs SFU polling room flags (prefer **explicit teardown hook** with idempotent close-by-**`sessionId`**).
- Whether **`av_disabled`** WS fan-out is emitted by the **room PATCH handler** only, the **WS route handler** only, or both (avoid duplicate events).
- Retry/backoff when **`PostToConnection`** fails mid-kill-switch fan-out (best-effort vs at-least-once to all tabs).

## Primary code pointers (optional)

- EventBridge rules / Scheduler groups in IaC; reconcile Lambda entrypoint.
