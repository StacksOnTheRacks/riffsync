# Error handling

## HTTP API

| Class | Behavior |
| --- | --- |
| **4xx client** | Stable **`code`** + **`message`** JSON body where practical; avoid leaking internals. |
| **5xx server** | Generic message to client; **full detail in logs** only. |
| **Conflict (409)** | **Optimistic lock / version mismatch** on room **`UpdateItem`** (concurrent host commands or stale **ETag**-style version). **Not** used for a separate “reclaim” protocol in MVP. |

## WebSocket

| Class | Behavior |
| --- | --- |
| **Protocol errors** | **Close** with sensible code + log; reconnect guidance in client (**`architecture.frontend.md`**). |
| **Business reject** | **Error** message envelope with **`type: "error"`** + **`code`**; do not tear down socket for transient host rejections unless policy requires. |
| **AV kill switch fan-out** | Authoritative **`avDisabled`** (or equivalent) broadcast forces client unpublish/unsubscribe of participant A/V; participant toggles reflect disabled state without requiring socket teardown. |
| **Participant A/V reject** | Return structured **`code`** for token denial, capacity block, or kill-switch block; client resets toggle to off and shows inline recoverable message. |

## Background jobs

| Class | Behavior |
| --- | --- |
| **Reconcile TMDB failure** | Per-row retry next run; **`PutMetricData`** **`Failed`** count; partial batch success allowed. |

## Kill-switch WebSocket fan-out (#103 / #116)

After durable **`avDisabled`** write on room document, room **`PATCH`** Lambda fans out (no inbound WS mutation route):

```json
{
  "type": "av_disabled",
  "roomId": "<uuid>",
  "sessionId": "<host-session-id>",
  "avDisabled": true,
  "ts": 1717700000000,
  "version": 42
}
```

- **`avDisabled: false`** on re-enable uses the same envelope with boolean **false**; no SFU teardown call on re-enable.
- **Business outcome:** all connected clients unpublish / unsubscribe participant A/V immediately; toggles reflect disabled state (**`error_state.md`**).
- Ordering: Dynamo commit → SFU **`/admin/teardown-producers`** (when disabling) → **`PostToConnection`** fan-out (**`data/consistency.md`**).

## Primary code pointers (optional)

- Shared error code enum in implementation.
