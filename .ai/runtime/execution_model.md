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
| **Browser SPA (or SSR)** | Single TypeScript SPA (React per **`docs/architecture.frontend.md`**): fan catalog/rooms plus **gated `/admin/*`** operator surfaces in one build and one CloudFront origin; YouTube iframe per tab; **control-plane** WebSocket for parties; **media-plane** direct SFU WebSocket for WebRTC (host screen share and participant AV). **One SFU WebSocket session per browser tab** may carry multiple producers and consumers. **No** privileged secrets. |

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

## Client mapping (handoff to #104 / #105)

- Map **`newProducer`** / **`producerClosed`** to strip/grid tiles by **`sessionId`** + **`producerClass`**.
- Mic mute with camera on: prefer **`producer.pause()`** / **`resume()`** on the audio producer (#104).
- Page Visibility: leave participant producers running for MVP (#104 may revisit battery policy).
- Module layout (**`sfuRoomSession`** extension vs helper) is a #104 implementation choice; SFU contract above is normative.

## Primary code pointers (optional)

- CDK **`lib/`** stacks; **`src/handlers/**/*.ts`** (or repo convention TBD).
