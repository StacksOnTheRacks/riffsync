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

### Transition tables (normative — #140)

Each module implements the four drawer lifecycle states. Internal enums may differ; **`RoomRealtimeSdk.getDiagnostics()`** maps to the strings below.

**`ChatSession`**

| From | Event | To |
| --- | --- | --- |
| **`torn-down`** | **`connect()`** / first **`openSocket()`** after join | **`reconnecting`** (maps from internal **`connecting`**) |
| **`reconnecting`** | Room WS **`open`** | **`connected`** |
| **`reconnecting`** | WS **`close`** / **`error`** while reconnect enabled | **`reconnecting`** (schedule backoff) |
| **`reconnecting`** | **3** consecutive reconnect cycles without **`open`** | **`degraded`** |
| **`connected`** | WS **`close`** / **`error`** | **`reconnecting`** |
| **`connected`** | Outbound send while WS not **`open`** | stays **`connected`** or **`reconnecting`**; surfaces **`CHAT_SEND_DROPPED`** at SDK boundary |
| **`*`** | **`disconnect()`** / intentional teardown | **`torn-down`** |

**`SfuMediaSession`**

| From | Event | To |
| --- | --- | --- |
| **`torn-down`** | **`connect()`** after room join bootstrap (**`sessionId`** + API base; **not** gated on chat WS flap) | **`reconnecting`** (maps from internal **`connecting`**) |
| **`reconnecting`** | Signaling WS **`open`** + session ready | **`connected`** |
| **`reconnecting`** | Signaling **`close`** / recoverable error | **`reconnecting`** (backoff per **`sfuReconnectPolicy.ts`**) |
| **`reconnecting`** | **5** failed reconnect cycles without stable **`open`** | **`degraded`** |
| **`connected`** | Signaling **`close`** / error | **`reconnecting`** |
| **`connected`** | Config-class failure (**`LOCAL_SFU_UNREACHABLE`**, etc.) | **`degraded`** (persistent until user/config fix) |
| **`connected`** | JWT re-mint failure while WS **`open`** | **`degraded`** |
| **`*`** | **`disconnect()`** / intentional teardown | **`torn-down`** |
| **`*`** | Room WS drop alone | **unchanged** — **no** transition to **`torn-down`** |

**`TheaterPlayback`**

| From | Event | To |
| --- | --- | --- |
| **`torn-down`** | Theater layout active + **`initTheaterPlayback()`** | **`connected`** |
| **`torn-down`** | Room mode → **Video Chat** | **`torn-down`** (theater graph disposed) |
| **`connected`** | **`AudioContext`** **`suspended`** while mix active | **`degraded`** |
| **`degraded`** | User gesture / **`resumeIfSuspended()`** success | **`connected`** |
| **`connected`** | SFU consumer detach for **`host_screen`** only (**`share_state: stopped`**) | **`connected`** (host-screen mix node removed; participant mic nodes persist) |
| **`connected`** | SFU signaling drop (sibling module) | **`degraded`** until consumers reattach or mix idle |
| **`*`** | **`dispose()`** / room leave | **`torn-down`** |

**Cross-drawer isolation (must never occur)**

| Trigger | Forbidden side effect |
| --- | --- |
| Room WS **`close`** alone | SFU **`disconnect()`**, **`getUserMedia`** stop, full producer wipe |
| SFU signaling **`close`** alone | Room WS **`disconnect()`**, chat log clear |
| **`share_state: stopped`** | Full SFU session close; participant AV producer teardown |
| Chat send failure | SFU reconnect or unpublish |

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
| **`SFU_RELAY_URL_MISSING`** | SFU signaling | No WS base resolved (missing token **`wsUrl`** and build-time override). |
| **`LOCAL_SFU_UNREACHABLE`** | SFU signaling | Local disposable signaling host not accepting connections (**#137**). |
| **`SFU_RELAY_UNREACHABLE`** | SFU signaling | Prod (non-local) signaling host unreachable after classified retry threshold (**#137**). |

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

## Decisions (module extraction — #138)

| Topic | Decision |
| --- | --- |
| **Module paths** | **`apps/web/src/room/sessions/ChatSession.ts`**, **`SfuMediaSession.ts`**, **`TheaterPlayback.ts`** — framework-agnostic classes with colocated **`*.test.ts`**. RoomPage uses thin hooks/factories that hold module instances; module files do **not** import React. |
| **`ChatSession` absorbs** | **`useRoomWebSocket.ts`** connect/reconnect/ping/send; inbound demux for **`chat`**, **`chat_gif`**, **`react`**, **`presence`**, **`room_mode`**, **`av_disabled`**, **`share_state`** frames. Chat-owned state: message log helpers, reaction merge, presence roster updates for chat/People UI. |
| **`SfuMediaSession` absorbs** | **`sfu/sfuRoomSession.ts`**, **`sfu/mediasoupSharing.ts`** connection lifecycle, **`sfu/participantAvSession.ts`** publish gate binding, ICE fetch, SFU token mint/reconnect policy, **`newProducer`** / **`producerClosed`** dispatch. |
| **`TheaterPlayback` absorbs** | **`audio/theaterAudioMix.ts`**, YouTube iframe ref lifecycle, host **`host_screen`** audio consumer attach to mix graph. Subscribes to **`SfuMediaSession`** consumer events — does **not** own SFU signaling socket. |
| **Media policy callbacks** | **`ChatSession`** forwards **`share_state`**, **`room_mode`**, **`av_disabled`** to registered **`SfuMediaSession`** / **`TheaterPlayback`** policy handlers — **no** implicit SFU teardown inside chat WS message handlers. |
| **Mesh removal** | Delete **`apps/web/src/room/sharing/**`**, mesh prod warning UI, and **`isMeshWatchPartyMediaEnabled`** branches from **`RoomPage`** during extraction. **`realtimeDiagnostics.ts`** signaling counters may remain until #157 retags logs per drawer. |
| **`RoomPage` shell** | Retains route/snapshot fetch, sidebar tabs, compose, stage layout, host bar, AV toggle chrome, a11y announcer. Target **≤ 900** lines after extraction (layout + wiring only). |
| **Extraction vs SDK (#139)** | Modules expose class methods first; narrow **`join` / `publishAv` / `subscribe` / `getDiagnostics`** facade lands in #139 — extraction must not block on facade naming. |
| **Extraction vs state machines (#140)** | Modules may use internal **`connected` / `closed`** flags during extraction; formal **`reconnecting` / `degraded` / `torn-down`** substates and drawer isolation enforcement land in #140. |

## Decisions (narrow SDK — #139)

| Topic | Decision |
| --- | --- |
| **Facade module** | **`apps/web/src/room/sessions/RoomRealtimeSdk.ts`** — framework-agnostic class with colocated **`RoomRealtimeSdk.test.ts`**. Only **`join`**, **`publishAv`**, **`subscribe`**, **`getDiagnostics`**, and **`teardown`** are public on the facade. Session module classes remain importable **only** from the SDK file and sibling session modules — not from **`RoomPage`**, stage, or chat UI. |
| **`join(roomId, options)`** | Accepts pre-fetched **`RoomSnapshot`**, guest **`sessionId`**, display name, optional fan JWT, API/WS base URLs, and host/guest role hints. Runs bootstrap order from **`startup_bootstrap.md`**: construct **`ChatSession`** → ICE warm → **`SfuMediaSession`** → **`TheaterPlayback`** when layout is Theater. Returns the SDK instance; **no** raw **`WebSocket`** or mediasoup handles escape the sessions package. |
| **`publishAv({ camera, mic })`** | Idempotent delegate to **`SfuMediaSession`** participant publish gate. Partial unpublish (camera off, mic on) without full session rebuild when publish is already supported. |
| **`subscribe(handlers)`** | Register **`hostScreen`** and/or **`participantAv`** consumer handler groups. Re-registering replaces prior handlers. **`SfuMediaSession`** attaches remote producers; **`TheaterPlayback`** wires audio mix nodes when Theater layout is active. |
| **`getDiagnostics()`** | Returns **`RoomRealtimeDiagnostics`** snapshot (stable field names for harness + UI mapping): **`roomId`**, **`sessionId`**, **`asOf`** (ISO-8601), **`drawers.chat`**, **`drawers.sfuSignaling`**, **`drawers.theaterPlayback`**, **`activeErrorCodes`**. Each drawer object: **`{ state, lastErrorCode? }`** where **`state`** is **`connected` \| `reconnecting` \| `degraded` \| `torn-down`**. Optional **`sfuSignaling`**: **`role`**, **`producerCount`**, **`consumerCount`**. Optional **`theaterPlayback.audioContextState`**. Top-level **`activeErrorCodes`** lists all drawer-tagged codes currently asserted (multi-code allowed). |
| **Dev-only diagnostics** | **`realtimeDiagnostics.ts`** (`?diag=1`, **`window.riffsyncRealtimeDiag`**) remains separate from **`getDiagnostics()`** — timeline counters and JWT probes are maintainer tooling, not the fan status contract. |
| **SDK vs state machines (#140)** | #139 may map module-internal coarse flags to the four lifecycle states; formal transition tables and drawer isolation enforcement land in #140. |
| **SDK vs typed errors (#141)** | #139 exposes **`lastErrorCode`** / **`activeErrorCodes`** strings from module boundaries; canonical UX copy and toggle **`aria-describedby`** mapping land in #141. |

## Decisions (state machines — #140)

| Topic | Decision |
| --- | --- |
| **`ChatSession` send queue** | **Drop** when room WS is not **`open`** — no in-memory queue. Failed compose send surfaces **`CHAT_SEND_DROPPED`**; inline compose feedback **and** chat drawer status banner (**`interaction_flow.md`**). |
| **Per-drawer backoff** | Shared constants in **`apps/web/src/room/sessions/drawerReconnectPolicy.ts`**. **Chat:** 1000ms initial delay, ×2 per failed cycle, 60000ms cap; **`degraded`** after **3** cycles without **`open`**. **SFU:** **`sfuReconnectPolicy.ts`** (600ms base, 45000ms cap); **`degraded`** after **5** failed cycles. **`reconnecting`** visible immediately on WS close. No jitter in MVP. |
| **`TheaterPlayback` resume** | **Implicit gesture resume** via existing play hints and **`AudioContext.resume()`** on user tap/play; drawer **`degraded`** when **`audioContextState === 'suspended'`** in Theater layout. No persistent **Enable party audio** control in #140. |
| **SFU JWT re-mint timer** | **`SfuMediaSession`** owns one **`setTimeout`** at **`exp - 60s`** wall clock while signaling WS is **`open`**; proactive **`POST /v1/webrtc/sfu-token`** re-mint. Timer cleared on teardown. Re-mint failure → drawer **`degraded`**, not **`torn-down`**. |
| **Reconnect mid-publish** | **No** producer **`pause()`** during SFU signaling reconnect — rely on mediasoup transport recovery (**`lifecycle_shutdown.md`**). |
| **Theater return from Video Chat** | **`RoomRealtimeSdk`** re-runs **`applySubscribeHandlers()`** after **`initTheaterPlayback()`** so consumers and mix nodes reattach. |
| **Harness / unit assertions** | After forced chat-only WS drop: **`getDiagnostics().drawers.chat`** is **`reconnecting`** then **`connected`**; **`drawers.sfuSignaling`** stays **`connected`**. Inverse for SFU-only drop. See **`lifecycle_shutdown.md`** and **`build_packaging.md`** steps 5–6. |

## Decisions (typed errors — #141)

| Topic | Decision |
| --- | --- |
| **Module boundary typing** | Session modules emit **`RealtimeDrawerError`** ( **`code`**, **`drawer`**, optional **`cause`**) — not bare **`Error`**. **`RoomRealtimeSdk`** maps to **`lastErrorCode`** / **`activeErrorCodes`**. |
| **Implementation files** | **`realtimeDrawerErrors.ts`** (types + mappers), **`drawerErrorPresentation.ts`** (copy + DOM ids). |

## Decisions (mediasoupSharing per-kind API — #144)

| Topic | Decision |
| --- | --- |
| **`unpublishProducerKind`** | Add **`(producerClass, kind)`** to **`SfuUnifiedSessionHandle`**. Closes the single live producer matching the tuple, removes it from **`liveProducers`**, and relies on **`producer.close()`** so the SFU emits **`producerClosed`** for that **`producerId`**. No-op when no matching producer. |
| **`unpublishProducerClass`** | Unchanged semantics — closes **all** producers for a class. Used for session **`close()`**, both-axes-off, kill switch, and room leave. **Not** for camera-off-mic-on or mic-off-camera-on. |
| **`publishStream` incremental produce** | Remove the leading **`unpublishProducerClass(producerClass)`** call. For each track in the stream: if the same **`(producerClass, kind)`** already publishes that **track id**, skip; else **`unpublishProducerKind(producerClass, kind)`** then **`produce`**. Kinds **not** present in the stream are **left running** — callers close them via **`unpublishProducerKind`**. |
| **`classAlreadyPublishing`** | Evaluate per **`(producerClass, kind)`** tuple, not class-wide. |
| **`publishChain`** | All produce and per-kind unpublish before produce stay on the existing serialized chain. |
| **`host_screen`** | Single-video class uses the same incremental path (at most one video kind). |
| **Consumer of APIs** | **`participantAvSession`** (#143) calls **`unpublishProducerKind`** from **`disableCamera` / `disableMic`**; **`syncPublish`** uses incremental **`publishStream`**. Same **`feature/issue-143`** branch may ship both issues. |

## Decisions (drawer wiring enforcement — #147)

M18 hardening enforces the #140 transition tables in live React wiring. Normative fixes for known contradictions:

| Topic | Decision |
| --- | --- |
| **SFU hook `enabled` gate** | **`SfuMediaSession`** connect/reconnect loops must **not** be disabled when **`ChatSession`** status is not **`open`** after initial room join. Room snapshot + **`sessionId`** (+ fan JWT when required) gate bootstrap only — not chat WS flap. |
| **Chat WS handlers** | Inbound/outbound chat reconnect paths must **not** call **`SfuMediaSession.disconnect()`**, stop **`getUserMedia`**, or wipe mediasoup transports without explicit media policy (**`share_state`**, **`av_disabled`**, **`room_mode`**, global leave). |
| **SFU reconnect handlers** | Signaling reconnect must **not** call **`ChatSession.disconnect()`** or clear chat scrollback. |
| **Status surface coupling** | Video-relay status resolvers (**`sfuRelayStatusCopy.ts`**) must **not** accept chat WS state — chat reconnect copy lives on the **sidebar chat banner** only (**`.ai/interface/presentation.md`**). Retire combined **"Reconnecting chat… Video may pause briefly."** |
| **Verification** | **`RoomRealtimeSdk.test.ts`** (and future harness steps 5–6) assert chat-only vs SFU-only outage matrix per **`lifecycle_shutdown.md`**. Sub-issues **#200–#202**. |

## Decisions (M19 status surfaces — #150)

| Topic | Decision |
| --- | --- |
| **UI input** | Room shell status banners read **`getDiagnostics().drawers.*`** lifecycle + **`lastErrorCode`** — not ad hoc **`wsStatus`** / **`sfuRoomErr`** strings in presentation components. |
| **Copy module** | Lifecycle strings and error-code templates resolve through **`drawerErrorPresentation.ts`** per **`error_state.md`** Surface mapping (#141). |
| **M19 gate** | Parent **#150** tracks M19 milestone exit: peer issues **#201**, **#207**, **#186** ship; sub-issue **#209** adds room-shell integration tests for simultaneous banners. |
| **Out of scope** | Tile attach/detach hardening (**#152**). |

## Decisions (M19 guest host-screen status — #151)

| Topic | Decision |
| --- | --- |
| **FSM source** | **`TheaterPlayback.getSnapshot().guestShareFsm`** drives guest host-screen attach states until **`getDiagnostics().drawers.theaterPlayback`** gains finer lifecycle (**#183** peer). |
| **Copy resolver** | **`resolveGuestVideoRelayStatusLine({ sfuRelayError, guestShareFsm })`** — **no** chat WS parameter. Config-class SFU errors win over FSM copy. |
| **DOM id** | Guest playback status line uses **`#riffsync-video-relay-status`**; maps to **`aria-describedby`** targets in **`error_state.md`** for drawer error codes on the same surface. |
| **Idle UX** | **`idle`** shows **Waiting for host to share…** on the video-relay status line only — retire duplicate placeholder copy in **`RoomPlaybackPanel`**. |
| **Mesh retirement** | No **`negotiating_ice`**, **`recovering_ice`**, or mesh ICE strings in stage playback path; grep-clean **`apps/web`**. |
| **M19 gate** | Parent **#151** tracks ship; sub-issues **#210–#212**; peer **#201** for chat decoupling. |

## Decisions (M19 tile lifecycle — #152)

| Topic | Decision |
| --- | --- |
| **Scope** | **Preserve** mic-only off strip/grid rule; **harden** tile attach/detach on video **`producerClosed`** only — no avatar chips, audible-only badges, or speaking-border chrome. |
| **M19 gate** | Parent **#152** tracks M19 milestone exit when peer **#142** acceptance criteria pass across Theater strip, Video Chat grid, and narrow horizontal row. |
| **Implementation** | Peer parent **#142** with sub-issues **#188–#190** on **`feature/issue-142`** — consumer detach → **`videoConsumers`** sync, **`ParticipantVideoTile`** **`srcObject`** cleanup, regression tests. |
| **Timing contract** | Tile leaves strip/grid within **one React commit** after consumer **`detach`**; **`<video>`** **`srcObject = null`** before next paint (**`presentation.md`**). |
| **Out of scope** | Mic-only stage chrome, mode-transition empty-state copy variants, tile lifecycle telemetry — not **#152**. |

## Decisions (participant AV publish gate — #148)

| Topic | Decision |
| --- | --- |
| **Client publish gate inputs** | **`ParticipantAvPublishGate`** gates **`canPublish`** on **`fanToken`** (signed-in fan JWT present) and **`!avDisabled`** only. **Remove `wsOpen`** — chat WebSocket status must **not** disable toggles or clear publish intent when SFU signaling is healthy. |
| **Server mint enforcement** | **`POST /v1/webrtc/sfu-token`** still requires active room presence row + **`X-Session-Id`**. Client re-establishes presence after chat reconnect before re-mint when needed (**`api_contracts.md`**). Token denial surfaces via existing toggle / SFU error paths — not preemptive **`canPublish: false`** from chat WS flap. |
| **SFU reconnect + publish intent** | On recoverable SFU signaling **`close`** (not **`user_close`** / exhausted retry), **preserve** **`cameraEnabled`** / **`micEnabled`** intent. Detach mediasoup session handle only; **do not** call class-wide **`unpublishProducerClass('participant_av')`** or **`getUserMedia` `track.stop()`** from the reconnect loop. **`attachSession`** + **`syncPublish`** resumes producers when signaling returns. |
| **`resetOnReconnect` semantics** | Narrow to **session detach for signaling blip** — clear in-flight **`busy`**, detach handle, **keep** toggle intent and local preview tracks. Distinct from **`teardownPublishing`** (kill switch, room leave, **`avDisabled`**). **`failPublish`** unchanged for hard / exhausted signaling failures (**`participantAvErrorFromSfuSessionEnd`**). |
| **Wiring surfaces** | Drop **`wsOpen`** from **`useSfuMediaSession`**, **`useRoomSessionWiring`**, and **`RoomRealtimeSdk.bootstrapMediaPlanes`** gate updates. **`updatePublishGate`** accepts **`fanToken`** + **`avDisabled`** only. |
| **Verification** | Unit tests: chat-only WS flap leaves **`needsProducerToken`** true when camera/mic were on; SFU **`signaling_close`** with publish intent preserves toggles and re-**`syncPublish`** on re-attach. Sub-issues under **#148**. |

## Decisions (chat send while SFU degraded — #149)

| Topic | Decision |
| --- | --- |
| **Send path gating** | **`RoomRealtimeSdk.sendControl`** and compose handlers (**`sendChat`**, **`sendChatGif`**, **`toggleChatReaction`**) must **not** consult SFU signaling status, **`sfuRoomErr`**, or **`drawers.sfuSignaling.state`**. Only **fan JWT** (for gated actions) and **chat-plane health** gate outbound delivery. |
| **SFU-only outage** | When **`drawers.chat.state === 'connected'`** and **`drawers.sfuSignaling`** is **`reconnecting`** or **`degraded`**, text/GIF/reaction sends **proceed** if room WS is **`open`**. **`CHAT_SEND_DROPPED`** must **not** appear in **`activeErrorCodes`** solely because SFU is unhealthy. |
| **`ChatSession.send` contract** | Returns **`boolean`** — **`true`** when payload is written to an **`open`** socket; **`false`** when WS is missing, not **`open`**, or **`ws.send`** throws. Callers clear compose draft **only** on **`true`**. |
| **`CHAT_SEND_DROPPED` boundary** | Set on **`false`** send result or chat drawer **`error`** status — **never** on SFU signaling **`error`** / **`reconnecting`**. Cleared when chat returns **`open`**. |
| **Compose feedback** | On drop: inline compose **`role="status"`** region with **`error_state.md`** copy; chat drawer banner shows **Reconnecting chat…** or degraded copy per **`presentation.md`**. Draft text **retained** for manual retry. |
| **Verification** | Unit tests: SFU-only simulated outage leaves chat send callable and does not set **`CHAT_SEND_DROPPED`**; chat-only outage sets drop code and retains draft. Sub-issues under **#149**. |

## Open implementation decisions

_(None for #140 / #147 / #148 / #149 scope.)_

## Primary code pointers (optional)

- **`apps/web/src/room/sessions/drawerReconnectPolicy.ts`** — shared chat/SFU degraded thresholds and chat backoff constants (**#140**).
- **`apps/web/src/room/sessions/RoomRealtimeSdk.ts`** — narrow public realtime API (**#139**); maps module FSM to **`getDiagnostics()`** (**#140**).
- **`apps/web/src/room/sessions/`** — **`ChatSession`**, **`SfuMediaSession`**, **`TheaterPlayback`** formal lifecycle FSM (**#140**).
- **`apps/web/src/pages/RoomPage.tsx`** — thin shell wiring session modules to room chrome.
- **`apps/web/src/room/sfu/`** — low-level mediasoup helpers absorbed by **`SfuMediaSession`** during extraction; directory may shrink to shared types/utilities.
- CDK **`lib/`** stacks; **`infra/cdk/lambda/`** WebSocket and SFU-token handlers (server-side; unchanged by client extraction).
