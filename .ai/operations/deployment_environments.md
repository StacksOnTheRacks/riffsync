# Deployment Environments

## Stage model

| Tier | Contract |
| --- | --- |
| **Production (hosted)** | Single billable footprint: **`environment=prod`** in CDK (`bin/riffsync.ts`). **No** hosted staging stacks. |
| **Local (workstation)** | Dev against **prod** API and Cognito pools (localhost OAuth callbacks); **disposable local SFU + TURN** for watch-party media — **no** mesh fallback. |
| **CI (ephemeral)** | **Fully isolated** disposable SFU + TURN per job; **no** prod footprint touch. Used by PR-blocking **`realtime-conformance`** harness. |

Validation and smoke checks for hosted auth run in **production**, consistent with prod-only CDK synthesis. Automated media conformance runs only against **CI ephemeral** or **local disposable** profiles — never against production **`RiffSyncTurn`** EC2.

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
- **Realtime conformance:** PR job boots isolated SFU + TURN — see **[`build_packaging.md`](build_packaging.md)**; **no** OIDC deploy role, **no** prod stack mutation.

## Local dev — disposable SFU + TURN profile

Local watch-party media **must** exercise the same SFU + coturn topology as **`RiffSyncTurn`**. Operators and contributors start a **disposable** profile on the workstation (docker compose or equivalent) before **`apps/web`** dev server:

| Contract | Value |
| --- | --- |
| **SFU process** | **`services/riffsync-sfu`** (or published container image built from it) listening on **`localhost:3000`** (HTTP + WebSocket upgrade). |
| **TURN** | Local coturn with static-auth credentials matching harness profile (see **`infra/coturn/turnserver.conf.example`**). |
| **Announced IP** | Loopback or host LAN IP for **`MEDIASOUP_ANNOUNCED_IP`** — not production EIP. |
| **Join secret** | Dev-only HMAC secret in **`.env.local`** / compose env — **not** prod Secrets Manager material. |
| **SPA wiring** | **`VITE_PUBLIC_SFU_WS_URL`** → local SFU **`ws://`** endpoint; ICE config points at local TURN. |
| **Control plane** | Room WebSocket and HTTP API may still target **prod** **`RiffSyncApi-prod`** (existing localhost OAuth pattern). |

**Mesh retirement:** Remove **`VITE_WEBRTC_USE_MEDIASOU_SFU`** mesh toggle. If disposable SFU is not running, room media surfaces a visible configuration error — not a silent mesh fallback.

## Participant AV — media capacity and promotion

| Contract | Value |
| --- | --- |
| **Per-room AV publishers** | Target and hard ceiling **8** concurrent signed-in fans publishing camera and/or microphone per watch-party room. |
| **Footprint-wide concurrency** | Singleton SFU on **`RiffSyncTurn`** comfortably supports **tens** of simultaneous AV-active rooms before instance-type or architecture upsize review. |
| **Limit-hit behavior** | **Hard-fail** publish toggle with visible client error when SFU session caps or instance capacity block a new publisher — **no** auto-degrade (audio-only, drop newest video) in MVP. |
| **Hosted staging SFU** | **None** — no billable staging media stack. PR harness uses **CI ephemeral** SFU + TURN; operator soak uses **production** media (manual checklist) or **local disposable** profile. |
| **Topology** | **SFU-only:** SPA + **`RiffSyncApi-prod`** + **`RiffSyncTurn`** S3 bundle in prod; local/CI use disposable SFU + coturn with identical signaling/producer semantics. **No** mesh WebRTC path. |

SFU runtime guardrails (**`SFU_MAX_WEBRTC_TRANSPORTS_PER_SESSION`**, **`SFU_MAX_CONSUMERS_PER_SESSION`**, RTC port range) must align with the per-room publisher ceiling when wired through EC2 user-data.

## SFU runtime env on EC2 (#106)

CDK user-data writes **`/etc/riffsync-sfu.env`** (systemd **`EnvironmentFile`**). Required and participant-AV caps:

| Variable | Default | Notes |
| --- | --- | --- |
| **`SFU_JWT_SECRET`** | (Secrets Manager) | Existing |
| **`PORT`** | **3000** | Existing |
| **`MEDIASOUP_ANNOUNCED_IP`** | EIP | Existing |
| **`MEDIASOUP_RTC_MIN_PORT`** / **`MAX_PORT`** | **40000–49999** | Existing in **`media-server-stack.ts`** |
| **`SFU_MAX_PRODUCERS_PER_SESSION`** | **3** | Host screen + participant video + audio on one tab |
| **`SFU_MAX_PRODUCERS_PER_ROOM`** | **24** | ~8 fans × 2 tracks + host headroom |
| **`SFU_MAX_WEBRTC_TRANSPORTS_PER_SESSION`** | **8** | Align with multi-consumer sessions |
| **`SFU_MAX_CONSUMERS_PER_SESSION`** | **64** | Theater grid + strip consumers |

Lambda mint-time **`publisher_cap_exceeded`** estimate uses **8 fan publishers** (not raw producer count).

## Redeploy runbook (#106)

| Change | Workflow | Post-deploy |
| --- | --- | --- |
| **`services/riffsync-sfu`** only | **[`deploy-turn.yml`](../../.github/workflows/deploy-turn.yml)** | **`docs/sfu-deploy-checklist.md`** through step 6 + multi-publisher section |
| **`webrtc-sfu-token`** / room PATCH | **`deploy-prod.yml`** phase 3 (API) | Token denial smoke + checklist |
| SPA error copy / a11y | **`deploy-prod.yml`** phase 5 (SPA) | Manual toggle error smoke |
| CDK SFU env / alarms | **`deploy-turn.yml`** (media stack) | **`curl /healthz`** + optional alarm verification |

Always run **`curl -sSf "${SFU_HTTP}/healthz"`** after media deploy before announcing AV-ready.

## Capacity worksheet (#106)

Back-of-envelope for **8** concurrent fan publishers (camera + mic) in one room on **`t3.medium`** SFU:

| Assumption | Value |
| --- | --- |
| Video per publisher | ~720p24 simulcast-friendly; ~1–2 Mbps uplink per active camera |
| Audio per publisher | ~50 Kbps Opus |
| **8** fans video-on | ~8–16 Mbps aggregate SFU ingress (order-of-magnitude) |
| Consumers | N viewers × M remote tiles scales **`SFU_MAX_CONSUMERS_PER_SESSION`** |

**Comfort zone:** tens of simultaneous AV-active rooms on singleton **`t3.medium`** before instance-type review. Upsize trigger: sustained CPU > 80% (optional alarm) or frequent **`TransportLimitRejected`** / **`ConsumerLimitRejected`** counters.

## Open implementation decisions

- **Compose profile location** — Repo path for local + CI-shared disposable SFU + TURN compose (e.g. **`infra/local-media/`** vs **`tests/realtime-conformance/`**).
- **Dev bootstrap script** — **`npm run media:local`** or documented **`docker compose up`** entry in **`README`** / **`infra/cdk/README.md`**.
- **ICE in CI** — Whether harness uses host-network ICE, TURN-only relay, or both; flake implications for GitHub-hosted runners.
- **Prod API coupling in local dev** — Whether local SFU may ever point at prod **`RiffSyncTurn`** for debugging (default: **no** — use disposable profile).

## Primary code pointers (optional)

- [`infra/cdk/bin/riffsync.ts`](../../infra/cdk/bin/riffsync.ts) — stack graph and **`addDependency`**
- [`infra/cdk/README.md`](../../infra/cdk/README.md) — operator runbooks, outputs, smoke checks
- [`infra/coturn/turnserver.conf.example`](../../infra/coturn/turnserver.conf.example) — TURN baseline for local/harness profiles
