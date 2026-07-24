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
| **`lastActiveAt` on **RoomPresence** | **Last-write-wins** per **`presenceKey`** — concurrent qualifying signals from the same connection coalesce to the newest timestamp; no cross-tab merge for the same **`fanSub`**. Stale writes after disconnect are discarded by TTL / row delete. |
| **Typing state** | **Ephemeral** — no durable ordering guarantee; fan-out is best-effort per connection. |
| **Chat reconnect** | **Client-held scrollback only** — drawer-independent **`ChatSession`** reconnect does **not** replay a server transcript. The same tab retains its in-memory message buffer (~**100** cap per **`interface/presentation.md`**) while the room WebSocket recovers; late join and full page reload still receive **no** chat history. No durable queue or stronger delivery ordering is implied. |
| **Room admin mutations** | **Serial per admin** at server for durable fields (episode selection, visibility, **`roomMode`**, **`avDisabled`**, **`broadcastCaptureActive`**, **`share_state`** if echoed): **reject** concurrent conflicting ops—second writer gets **409** (HTTP) or a **business `error` envelope** on WebSocket (**conditional update** / **`version`** on the room item). WebRTC media is **SFU-mediated** on the media plane; API Gateway room WebSocket carries chat, presence, and **`share_state`** only — **no** mesh SDP/ICE relay (**#135**). **No server-side queue** for MVP. |
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

## Decisions (answered — presence and AV maturity)

| Question | Decision |
| --- | --- |
| **`lastActiveAt` concurrency? | **Last-write-wins** per **`presenceKey`** — acceptable for engagement badges; no CRDT. |
| **Active** vs **online** consistency? | **Online** follows open **RoomPresence** row; **active** follows **`lastActiveAt`** within **120s** — may briefly disagree during fan-out lag (casual ordering). |
| Typing durability? | **None** — typing fan-out has no strong consistency with **RoomPresence**; reconnect clears until new events. |

## Friends and direct messaging

| Property | Level |
| --- | --- |
| **Friendship edge** | Durable in Dynamo before clients treat the pair as friends. Accept creates the edge (and retires the pending request) as one product outcome; exact transactional bundling is tier-TW. |
| **FriendshipRequest** | Durable pending state; accept/decline/cancel are authoritative server writes. Duplicate open requests for the same unordered pair are rejected (**409**) or coalesced idempotently (same direction **200**). |
| **Remove-friend** | Mutual teardown is immediate for both parties' friendship view. DM compose/history access closes for **both** in the same outcome (hide/close). Soft vs hard delete of message bodies does not change the access rule. |
| **DM delivery / history** | **Casual / last-write-wins** ordering acceptable for MVP (room-chat precedent). History is account-lifetime durable; reconnect and open-thread sync may replay from Dynamo (unlike drawer-only room chat client buffer language). |
| **DmUnread** | Server-authoritative per recipient; clear-on-view is a durable write. Concurrent clears coalesce to the newest watermark (LWW acceptable). |
| **Friends online** | **Eventually consistent** with **RoomPresence** connect/disconnect and TTL cleanup. Brief lag or false online/offline around disconnect is acceptable; not a strongly consistent presence ledger. |

## Decisions (answered — friends and direct messaging)

| Question | Decision |
| --- | --- |
| DM consistency posture? | **Casual / LWW** for delivery and unread clear — MVP-acceptable. |
| Remove-friend visibility? | Both parties lose friendship and DM access together; no one-sided lingering read/compose. |
| Friends online vs RoomPresence? | Derived signal; may lag roster reality; no durable last-seen clock to reconcile. |

## Decisions (answered — friendship invite/accept lifecycle #356)

| Question | Decision |
| --- | --- |
| **Accept write shape?** | **TransactWrite** (preferred): delete all pending **FriendshipRequest** rows for the **`pairKey`**, **Put** **Friendship** item. Retry-safe: second accept on missing request returns **404 `friend_request_not_found`**. |
| **Decline / cancel write shape?** | Single **DeleteItem** on **`requestId`**; conditional on **`status: pending`** and caller role (recipient vs requester). |
| **Concurrent accept on reciprocal pendings?** | First successful accept wins; transaction clears **both** pendings and creates one **Friendship**. Second accept returns **404** after pendings cleared. |

## Decisions (answered — mutual remove-friend #358)

| Question | Decision |
| --- | --- |
| **Remove write shape?** | **TransactWrite** when **DmThreads** table exists: **DeleteItem** **Friendship** + **UpdateItem** **DmThread** **`status: closed`**, **`closedAt`**. Retry-safe: second remove → **404 `friendship_not_found`**. |
| **Remove vs DM send race?** | DM send/history handlers re-check friendship and closed thread **before** durable write; remove completing first denies with **403** (`friendship_not_active` / `dm_thread_closed`). |

## Open implementation decisions

- Whether **`lastActiveAt`** updates use unconditional **`UpdateItem`** or conditional max-timestamp write to reduce clock-skew regressions.
- Cross-tab **`fanSub`** badge consistency when one tab disconnects while another remains **active** — roster shows multiple **RoomPresence** rows per fan today; **active** is per-row unless product merges (tier TW).
- Accept-friendship write shape: single **TransactWrite** (delete/update request + put edge [+ ensure thread]) vs ordered multi-step with idempotency keys — **#356**: **TransactWrite** for accept; decline/cancel single delete.
- Unread watermark concurrency when both devices view the same thread (conditional update vs blind LWW).
- Online derivation freshness: strongly consistent **RoomPresence** query vs eventual; stale-online window after disconnect before TTL/row delete.

## Primary code pointers (optional)

- Room item **version** / **optimistic locking** attribute when implemented.
