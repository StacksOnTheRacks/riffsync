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
| **Chat reconnect** | **Client-held scrollback only** — drawer-independent **`ChatSession`** reconnect does **not** replay a server transcript. The same tab retains its in-memory message buffer (~**100** cap per **`interface/presentation.md`**) while the room WebSocket recovers; late join and full page reload still receive **no** chat history. No durable queue or stronger delivery ordering is implied. |
| **Room admin mutations** | **Serial per admin** at server for durable fields (episode selection, visibility, **`roomMode`**, **`avDisabled`**, **`broadcastCaptureActive`**, signaling-adjacent envelopes if echoed): **reject** concurrent conflicting ops—second writer gets **409** (HTTP) or a **business `error` envelope** on WebSocket (**conditional update** / **`version`** on the room item). WebRTC media itself is **SFU-mediated**; server relays **signaling** best-effort. **No server-side queue** for MVP. |
| **AV kill switch** | When **`avDisabled`** becomes true: durable **Rooms** write succeeds first; then deny new participant producer grants, tear down active participant producers, and fan-out authoritative disabled state (exact ordering tier-TW below). |

## Decisions (answered)

| Question | Decision |
| --- | --- |
| CRDT for shared media timing? | **No** MVP — **single admin publisher** + **one stream** simplifies consistency versus CRDT across players. |
| Cross-region active-active? | **Out of scope** MVP — single primary region. |
| Participant toggle state on reconnect? | **Default off** — no restore from **RoomPresence** or **Rooms**. |

## Decisions (answered — #101 host PATCH)

| Question | Decision |
| --- | --- |
| **`roomMode`** → **`videoChat`** with active tab capture? | **Single atomic host `PATCH`** with **`roomMode: videoChat`** and **`broadcastCaptureActive: false`** (#109). On **`409`**, client refreshes snapshot and retries with updated **`version`** — no server-side merge of partial field intent across conflicting writes. One **`room_mode`** fan-out after commit (#103). Client still sends local **`share_state: stopped`** per #104. |

## Decisions (answered — #103 fan-out)

| Question | Decision |
| --- | --- |
| Kill-switch ordering (#102 / #103)? | Durable **`avDisabled`** write → SFU **`/admin/teardown-producers`** (#112) → **`av_disabled`** WebSocket fan-out → token mint denial (#111/#112). In-flight **`produce`** after teardown may fail at SFU or close shortly; clients unpublish on **`av_disabled`** (#104). |
| WS fan-out timing? | **After Dynamo commit only** — no optimistic **`PostToConnection`** before conditional write succeeds. |
| SFU producer vs **RoomPresence** staleness? | **Out of scope #103** — layout runtime (#104/#105) reconciles SFU events with roster. |

## Open implementation decisions

- (none for #103 WebSocket fan-out scope)

## Primary code pointers (optional)

- Room item **version** / **optimistic locking** attribute when implemented.
