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

## API Gateway WebSocket **`$disconnect`**

- Must **eventually** remove **connectionId → room** mappings and adjust presence counts if tracked.
- **Best-effort only:** clients may disappear without clean close — rely on **`lastActivityAt`** + pings for room liveness (**`README.md`** room lifecycle).

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

## Open implementation decisions

- Page Visibility battery policy for participant producers while tab backgrounded (**MVP:** leave running per **`execution_model.md`**).

## Primary code pointers (optional)

- `$disconnect` handler implementation.
