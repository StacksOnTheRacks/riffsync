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
- **Room leave / navigate:** Same teardown as explicit off; close participant producers before host capture cleanup where both exist.
- **Video Chat mode:** Entering **Video Chat** fully stops host tab-capture tracks and host screen-share SFU session when sharing was active; returning to **Theater** is explicit **Share Source Tab**, not warm resume.
- **Theater audio:** Multiple SFU audio consumers (host movie + participant mics) mixed **client-side**; kill switch on stops subscribing to participant audio.

## Open implementation decisions

- Participant **`getUserMedia`** PermissionDenied / NotFoundError taxonomy and recovery (retry toggle vs settings link).
- SFU **`transport limit reached`** / **`consumer limit reached`** user-visible errors when party scales.
- Behavior when host enables AV kill switch mid-publish: force **`track.stop()`** on clients via WebSocket event vs wait for token expiry.
- Video Chat pause implementation detail: interaction with **`share_state`** WebSocket messages and **`broadcastCaptureActive`** room field.
- Room leave cleanup order when host capture and participant AV are both active.

## Primary code pointers (optional)

- `$disconnect` handler implementation.
