# Observability

**CloudWatch-first** — **`docs/architecture.server.md`** **Observability** section is normative.

## Summary contract

| Concern | AWS mechanism |
| --- | --- |
| **Metrics (infra)** | Lambda, API Gateway, DynamoDB, EventBridge **built-in** metrics. |
| **Metrics (product)** | **`PutMetricData`** or **EMF** under **`RiffSync/...`** namespaces; **low-cardinality** dimensions only. |
| **Dashboards** | **`AWS::CloudWatch::Dashboard`** in IaC; ops + reconcile + optional WebSocket views. |
| **Logs** | Structured JSON → **CloudWatch Logs**; **Logs Insights** for investigation; **metric filters** → alarms. |
| **Alarms** | **Lightweight defaults for OSS/cost**: e.g. sustained **Lambda error rate**, **API 5xx %**, **Dynamo throttling**, **reconcile failure** custom metric — **SNS email** to maintainer **optional**; **no** mandatory commercial on-call SLA (**`.forge/interface/presentation.md`**). **Thresholds** are **environment-specific** in IaC (stricter **prod**, quieter **staging**). |
| **Tracing** | **X-Ray** optional. |

## Availability (non-goal)

RiffSync as an OSS project does **not** publish **uptime SLAs** or incident **SLO** figures—**cost and volunteer bandwidth** come first. Deployers set their own alarm **severity** and **PagerDuty** (if any).


## Anti-patterns

- High-cardinality dimensions (**`roomId`**, **`userId`**) on **PutMetricData**.
- Relying on **admin HTTP** as the only reporting path for core KPIs.

## Primary code pointers (optional)

- Dashboard JSON in `infra/` when added.
