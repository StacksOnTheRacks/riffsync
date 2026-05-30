# Security

Defense-in-depth for a **public + anonymous** surface plus **operator** tools.

## Threat posture

| Area | Mitigation |
| --- | --- |
| **Injection / abuse** | Input validation on chat and display names; **rate limits** (API GW / WAF) per environment. |
| **AuthZ** | **Least privilege** IAM per Lambda; **fan** routes accept **fan pool** JWT only; **`/v1/admin/*`** accepts **staff pool** JWT only (**second HTTP JWT authorizer** on staff issuer + staff app-client audience — cross-pool tokens fail at API Gateway). **`cognito-idp:ListUsers`** / **`AdminGetUser`** on admin Lambdas: **Resource** = **fan pool ARN** only (roster reads). Staff-pool **`cognito-idp:*`** (future invite automation): **staff pool ARN** only — never **`cognito-idp:*`** on both pools. |
| **Secrets** | **Secrets Manager** / SSM secure params; **never** in git, env files committed, or browser. |
| **Transport** | **TLS** everywhere (API Gateway defaults). |

## Staff auth and admin Lambda IAM

| Topic | Contract |
| --- | --- |
| **Staff JWT authorizer** | Second **`HttpJwtAuthorizer`** on **`RiffSyncApi-prod`**: issuer **`https://cognito-idp.<region>.amazonaws.com/<staffPoolId>`**, audience **staff SPA app client id**. Bound only on **`/v1/admin/*`**. Fan authorizer unchanged. Trust boundary: **[`authorization.md`](../integration/authorization.md)**. |
| **Admin Lambda roles** | **Separate** execution role per admin handler; fan-route Lambdas do **not** assume admin roles. Handlers read **`cognito:groups`** from authorizer context (**`admin`**, **`curator`**). |
| **Fan roster IAM** | **`cognito-idp:ListUsers`**, **`cognito-idp:AdminGetUser`**: **Resource** = **fan user pool ARN** only (future roster UI). |
| **Staff pool IAM** | Future staff provisioning APIs: **`cognito-idp:*`** scoped to **staff user pool ARN** only — not account-wide. |
| **DynamoDB** | Table-scoped grants when catalog/list handlers ship; auth MVP probe needs authorizer context only. |
| **Staff pool email** | **`UserPoolEmail.withSES`**: reuse verified domain **`riffsync.tv`**, **`From`** **`RiffSync <noreply@riffsync.tv>`**, configuration set **`riffsync-ses-send-prod`** (same outbound reputation pipeline as fan pool). |
| **Operator invites (MVP)** | Manual Cognito console **`AdminCreateUser`** + group assignment; **`selfSignUpEnabled: false`**. |
| **MFA** | Staff pool MFA **`OPTIONAL`** at launch (recommended, not mandatory). |
| **Deploy ordering** | **`RiffSyncStaffAuth-prod`** before **`RiffSyncApi-prod`**; SPA rebuild after staff outputs exist — **[`deployment_environments.md`](deployment_environments.md)**. |

## Data

| Data class | Handling |
| --- | --- |
| **PII (optional Cognito)** | Minimize retention in logs; **mask** in admin roster UI by default per **`architecture.admin.md`**. |
| **Chat** | **Ephemeral** over WebSocket only—**no Dynamo persistence** of message body, reactions, or GIF posts (moderation is **rate limits** + **disconnect**; see **`api_contracts.md`**). |
| **Fan avatars** | **S3** objects with **public HTTPS** URLs; validate upload size/MIME server-side; **no** chat or GIF bytes in Dynamo. |
| **Giphy** | API key in **Secrets Manager** only; proxy search is JWT-gated and rate limited. **Operator runbook:** [`docs/operations/giphy.md`](../../docs/operations/giphy.md). |

## Service expectations (OSS / cost)

| Topic | Contract |
| --- | --- |
| **Availability** | **No formal SLA** for the open-source project; self-hosters tune **CloudWatch** alarms and **budgets** per **`.ai/operations/observability.md`**. |
| **Logs** | Avoid logging **raw chat text** at **INFO** in production—prefer **metrics** + sampled **DEBUG** if needed (cardinality / cost). |

## Compliance cues

| Topic | Contract |
| --- | --- |
| **Third-party ToS** | YouTube embed + TMDB attribution + **Giphy** usage + Meta login rules documented for operators (**Giphy:** [`docs/operations/giphy.md`](../../docs/operations/giphy.md)). |

## Primary code pointers (optional)

- WAF ACLs on HTTP API when enabled.
