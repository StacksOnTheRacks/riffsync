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
| **`ChatSession`** | API Gateway **room WebSocket**: chat send/receive, reactions, **`typing_start`** / **`typing_stop`** and inbound **`typing`** fan-out, **`ping`**, presence roster updates (**`presence`**, **`lastActiveAt`**, **`active`** badges for People tab), join/leave **`chat_system`** lines (signed-in fans only), room-mode and kill-switch fan-out handling that affects **chat/composability only**. Qualifying control-plane sends (**`typing_start`**, **`chat`**, **`chat_gif`**, **`react`**, **`ping`** within the active window) mark the sender **active** — typing is **not** display-only. | Close SFU signaling, stop **`getUserMedia`** / **`getDisplayMedia`**, or tear down mediasoup producers/consumers. |
| **`SfuMediaSession`** | Direct **SFU signaling WebSocket** per tab (**one session per tab**): ICE/TURN attach, **mandatory per-`producerClass` send transport isolation** (**`host_screen`** and **`participant_av`** each own a send transport within the same signaling socket), mediasoup produce/consume, per-kind unpublish (**#143** / **#144**), **`newProducer`** / **`producerClosed`** dispatch to subscribers. **No** session-level **`close()`** for class-scoped failures — partial unpublish and transport recovery only. | Close room WebSocket or block chat send on SFU failure. |
| **`TheaterPlayback`** | YouTube iframe lifecycle, **client-side Web Audio** mix graph (host movie audio + **`participant_av`** audio consumers at equal gain **1.0**), **`AudioContext`** suspend/resume policy. | Own SFU signaling socket; must subscribe to **`SfuMediaSession`** for consumer attach/detach. |

### Local Cast controller

Chromecast runtime state belongs to the room shell as a **client-local controller**, not to **`ChatSession`**, **`SfuMediaSession`**, or **`TheaterPlayback`**. It may coordinate with presentation and media/source helpers, but it must not become a drawer in **`RoomRealtimeSdk.getDiagnostics()`** unless a later contract explicitly adds a Cast diagnostics surface.

| Concern | Contract |
| --- | --- |
| **State scope** | Per browser tab, session-only; no room document persistence, `localStorage`, room WebSocket fan-out, or SFU token claim. |
| **Entry gate** | Start only from normal room view after sender support is detected. Expanded view is not a valid start point. |
| **Start transition** | Keep the normal in-page video visible until Cast start succeeds. Swap the sender stage to **`Now Casting`** only after confirmed success. |
| **Active state** | While active, the sender remains joined to the room and chat stays controlled by **`ChatSession`**. Cast active state must not close healthy chat or SFU sessions. |
| **Stop / failure** | Stop, unavailable, rejected start, receiver disconnect, route leave, or reload converges on local cleanup and returns to normal in-page playback without clearing room session or chat state. |
| **Authority** | Cast state never changes **`roomMode`**, **`avDisabled`**, **`share_state`**, host screen publishing, participant A/V publish eligibility, or other participants' presentation. |
| **Receiver model** | The receiver is a custom RiffSync Cast page fed by sender-proxied local state over the Cast channel. It does not join the room, create a participant session, open room/SFU sockets, or own room authority. |
| **Participant isolation (#277)** | Other participants' **`ChatSession`**, **`SfuMediaSession`**, **`TheaterPlayback`**, drawer diagnostics, stage presentation, controls, and chat/sidebar state remain unchanged when one viewer enters, exits, fails, or cleans up local Cast. |

### Cast availability detector (#272)

The #272 slice may introduce the first local Cast controller shape as a capability detector only.

| Concern | Contract |
| --- | --- |
| **Minimum states** | **`checking`**, **`available`**, and **`unavailable`** are sufficient for the availability UI. Internal names may differ, but the UI must distinguish "show Cast to TV" from "omit or explain unavailable." |
| **Bootstrap isolation** | Detection starts after normal room shell bootstrap is underway or complete. Failure to load a Cast SDK or read browser support maps to local **`CAST_UNAVAILABLE`** and does not fail the room. |
| **Diagnostics** | #272 does not add Cast to **`RoomRealtimeSdk.getDiagnostics()`**, drawer health, or active realtime error codes. Local dev logs are acceptable when they do not imply room activity or identify receiver devices. |
| **Lifecycle ceiling** | #272 does not model **`starting`**, **`casting`**, **`stopping`**, receiver disconnect, or source cleanup. Those runtime states belong to later M25 slices. |

### Cast start controller (#273)

The #273 slice extends the local Cast controller from availability into custom receiver launch and receiver presentation proof.

| Concern | Contract |
| --- | --- |
| **Controller home** | Keep Cast controller state near the room shell (`RoomPage` or a colocated room hook/module). It coordinates sender presentation snapshots and receiver channel messages, but it remains outside **`RoomRealtimeSdk.getDiagnostics()`**. |
| **Minimum lifecycle states** | Add local states equivalent to **`idle`**, **`starting`**, **`casting`**, and **`start_failed`**. Later stop, receiver-disconnect, receiver-playback-blocked, and stop-failed refinements may extend the state machine without changing room authority. |
| **Launch source** | Cast starts the custom RiffSync receiver page, then sends a presentation snapshot that includes the current stage-primary video source/binding metadata needed by the receiver plus chat overlay state. |
| **Receiver updates** | While launch is active, the sender sends chat-overlay updates over the Cast channel. The receiver renders overlay content only; compose, authenticated chat send, People, Room, and Profile interactions stay on the sender. |
| **Success condition** | Cast start is successful only when the receiver confirms it is rendering the stage-primary video plus bottom-right chat overlay. A launch-only or model-pass-only acknowledgement is insufficient for #273. |
| **Playback surface** | The sender keeps normal in-page playback visible during **`starting`**. After receiver render confirmation, the sender may transition to the later **`Now Casting`** state owned by #274. |

### Cast-active controller (#274)

The #274 slice extends the local Cast controller from confirmed start into persistent active sender presentation.

| Concern | Contract |
| --- | --- |
| **Minimum lifecycle state** | Add or expose local state equivalent to **`casting`** / **`active`** with optional **`stopping`** intent. Names may differ, but UI must distinguish active Cast from starting, failed start, idle, and later failed-stop/disconnect states. |
| **Stage projection** | When state is active, the room shell renders **`CAST_ACTIVE`** / **`Now Casting`** on the sender stage and hides the normal in-page video surface until stop/disconnect cleanup returns control to later slices. |
| **Stop intent** | The Stop Cast control invokes the local Cast controller's stop entrypoint. This entrypoint must not call room HTTP APIs, emit room WebSocket messages, mutate **`share_state`**, close **`ChatSession`**, close **`SfuMediaSession`**, or change SFU token claims. |
| **Expanded state** | Active Cast clears or suppresses expanded-view local state. The controller must not re-enter expanded view after stop unless a later interface contract permits it. |
| **Diagnostics** | Active/stopping Cast state remains outside **`RoomRealtimeSdk.getDiagnostics().drawers.*`** and **`activeErrorCodes`**. Test-only controller state or local component assertions are acceptable. |

### Cast stop restoration controller (#276)

The #276 slice completes the intentional sender Stop Cast path after active Cast has already been confirmed.

| Concern | Contract |
| --- | --- |
| **Stop trigger** | A user-initiated Stop Cast from the sender's active **`Now Casting`** panel invokes the local Cast controller stop path. |
| **State transition** | The controller may expose a local **`stopping`** state while the sender SDK stop request and local cleanup run. Successful stop returns to the same idle/available posture used before Cast start, subject to the current sender-support result. |
| **Resource cleanup** | Release sender-side Cast session handles, Cast channel listeners, receiver presentation bindings, and any hidden or detached Cast playback/source binding created for the active session. Cleanup is best-effort and idempotent. |
| **Playback restoration** | Restore the normal in-page stage playback surface after cleanup completes. The restored surface uses the latest local room state and authoritative room snapshot already held by the room shell; it does not require a room refetch solely because Cast stopped. |
| **Preserved room state** | Do not clear room membership, chat scrollback, compose draft, selected sidebar tab, presence state, participant A/V controls, **`ChatSession`**, **`SfuMediaSession`**, **`TheaterPlayback`**, **`share_state`**, **`roomMode`**, or **`avDisabled`** for Stop Cast alone. |
| **Sibling boundary** | Receiver disconnects, sender SDK-ended sessions outside explicit Stop Cast success, start/stop failure copy, and blocked/unavailable recovery are refined by #278. #276 may share the cleanup helper but does not define those failure states. |
| **Diagnostics** | Stop restoration remains local controller state. It must not add Cast drawer diagnostics, active realtime error codes, room WebSocket messages, room HTTP mutations, or SFU token changes. |

### Application SDK surface (narrow public API)

Room code outside these modules calls only:

| API | Responsibility |
| --- | --- |
| **`join(roomId, options)`** | Bootstrap per **`startup_bootstrap.md`**: snapshot, **`ChatSession`**, ICE warm, **`SfuMediaSession`**, optional **`TheaterPlayback`** init. Returns handles/diagnostics refs — not raw WebSocket instances. |
| **`publishAv({ camera, mic })`** | Idempotent participant AV on **`SfuMediaSession`**; partial unpublish (camera off, mic on) without full session rebuild when publish is already supported. |
| **`subscribe({ hostScreen, participantAv })`** | Register consumer interest; **`SfuMediaSession`** attaches remote producers; **`TheaterPlayback`** wires audio mix nodes when in Theater mode. |
| **`getDiagnostics()`** | Drawer-tagged status for UI and logs: chat plane, SFU signaling, ICE/TURN, theater audio graph — see **Typed runtime errors** and **`.ai/interface/presentation.md`** (separate status surfaces). |

Implementation may colocate helpers; **module boundaries and lifecycle rules above are normative**.

### Presence, typing, and active (control plane)

**`ChatSession`** owns all room WebSocket presence-adjacent behavior. SFU signaling **must not** carry typing, **`active`**, or speaking state.

| Topic | Contract |
| --- | --- |
| **Online vs active** | **Online** = open **RoomPresence** row. **Active** = engaged within a **2-minute** idle window after the last qualifying signal — **not** SFU publish, sidebar tab focus, or profile telemetry. |
| **Qualifying active signals (union)** | **`typing_start`**, outbound **`chat`** / **`chat_gif`**, **`react`** (add or remove), and **`ping`** when the heartbeat falls inside the active window. Each qualifying inbound route updates durable **`lastActiveAt`** on the sender's **RoomPresence** row before fan-out. |
| **Typing** | **`typing_start`** / **`typing_stop`** are fan-JWT-gated, ephemeral fan-out only (**no** **RoomChat** write). **`typing_start`** also marks **active**. Inbound **`typing`** envelopes update compose UI and People-adjacent indicators. |
| **Reconnect rehydration** | **`lastActiveAt`** persists on **RoomPresence** so **`presence_request`** and roster fan-out rehydrate accurate **active** badges for late joiners and refresh. |
| **Join / leave lines** | Signed-in fans (**`fanSub`**) receive ephemeral **`chat_system`** join/leave lines on the room WebSocket; anonymous guests connect silently. Not persisted in **RoomChat**. |

**Active boolean at broadcast:** server **precomputes** **`active`** on each **`presence`** member and includes **`lastActiveAt`** (epoch seconds) when set. Clients treat server **`active`** as authoritative for People badges.

### Speaking indicator (client VAD)

Speaking affordance is **client-side only** — local mic **`AnalyserNode`** and remote audio tracks where the client subscribes. **No** SFU signaling or server mix input.

| Surface | Contract |
| --- | --- |
| **Theater strip + Video Chat grid** | Speaking border or equivalent affordance on **video-on** tiles when VAD detects speech on that participant's audio path. |
| **People tab** | Speaking state on roster rows for **all** participants, including **mic-only** (no video tile). |
| **Mic-only on stage** | **No** new stage chrome — mic-only participants remain off strip/grid; speaking shows on **People** tab only. |
| **Out of scope** | Avatar chips, audible-only stage badges, server-side theater audio mix scheduling (**deferred** follow-on). |

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
| Cast failure / stop | ChatSession teardown, SfuMediaSession teardown, host **`share_state`** mutation, room leave, or participant A/V policy change |

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
| **Single session per tab** | One SFU WebSocket per browser tab (**`SfuMediaSession`**). Within that session: **separate send transports per `producerClass`** (**`host_screen`**, **`participant_av`**) plus shared receive transport(s) as implementation requires. Host may publish both classes concurrently; participants attach multiple remote consumers via **`newProducer`** / **`producerClosed`** on the same signaling socket. |
| **Per-class transport isolation** | Class-scoped ICE/transport failure, per-kind unpublish, or partial produce errors **must not** invoke session-level **`close()`** — recover or tear down **that class's send transport** only. Session **`close()`** is reserved for tab leave, kill switch, or unrecoverable whole-session fault. |
| **Tile routing** | Map strip/grid attachment to **`sessionId`** + **`producerClass`** + **`kind`** from SFU events. No **`fanSub`** dedupe across tabs in MVP — two tabs from one fan appear as two tiles when both cameras are on. |
| **Camera off, mic on** | **Close the video producer** and emit/consume **`producerClosed`** for video; **remove strip/grid tile immediately** (no frozen last frame). Keep audio producer active (or **`pause()`** / **`resume()`** when mic muted with camera on). **No** full SFU session rebuild when publish already supported. |
| **Mic-only visibility** | Mic-only participants stay **off** strip/grid (audible via theater mix or Video Chat audio path only) — hardening fixes **tile lifecycle** on camera-off, not new stage chrome. |
| **Mic mute with camera on** | **`producer.pause()`** / **`resume()`** on the audio producer; camera track and video producer stay live. |
| **Page Visibility** | Leave participant producers running for MVP; battery policy revisit is out of scope. |
| **Theater audio mix** | **Client-side default:** **Web Audio API** graph via **`TheaterPlayback`**: host movie audio + each **`participant_av`** audio consumer at equal gain (**1.0**); no automatic ducking in MVP. **Server-side theater audio mix scheduling deferred** to a follow-on initiative — decoupling, presence, typing, and speaking ship first. |
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
| **`ChatSession` absorbs** | **`useRoomWebSocket.ts`** connect/reconnect/ping/send; inbound demux for **`chat`**, **`chat_gif`**, **`react`**, **`typing`**, **`chat_system`**, **`presence`**, **`room_mode`**, **`av_disabled`**, **`share_state`** frames. Chat-owned state: message log helpers, reaction merge, typing map, **`lastActiveAt`** / **`active`** roster fields for People UI, compose typing outbound (**`typing_start`** / **`typing_stop`**). |
| **`SfuMediaSession` absorbs** | **`sfu/sfuRoomSession.ts`**, **`sfu/mediasoupSharing.ts`** connection lifecycle, **`sfu/participantAvSession.ts`** publish gate binding, ICE fetch, SFU token mint/reconnect policy, **`newProducer`** / **`producerClosed`** dispatch. |
| **`TheaterPlayback` absorbs** | **`audio/theaterAudioMix.ts`**, YouTube iframe ref lifecycle, host **`host_screen`** audio consumer attach to mix graph. Subscribes to **`SfuMediaSession`** consumer events — does **not** own SFU signaling socket. |
| **Media policy callbacks** | **`ChatSession`** forwards **`share_state`**, **`room_mode`**, **`av_disabled`** to registered **`SfuMediaSession`** / **`TheaterPlayback`** policy handlers — **no** implicit SFU teardown inside chat WS message handlers. |
| **Mesh removal** | Delete **`apps/web/src/room/sharing/**`**, mesh prod warning UI, and **`isMeshWatchPartyMediaEnabled`** branches from **`RoomPage`** during extraction. **`realtimeDiagnostics.ts`** counter/timeline for **`?diag=1`** stays dev-only; production drawer-tagged logs land in **`clientDrawerLog.ts`** (**#157**). |
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
| **`getDiagnostics()`** | Returns **`RoomRealtimeDiagnostics`** snapshot (stable field names for harness + UI mapping): **`roomId`**, **`sessionId`**, **`asOf`** (ISO-8601), **`drawers.chat`**, **`drawers.sfuSignaling`**, **`drawers.theaterPlayback`**, **`activeErrorCodes`**. Module drawers expose **`{ state, lastErrorCode? }`** plus optional fields per **`integration/api_contracts.md`**. **#158** extends **`sfuSignaling`** with **`health.connectivity`** and **`health.produceConsume`** sub-snapshots aligned to observability log drawers. |
| **Dev-only diagnostics** | **`realtimeDiagnostics.ts`** (`?diag=1`, **`window.riffsyncRealtimeDiag`**) remains separate from **`getDiagnostics()`** — timeline counters and JWT probes are maintainer tooling, not the fan status contract. |
| **Dev support getter (#158)** | **`import.meta.env.DEV`** builds may register **`window.riffsyncRoomDiagnostics`** — zero-arg function returning the latest **`getDiagnostics()`** snapshot while the room SDK is joined. **Not** present in production bundles. |
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
| **Harness / unit assertions** | After forced chat-only WS drop: **`getDiagnostics().drawers.chat`** is **`reconnecting`** then **`connected`**; **`drawers.sfuSignaling.state`** and **`drawers.sfuSignaling.health.connectivity.state`** stay **`connected`**. Inverse for SFU-only drop. See **`lifecycle_shutdown.md`** and **`build_packaging.md`** steps 5–6. |

## Decisions (getDiagnostics health snapshot — #158)

| Topic | Decision |
| --- | --- |
| **Scope** | Extend **`RoomRealtimeSdk.getDiagnostics()`** with per-drawer **health** fields for support repro and **`realtime-conformance`** assertions. **Does not** add fan-visible banners (**#150** peer). |
| **Health nesting** | **`drawers.sfuSignaling.health.connectivity`** and **`drawers.sfuSignaling.health.produceConsume`** — maps observability log drawers **`connectivity`** and **`produce_consume`** without new top-level UI drawer keys. |
| **Connectivity mapping** | **`SfuMediaSession`** / **`mediasoupSharing`** ICE hooks set **`health.connectivity.state`**: **`reconnecting`** on **`checking`** or **`disconnected`** before **`ICE_FAILED`** deadline (**10s** per **#141**); **`degraded`** on **`ICE_FAILED`** or **`TURN_RELAY_REQUIRED`**; **`connected`** on **`connected`** / **`completed`**. |
| **Produce/consume mapping** | **`health.produceConsume`** reads live producer/consumer counts and attach flags from **`SfuMediaSession`**. **`degraded`** on **`TRANSPORT_LIMIT_REACHED`**, **`CONSUMER_LIMIT_REACHED`**, or **`consumer_attach_failed`**; **`PRODUCER_CLOSED`** does **not** flip state (**`error_state.md`**). |
| **Theater lifecycle** | **`theaterPlayback.state`**: **`connected`** when Theater layout bootstrapped and mix not **`degraded`**; **`reconnecting`** when **`guestShareFsm`** is **`verifying_media`**; **`degraded`** when **`audioContextState === 'suspended'`** or theater mix error; **`torn-down`** on Video Chat layout or pre-bootstrap. |
| **Contract module** | **`apps/web/src/room/sessions/roomRealtimeDiagnosticsContract.ts`** exports types, lifecycle enum, required top-level/drawer keys, and **`assertRoomRealtimeDiagnosticsContract(diag)`** for harness + unit tests. |
| **`onDiagnosticsChange`** | Emit when any module drawer **or** health sub-field changes (ICE state transitions included). |
| **Implementation split** | Sub-issues **#217** (SFU health wiring), **#218** (theater lifecycle + contract module + contract tests). |

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
| **Scope** | **Preserve** mic-only off strip/grid rule; **harden** tile attach/detach on video **`producerClosed`**. **Speaking affordance** on video tiles (Theater strip, Video Chat grid) and **People** tab roster rows is **in scope** (client VAD). Still **no** avatar chips or audible-only stage badges. |
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

## Decisions (answered — presence and AV maturity)

| Topic | Decision |
| --- | --- |
| **Active signal set** | **Union** — **`typing_start`**, **`chat`** send, **`chat_gif`** post, **`react`** toggle, and qualifying **`ping`** within the active window all mark a participant **active**. |
| **Active idle window** | **2 minutes** after last qualifying signal. |
| **Active on reconnect** | **Yes** — persist **`lastActiveAt`** on **RoomPresence** so **`presence_request`** and roster fan-out rehydrate **active** for late joiners and refresh. |
| **Video Chat mode while A/V matures** | **Keep** in host control bar with explicit **Beta** / **Experimental** label when **`avDisabled`** is false. |
| **Join/leave system chat lines** | **Signed-in fans only** — guests connect silently; named signed-in fans get ephemeral join/leave system lines on room WebSocket (not persisted in **RoomChat**). |
| **Server-side theater audio mix** | **Later phase** — client Web Audio equal-gain mix remains normative until a follow-on initiative. |
| **Speaking indicator scope** | **Video tiles plus People tab** — speaking on Theater strip and Video Chat grid when video is on; **mic-only** participants show speaking on **People** tab roster rows only (no new stage chrome). |
| **SFU decoupling depth** | **Single SFU signaling WebSocket per tab** with **mandatory per-class send transport isolation**, per-kind unpublish (**#143** / **#144**), and explicit prohibition of session-level **`close()`** for class-scoped failures. |
| **Typing vs active** | Typing contributes to **active** badge — not display-only. |
| **Idle viewers** | **`ping`** within the 2-minute window counts toward **active**; heartbeats alone keep idle watchers **active**. |

## Decisions (answered — M22 ChatSession typing)

| Topic | Decision |
| --- | --- |
| **`typing_stop` throttle UX** | Silent drop when per-minute typing pair cap exceeded — no inbound **`error`** envelope to client. |
| **Compose debounce** | **300ms** trailing debounce before first **`typing_start`** in a burst; **`typing_stop`** on send, blur, or **3s** idle without keystroke. |
| **Inbound typing TTL** | Clear local typing UI **5s** after last **`typing_start`** without **`typing_stop`**. |

## Decisions (answered — M23 speaking VAD #242)

| Topic | Decision |
| --- | --- |
| **Analyser config** | **`fftSize` 512**; time-domain RMS normalized to **0–1** against full-scale int16. |
| **Enter speaking** | RMS **≥ 0.02** for **150ms** consecutive samples (attack smoothing). |
| **Exit speaking** | RMS below threshold for **300ms** (hang) before clearing affordance. |
| **Local vs remote** | Local: attach analyser to **`getUserMedia`** audio track when mic publishing and not **`paused`**. Remote: attach to inbound **`participant_av`** audio **`MediaStreamTrack`** when consumer live and producer not **`paused`**. |
| **Muted mic** | Audio producer **`pause()`** — VAD **off**; no speaking affordance on tile or People row. |
| **Implementation owner** | **`apps/web/src/room/audio/speakingVad.ts`** (or colocated helper); sub-issue **#249**. |

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### existing-realtime-harness
- **Harness extension** — **`realtime-conformance`** steps for typing routes, **`lastActiveAt`** / **active** fan-out after **`presence_request`**, and drawer-isolation matrix extensions documented in **`.ai/operations/observability.md`**.

### chromecast-runtime-controller
- **Resolved for #273:** the controller is room-shell local and launches a custom RiffSync receiver page with sender-proxied state.
- **Resolved for #273:** local lifecycle must cover **`idle`**, **`starting`**, **`casting`**, and **`start_failed`**; stop/disconnect refinements extend this in sibling issues.
- **Resolved for #273:** the receiver reconstructs the expanded-view-like presentation from sender-proxied snapshots and updates; provider-native media Cast and tab mirroring are outside this slice.
- **Resolved for #273:** normal in-page playback remains visible during **`starting`** and the #274 sender-stage replacement owns the full **`Now Casting`** placeholder behavior.
- **Resolved for #273:** Cast-specific launch/render test hooks may be local to the Cast controller or receiver harness, but they must not overload **`getDiagnostics().drawers.*`**.
- **Resolved for #274:** active Cast renders **`CAST_ACTIVE`** / **`Now Casting`** on the sender stage, exposes local Stop Cast intent, clears/suppresses expanded view, and still does not add drawer diagnostics or active realtime error codes.
- **Resolved for #276:** successful intentional Stop Cast uses local, idempotent cleanup and restores the normal in-page stage without clearing room, chat, SFU, theater playback, sidebar, or authoritative room state.
- **Resolved for #277:** Cast controller tests should assert the absence of room HTTP mutations, room WebSocket sends, **`share_state`** changes, SFU token/permission changes, drawer diagnostic changes, and remote participant presentation changes for local Cast lifecycle paths.
- **Resolved for #278:** extend the local Cast controller lifecycle with distinct unavailable, start-failed, session-ended, playback-blocked, stopping, stop-failed, and cleaned-up states. Receiver disconnect, sender SDK **session-ended**, receiver app close, external TV stop, and blocked receiver playback must drive local cleanup and retry behavior without touching **`ChatSession`**, **`SfuMediaSession`**, **`TheaterPlayback`**, room HTTP APIs, room WebSocket sends, or **`RoomRealtimeSdk.getDiagnostics().drawers.*`**.
- **Resolved for #278:** tests may use controller-local hooks, fake sender clients, and receiver-channel stubs to simulate unavailable support, launch rejection, active disconnect, playback blocked, stop rejection, and cleanup completion. These hooks must remain outside aggregate room diagnostics and active realtime error codes.

## Primary code pointers (optional)

- **`apps/web/src/room/sessions/drawerReconnectPolicy.ts`** — shared chat/SFU degraded thresholds and chat backoff constants (**#140**).
- **`apps/web/src/room/sessions/RoomRealtimeSdk.ts`** — narrow public realtime API (**#139**); maps module FSM to **`getDiagnostics()`** (**#140**).
- **`apps/web/src/room/sessions/`** — **`ChatSession`**, **`SfuMediaSession`**, **`TheaterPlayback`** formal lifecycle FSM (**#140**).
- **`apps/web/src/pages/RoomPage.tsx`** — thin shell wiring session modules to room chrome.
- **`apps/web/src/room/sfu/`** — low-level mediasoup helpers absorbed by **`SfuMediaSession`** during extraction; directory may shrink to shared types/utilities.
- CDK **`lib/`** stacks; **`infra/cdk/lambda/`** WebSocket and SFU-token handlers (server-side; unchanged by client extraction).
