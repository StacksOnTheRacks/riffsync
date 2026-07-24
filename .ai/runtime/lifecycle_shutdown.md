# Lifecycle & shutdown

## Drawer-independent teardown

Realtime modules (**`ChatSession`**, **`SfuMediaSession`**, **`TheaterPlayback`**) shut down **independently** unless a **global room leave** or explicit **media policy** requires coordinated teardown. See **`execution_model.md`** decouple table.

| Trigger | ChatSession | SfuMediaSession | TheaterPlayback |
| --- | --- | --- | --- |
| Room navigate away / leave | **`torn-down`** | **`torn-down`** (ordered: stop tracks → close producers → close signaling) | **`torn-down`** |
| Room WS drop alone | Reconnect; **no** SFU close | **unchanged** if healthy | **unchanged** if healthy |
| SFU signaling drop alone | **unchanged** if healthy | Reconnect; **no** room WS close | May **`degrade`** until consumers reattach |
| **`share_state: stopped`** (guest) | **unchanged** | **Partial:** detach **`host_screen`** consumers only; **keep** session + **`participant_av`** | Remove host-screen audio node from mix; **keep** participant mic nodes |
| **`avDisabled`** | **unchanged** (chat may continue) | Stop participant AV per kill-switch | Remove participant audio from mix |

Local Cast state follows the same independence rule: Cast stop, failure, or receiver disconnect clears local Cast resources and sender **`Now Casting`** UI only. It must not tear down **`ChatSession`**, **`SfuMediaSession`**, or **`TheaterPlayback`** unless the user also leaves the room or another explicit media policy applies.

Friends/DM client state follows the same independence rule: closing a DM panel, friends dropdown, or Friends tab — or a friends/DM reconnect failure — clears only that social surface. It must not tear down **`ChatSession`**, **`SfuMediaSession`**, **`TheaterPlayback`**, or Cast. Global room leave may stop room-scoped listeners, but must not invent a coupled “leave friends” that closes healthy media/chat drawers solely because Friends unmounted.

## Friends online and DM teardown

| Trigger | Contract |
| --- | --- |
| **Friend leaves all rooms (`$disconnect` / presence TTL)** | That friend’s **RoomPresence** rows clear per existing room disconnect. Friends-list **online** for observers becomes false on next derive/query (or push if a friends online channel exists). No last-seen durable write. Room People roster for *other* rooms is unchanged. |
| **Viewer closes friends dropdown / DM panel (main site)** | Local UI + optional DM listeners for that surface stop. No room leave, no SFU teardown, no **`ChatSession`** close. |
| **Viewer leaves Friends tab (room shell)** | Local Friends/DM listeners for that tab may stop. **`ChatSession`**, SFU, theater, Cast, and People remain per their own policies. |
| **Global room leave / navigate away** | Existing ordered room teardown applies. Friends/DM main-site session (if any) is orthogonal and may continue on catalog routes after leave. |
| **Account-closure / explicit DM delete purge (later)** | Bounded **Scheduler → Lambda** batch class (same as stale-room sweeper). Not a long-lived worker. Exact rule names and batch sizing are open. |

## Typing and active teardown (`ChatSession`)

| Trigger | Contract |
| --- | --- |
| **Intentional room leave / navigate** | Before **`ChatSession`** reaches **`torn-down`**, emit **`typing_stop`** when local compose was in typing state and room WS is still **`open`**. Clear local typing map for all remote **`sessionId`** keys. |
| **Room WS drop alone** | Clear **local** inbound typing indicators immediately. **`typing_stop`** outbound is **best-effort** if the socket is already closed — server **`$disconnect`** clears authoritative typing for that connection. **`ChatSession`** reconnect does **not** reset durable **`lastActiveAt`** on self or peers. |
| **SFU signaling drop alone** | **No** typing or **active** teardown — **`ChatSession`** unchanged. |
| **Global leave order** | Typing stop and chat teardown occur in step (4) **`ChatSession`** teardown after SFU participant track stop (steps 1–3 unchanged). |

## API Gateway WebSocket **`$disconnect`**

- Must **eventually** remove **connectionId → room** mappings and adjust presence counts if tracked.
- **Typing teardown:** clear the disconnecting connection's in-flight typing indicator server-side and fan out **`typing_stop`** semantics to room members (ephemeral — no **RoomChat** write). **`lastActiveAt`** on **RoomPresence** is **not** cleared on disconnect — durable badge history until TTL or stale-row cleanup.
- **Best-effort only:** clients may disappear without clean close — rely on **`lastActivityAt`** + pings for room liveness (**`README.md`** room lifecycle); stale remote typing entries expire when the sender's row is removed or typing TTL elapses.

## Lambda

- **No graceful drain** semantics required beyond finishing in-flight invocation; Dynamo writes should be **idempotent** where retries occur.

## Scheduled jobs

- **Timeout:** batch with **continuation token** / next schedule if catalog too large for one invocation (**implementation detail**).

## EC2 SFU

- **Session teardown:** On SFU WebSocket close or error, **`tearDownSession`** removes **only that session's producers** from the room registry, not all producers in the room.
- **Graceful shutdown:** **SIGTERM/SIGINT** stops accepting new WebSocket upgrades, closes live signaling sockets, then shuts down mediasoup Worker. Clients rely on SPA reconnect policy; expect brief media blip on deploy.
- **AV kill switch:** When host enables kill switch, server tears down active participant producers on SFU, denies new participant producer tokens, and fans out **`avDisabled`** on room WebSocket. Clients stop participant **`getUserMedia`** tracks and tear down participant SFU consumers locally.

## SPA participant AV

- **Camera off, mic on:** **Close video producer**; propagate **`producerClosed`** for video; **detach remote tile immediately** (frozen last frame is a contract violation). Keep audio producer (or **`pause()`** / **`resume()`** when mic muted with camera on). **No** full SFU session rebuild when publish already supported.
- **Toggle off (both):** Stop local **`getUserMedia`** tracks and close participant SFU producers; do not leave muted ghost producers.
- **Mic mute with camera on:** Prefer **`producer.pause()`** / **`resume()`** on the audio producer; keep the camera track and video producer running.
- **`share_state: stopped` (guest):** Detach **`host_screen`** mediasoup consumers and clear host-screen UI attachment only. **Do not** close SFU WebSocket or tear down **`participant_av`** producers/consumers.
- **Room leave / navigate:** Teardown order: (1) stop participant **`getUserMedia`** and close **`participant_av`** producers, (2) stop host tab-capture and close **`host_screen`** producer if active, (3) close **`SfuMediaSession`**, (4) **`ChatSession`** teardown, (5) **`TheaterPlayback`** teardown.
- **Video Chat mode:** Entering **Video Chat** fully stops host tab-capture tracks and **`host_screen`** SFU producer when sharing was active; clear local **`broadcastCaptureActive`**; do **not** warm-resume capture or emit optimistic **`share_state`**. Returning to **Theater** is explicit **Share Source Tab**.
- **Theater audio:** Multiple SFU audio consumers (host movie + participant mics) mixed **client-side** via **Web Audio API** at **equal gain (1.0)** — no automatic ducking in MVP. Kill switch on stops subscribing to participant audio and tears down participant consumers.
- **Kill switch mid-publish:** On authoritative **`avDisabled`** room WebSocket event, immediately **`track.stop()`** on local **`getUserMedia`**, close participant producers, and tear down participant AV consumers locally — do **not** wait for SFU token expiry.

## SPA local Cast

- **Active Cast UI (#274):** After receiver render confirmation, active Cast owns the sender **`Now Casting`** UI and Stop Cast control. Activating Stop Cast begins local stop intent and may enter a local stopping state, but it must not clear room membership, chat draft/session state, selected sidebar tab, SFU signaling, or **`TheaterPlayback`** by itself.
- **Stop Cast restoration (#276):** A successful intentional Stop Cast runs idempotent, best-effort cleanup for sender-side Cast session handles, Cast channel listeners, receiver presentation bindings, and hidden/detached Cast source bindings, then clears local Cast-active UI and returns the sender stage to normal in-page playback. The restored stage uses the latest room shell state already held locally.
- **Failure and disconnect boundary (#278):** Receiver disconnect, sender SDK-ended active sessions, stop failure, start failure beyond #273, blocked Cast, and unavailable Cast may reuse the same cleanup helper, but #278 owns their user-facing local status, failed/ended states, and retry behavior.
- **Failure recovery (#278):** For **`CAST_SESSION_ENDED`** and **`CAST_PLAYBACK_BLOCKED`**, cleanup clears active Cast UI, releases sender-side Cast handles/listeners best-effort, keeps chat/sidebar/room/SFU state mounted, and restores or keeps the normal in-page playback surface visible. For **`CAST_STOP_FAILED`**, cleanup must not pretend stop succeeded while the sender still has an active route; keep Stop Cast retryable and preserve room participation.
- **Room leave / navigate / reload:** clear local Cast state and release Cast/source resources best-effort before or alongside global room teardown. Failure to stop an already-ended receiver session must not block room leave.
- **Cast start failure:** restore or keep normal in-page playback visible, keep chat draft/session state intact, and avoid closing healthy chat or SFU drawers.
- **Custom receiver launch failure (#273):** if the sender SDK rejects launch, the user cancels the chooser, or the receiver does not confirm rendering stage-primary video plus chat overlay, clear **`CAST_STARTING`**, surface **`CAST_START_REJECTED`**, and keep normal playback visible.
- **Expanded view state:** Cast starts only from normal view. If stale expanded-view local state exists internally, cleanup must not re-enter expanded view after Cast stop unless a later interface contract permits it.
- **Participant isolation (#277):** local Cast cleanup must be idempotent and sender-only. It must not close room WebSocket, close SFU signaling, stop participant **`getUserMedia`**, clear remote consumers, change **`share_state`**, mutate room state, clear other viewers' stage/chrome, or broadcast room cleanup messages.
- **Verification (#279):** cleanup tests cover successful stop, failed stop, receiver disconnect, SDK-ended active sessions, blocked playback, start failure, unavailable Cast, room leave, navigation, and reload. They assert idempotent release of sender-side Cast session handles, Cast channel listeners, receiver presentation bindings, hidden/detached Cast source bindings, timers, and stale UI state while preserving healthy room modules and authority.
- **Lifecycle matrix verification (#305):** start, pending render, active Cast, normal stop, receiver loss, blocked playback, failed stop, sender navigation, reload, and repeated cleanup paths all prove the same boundary: local Cast cleanup updates only the casting sender's local UI and Cast resources. Tests assert no room HTTP mutation, room WebSocket send/fan-out, SFU token request, `ChatSession` teardown, `SfuMediaSession` teardown, `TheaterPlayback` teardown, presence write, chat send, `share_state`, `roomMode`, `avDisabled`, durable room field, room diagnostics, or other-participant UI change occurs solely because of Cast.

## Participant A/V errors (client)

| Condition | UX |
| --- | --- |
| **`NotAllowedError`** (permission denied) | Inline recoverable error at toggles; camera/mic remain off; user retries on next toggle click after fixing browser/OS permission. |
| **`NotFoundError`** (no device) | Inline **"No camera or microphone found"** at toggles; remain off until user retries. |
| SFU **`transport limit reached`** / **`consumer limit reached`** | Inline hard-fail on toggle with SFU error message; toggle returns off; no silent retry loop. |
| Token / cap rejection (**403** / **429**) | Inline error at toggle; return to off per **`error_state.md`**. |

## Decisions (state machines — #140)

| Topic | Decision |
| --- | --- |
| **`SfuMediaSession` reconnect mid-publish** | **No** producer **`pause()`** during signaling reconnect — rely on mediasoup transport recovery without full session rebuild. |
| **Theater mode transition** | On **Video Chat → Theater**, **`RoomRealtimeSdk.initTheaterPlayback()`** then **`applySubscribeHandlers()`** reattaches SFU consumers and mix nodes; ordered warmup avoids silent black screen beyond existing **Updating room layout…** copy. |
| **Harness-visible teardown assertions** | Unit tests and **`realtime-conformance`** steps 5–6 assert **`getDiagnostics()`**: failed drawer **`reconnecting`** during outage, **`connected`** after recovery; sibling drawer **`connected`** throughout. Chat-only drop must **not** set **`sfuSignaling`** or **`sfuSignaling.health.connectivity`** to **`torn-down`**. SFU-only drop must **not** set **`chat`** to **`torn-down`**. Health sub-snapshots (**#158**) follow the same sibling independence rules. M18 wiring enforcement and regression tests: **#147**, sub-issues **#200–#202**. |

## Decisions (answered — presence and AV maturity)

| Topic | Decision |
| --- | --- |
| **Typing on disconnect** | Client emits **`typing_stop`** on intentional leave when compose was typing; server clears typing state on **`$disconnect`** and fans ephemeral stop to peers. |
| **`lastActiveAt` on disconnect** | **Preserve** on **RoomPresence** until row TTL — disconnect does not force **active** false for historical accuracy on late **`presence_request`**. |
| **Drawer isolation** | Typing/active teardown is **`ChatSession`** only — SFU or theater modules **must not** clear typing maps or **`active`** roster fields. |

## Decisions (answered — M22 typing shutdown)

| Topic | Decision |
| --- | --- |
| **`typing_stop` on tab close** | Browser **`beforeunload`** may emit **`typing_stop`** best-effort only; authoritative clear is server **`$disconnect`** (removes typing fan-out state) plus client teardown. |

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### friends-dm-lifecycle
- Whether friends online updates on the main site use push, poll/snapshot refresh, or hybrid after a peer’s room `$disconnect` (integration wire; runtime requires eventual consistency with **RoomPresence** truth, not a new presence process).
- **Leave room with open nested DM (#364):** Preserve in-progress compose text in **`FanDmSession`** in-memory state for the browser session. **`RoomPage`** teardown / **Leave Party** must **not** close SFU or **`ChatSession`** because Friends/DM is active. Draft is **not** written to **`localStorage`**; full page reload clears unsent compose.
- Account-closure DM purge Scheduler/Lambda naming and batch continuation tokens when that job is scheduled.

### chromecast-lifecycle-shutdown
- No open implementation decisions remain for M25 Cast lifecycle cleanup verification. See **SPA local Cast** and **Verification (#279)** above.

## Primary code pointers (optional)

- `$disconnect` handler implementation.
