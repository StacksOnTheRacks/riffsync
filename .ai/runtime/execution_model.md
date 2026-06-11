# Execution model

Runtime topology: **AWS serverless MVP** (**`docs/architecture.server.md`**).

## Infrastructure delivery

| Choice | Contract |
| --- | --- |
| **IaC** | **AWS CDK** (TypeScript) as the canonical way to declare stacks, synth to CloudFormation, deploy via **`cdk deploy`**. |
| **Lambda language** | **TypeScript** source → bundle/transpile → **Node.js** Lambda runtime (**`nodejs22.x`** or current LTS at ship time—pin in CDK **`Runtime`**). |

**Prefer serverless** managed services (**API Gateway, Lambda, DynamoDB, EventBridge/Scheduler, Cognito, CloudWatch**) for all default paths; add **VPC + ElastiCache** or similar only where the architecture docs already justify it.

## Compute

| Unit | Behavior |
| --- | --- |
| **Lambda** | **Stateless** **TypeScript** request handlers; concurrency scales with API Gateway / EventBridge. Assume **cold starts**; avoid long init (cache TMDB config in global with TTL). **Admin HTTP** handlers on **`/v1/admin/*`** trust **staff authorizer context** (`sub`, **`cognito:groups`**) at the edge; they do **not** repurpose the fan-only JWT verifier module bound to fan **`COGNITO_*`** env. WebSocket/SFU Lambdas keep fan pool env unchanged. |
| **API Gateway HTTP** | Routes to Lambda integration; **fan JWT authorizer** on fan-protected routes; **staff JWT authorizer** on **`/v1/admin/*`** only (second authorizer, staff pool issuer + staff SPA client audience). Cross-pool tokens fail at the gateway. |
| **API Gateway WebSocket** | **`$connect` / `$disconnect`** + route selection to Lambdas; **`PostToConnection`** for broadcast. |
| **EC2 SFU (`riffsync-sfu`)** | **Long-lived Node process** per instance: HTTP health, WebSocket upgrade on HMAC join JWT, one mediasoup **Worker**, in-memory **`roomMap`** keyed by environment and room id. Handles RTP for host tab-capture and **multi-producer** participant camera/microphone. Graceful shutdown on **SIGTERM/SIGINT** (stop accepting upgrades, close live sockets, shut down mediasoup). See **`lifecycle_shutdown.md`**. |

## Client

| Unit | Behavior |
| --- | --- |
| **Browser SPA (or SSR)** | Single TypeScript SPA (React per **`docs/architecture.frontend.md`**): fan catalog/rooms plus **gated `/admin/*`** operator surfaces in one build and one CloudFront origin; YouTube iframe per tab; **control-plane** WebSocket for parties; **media-plane** direct SFU WebSocket for WebRTC (host screen share and participant AV). **One SFU WebSocket session per browser tab** may carry multiple producers and consumers. **No** privileged secrets. **SFU-only** media path in all environments — no mesh WebRTC branch. Room orchestration is split into jurisdictional session modules (below); **`RoomPage`** is a thin shell. |

## Client session modules (realtime hardening)

Extract three runtime modules with **explicit lifecycle APIs** and **no cross-drawer destructive hooks**. Each module owns connect, disconnect, reconnect, and teardown for its drawer only.

| Module | Owns | Must not |
| --- | --- | --- |
| **`ChatSession`** | API Gateway **room WebSocket**: chat send/receive, reactions, presence-adjacent control events consumed by chat UI, room-mode and kill-switch fan-out handling that affects **chat/composability only**. | Close SFU signaling, stop **`getUserMedia`** / **`getDisplayMedia`**, or tear down mediasoup producers/consumers. |
| **`SfuMediaSession`** | Direct **SFU signaling WebSocket** per tab: ICE/TURN attach, mediasoup transports, **`host_screen`** and **`participant_av`** produce/consume, **`newProducer`** / **`producerClosed`** dispatch to subscribers. | Close room WebSocket or block chat send on SFU failure. |
| **`TheaterPlayback`** | YouTube iframe lifecycle, **client-side Web Audio** mix graph (host movie audio + **`participant_av`** audio consumers at equal gain **1.0**), **`AudioContext`** suspend/resume policy. | Own SFU signaling socket; must subscribe to **`SfuMediaSession`** for consumer attach/detach. |

### Application SDK surface (narrow public API)

Room code outside these modules calls only:

| API | Responsibility |
| --- | --- |
| **`join(roomId, options)`** | Bootstrap per **`startup_bootstrap.md`**: snapshot, **`ChatSession`**, ICE warm, **`SfuMediaSession`**, optional **`TheaterPlayback`** init. Returns handles/diagnostics refs — not raw WebSocket instances. |
| **`publishAv({ camera, mic })`** | Idempotent participant AV on **`SfuMediaSession`**; partial unpublish (camera off, mic on) without full session rebuild when publish is already supported. |
| **`subscribe({ hostScreen, participantAv })`** | Register consumer interest; **`SfuMediaSession`** attaches remote producers; **`TheaterPlayback`** wires audio mix nodes when in Theater mode. |
| **`getDiagnostics()`** | Drawer-tagged status for UI and logs: chat plane, SFU signaling, ICE/TURN, theater audio graph — see **Typed runtime errors** and **`.ai/interface/presentation.md`** (separate status surfaces). |

Implementation may colocate helpers; **module boundaries and lifecycle rules above are normative**.

### Session state machines (per module)

Each module exposes a coarse lifecycle state for UI and reconnect policy:

| State | Meaning |
| --- | --- |
| **`connected`** | Drawer operational for its contract (chat send allowed; SFU signaling up and transports usable; theater mix running if applicable). |
| **`reconnecting`** | Transient loss; module runs its own backoff/re-mint loop; **other modules stay in `connected` or `degraded` unless they independently fail**. |
| **`degraded`** | Partial function (e.g. chat open but SFU produce blocked; theater mix suspended pending user gesture). Still **not** an excuse to tear down a healthy sibling module. |
| **`torn-down`** | Module closed intentionally (navigate away, room leave, kill switch policy) or exhausted recoverable reconnect — resources released. |

**Drawer-independent reconnect:** When room WebSocket drops while SFU signaling stays open (or the reverse), the **healthy module keeps running**; only the failed module enters **`reconnecting`**. No coupled "leave room" that closes both planes unless the user navigates away or room leave policy applies globally.

### Decouple destructive hooks (room WebSocket → media)

Room WebSocket event handlers **must not** implicitly tear down **`SfuMediaSession`** unless an explicit **media policy** says so. Normative examples:

| Event / condition | Media policy |
| --- | --- |
| **`share_state: stopped`** (guest) | **Detach `host_screen` consumers only** — close host-screen mediasoup consumers and clear host-screen tile attachment. **Preserve** SFU signaling session, **`participant_av`** producers/consumers, and theater mic mix. **Do not** close full SFU WebSocket. |
| **`avDisabled`** (kill switch) | Authoritative media policy: stop participant **`getUserMedia`**, close **`participant_av`** producers, tear down participant consumers — per existing kill-switch contract. |
| **`room_mode`** → Video Chat | Stop **`host_screen`** capture and producers; detach host-screen consumers — per room-mode contract. |
| Chat WebSocket **`close` / error** | **`ChatSession`** reconnect only — **no** SFU teardown. |
| SFU signaling **`close` / error** | **`SfuMediaSession`** reconnect only — **no** room WebSocket teardown. |

### Typed runtime errors (execution boundary)

Client runtime failures crossing module boundaries use **drawer-tagged codes** (not bare **`Error`**). Canonical set includes at minimum:

| Code | Drawer | Typical cause |
| --- | --- | --- |
| **`CHAT_SEND_DROPPED`** | chat | Room WS not **`open`**; send rejected or timed out. |
| **`SIGNALING_TIMEOUT`** | SFU signaling | Join/produce/consume RPC exceeded deadline. |
| **`ICE_FAILED`** | connectivity | ICE terminal failure on transport. |
| **`TURN_RELAY_REQUIRED`** | connectivity | Host/participant path requires relay; none available. |
| **`PRODUCER_CLOSED`** | SFU media | Remote or local producer ended; consumers must detach. |
| **`SFU_TOKEN_DENIED`** | SFU signaling | Mint **403** / **429** (caps, kill switch, presence). |
| **`TRANSPORT_LIMIT_REACHED`** | SFU media | Session transport cap (**`SFU_MAX_WEBRTC_TRANSPORTS_PER_SESSION`**). |
| **`CONSUMER_LIMIT_REACHED`** | SFU media | Session consumer cap. |
| **`THEATER_AUDIO_SUSPENDED`** | theater playback | **`AudioContext`** suspended; mix inaudible until resume policy runs. |

Full UX copy and stable **`code`** strings for toggle surfaces remain in **`.ai/business_logic/error_state.md`**; modules map internal failures to these codes at the boundary. **`getDiagnostics()`** exposes active codes per drawer for separate status UI (**`.ai/interface/`**).

## Background

| Unit | Behavior |
| --- | --- |
| **Scheduled Lambda** | Reconcile + sweeper — TypeScript Lambdas — **bounded time** batch; continuation via next schedule or pagination cursors (**implementation**). |

## Decisions (answered)

| Question | Decision |
| --- | --- |
| IaC SAM vs CDK? | **CDK** as project standard. SAM/local still fine for **local** invoke/debug of individual handlers. |
| Lambda Python/Go? | **Not** default; **TypeScript** end-to-end for backend handlers unless a future component forces another runtime. |
| SFU sessions per browser tab? | **One** SFU WebSocket session per tab with multiple producers/consumers (host screen, participant cam/mic, remote consumers). |
| Participant AV media API? | **`getUserMedia`** for signed-in fan camera/microphone; **`getDisplayMedia`** for host lawful tab-capture only. Never substitute one for the other. |
| AV kill switch enforcement? | **Server-enforced:** deny participant producer SFU tokens, tear down active participant producers on SFU, broadcast authoritative **`avDisabled`** on room WebSocket. |
| SFU producer registry? | **Per-producer registry** (not one producer per kind); **`tearDownSession`** removes **only that session's producers**, not a room-wide wipe. |

## SFU producer registry (mediasoup service)

| Topic | Contract |
| --- | --- |
| **Registry shape** | Replace single **`producersByKind`** slot with **`producers: Map<producerId, { producer, sessionId, producerClass, kind }>`**. Upsert replaces the prior producer for the same **`(sessionId, producerClass, kind)`** tuple. |
| **`listProducers` / events** | Summaries and **`newProducer`** / **`producerClosed`** fan-out include **`{ producerId, kind, sessionId, producerClass }`**. |
| **Session teardown** | On SFU WebSocket close, remove **only** producers owned by that **`sessionId`** — never room-wide wipe. |
| **Room idle** | **`ROOM_IDLE_MS`** schedules router close when the room has **zero** producers across all classes. |
| **Two tabs per fan** | **Allow** — each tab **`sessionId`** may publish independently; per-room cap is the abuse guard (no **`fanSub`** dedupe MVP). |
| **Caps (env)** | **`SFU_MAX_PRODUCERS_PER_SESSION`** default **3**; **`SFU_MAX_PRODUCERS_PER_ROOM`** default **24**. Enforced at **`produce`**; Lambda mirrors room-level estimate at mint. |

## Client participant AV runtime (#104)

| Topic | Contract |
| --- | --- |
| **Single session per tab** | One SFU WebSocket + one mediasoup send/receive transport pair per browser tab (**`SfuMediaSession`**). Host may publish **`host_screen`** and **`participant_av`** concurrently; all participants attach multiple remote consumers via **`newProducer`** / **`producerClosed`** events on that session. |
| **Tile routing** | Map strip/grid attachment to **`sessionId`** + **`producerClass`** + **`kind`** from SFU events. No **`fanSub`** dedupe across tabs in MVP — two tabs from one fan appear as two tiles when both cameras are on. |
| **Camera off, mic on** | **Close the video producer** and emit/consume **`producerClosed`** for video; **remove strip/grid tile immediately** (no frozen last frame). Keep audio producer active (or **`pause()`** / **`resume()`** when mic muted with camera on). **No** full SFU session rebuild when publish already supported. |
| **Mic-only visibility** | Mic-only participants stay **off** strip/grid (audible via theater mix or Video Chat audio path only) — hardening fixes **tile lifecycle** on camera-off, not new stage chrome. |
| **Mic mute with camera on** | **`producer.pause()`** / **`resume()`** on the audio producer; camera track and video producer stay live. |
| **Page Visibility** | Leave participant producers running for MVP; battery policy revisit is out of scope. |
| **Theater audio mix** | **Client-side default:** **Web Audio API** graph via **`TheaterPlayback`**: host movie audio + each **`participant_av`** audio consumer at equal gain (**1.0**); no automatic ducking in MVP. Server-side mix **deferred**. |
| **Reconnect privacy** | After refresh or disconnect, local camera and microphone state **default off**; fan must manually re-enable (no sessionStorage persistence of publish intent). |

## Media path (all environments)

| Topic | Contract |
| --- | --- |
| **Topology** | **SFU mandatory** in local dev, CI, and prod. **Mesh WebRTC code paths removed** — single mediasoup-client execution graph. |
| **Local / CI** | Disposable **SFU + TURN** profile matching prod signaling and ICE shape — see **`startup_bootstrap.md`** and **`.ai/operations/deployment_environments.md`**. |
| **Prod** | Unchanged: **`RiffSyncTurn`** EC2 hosts coturn + **`riffsync-sfu`**. |

## Open implementation decisions

- **`ChatSession` send queue:** drop vs short buffer when room WS flaps while compose is active.
- **Per-drawer backoff:** max attempts, jitter, and user-visible **`reconnecting`** threshold before **`degraded`** — align with **`.ai/interface/`** status copy.
- **`getDiagnostics()` shape:** stable JSON fields for harness assertions and fan-visible status mapping.
- **`TheaterPlayback` resume:** implicit gesture resume vs optional explicit control — **`.ai/interface/presentation.md`**.
- **SFU JWT timer vs connected socket:** re-mint at ~60s before **`exp`** while signaling socket stays **`open`** — exact timer ownership between **`SfuMediaSession`** and token fetch helper.

## Primary code pointers (optional)

- CDK **`lib/`** stacks; **`src/handlers/**/*.ts`** (or repo convention TBD).
