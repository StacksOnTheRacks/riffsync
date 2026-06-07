# Lifecycle & shutdown

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

- **Toggle off:** Stop local **`getUserMedia`** tracks and close participant SFU producers; do not leave muted ghost producers.
- **Mic mute with camera on:** Prefer **`producer.pause()`** / **`resume()`** on the audio producer; keep the camera track and video producer running.
- **Room leave / navigate:** Teardown order: (1) stop participant **`getUserMedia`** and close **`participant_av`** producers, (2) stop host tab-capture and close **`host_screen`** producer if active, (3) close SFU session, (4) room WebSocket teardown per existing navigation.
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

## Open implementation decisions

- Page Visibility battery policy for participant producers while tab backgrounded (**MVP:** leave running per **`execution_model.md`**).

## Primary code pointers (optional)

- `$disconnect` handler implementation.
