# Security

Defense-in-depth for a **public + anonymous** surface plus **operator** tools.

## Threat posture

| Area | Mitigation |
| --- | --- |
| **Injection / abuse** | Input validation on chat and display names; **rate limits** (API GW / WAF) per environment. |
| **AuthZ** | **Least privilege** IAM per Lambda; **admin** routes **staff JWT only**; **`cognito-idp:ListUsers`** scoped to fan pool ARN. |
| **Secrets** | **Secrets Manager** / SSM secure params; **never** in git, env files committed, or browser. |
| **Transport** | **TLS** everywhere (API Gateway defaults). |

## Data

| Data class | Handling |
| --- | --- |
| **PII (optional Cognito)** | Minimize retention in logs; **mask** in admin roster UI by default per **`architecture.admin.md`**. |
| **Chat** | **Ephemeral** over WebSocket only—**no Dynamo persistence** of message body, reactions, or GIF posts (moderation is **rate limits** + **disconnect**; see **`api_contracts.md`**). |
| **Fan avatars** | **S3** objects with **public HTTPS** URLs; validate upload size/MIME server-side; **no** chat or GIF bytes in Dynamo. |
| **Giphy** | API key in **Secrets Manager** only; proxy search is JWT-gated and rate limited. |

## Service expectations (OSS / cost)

| Topic | Contract |
| --- | --- |
| **Availability** | **No formal SLA** for the open-source project; self-hosters tune **CloudWatch** alarms and **budgets** per **`.ai/operations/observability.md`**. |
| **Logs** | Avoid logging **raw chat text** at **INFO** in production—prefer **metrics** + sampled **DEBUG** if needed (cardinality / cost). |

## Compliance cues

| Topic | Contract |
| --- | --- |
| **Third-party ToS** | YouTube embed + TMDB attribution + **Giphy** usage + Meta login rules documented for operators. |

## Primary code pointers (optional)

- WAF ACLs on HTTP API when enabled.
