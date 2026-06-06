# Deployment Environments

## Stage model

| Tier | Contract |
| --- | --- |
| **Production (hosted)** | Single billable footprint: **`environment=prod`** in CDK (`bin/riffsync.ts`). **No** hosted staging stacks. |
| **Local** | Workstation dev against **prod** API and Cognito pools (localhost OAuth callbacks); **no** separate deploy target. |

Validation and smoke checks for hosted auth run in **production**, consistent with prod-only CDK synthesis.

## CloudFormation stacks (production)

| Stack | Role |
| --- | --- |
| **`RiffSyncTurn`** | TURN + mediasoup SFU (VPC, EC2) |
| **`RiffSyncFanAuth-prod`** | Fan Cognito user pool, Hosted UI, SPA app client |
| **`RiffSyncStaffAuth-prod`** | **Staff** Cognito user pool (invite-only), Hosted UI, SPA app client, **`admin`** / **`curator`** groups |
| **`RiffSyncStatic-prod`** | Private S3 + CloudFront OAC for the **single** fan/staff SPA |
| **`RiffSyncSesInbound`** | Shared SES inbound receipt rules |
| **`RiffSyncApi-prod`** | HTTP + WebSocket API, DynamoDB, fan JWT authorizer, **staff JWT authorizer** on **`/v1/admin/*`**, Lambdas |

**Staff auth is additive:** deploying **`RiffSyncStaffAuth-prod`** does not mutate the fan pool or fan authorizer. **`RiffSyncApi-prod`** update wires the staff authorizer and admin routes.

## Deploy sequence (production)

Manual workflow **[`deploy-prod.yml`](../../.github/workflows/deploy-prod.yml)** (**`workflow_dispatch`**, ref **`main`**). See **[`build_packaging.md`](build_packaging.md)** for SPA publish.

| Phase | Stacks / steps | Notes |
| --- | --- | --- |
| **1 — Media** | **`RiffSyncTurn`** | Parallel with platform. |
| **2 — Platform** | **`RiffSyncFanAuth-prod`**, **`RiffSyncStaffAuth-prod`**, **`RiffSyncStatic-prod`**, **`RiffSyncSesInbound`** | Staff stack deploys **before** API (pool + client IDs must exist). **`apiCatalog.addDependency(staffAuth)`** in **`bin/riffsync.ts`** enforces synth order. |
| **3 — API** | **`RiffSyncApi-prod`** (**`--exclusively`**) | After media + platform. Staff pool/client props + staff JWT authorizer + first **`/v1/admin/*`** route. |
| **4 — OAuth / CORS refresh** | **`RiffSyncFanAuth-prod`**, **`RiffSyncStaffAuth-prod`**, **`RiffSyncApi-prod`** (**`--exclusively`**) | Point fan and staff Cognito callback allowlists and HTTP API CORS at **`FanWebSiteUrl`** from **`RiffSyncStatic-prod`**. Staff callbacks include **`/admin/auth/callback`** on the same origin as the fan SPA. |
| **5 — SPA** | **`npm run build`** in **`apps/web`**, **`aws s3 sync`**, CloudFront invalidation | One artifact; fan + staff **`VITE_*`** vars baked at build time (see **`build_packaging.md`**). |

**Brownfield first rollout:** deploy **`RiffSyncStaffAuth-prod`**, then **`RiffSyncApi-prod --exclusively`**, then rebuild and publish the SPA with staff Cognito outputs.

**Operator onboarding (MVP):** invite-only staff accounts via Cognito console (**`AdminCreateUser`**) and **`admin`** / **`curator`** group assignment — no self-service registration.

## GitHub Actions and OIDC

- **CI:** **[`ci.yml`](../../.github/workflows/ci.yml)** — synth + lint; **no** AWS deploy credentials.
- **Production deploy:** OIDC → **`AWS_DEPLOY_ROLE_ARN_PROD`**; extend deploy role **`cognito-idp:*`** (or minimal create/update actions) when the second pool is first deployed.
- **Media-only:** **[`deploy-turn.yml`](../../.github/workflows/deploy-turn.yml)**.

## Participant AV — media capacity and promotion

| Contract | Value |
| --- | --- |
| **Per-room AV publishers** | Target and hard ceiling **8** concurrent signed-in fans publishing camera and/or microphone per watch-party room. |
| **Footprint-wide concurrency** | Singleton SFU on **`RiffSyncTurn`** comfortably supports **tens** of simultaneous AV-active rooms before instance-type or architecture upsize review. |
| **Limit-hit behavior** | **Hard-fail** publish toggle with visible client error when SFU session caps or instance capacity block a new publisher — **no** auto-degrade (audio-only, drop newest video) in MVP. |
| **Hosted staging SFU** | **None** — load and soak for multi-producer rooms run against **production** media stack or **local dev** with prod API pools. |
| **Topology** | Unchanged: SPA + **`RiffSyncApi-prod`** + **`RiffSyncTurn`** S3 bundle; TURN remains shared coturn on the same **`RiffSyncTurn`** stack. |

SFU runtime guardrails (**`SFU_MAX_WEBRTC_TRANSPORTS_PER_SESSION`**, **`SFU_MAX_CONSUMERS_PER_SESSION`**, RTC port range) must align with the per-room publisher ceiling when wired through EC2 user-data.

## Open implementation decisions

- **SFU runtime env on EC2:** Wire **`SFU_MAX_WEBRTC_TRANSPORTS_PER_SESSION`**, **`SFU_MAX_CONSUMERS_PER_SESSION`**, and optionally **`MEDIASOUP_RTC_MIN/MAX_PORT`** through CDK user-data **`/etc/riffsync-sfu.env`** (today only **`SFU_JWT_SECRET`**, **`PORT`**, **`MEDIASOUP_ANNOUNCED_IP`**, RTC min/max are set in **`media-server-stack.ts`**).
- **Redeploy runbook:** Document when participant AV SFU changes require **`deploy-turn.yml`** vs full **`deploy-prod.yml`**, and post-deploy **`curl`** **`/healthz`** + checklist steps for multi-publisher scenarios.
- **Capacity worksheet:** Back-of-envelope bandwidth and mediasoup worker limits for **8** concurrent publishers per room; input to EC2 instance type review (**`t3.medium`** vs upsize).

## Primary code pointers (optional)

- [`infra/cdk/bin/riffsync.ts`](../../infra/cdk/bin/riffsync.ts) — stack graph and **`addDependency`**
- [`infra/cdk/README.md`](../../infra/cdk/README.md) — operator runbooks, outputs, smoke checks
