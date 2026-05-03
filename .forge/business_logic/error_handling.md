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

## Background jobs

| Class | Behavior |
| --- | --- |
| **Reconcile TMDB failure** | Per-row retry next run; **`PutMetricData`** **`Failed`** count; partial batch success allowed. |

## Primary code pointers (optional)

- Shared error code enum in implementation.
