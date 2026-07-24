# Error handling

## Realtime failure drawers

Watch-party failures classify to **drawers** aligned with session jurisdictions (**`domain_model.md`**). Each drawer has distinct recovery policy; a failure in one drawer does **not** imply wholesale teardown of another unless policy below requires it.

| Drawer | Typical sources | Recovery posture |
| --- | --- | --- |
| **Chat (room WebSocket)** | Send reject, socket close, backoff exhausted | Reconnect chat plane alone; do not close SFU session on chat failure. |
| **SFU signaling** | Signaling WebSocket close, JWT expiry, **`produce`** reject | Reconnect SFU plane alone; adopt refreshed token without preemptive unrelated producer teardown unless revoked. **Configuration-class** unreachable hosts (**#137**) enter persistent visible error; do not clear banner on reconnect attempt until **`session.ready`**. |
| **Connectivity (ICE/TURN)** | ICE failed, relay required, DTLS timeout | Retry ICE/TURN path; surface connectivity drawer codes; SFU signaling may stay open while ICE recovers. |
| **Produce / consume** | **`producerClosed`**, consumer attach failure, partial unpublish | Detach or update consumers and tiles per producer class; no full session rebuild when partial teardown suffices. |
| **Theater playback** | **AudioContext** suspend, autoplay block, mix graph error | Local playback recovery; does not tear down chat or SFU unless user leaves room. |

**Orthogonal reconnect:** Restoring one drawer must not rebuild another except on room leave, **`avDisabled`**, or explicit cross-drawer policy.

**`share_state: stopped`:** Room WebSocket handler detaches **`host_screen`** consumers only. It must **not** invoke full SFU session teardown for guests.

Stable drawer codes extend the participant A/V taxonomy in **`error_state.md`** (e.g. **`CHAT_SEND_DROPPED`**, **`SIGNALING_TIMEOUT`**, **`ICE_FAILED`**, **`TURN_RELAY_REQUIRED`**, **`PRODUCER_CLOSED`**).

## HTTP API

| Class | Behavior |
| --- | --- |
| **4xx client** | Stable **`code`** + **`message`** JSON body where practical; avoid leaking internals. |
| **5xx server** | Generic message to client; **full detail in logs** only. |
| **Conflict (409)** | **Optimistic lock / version mismatch** on room **`UpdateItem`** (concurrent host commands or stale **ETag**-style version). **Not** used for a separate “reclaim” protocol in MVP. |

## Friends and direct messaging

Friends/DM mutations and reads are fan JWT-gated HTTP (and optional realtime push while connected). Failures follow the same structured-reject posture as other fan APIs: stable **`code`** + recoverable client messaging. Friends/DM failure must **not** tear down a healthy room **ChatSession** or **SfuMediaSession**.

| Class | Behavior |
| --- | --- |
| **Auth miss** | Missing/invalid fan JWT → **401/403** with structured **`code`**; clients hide or disable friends/DM chrome for signed-out and guest sessions. |
| **Business deny** | No active **Friendship**, pending-only peer, self-invite, or closed **DmThread** after remove → structured reject; compose/history stay unavailable. |
| **Conflict** | Duplicate pending invite, accept of already-resolved request, or concurrent mutual invites → structured conflict/idempotent outcome (exact codes TW). |
| **Rate limit / abuse** | Friend-request or DM send throttle → **429** (or equivalent) with recoverable copy; no staff DM-body moderation path. |
| **Delivery / sync** | History sync or realtime push failure is recoverable on the friends/DM surface only; room chat drawer codes stay independent. |

## WebSocket

| Class | Behavior |
| --- | --- |
| **Protocol errors** | **Close** with sensible code + log; reconnect guidance in client (**`architecture.frontend.md`**). Chat protocol close triggers **chat drawer** reconnect only. |
| **Business reject** | **Error** message envelope with **`type: "error"`** + **`code`**; do not tear down socket for transient host rejections unless policy requires. |
| **Chat send dropped** | Structured **`code`** (e.g. **`CHAT_SEND_DROPPED`**) when outbound chat cannot be delivered; **no** SFU teardown; user may retry send after chat plane recovers. |
| **`share_state` events** | **`stopped`** detaches **`host_screen`** consumers per role/mode; **does not** close SFU signaling session for guests. **`started`** re-attaches **`host_screen`** per **`roomMode`**. |
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

## Decisions (answered — realtime hardening)

| Question | Decision |
| --- | --- |
| `share_state: stopped` handler scope? | Detach **`host_screen`** only; **no** guest full SFU session close from chat handler. |
| `share_state: started` handler scope? | **No** symmetric detach — guest re-attach via SFU **`newProducer`** in **Theater** only; **Video Chat** ignores host-screen attach (**#146**). |
| `host_screen` close vs participant theater mix? | **`theaterAudioMix`** removes **`host_screen`** nodes only; **`participant_av`** audio nodes **persist** until producer close, **`avDisabled`**, or room leave (**#145**). |
| Drawer-independent reconnect? | Each drawer recovers alone; cross-drawer destructive hooks forbidden except leave / **`avDisabled`**. |
| Typed failure domains? | Extend taxonomy with drawer codes; failures name drawer in logs/metrics contracts (**`operations/observability.md`** peer). |
| SFU config vs transient failure? | Classify **`LOCAL_SFU_UNREACHABLE`** / **`SFU_RELAY_UNREACHABLE`** per **`configuration.md`** thresholds; **no** mesh fallback. |
| Drawer code → surface mapping? | Normative table in **`error_state.md`** **Surface mapping (#141)**; shared enum in **`realtimeDrawerErrors.ts`**. |

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### friends-and-direct-messaging
- Stable structured **`code`** names for rate-limited DM send/history paths — **M35** (`friendship_not_active`, `dm_thread_closed` defined #358 / **`api_contracts.md`**).
- Whether DM send denials after remove use the same envelope family as room **`CHAT_SEND_DROPPED`** analogues or a friends/DM-specific code set — **M35**.
- Retry/backoff guidance copy for DM sync failure vs friend-list load failure.

## Primary code pointers (optional)

- **`apps/web/src/room/realtimeDrawerErrors.ts`** — shared drawer error enum and boundary mappers.
