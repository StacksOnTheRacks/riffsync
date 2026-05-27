# Consistency

## Room playback

| Property | Level |
| --- | --- |
| **Room metadata** | **Strong** per **`roomId`** including **mutable** **current** **`catalogEpisodeId`** / visibility / **`playbackExpectation`** / **`lastActivityAt`** — durable in **Dynamo** before fan-out where applicable. |
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
| **Room admin mutations** | **Serial per admin** at server for durable fields (episode selection, visibility, signaling-adjacent envelopes if echoed): **reject** concurrent conflicting ops—second writer gets **409** (HTTP) or a **business `error` envelope** on WebSocket (implementation: **conditional update** / **version** on the room item). WebRTC media itself is **peer-mediated**; server relays **signaling** best-effort. **No server-side queue** for MVP. |

## Decisions (answered)

| Question | Decision |
| --- | --- |
| CRDT for shared media timing? | **No** MVP — **single admin publisher** + **one stream** simplifies consistency versus CRDT across players. |
| Cross-region active-active? | **Out of scope** MVP — single primary region. |

## Primary code pointers (optional)

- Room item **version** / **optimistic locking** attribute when implemented.
