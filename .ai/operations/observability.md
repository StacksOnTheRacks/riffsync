# Observability

**CloudWatch-first** — **`docs/architecture.server.md`** **Observability** section is normative.

## Summary contract

| Concern | AWS mechanism |
| --- | --- |
| **Metrics (infra)** | Lambda, API Gateway, DynamoDB, EventBridge **built-in** metrics. |
| **Metrics (product)** | **`PutMetricData`** or **EMF** under **`RiffSync/...`** namespaces; **low-cardinality** dimensions only. |
| **Dashboards** | **`AWS::CloudWatch::Dashboard`** in IaC; ops + reconcile + optional WebSocket views. |
| **Logs** | Structured JSON → **CloudWatch Logs**; **Logs Insights** for investigation; **metric filters** → alarms. |
| **Alarms** | **Lightweight defaults for OSS/cost**: e.g. sustained **Lambda error rate**, **API 5xx %**, **Dynamo throttling**, **reconcile failure** custom metric — **SNS email** to maintainer **optional**; **no** mandatory commercial on-call SLA (**`.ai/interface/presentation.md`**). Tune thresholds in IaC for the **prod** footprint. |
| **Tracing** | **X-Ray** optional. |

## Availability (non-goal)

RiffSync as an OSS project does **not** publish **uptime SLAs** or incident **SLO** figures—**cost and volunteer bandwidth** come first. Deployers set their own alarm **severity** and **PagerDuty** (if any).


## Fan-facing realtime and API (M10)

| Namespace | Routes (dimension **`Route`**) | Notes |
| --- | --- | --- |
| **`RiffSync/Realtime`** | **`chat`**, **`chat_gif`**, **`react`** | EMF via Lambda **stdout**; dimensions **`Environment`**, **`Route`**, **`Outcome`** only. |
| **`RiffSync/Api`** | **`GiphySearch`**, **`FanAvatarUpload`** | Same dimension set; no raw chat text or upload bytes in **INFO** logs (**`security.md`**). |

## Media plane (SFU + TURN)

Participant AV increases silent degradation risk on the **singleton** mediasoup worker (limits hit, worker death, RTC port exhaustion). Observability stays **aggregate** — same OSS posture as chat/API.

| Signal class | Source | Contract |
| --- | --- | --- |
| **SFU health** | EC2 **`/healthz`** | **`workerAlive`**, **`routerRoomCount`**, **`signalingConnections`** — probe success/failure only; no per-room breakdown in metrics. |
| **SFU process logs** | Local stdout/journal on SFU EC2 | Structured JSON; **no** **`roomId`**, **`sessionId`**, or **`sub`** at **INFO** volume. |
| **TURN relay load** | EC2 network metrics (optional) | Aggregate CPU/network on TURN instance; more publishers increase relay traffic on the shared **`t3.small`**. |
| **Limit rejections** | SFU counters (when wired) | Transport/consumer cap rejections as low-cardinality counters — **no** room id dimension. |

**Alerting:** Remain **best-effort** maintainer alerts (optional SNS email) like chat/API today — **no** mandatory PagerDuty or commercial on-call SLA for participant AV.

## Anti-patterns

- High-cardinality dimensions (**`roomId`**, **`sessionId`**, **`userId`**, **`giphyId`**, **`sub`**) on **PutMetricData** or EMF dimensions.
- Logging message **`text`**, GIF rendition URLs, or multipart avatar bytes at **INFO** in production.
- Relying on **admin HTTP** as the only reporting path for core KPIs.
- Per-room or per-session SFU telemetry that would explode CloudWatch cost at party scale.

## Open implementation decisions

- **SFU signal classes:** Define aggregate metrics namespace (e.g. **`RiffSync/Media`**) with dimensions **`Environment`**, **`Signal`** only: SFU health probe success, **`workerAlive`**, aggregate **`signalingConnections`**, **`routerRoomCount`**, transport/consumer limit rejections (counter, no room id).
- **EC2 alarms:** Optional IaC **`AWS::CloudWatch::Alarm`** on SFU instance CPU/network and/or synthetic **`/healthz`** check; threshold values and SNS wiring left to **`/refine-issue`**.
- **Log path:** Decide whether SFU structured JSON logs ship to **CloudWatch Logs** (agent/cron) vs maintainer **SSM session + journalctl** only; align with OSS cost posture.
- **Worker failure runbook:** Operator steps when mediasoup **`worker.on('died')`** fires (all rooms cleared on instance); tie to **`/healthz`** and instance reboot policy.

## Primary code pointers (optional)

- Dashboard JSON in `infra/` when added.
