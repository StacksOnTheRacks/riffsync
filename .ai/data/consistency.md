# Consistency

## Room playback

| Property | Level |
| --- | --- |
| **Room metadata** | **Strong** per **`roomId`** including **mutable** **current** **`catalogEpisodeId`** / visibility / **`playbackExpectation`** / **`roomMode`** / **`avDisabled`** / **`broadcastCaptureActive`** / **`lastActivityAt`** — durable in **Dynamo** before fan-out where applicable. Host admin **`PATCH`** uses **`version`** optimistic lock; conflicting concurrent writes return **`409`**. |
| **Participant A/V publish state** | **Runtime-only** in SFU producer lifecycle — **not** strongly consistent with **RoomPresence** or **Rooms**. Reconnect defaults camera/mic **off**; UI may use casual WebSocket fan-out for layout hints. |
| **Guest viewing alignment** | **Inherent** to **one shared realtime media path**: guests consume the **room admin’s** captured **`MediaStream`** (WebRTC), not parallel embedded timelines—no server-managed **drift correction** across separate YouTube iframes. |

## Catalog

| Property | Level |
| --- | --- |
| **Enrichment** | **Eventual**: reconcile job lags source; **`tmdbArtworkSyncedAt`** marks freshness. |
| **Read-through cache** | **Eventually consistent** with Dynamo; **ETag** or version for clients if exposed. |

## Ordering (WebSocket)

| Property | Contract |
| --- | --- |
| **Chat / presence** | **Casual ordering**; last-write-wins acceptable for simple MVP. |
| **Room admin mutations** | **Serial per admin** at server for durable fields (episode selection, visibility, **`roomMode`**, **`avDisabled`**, **`broadcastCaptureActive`**, signaling-adjacent envelopes if echoed): **reject** concurrent conflicting ops—second writer gets **409** (HTTP) or a **business `error` envelope** on WebSocket (**conditional update** / **`version`** on the room item). WebRTC media itself is **SFU-mediated**; server relays **signaling** best-effort. **No server-side queue** for MVP. |
| **AV kill switch** | When **`avDisabled`** becomes true: durable **Rooms** write succeeds first; then deny new participant producer grants, tear down active participant producers, and fan-out authoritative disabled state (exact ordering tier-TW below). |

## Decisions (answered)

| Question | Decision |
| --- | --- |
| CRDT for shared media timing? | **No** MVP — **single admin publisher** + **one stream** simplifies consistency versus CRDT across players. |
| Cross-region active-active? | **Out of scope** MVP — single primary region. |
| Participant toggle state on reconnect? | **Default off** — no restore from **RoomPresence** or **Rooms**. |

## Open implementation decisions

- Ordering when host sets **`avDisabled`** concurrently with in-flight participant **`produce`** requests (Dynamo write vs SFU tear-down vs WebSocket broadcast).
- **`roomMode`** change to **`videoChat`** while **`broadcastCaptureActive`** is true: single **`PATCH`** vs two-step client sequence and which field write wins on **`409`** retry.
- Whether WebSocket **`room_mode`** / **`av_disabled`** (exact **`type`** TBD) messages are emitted only after Dynamo commit or optimistically before ack.
- SFU producer list freshness vs **RoomPresence** roster for layout (stale tile when producer exists but presence row expired).

## Primary code pointers (optional)

- Room item **version** / **optimistic locking** attribute when implemented.
