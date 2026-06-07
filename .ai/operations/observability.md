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

## Primary code pointers (optional)

- Dashboard JSON in `infra/` when added.
