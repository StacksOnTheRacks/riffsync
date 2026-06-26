# Observability drawer mapping (operator runbook)

Human-facing guide for correlating **realtime drawers** (`chat`, `signaling`, `connectivity`, `produce_consume`) with fan browser logs, **`getDiagnostics()`**, and AWS signals.

**Timeless contract:** [`.ai/operations/observability.md`](../.ai/operations/observability.md) (Decisions #159). **Server architecture:** [`architecture.server.md`](architecture.server.md#observability-aws--cloudwatch-first).

---

## Namespace summary

| Namespace | Plane | Dimensions (frozen) | Primary drawers |
| --- | --- | --- | --- |
| **`RiffSync/Realtime`** | API Gateway room WebSocket (Lambda EMF on stdout) | **`Environment`**, **`Route`**, **`Outcome`** | **chat** |
| **`RiffSync/Media`** | SFU EC2 stdout EMF + Lambda **`webrtc-sfu-token`** | **`Environment`**, **`Signal`**; **`SfuTokenDenied`** may add **`Reason`** | **signaling**, **connectivity** (partial), **produce_consume** |
| **`RiffSync/Api`** | HTTP API (Giphy, avatar upload, admin catalog) | **`Environment`**, **`Route`**, **`Outcome`** | (not a realtime drawer) |
| **Built-in AWS** | Lambda, API Gateway, DynamoDB, EC2 | Service defaults | Infra health around all drawers |

**Ship status legend**

| Value | Meaning |
| --- | --- |
| **shipped** | EMF or structured server log on **`main`** today |
| **log-only** | Client **`clientDrawerLog`** JSON in browser console only |
| **deferred** | Contract or helper exists; not emitted on production paths yet |
| **out-of-scope** | Explicitly excluded from CloudWatch, diagnostics, and drawer logs |

**M21 posture:** Client drawer events stay **log-only**. Operators correlate fan console JSON with AWS using this table. SFU process EMF lands on EC2 **stdout/journal** until a CloudWatch agent or scrape Lambda ships; the **`RiffSync-prod-operations`** dashboard shows Lambda-side **`SfuTokenDenied`** and EC2 CPU/network, not every SFU stdout counter.

---

## Drawer → signal table

Columns follow issue #219 / #159: client module events, **`getDiagnostics()`** field names from #158, CloudWatch home, server log source, **Ship status**.

### Chat drawer

| Drawer | Client log module / events | **`getDiagnostics()` field (#158)** | CloudWatch metric / signal | Server log source | Ship status |
| --- | --- | --- | --- | --- | --- |
| **chat** | **`ChatSession`** via **`clientDrawerLog`**: **`ws_connect_attempt`**, **`ws_open`**, **`ws_close`**, **`ws_error`**, **`reconnect_scheduled`**, **`reconnect_success`**, **`degraded_threshold`**, **`send_dropped`** (**`CHAT_SEND_DROPPED`**), **`typing_start_sent`**, **`typing_stop_sent`**, **`typing_fanout`**, **`active_roster_update`**, **`chat_system_fanout`** | **`drawers.chat.state`**, **`drawers.chat.lastErrorCode`** | **`RiffSync/Realtime`** **`Requests`** — **`Route`**: **`chat`**, **`chat_gif`**, **`react`**, **`typing_start`**, **`typing_stop`**; **`Outcome`**: **`success`** \| **`validation_error`** \| **`auth_forbidden`** \| **`server_error`** | Lambda **`ws-route.ts`** structured **`logWsAction`** ( **`riffsyncDiag`**, route tail, room head — no message text) | Client events **log-only**; **`Requests`** **shipped** |
| **chat** (typing accepted) | **`typing_start_sent`**, **`typing_stop_sent`** | **`drawers.chat.state`** | **`RiffSync/Realtime`** **`TypingRouteAccepted`** — **`Route`**: **`typing_start`** \| **`typing_stop`** | Lambda **`riffsync-observability.ts`** EMF on successful typing handler | **shipped** |
| **chat** (typing throttle) | (no client **`typing_stop_failed`** in MVP) | **`drawers.chat.state`** | **`RiffSync/Realtime`** **`TypingRouteThrottled`** — **`Route`**: **`typing_start`** \| **`typing_stop`** | Lambda when per-**`sessionId`** typing rate limit fires | **shipped** |
| **chat** (active roster) | **`active_roster_update`**, **`typing_fanout`** | **`drawers.chat.state`** | **`RiffSync/Realtime`** **`PresenceActiveFanOut`** (one increment per roster fan-out wave with at least one **`active: true`** member) | Lambda **`broadcastRoomPresence`** in **`ws-shared.ts`** | **shipped** |
| **chat** (rehydrate) | **`ws_open`** after reconnect | **`drawers.chat.state`** | **`RiffSync/Realtime`** **`PresenceRequestRehydrated`** | Lambda **`presence_request`** handler in **`ws-route.ts`** | **shipped** |
| **chat** (active writes) | **`typing_start_sent`**, chat send paths | **`drawers.chat.state`** | **`RiffSync/Realtime`** **`QualifyingActiveWrite`** — optional **`Route`**: **`typing_start`**, **`chat`**, **`chat_gif`**, **`react`**, **`ping`** | Lambda handlers that update **`lastActiveAt`** | **shipped** |
| **chat** (send dropped) | **`send_dropped`** + **`CHAT_SEND_DROPPED`** | **`drawers.chat.lastErrorCode`**, **`activeErrorCodes`** | (none) | (none) | Client **log-only**; aggregate **`ChatSendDropped`** **deferred** |
| **chat** (future) | — | — | **`ChatSendDropped`** counter (design only) | — | **deferred** |

**Note:** **`ping`** updates **`lastActiveAt`** and emits **`QualifyingActiveWrite`** but does **not** emit **`Requests`** EMF today.

### Signaling drawer

| Drawer | Client log module / events | **`getDiagnostics()` field (#158)** | CloudWatch metric / signal | Server log source | Ship status |
| --- | --- | --- | --- | --- | --- |
| **signaling** | **`SfuMediaSession`**: **`signaling_connect`**, **`signaling_open`**, **`signaling_close`**, **`signaling_reconnect_scheduled`**, **`signaling_reconnect_success`**, **`signaling_degraded`**, **`token_denied`** | **`drawers.sfuSignaling.state`**, **`drawers.sfuSignaling.lastErrorCode`**, **`drawers.sfuSignaling.role`** | **`RiffSync/Media`** **`SignalingConnections`**, **`WorkerAlive`**, **`RouterRoomCount`**, **`HealthProbeSuccess`** (gauge/counter contract) | SFU **`/healthz`** JSON; SFU JSON logs with **`drawer: "signaling"`** on **`journalctl -u riffsync-sfu`** | Client **log-only**; health metrics **deferred** auto-scrape (operator **`curl /healthz`** MVP) |
| **signaling** (token deny) | **`token_denied`** | **`drawers.sfuSignaling.lastErrorCode`**, **`activeErrorCodes`** | **`RiffSync/Media`** **`SfuTokenDenied`** — optional **`Reason`**: **`av_disabled`**, **`publisher_cap_exceeded`**, **`rate_limited`**, … | Lambda **`webrtc-sfu-token.ts`** EMF | **`SfuTokenDenied`** **shipped** |
| **signaling** (timeout / failure) | **`signaling_degraded`**, typed codes in logs | **`drawers.sfuSignaling.state`** | (none) | SFU structured JSON logs | **log-only** |

### Connectivity drawer

| Drawer | Client log module / events | **`getDiagnostics()` field (#158)** | CloudWatch metric / signal | Server log source | Ship status |
| --- | --- | --- | --- | --- | --- |
| **connectivity** | **`transportConnectivityDrawerLog`** / **`iceDiagnostics`**: **`ice_failed`** (**`ICE_FAILED`**), **`turn_relay_required`** (**`TURN_RELAY_REQUIRED`**), **`ice_recovered`** | **`drawers.sfuSignaling.health.connectivity.state`**, **`.lastErrorCode`**, **`.iceConnectionState`** | (none today) | TURN/SFU infra logs; optional future **`IceGatheringFailed`** aggregate | Client **log-only**; **`IceTransportSignal`** EMF helper exists in SFU but is **not** called — **deferred** |
| **connectivity** (future) | — | **`drawers.sfuSignaling.health.connectivity`** | **`IceGatheringFailed`** (design) | — | **deferred** |

Transport-level ICE failures map to the **connectivity** drawer in fan UX and harness step summaries (**`[drawer=connectivity] code=ICE_FAILED`**).

### Produce / consume drawer

| Drawer | Client log module / events | **`getDiagnostics()` field (#158)** | CloudWatch metric / signal | Server log source | Ship status |
| --- | --- | --- | --- | --- | --- |
| **produce_consume** | **`produceConsumeDrawerLog`**, **`SfuMediaSession`**, **`TheaterPlayback`**: **`producer_closed`** (**`PRODUCER_CLOSED`**, INFO), **`partial_unpublish`**, **`consumer_attach_failed`**, **`transport_limit`**, **`consumer_limit`**, **`mix_error`**, **`host_screen_*`** | **`drawers.sfuSignaling.health.produceConsume.state`**, **`.lastErrorCode`**, **`.producerCount`**, **`.consumerCount`**, **`.hostScreenAttached`**, **`.participantAvPublishActive`** | **`RiffSync/Media`** **`TransportLimitRejected`**, **`ConsumerLimitRejected`** | SFU **`media-observability.ts`** EMF on stdout when caps hit (**`SFU_MAX_WEBRTC_TRANSPORTS_PER_SESSION`**, **`SFU_MAX_CONSUMERS_PER_SESSION`**) | Client **log-only**; limit EMF **shipped** (stdout; dashboard ingest **deferred**) |
| **produce_consume** (publish reject) | Inline AV toggle errors, **`sfu_publish_rejected`** | **`drawers.sfuSignaling.health.produceConsume.lastErrorCode`** | **`RiffSync/Media`** **`ProduceFailure`** — **`Reason`**: **`forbidden`**, **`bad_params`**, **`producer_class_mismatch`**, **`session_producer_limit`**, **`room_producer_limit`** | SFU **`index.ts`** produce handler | **shipped** (SFU stdout EMF) |
| **produce_consume** (lifecycle) | **`producer_closed`**, **`partial_unpublish`** | **`drawers.sfuSignaling.health.produceConsume`** | (none) | SFU JSON logs with **`drawer: "produce_consume"`** | Client + SFU logs **log-only**; aggregate **`ProducerLifecycleEvent`** **deferred** |
| **produce_consume** (gauges) | — | **`.producerCount`**, **`.consumerCount`** | **`ActiveProducers`**, **`ActiveConsumers`** (helpers in **`media-observability.ts`**) | — | **deferred** (not emitted on **`main`**) |

### Out of scope

| Drawer | Client log module / events | **`getDiagnostics()` field (#158)** | CloudWatch | Server logs | Ship status |
| --- | --- | --- | --- | --- | --- |
| **Speaking VAD** (#249) | **`speakingVad.ts`** — dev/debug only | (none) | (none) | (none) | **out-of-scope** |

---

## M21 signal posture (quick reference)

| Signal | Ship status |
| --- | --- |
| Client **`clientDrawerLog`** (all drawers) | **log-only** |
| **`RiffSync/Realtime`** **`Requests`** (chat routes) | **shipped** |
| **`TypingRouteAccepted`**, **`TypingRouteThrottled`** | **shipped** |
| **`PresenceActiveFanOut`**, **`QualifyingActiveWrite`**, **`PresenceRequestRehydrated`** | **shipped** (Lambda EMF on **`main`**) |
| **`TransportLimitRejected`**, **`ConsumerLimitRejected`**, **`ProduceFailure`** | **shipped** (SFU stdout) |
| **`SfuTokenDenied`** | **shipped** (Lambda) |
| **`HealthProbeSuccess`**, **`WorkerAlive`**, **`SignalingConnections`**, **`RouterRoomCount`** | Operator **`curl /healthz`** MVP; periodic scrape **deferred** |
| **`ChatSendDropped`**, **`IceGatheringFailed`**, **`ProducerLifecycleEvent`**, **`IceTransportSignal`**, **`ActiveProducers`/`ActiveConsumers`** | **deferred** |
| Speaking VAD | **out-of-scope** |
| **`DrawerIsolationViolation`** | Harness / CI only — **not** production CloudWatch |

---

## Investigation playbook

Recommended order (from #159):

1. **Fan console** — filter JSON lines by **`drawer`** (`chat`, `signaling`, `connectivity`, `produce_consume`). Each line is **`{ drawer, event, outcome, code? }`** from **`apps/web/src/room/clientDrawerLog.ts`**.
2. **`getDiagnostics()`** — map drawer to field (dev: **`window.riffsyncRoomDiagnostics()`** when room SDK is joined):
   - **`chat`** → **`drawers.chat`**
   - **`signaling`** → **`drawers.sfuSignaling.state`**
   - **`connectivity`** → **`drawers.sfuSignaling.health.connectivity`**
   - **`produce_consume`** → **`drawers.sfuSignaling.health.produceConsume`**
3. **CloudWatch** — open dashboard **`RiffSync-prod-operations`** ([`infra/cdk/README.md`](../infra/cdk/README.md#cloudwatch-operations-dashboard)):
   - Chat symptoms → **`RiffSync/Realtime`** widget (**`Requests`**, typing counters, presence counters).
   - Media cap / token symptoms → **`RiffSync/Media`** (**`SfuTokenDenied`** on dashboard; limit rejections may require SFU log tail until agent ships).
   - Infra saturation → Lambda errors, API Gateway 5xx, SFU EC2 **`CPUUtilization`** (**`riffsync-sfu-high-cpu`** alarm when wired).
4. **SFU journal** — SSM to SFU instance: **`journalctl -u riffsync-sfu -f`**. Look for structured JSON with **`drawer: "signaling"`** or **`drawer: "produce_consume"`**. Worker death: see worker runbook in [`infra/cdk/README.md`](../infra/cdk/README.md#self-hosted-media-coturn-turn--mediasoup-sfu-on-ec2) and [`sfu-deploy-checklist.md`](sfu-deploy-checklist.md).

**Drawer independence:** Chat-only outage must not set **`drawers.sfuSignaling.state`** to **`torn-down`**, and SFU-only outage must not block chat sends when **`drawers.chat.state === 'connected'`**. Harness steps 5–6 encode this contract.

---

## M23 produce_consume troubleshooting

### Host screen vs participant AV (#247, harness step 9)

When **`host_screen`** and **`participant_av`** producers coexist:

- Closing only the **`participant_av` video** producer must **not** detach the **`host_screen`** consumer. Expect **`producer_closed`** (**`PRODUCER_CLOSED`**, INFO) for the AV class only; **`drawers.sfuSignaling.health.produceConsume.hostScreenAttached`** stays **`true`** within ~2s.
- **`partial_unpublish`** logs indicate selective teardown, not full SFU session loss.
- If **`host_screen`** drops while AV video closes, check SFU journal for mistaken router cleanup and client **`consumer_attach_failed`** on the produce_consume drawer.

### Per-class transport failures → drawer mapping

| Symptom | Likely drawer | Client **`code`** | **`getDiagnostics()`** | AWS / server |
| --- | --- | --- | --- | --- |
| ICE gathering / PC failed | **connectivity** | **`ICE_FAILED`**, **`TURN_RELAY_REQUIRED`** | **`health.connectivity.lastErrorCode`** | TURN reachability; STUN-only ICE config |
| SFU WS drop / token issues | **signaling** | **`sfu_signaling_failed`**, config codes | **`drawers.sfuSignaling.state`** | **`SfuTokenDenied`**; SFU signaling logs |
| Transport / consumer caps | **produce_consume** | **`TRANSPORT_LIMIT_REACHED`**, **`CONSUMER_LIMIT_REACHED`** | **`health.produceConsume.lastErrorCode`** | **`TransportLimitRejected`**, **`ConsumerLimitRejected`** EMF on SFU stdout |
| Producer closed (tile-only UX) | **produce_consume** | **`PRODUCER_CLOSED`** | **`health.produceConsume.state`** | SFU produce_consume JSON logs |
| Theater audio graph | **produce_consume** | **`mix_error`** | **`drawers.theaterPlayback`** (related playback drawer) | Client **log-only** |

Caps (defaults on SFU EC2): **`SFU_MAX_WEBRTC_TRANSPORTS_PER_SESSION=8`**, **`SFU_MAX_CONSUMERS_PER_SESSION=64`** — see [`infra/cdk/lib/sfu-env-lines.ts`](../infra/cdk/lib/sfu-env-lines.ts).

---

## CloudWatch Logs Insights (examples)

Low-cardinality queries only — **do not** add **`roomId`**, **`sessionId`**, or **`sub`** as metric dimensions.

### Lambda realtime routes (chat drawer)

Log group: WebSocket route Lambda (environment-specific name from CDK).

```sql
fields @timestamp, route, outcome, connectionIdTail, roomIdHead
| filter ispresent(riffsyncDiag) and riffsyncDiag = "ws"
| filter route in ["chat", "chat_gif", "react", "typing_start", "typing_stop"]
| stats count() by route, outcome
| sort route asc
```

### Lambda EMF presence / typing (stdout in same log group)

```sql
fields @timestamp, TypingRouteAccepted, TypingRouteThrottled, PresenceActiveFanOut, QualifyingActiveWrite, PresenceRequestRehydrated
| filter ispresent(TypingRouteAccepted) or ispresent(PresenceActiveFanOut) or ispresent(PresenceRequestRehydrated)
| stats sum(TypingRouteAccepted) as typing_ok, sum(TypingRouteThrottled) as typing_throttled, sum(PresenceActiveFanOut) as active_fanout by bin(5m)
```

### SFU limit rejections (when logs are forwarded or copied from journal)

Search for EMF JSON with **`TransportLimitRejected`** or **`ConsumerLimitRejected`** in SFU stdout (local journal until CloudWatch agent):

```sql
fields @timestamp, Signal, TransportLimitRejected, ConsumerLimitRejected, ProduceFailure, Reason
| filter ispresent(Signal) and Signal in ["TransportLimitRejected", "ConsumerLimitRejected"]
| stats count() by Signal, bin(1h)
```

---

## Related docs

- [`.ai/operations/observability.md`](../.ai/operations/observability.md) — frozen dimensions and decisions
- [`architecture.server.md`](architecture.server.md#observability-aws--cloudwatch-first) — CloudWatch-first architecture
- [`infra/cdk/README.md`](../infra/cdk/README.md#self-hosted-media-coturn-turn--mediasoup-sfu-on-ec2) — SFU deploy, worker runbook, dashboard
- [`sfu-deploy-checklist.md`](sfu-deploy-checklist.md) — post-deploy **`/healthz`** and manual drills
