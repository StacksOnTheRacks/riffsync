# Observability

**CloudWatch-first** — **`docs/architecture.server.md`** **Observability** section is normative.

## Summary contract

| Concern | AWS mechanism |
| --- | --- |
| **Metrics (infra)** | Lambda, API Gateway, DynamoDB, EventBridge **built-in** metrics. |
| **Metrics (product)** | **`PutMetricData`** or **EMF** under **`RiffSync/...`** namespaces; **low-cardinality** dimensions only. |
| **Dashboards** | **`AWS::CloudWatch::Dashboard`** in IaC; ops + reconcile + optional WebSocket views. Shipped: **`RiffSync-prod-operations`** in **`infra/cdk/lib/observability-stack.ts`**. |
| **Logs** | Structured JSON → **CloudWatch Logs**; **Logs Insights** for investigation; **metric filters** → alarms. |
| **Alarms** | **Lightweight defaults for OSS/cost**: e.g. sustained **Lambda error rate**, **API 5xx %**, **Dynamo throttling**, **reconcile failure** custom metric — **SNS email** to maintainer **optional**; **no** mandatory commercial on-call SLA (**`.ai/interface/presentation.md`**). Tune thresholds in IaC for the **prod** footprint. |
| **Tracing** | **X-Ray** optional. |

## Availability (non-goal)

RiffSync as an OSS project does **not** publish **uptime SLAs** or incident **SLO** figures—**cost and volunteer bandwidth** come first. Deployers set their own alarm **severity** and **PagerDuty** (if any).


## Realtime drawers (hardening)

Watch-party reliability spans **orthogonal drawers**. Telemetry and structured logs must label the drawer — not collapse chat and media into one "realtime" bucket.

| Drawer | Plane | Primary signal home | Fan-visible status (separate surfaces) |
| --- | --- | --- | --- |
| **Chat** | API Gateway room WebSocket | **`RiffSync/Realtime`** (`Route`: **`chat`**, **`chat_gif`**, **`react`**, **`typing_start`**, **`typing_stop`**, **`presence_request`**) | "Chat reconnecting" copy |
| **Signaling** | SFU WebSocket (join, produce, consume events) | **`RiffSync/Media`** + SFU JSON logs | "Video relay reconnecting" copy |
| **Connectivity** | ICE / TURN candidate gathering | Client diagnostic logs; optional aggregate counters | Inline toggle / relay errors (`ICE_FAILED`, `TURN_RELAY_REQUIRED`) |
| **Produce / consume** | mediasoup producer/consumer lifecycle | **`RiffSync/Media`** limit rejections + client logs | Inline AV toggle errors (`PRODUCER_CLOSED`, cap errors) |

**Drawer-independent reconnect:** A failure in one drawer must not imply teardown telemetry for the other. Log lines and client diagnostics include **`drawer`** (`chat` | `signaling` | `connectivity` | `produce_consume`) at **INFO** — **no** **`roomId`**, **`sessionId`**, or **`sub`** in metric dimensions.

**Posture:** Drawer labels are **maintainer-facing contract** (logs, runbooks, harness CI output) **and** drive **separate fan-visible status surfaces** per **`interface/presentation.md`** — not a security-boundary change (no new PII in metrics).

## Fan-facing realtime and API (M10)

| Namespace | Routes (dimension **`Route`**) | Notes |
| --- | --- | --- |
| **`RiffSync/Realtime`** | **`chat`**, **`chat_gif`**, **`react`**, **`typing_start`**, **`typing_stop`**, **`presence_request`**, **`ping`** | EMF via Lambda **stdout**; dimensions **`Environment`**, **`Route`**, **`Outcome`** only. Chat drawer only — **not** SFU signaling. **`presence_request`** and **`ping`** include **`Outcome`** for roster rehydration and **active** **`lastActiveAt`** write success — no per-member cardinality. |
| **`RiffSync/Api`** | **`GiphySearch`**, **`FanAvatarUpload`** | Same dimension set; no raw chat text or upload bytes in **INFO** logs (**`security.md`**). |

## Presence and typing metrics (control plane)

Low-cardinality product signals for **active** engagement and typing — same OSS posture as chat routes.

| **`Signal`** (namespace **`RiffSync/Realtime`**) | Type | Source | Contract |
| --- | --- | --- | --- |
| **`TypingRouteAccepted`** | counter | WS route handler **`typing_start`** / **`typing_stop`** success path | Increment per accepted route invocation; dimension **`Route`** = **`typing_start`** \| **`typing_stop`**. |
| **`TypingRouteThrottled`** | counter | WS route handler when per-**`sessionId`** typing rate limit fires | No **`sessionId`** dimension; optional **`Route`** only. |
| **`PresenceActiveFanOut`** | counter | Lambda after **`presence`** broadcast where at least one member carries **`active: true`** or fresh **`lastActiveAt`** | One increment per roster fan-out wave — not per member. |
| **`PresenceRequestRehydrated`** | counter | **`presence_request`** handler completes with roster + optional **`chat_history`** | Tracks reconnect rehydration volume. |
| **`QualifyingActiveWrite`** | counter | WS handlers that update **`lastActiveAt`** (**`typing_start`**, **`chat`**, **`chat_gif`**, **`react`**, qualifying **`ping`**) | Aggregate **`Signal`** with optional **`Route`** dimension — **no** **`fanSub`**. |

MVP may emit via Lambda stdout EMF alongside existing **`Requests`** metric; wiring is tier TW when handlers land.

## AV decoupling observability (drawer isolation)

Participant A/V maturity depends on **orthogonal drawer health**. Telemetry must prove chat-plane events do not correlate with spurious SFU teardown signals (and vice versa).

| Signal class | Source | Contract |
| --- | --- | --- |
| **Harness drawer matrix** | **`realtime-conformance`** steps 5–6 (+ tier TW extensions) | Assert **`getDiagnostics()`** sibling drawer independence on chat-only vs SFU-only simulated outage — see **`lifecycle_shutdown.md`**. |
| **`DrawerIsolationViolation`** | Harness / unit tests only (log or CI failure) | Emitted when a chat-only WS drop sets **`sfuSignaling`** to **`torn-down`**, or SFU-only drop sets **`chat`** to **`torn-down`**. **Not** a production CloudWatch metric in MVP. |
| **Client typing logs** | **`ChatSession`** via **`clientDrawerLog`** | **`typing_start_sent`**, **`typing_stop_sent`**, **`typing_fanout`**, **`active_roster_update`** at **INFO** — **`drawer: chat`** only. |
| **Speaking VAD** | Client-only | **No** CloudWatch or SFU logs — maintainer debug via optional dev flags only. |

## Media plane (SFU + TURN)

Participant AV increases silent degradation risk on the **singleton** mediasoup worker (limits hit, worker death, RTC port exhaustion). Observability stays **aggregate** — same OSS posture as chat/API.

| Signal class | Source | Contract |
| --- | --- | --- |
| **SFU health** | EC2 **`/healthz`** | **`workerAlive`**, **`routerRoomCount`**, **`signalingConnections`** — probe success/failure only; no per-room breakdown in metrics. |
| **SFU process logs** | Local stdout/journal on SFU EC2 | Structured JSON with **`drawer: "signaling"`** or **`drawer: "produce_consume"`** on lifecycle events; **no** **`roomId`**, **`sessionId`**, or **`sub`** at **INFO** volume. |
| **TURN relay load** | EC2 network metrics (optional) | Aggregate CPU/network on TURN instance; more publishers increase relay traffic on the shared **`t3.small`**. |
| **Limit rejections** | SFU counters (when wired) | Transport/consumer cap rejections as low-cardinality counters — **no** room id dimension. |

**Alerting:** Remain **best-effort** maintainer alerts (optional SNS email) like chat/API today — **no** mandatory PagerDuty or commercial on-call SLA for participant AV.

## Anti-patterns

- High-cardinality dimensions (**`roomId`**, **`sessionId`**, **`userId`**, **`giphyId`**, **`sub`**) on **PutMetricData** or EMF dimensions.
- Logging message **`text`**, GIF rendition URLs, or multipart avatar bytes at **INFO** in production.
- Relying on **admin HTTP** as the only reporting path for core KPIs.
- Per-room or per-session SFU telemetry that would explode CloudWatch cost at party scale.

## `RiffSync/Media` metrics (#106)

Aggregate namespace for participant AV and SFU health. Dimensions **`Environment`**, **`Signal`** only — **no** **`roomId`**, **`sessionId`**, or **`sub`**.

| **`Signal`** | Type | Source |
| --- | --- | --- |
| **`HealthProbeSuccess`** | counter | Synthetic or operator **`curl /healthz`** (optional external probe) |
| **`WorkerAlive`** | gauge (0/1) | Parsed from **`/healthz`** **`workerAlive`** on scrape |
| **`SignalingConnections`** | gauge | **`/healthz`** **`signalingConnections`** |
| **`RouterRoomCount`** | gauge | **`/healthz`** **`routerRoomCount`** |
| **`TransportLimitRejected`** | counter | SFU process when **`SFU_MAX_WEBRTC_TRANSPORTS_PER_SESSION`** blocks |
| **`ConsumerLimitRejected`** | counter | SFU process when **`SFU_MAX_CONSUMERS_PER_SESSION`** blocks |
| **`SfuTokenDenied`** | counter | Lambda **`webrtc-sfu-token`** denials; optional second dimension **`Reason`** (`av_disabled`, `publisher_cap_exceeded`, `rate_limited`, …) — **no** **`fanSub`** |

Emit via SFU stdout EMF or **`PutMetricData`** from a lightweight scrape Lambda later; MVP may start with **`/healthz`** manual checks plus SFU JSON logs.

**Drawer → signal mapping (normative):**

| Drawer | Existing **`RiffSync/Media`** **`Signal`** | Client / Lambda extensions (low-cardinality) |
| --- | --- | --- |
| Signaling | **`SignalingConnections`**, **`HealthProbeSuccess`**, **`WorkerAlive`** | Typed codes: **`SIGNALING_TIMEOUT`**, **`sfu_signaling_failed`** in logs only until counters wired |
| Connectivity | (none today) | Log-only **`ICE_FAILED`**, **`TURN_RELAY_REQUIRED`** at client; optional future aggregate **`IceGatheringFailed`** counter |
| Produce / consume | **`TransportLimitRejected`**, **`ConsumerLimitRejected`**, **`SfuTokenDenied`** | Log-only **`PRODUCER_CLOSED`** at client; optional **`ProducerLifecycleEvent`** counter without room dimension |
| Chat | **`RiffSync/Realtime`** route outcomes | **`CHAT_SEND_DROPPED`** in client logs; Lambda **`Outcome`** on failed fan-out; **`TypingRouteAccepted`**, **`TypingRouteThrottled`**, **`PresenceActiveFanOut`**, **`QualifyingActiveWrite`** when wired |

## EC2 alarms (optional, OSS posture)

| Alarm | Metric | Threshold | Action |
| --- | --- | --- | --- |
| **SFU high CPU** | **`AWS/EC2` CPUUtilization** on SFU instance | **> 80%** for **5** consecutive minutes | Optional SNS email to maintainer |
| **SFU status check** | **`StatusCheckFailed`** | **≥ 1** for **2** minutes | Optional SNS email |

No mandatory PagerDuty. Tune in **`media-server-stack.ts`** when wired.

## SFU log path (#106)

- **MVP:** Structured JSON on SFU EC2 **stdout** / **journalctl**; operators use **SSM Session Manager** + **`journalctl -u riffsync-sfu -f`**.
- **No** CloudWatch Logs agent on SFU EC2 in MVP (cost posture). Maintainer may add agent later without contract change.

## Worker failure runbook (#106)

When mediasoup **`worker.on('died')`** fires (all room routers on the instance are cleared):

1. Confirm **`curl -sSf "${SFU_HTTP}/healthz"`** shows **`workerAlive: false`** or probe failure.
2. Check **`journalctl -u riffsync-sfu`** for **`worker died`** JSON line.
3. **Restart** SFU systemd unit: **`sudo systemctl restart riffsync-sfu`** (user-data installs unit).
4. Re-probe **`/healthz`** — expect **`workerAlive: true`**, **`routerRoomCount: 0`** until rooms reconnect.
5. If restart fails twice, **reboot EC2** instance via console or **`aws ec2 reboot-instances`**.
6. Notify active parties via community channel if sustained outage; no in-app SLA copy.

Document these steps in **`infra/cdk/README.md`** SFU section and **`docs/sfu-deploy-checklist.md`**.

## Client diagnostic logs (hardening)

Session modules (**`ChatSession`**, **`SfuMediaSession`**, **`TheaterPlayback`**) emit structured JSON via **`apps/web/src/room/clientDrawerLog.ts`** — production always-on, separate from dev-only **`realtimeDiagnostics.ts`** (`?diag=1`) and opt-in **`webrtcDebug.ts`** (`?webrtcDebug=1`).

| Field | Contract |
| --- | --- |
| **`drawer`** | `chat` \| `signaling` \| `connectivity` \| `produce_consume` |
| **`event`** | Stable snake_case lifecycle name (e.g. **`ws_close`**, **`reconnect_scheduled`**, **`producer_closed`**) |
| **`code`** | Typed failure from **`business_logic/error_handling.md`** when present (`PRODUCER_CLOSED`, `CHAT_SEND_DROPPED`, `SIGNALING_TIMEOUT`, `ICE_FAILED`, `TURN_RELAY_REQUIRED`, …) |
| **`outcome`** | `retry` \| `failed` \| `recovered` |

**Levels:** **INFO** for lifecycle transitions (connect, reconnect schedule, recovery); **WARN**/**ERROR** when **`code`** is set for typed failures. **`PRODUCER_CLOSED`** logs at **INFO** only (tile-only UX per **#141**).

**No** **`roomId`**, **`sessionId`**, or fan **`sub`** in browser console at default log level shipped to production builds.

## Decisions (client drawer logs — #157)

| Topic | Decision |
| --- | --- |
| **Log module** | **`apps/web/src/room/clientDrawerLog.ts`** with colocated **`clientDrawerLog.test.ts`**. Export **`emitClientDrawerLog(payload)`**; tests assert JSON shape and forbidden identity keys. |
| **Payload shape** | **`{ drawer, event, code?, outcome }`** serialized as one JSON object per line. **`drawer`** and **`outcome`** required; **`code`** required on WARN/ERROR failure paths. |
| **Sink** | **`console.info`** (INFO lifecycle), **`console.warn`** (WARN), **`console.error`** (ERROR) — not gated by diag flags. |
| **Forbidden fields** | No **`roomId`**, **`sessionId`**, **`sub`**, JWT, SDP bodies, or ICE candidate strings. |
| **Chat drawer** | **`ChatSession`** emits: **`ws_connect_attempt`**, **`ws_open`**, **`ws_close`**, **`ws_error`**, **`reconnect_scheduled`**, **`reconnect_success`**, **`degraded_threshold`**, **`send_dropped`** (**`CHAT_SEND_DROPPED`**, outcome **`failed`**), **`typing_start_sent`**, **`typing_stop_sent`**, **`typing_fanout`**, **`active_roster_update`**, **`chat_system_fanout`**. |
| **Signaling drawer** | **`SfuMediaSession`** emits: **`signaling_connect`**, **`signaling_open`**, **`signaling_close`**, **`signaling_reconnect_scheduled`**, **`signaling_reconnect_success`**, **`signaling_degraded`**, **`token_denied`** (typed denial code when known). |
| **Connectivity drawer** | **`mediasoupSharing`** PC hooks (via **`clientDrawerLog`**): **`ice_failed`** (**`ICE_FAILED`**), **`turn_relay_required`** (**`TURN_RELAY_REQUIRED`**), **`ice_recovered`** (outcome **`recovered`**). Production path replaces ad hoc **`webrtcLog`** ICE-failed copy for **`iceConnectionState === 'failed'`**. |
| **Produce/consume drawer** | **`SfuMediaSession`** + **`TheaterPlayback`**: **`producer_closed`** (**`PRODUCER_CLOSED`**, INFO), **`consumer_attach_failed`**, **`partial_unpublish`**, **`transport_limit`**, **`consumer_limit`**, **`mix_error`** (theater audio graph). |
| **`realtimeDiagnostics` migration** | **`recordOutboundDropped`** calls **`emitClientDrawerLog`** with **`drawer: chat`**, **`event: send_dropped`**, **`code: CHAT_SEND_DROPPED`**, outcome **`failed`**; remove raw **`[riffsync-diag]`** warn string. Counter/timeline behavior for **`?diag=1`** unchanged. |
| **Test contract** | Session module tests spy **`emitClientDrawerLog`** at WS close, reconnect, send-drop, and SFU reconnect boundaries; **`clientDrawerLog.test.ts`** covers serialization and redaction. |

## Decisions (harness CI telemetry — #153)

| Topic | Decision |
| --- | --- |
| **Primary surface** | GitHub Actions **step summary** markdown — one line per failed assertion: **`[drawer=<drawer>] code=<CODE> step=<scenario>`** where **`<drawer>`** is `chat` \| `signaling` \| `connectivity` \| `produce_consume`. |
| **Failure artifacts** | Upload **`harness-summary.json`** (structured drawer/code/step/outcome array) and **`sfu-compose.log`** (`docker compose` stdout) when the harness runner fails — retain **7** days. |
| **JUnit XML** | **Deferred** — step summary + JSON artifact are MVP; add JUnit when PR annotation integration is needed. |
| **Compile-only interim** | When **`tests/realtime-conformance/run.sh`** is absent, SFU compile failure uses **`[drawer=connectivity] code=SFU_BUILD_FAILED step=compile`**. |

## Decisions (getDiagnostics vs client logs — #158)

| Topic | Decision |
| --- | --- |
| **Dual surfaces** | **Console logs** (**#157**, **`clientDrawerLog`**) and **`getDiagnostics()`** health snapshot (**#158**) share drawer vocabulary but serve different consumers: unstructured JSON lines vs stable programmatic contract. |
| **Log drawer → diagnostics field** | `chat` → **`drawers.chat`**; `signaling` → **`drawers.sfuSignaling.state`**; `connectivity` → **`drawers.sfuSignaling.health.connectivity`**; `produce_consume` → **`drawers.sfuSignaling.health.produceConsume`**. |
| **Harness failure lines** | When assertion reads **`getDiagnostics()`**, stderr uses observability drawer label: e.g. **`[drawer=connectivity] code=ICE_FAILED step=5`**. |
| **Support repro** | Dev builds: **`window.riffsyncRoomDiagnostics()`** documents support steps in issue **#158**; production fans use visible status banners + drawer logs only. |

## Decisions (drawer → CloudWatch mapping — #159)

| Topic | Decision |
| --- | --- |
| **Operator runbook** | **`docs/observability-drawer-mapping.md`** is the human-facing mapping (tables, investigation steps, Logs Insights examples). **`.ai/operations/observability.md`** (this file) remains the timeless contract; runbook links here and to **`docs/architecture.server.md`**. |
| **M21 metric posture** | **Client drawer events are log-only** — browser **`clientDrawerLog`** JSON does not emit CloudWatch. Operators correlate fan console lines with AWS signals using the runbook drawer column. |
| **Deferred client counters** | **`ChatSendDropped`**, **`IceGatheringFailed`**, and **`ProducerLifecycleEvent`** are **not** added in M21. Document as optional future **`RiffSync/Realtime`** / **`RiffSync/Media`** aggregates with **no** `roomId` / `sessionId` / `sub` dimensions. |
| **`RiffSync/Realtime` (frozen)** | Metric **`Requests`** via Lambda stdout EMF (**`infra/cdk/lambda/riffsync-observability.ts`**). Dimensions **`Environment`**, **`Route`** (`chat` \| `chat_gif` \| `react` \| `typing_start` \| `typing_stop` \| `presence_request` \| `ping`), **`Outcome`**. Maps to **chat drawer** only — not SFU signaling. |
| **`RiffSync/Media` (frozen)** | Metric names are the **`Signal`** dimension values in the **`RiffSync/Media` metrics (#106)** table. Dimensions **`Environment`**, **`Signal`**; **`SfuTokenDenied`** Lambda may add **`Reason`** (server-side only). |
| **Limit rejection EMF** | **`TransportLimitRejected`** and **`ConsumerLimitRejected`** emit from SFU stdout via **`services/riffsync-sfu/src/media-observability.ts`** — **shipped**; maps to **produce_consume** drawer. |
| **Health gauges** | **`HealthProbeSuccess`**, **`WorkerAlive`**, **`SignalingConnections`**, **`RouterRoomCount`** are **contracted** but **not auto-scraped in M21** — operator **`curl /healthz`** per **`docs/sfu-deploy-checklist.md`**; periodic Lambda scrape **deferred**. |
| **EC2 alarms** | **`riffsync-sfu-high-cpu`** (**`CPUUtilization` > 80%**, 5 min) and **`riffsync-sfu-status-check-failed`** (**`StatusCheckFailed` ≥ 1**, 2 min) **shipped** in **`media-server-stack.ts`** — no SNS in OSS default. |
| **Investigation order** | (1) Fan console filter **`drawer`** → (2) matching **`getDiagnostics()`** field per #158 table → (3) **`RiffSync/Realtime`** or **`RiffSync/Media`** dashboard / EMF → (4) SFU **`journalctl`** for signaling / produce_consume server lines. |

## Decisions (answered — presence and AV maturity)

| Topic | Decision |
| --- | --- |
| **Typing route metrics** | **`typing_start`** and **`typing_stop`** are first-class **`RiffSync/Realtime`** **`Route`** dimensions with **`Outcome`** — same EMF path as **`chat`**. |
| **Active fan-out metrics** | **`PresenceActiveFanOut`** and **`QualifyingActiveWrite`** are aggregate counters (per fan-out wave / per qualifying write class) — **no** per-member or **`fanSub`** dimensions. |
| **AV decoupling verification** | Chat-only vs SFU-only outage matrix remains harness + unit contract; **`DrawerIsolationViolation`** is CI/log-only, not production CloudWatch. |
| **Speaking VAD telemetry** | Client-only — excluded from CloudWatch and SFU logs in MVP. |
| **Server mix deferral** | No **`RiffSync/Media`** signals for server-side theater mix until follow-on initiative. |

## Decisions (answered — M22 observability)

| Topic | Decision |
| --- | --- |
| **`presence.active` at broadcast** | Server precomputes **`active`**; harness and EMF assert **`lastActiveAt`** on rehydrate and typing fan-out behavior — not which side computed **`active`** on the client. |

## Decisions (M24 presence/typing EMF — #251)

| Topic | Decision |
| --- | --- |
| **Emit path** | Lambda stdout EMF via existing **`RiffSync/Realtime`** helper — same **`Environment`**, **`Route`**, **`Outcome`** dimensions as **`chat`** / **`ping`**. |
| **`TypingRouteAccepted`** | Increment on successful **`typing_start`** / **`typing_stop`** handler completion; **`Route`** dimension = route name. |
| **`TypingRouteThrottled`** | Increment when per-**`sessionId`** typing rate limit fires on **`typing_start`** or **`typing_stop`** — **no** **`sessionId`** dimension. |
| **`PresenceActiveFanOut`** | One increment per **`presence`** broadcast wave where at least one member has **`active: true`** or fresh **`lastActiveAt`**. |
| **`QualifyingActiveWrite`** | Increment when a handler updates **`lastActiveAt`** (**`typing_start`**, **`chat`**, **`chat_gif`**, **`react`**, qualifying **`ping`**). Optional **`Route`** dimension — **no** **`fanSub`**. |
| **`PresenceRequestRehydrated`** | Increment when **`presence_request`** completes with roster (+ optional requester-only **`chat_history`**). |
| **Throttle client logs** | Throttled **`typing_stop`** emits **`TypingRouteThrottled`** only — **no** client **`typing_stop_failed`** drawer log in MVP. |
| **Ship gate** | Wire after M22 #244–#245 handlers land; unit tests assert EMF JSON shape without high-cardinality dimensions. |

## Decisions (M24 harness telemetry — #252)

| Topic | Decision |
| --- | --- |
| **Step 7 — typing** | Harness peer sends **`typing_start`**; stub asserts room-wide **`typing`** fan-out; peer disconnect or **`typing_stop`** clears typing flag for that **`sessionId`**. Optional: signed-in fan stub emits **`chat_system`** **`join`** once — not required for job green. |
| **Step 8 — active rehydrate** | After qualifying **`ping`** inside active window, **`presence_request`** response includes sender **`lastActiveAt`** and expected **`active`** on roster members; assert via stub roster snapshot. |
| **Step 9 — `host_screen` survival** | With active **`host_screen`** and **`participant_av`** video+audio, close **video** producer only; assert **`host_screen`** consumer remains attached within **2s**; **`participant_av`** audio consumer may remain; SFU signaling session stays **`open`**. |
| **Speaking VAD** | Excluded from automated harness — client-only debug. |
| **`DrawerIsolationViolation`** | CI failure / structured log when step 5–6 or 9 detects sibling drawer **`torn-down`** — **not** production CloudWatch. |
| **Failure output** | Same **`[drawer=…] code=… step=N`** stderr contract as steps 1–6; **`harness-summary.json`** rows include steps **7–9**. |
| **Checklist tags** | **`docs/sfu-deploy-checklist.md`** rows gain **`PR: step 7`**, **`PR: step 8`**, **`PR: step 9`** per **`build_packaging.md`** mapping table. |

## Open implementation decisions

- **Health probe scrape Lambda** — Periodic **`/healthz`** scrape emitting **`HealthProbeSuccess`** / gauge metrics — deferred past M21 (cost and IAM guardrails).
- **Optional aggregate client counters** — **`IceGatheringFailed`**, **`ProducerLifecycleEvent`**, **`ChatSendDropped`** — design only in runbook until a server-side aggregation path exists (no browser **`PutMetricData`**).

## Primary code pointers (optional)

- **`apps/web/src/room/clientDrawerLog.ts`** — production drawer-tagged console logs (**#157**).
- **`apps/web/src/room/sessions/roomRealtimeDiagnosticsContract.ts`** — stable **`getDiagnostics()`** contract helpers (**#158**).
- **`apps/web/src/room/realtimeDiagnostics.ts`** — dev-only diag panel counters (**`?diag=1`**).
- **`docs/observability-drawer-mapping.md`** — operator runbook for drawer → CloudWatch mapping (**#159**).
- Dashboard JSON in `infra/` when added.
