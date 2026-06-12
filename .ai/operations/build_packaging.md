# Build and Packaging

## Artifacts

| Artifact | Source | Publish target |
| --- | --- | --- |
| **Fan + staff SPA** | **`apps/web`** — single Vite build (**`npm run build`** → **`dist/`**) | **`RiffSyncStatic-prod`** S3 bucket + CloudFront invalidation |
| **Lambda handlers** | **`infra/cdk/lambda/`** — bundled by CDK | **`RiffSyncApi-prod`** (and other stacks as defined in IaC) |
| **CDK templates** | **`infra/cdk`** — **`cdk synth`** | CloudFormation deploy via GitHub Actions or operator **`cdk deploy`** |

The **admin UI** is **gated routes** under **`/admin/*`** in the **same** SPA as the fan catalog and rooms — **one** build, **one** CloudFront origin. Staff OAuth uses path **`/admin/auth/callback`** on the same **`FanWebSiteUrl`** origin as fan **`/auth/callback`**.

## SPA build-time configuration

Vite bakes public config at **`npm run build`**; the browser bundle does **not** fetch Cognito ids from S3 or SSM at runtime.

### Fan auth (existing)

Read from **`RiffSyncFanAuth-prod`** CloudFormation outputs in **[`deploy-prod.yml`](../../.github/workflows/deploy-prod.yml)**:

| Output | Vite env |
| --- | --- |
| **`FanHostedUiBaseUrl`** (host only) | **`VITE_COGNITO_HOSTED_UI_DOMAIN`** |
| **`FanUserPoolClientId`** | **`VITE_COGNITO_CLIENT_ID`** |

Also from **`RiffSyncStatic-prod`** / **`RiffSyncApi-prod`**: **`VITE_PUBLIC_ORIGIN`**, **`VITE_PUBLIC_API_BASE_URL`**, **`VITE_PUBLIC_WS_URL`**, **`VITE_PUBLIC_SFU_WS_URL`** (required for watch-party media in all environments).

**SFU-only media path:** **No** mesh WebRTC fallback. Retire **`VITE_WEBRTC_USE_MEDIASOU_SFU`** and mesh branches from **`apps/web`** this milestone. Local dev and CI use disposable SFU + TURN profiles per **[`deployment_environments.md`](deployment_environments.md)** — same mediasoup + coturn topology as production **`RiffSyncTurn`**, not a second code path.

### Staff auth (same build)

Read from **`RiffSyncStaffAuth-prod`** outputs in the **same** SPA build step (parallel to fan reads):

| Output | Vite env |
| --- | --- |
| **`StaffHostedUiBaseUrl`** (host only) | **`VITE_STAFF_COGNITO_HOSTED_UI_DOMAIN`** |
| **`StaffUserPoolClientId`** | **`VITE_STAFF_COGNITO_CLIENT_ID`** |

**Namespace separation:** staff vars are distinct from fan **`VITE_COGNITO_*`** so the SPA preserves separate trust boundaries in token storage (**`riffsync.staff*`** vs fan keys). **No** SPA client secret in the bundle.

**Local dev:** **`.env.local`** under **`apps/web`** may set staff **`VITE_*`** vars pointing at the prod staff pool (localhost OAuth callbacks mirror fan **`localDevCallbackLogoutBase`**). Missing staff env should fail loudly on admin login entry only; fan flows remain usable.

### Deploy ordering vs build

Staff Cognito outputs must exist **before** the SPA build that includes admin routes:

1. Deploy **`RiffSyncStaffAuth-prod`**
2. Deploy **`RiffSyncApi-prod`** (staff authorizer)
3. Refresh OAuth/CORS (staff + fan allowlists include **`/admin/auth/callback`**)
4. **`npm run build`** with fan + staff **`VITE_*`**, then S3 sync + invalidation

See **[`deployment_environments.md`](deployment_environments.md)** for the full production sequence.

## CI expectations

| Job | Scope | Blocking |
| --- | --- | --- |
| **`infra-cdk`** | **`cdk synth`**, **`cfn-lint`** on **`cdk.out`** | PR |
| **`web-app`** | **`apps/web`** **`npm run build`** + unit tests + lint (may use placeholder env in CI; production deploy reads live Cfn outputs) | PR |
| **`realtime-conformance`** | Disposable SFU + TURN integration harness (see below) | **PR** when path filters match |

PR CI **does not deploy** to AWS and **must not** touch the production **`RiffSyncTurn`** footprint.

### Realtime conformance harness (PR-blocking)

Normative automated substitute for manual checklist steps that exercise client + SFU orchestration. Complements — does not replace — operator **[`docs/sfu-deploy-checklist.md`](../../docs/sfu-deploy-checklist.md)** post-deploy verification against **production** media.

| Contract | Value |
| --- | --- |
| **Trigger** | **`pull_request`** to **`main`** when paths change under **`apps/web/**`** or **`services/riffsync-sfu/**`** (extend **`ci.yml`** path filters accordingly). |
| **Isolation** | Ephemeral SFU + coturn started inside the job (container or compose profile). **No** prod API deploy, **no** **`RiffSyncTurn`** EC2 mutation, **no** prod Cognito fan JWT material in CI logs. |
| **Credential class** | Harness-local HMAC join secret and static-auth TURN credentials only — not Secrets Manager prod classes. |
| **Topology** | Same planes as prod: room control stub or mock where needed, direct SFU signaling WebSocket, ICE against disposable TURN. |

**Ordered scenario steps** (pass/fail assertions at each gate):

1. **Join** — bootstrap room WebSocket (or harness stub) and SFU signaling session with valid join JWT.
2. **Publish** — produce **`participant_av`** video + audio (or **`host_screen`** where scenario requires).
3. **Consume** — remote harness peer receives media; remote tile / consumer attach succeeds.
4. **Partial unpublish** — camera off while mic on: video **`producerClosed`** propagates; remote video tile detaches promptly (**no** frozen last frame); audio continues without full SFU session rebuild.
5. **Reconnect — chat WS** — force room WebSocket drop while SFU signaling stays open; chat plane recovers independently; media session persists per drawer-independent contract. Assert **`getDiagnostics().drawers.chat`** transitions **`connected` → `reconnecting` → `connected`** while **`drawers.sfuSignaling.state`** stays **`connected`**.
6. **Reconnect — SFU WS** — force SFU signaling drop while room WebSocket stays open; token refetch + SFU reconnect recovers media; chat plane unaffected. Assert **`drawers.sfuSignaling`** recovers while **`drawers.chat.state`** stays **`connected`**.

Harness failures must name the **drawer** (chat, signaling, connectivity, produce/consume) in CI output. See **[`observability.md`](observability.md)** drawer mapping.

## Decisions (realtime-conformance CI gate — #153)

| Topic | Decision |
| --- | --- |
| **Job id** | **`realtime-conformance`** in **[`ci.yml`](../../.github/workflows/ci.yml)** — third PR job alongside **`infra-cdk`** and **`web-app`**. |
| **Workflow file** | Extend existing **`ci.yml`** — **no** separate workflow file. |
| **Path filters** | Add **`services/riffsync-sfu/**`**, **`tests/realtime-conformance/**`**, **`infra/local-media/**`** to **`pull_request`** and **`push`** **`paths`** (keep existing **`apps/web/**`** and CDK paths). |
| **Blocking** | **PR-blocking** when path filters match — same required-check posture as **`web-app`**. |
| **SFU compile gate** | First steps in **`realtime-conformance`**: **`npm ci && npm run build`** under **`services/riffsync-sfu`** — **not** folded into **`infra-cdk`**. |
| **Runner entrypoint** | **`tests/realtime-conformance/run.sh`** at repo root (created by **#155**). When absent, job **passes after SFU compile only** (incremental ship before scenarios land). When present, non-zero exit **fails** the job. |
| **Compose bootstrap** | **`tests/realtime-conformance/bootstrap-media.sh`** (**#154**) starts disposable SFU + coturn via **`infra/local-media/compose.yml`**; **#153** job invokes **`up`** + **`wait`** before **`run.sh`**, **`down`** in **`if: always()`**. |
| **AWS / prod** | **No** OIDC deploy role, **no** Secrets Manager prod classes, **no** **`RiffSyncTurn`** mutation. |
| **Parallelism** | **`realtime-conformance`** has **no** **`needs:`** on sibling jobs — runs in parallel with **`infra-cdk`** / **`web-app`**. |

## Decisions (CI ephemeral bootstrap — #154)

| Topic | Decision |
| --- | --- |
| **Bootstrap script** | **`tests/realtime-conformance/bootstrap-media.sh`** — **`up`** (fixture env + **`docker compose up -d --build`**), **`wait`** (**`/healthz`** poll), **`down`** (compose teardown + optional log capture). |
| **Fixture env** | Generated from committed **`infra/local-media/.env.example`** and **`coturn/turnserver.conf.example`** — harness **`SFU_JWT_SECRET`** matches **#155** in-process token mint; **no** prod join HMAC in CI. |
| **Docker posture** | Standard **`ubuntu-latest`** Docker; SFU signaling on **`127.0.0.1:3000`** only; coturn **3478** + relay range per compose — same port map as local profile. |
| **Job wiring owner** | **#153** adds **`realtime-conformance`** steps that call bootstrap; **#154** ships the script + **`tests/realtime-conformance/README.md`** operator notes. |
| **Incremental ship** | Bootstrap runs even when **`run.sh`** is absent — job passes after **`wait`** succeeds post-SFU compile (**#153** interim gate). |

## Open implementation decisions

- **Harness driver** — Node dual-peer **`mediasoup-client`** script is the PR gate (**#155**); Playwright browser **`getUserMedia`** fidelity deferred post-MVP unless a scenario requires UI tile assertions.
- **Timeouts and flake policy** — Per-step wall clocks, retry budget, and supplemental artifact capture (HAR) — **#155** runner; job-level **`timeout-minutes`** on **`realtime-conformance`** set when runner lands.
- **Room WS stub** — Minimal in-process mock in **`tests/realtime-conformance/`** (**#155**); not testcontainers for MVP.

## Release and delivery

- **Production:** manual **[`deploy-prod.yml`](../../.github/workflows/deploy-prod.yml)** on **`main`** only.
- **Deploy identity:** GitHub OIDC → IAM role (**`AWS_DEPLOY_ROLE_ARN_PROD`**) — prefer over long-lived access keys ([`docs/architecture.server.md`](../../docs/architecture.server.md) Delivery pipeline §).

## Participant AV (watch-party rooms) — SFU-only artifact graph

All watch-party media (host screen + participant camera/microphone) ships through **one** mediasoup SFU path. **No** mesh WebRTC artifact or build flag.

| Change surface | Artifact / workflow |
| --- | --- |
| Room client modules (**`ChatSession`**, **`SfuMediaSession`**, **`TheaterPlayback`**) | **`apps/web`** SPA rebuild → **`RiffSyncStatic-prod`** |
| SFU token mint, room WebSocket fan-out | **`RiffSyncApi-prod`** Lambdas |
| mediasoup multi-producer SFU | **`services/riffsync-sfu`** → **`RiffSyncTurn`** S3 bundle via **[`deploy-turn.yml`](../../.github/workflows/deploy-turn.yml)** or phase 1 of **[`deploy-prod.yml`](../../.github/workflows/deploy-prod.yml)** |

Media-only SFU hotfixes may use **`deploy-turn.yml`** without a full platform/API/SPA sequence.

**CI vs prod verification:**

| Band | When | Harness |
| --- | --- | --- |
| **PR** | **`apps/web/**`** or **`services/riffsync-sfu/**`** changes | **`realtime-conformance`** (isolated disposable SFU + TURN) |
| **Post-deploy (prod)** | **`deploy-turn.yml`** or **`deploy-prod.yml`** media/API/SPA phases | Manual **[`docs/sfu-deploy-checklist.md`](../../docs/sfu-deploy-checklist.md)** |

## SFU deploy checklist — hardening deltas

Post-deploy verification extends **[`docs/sfu-deploy-checklist.md`](../../docs/sfu-deploy-checklist.md)**. After realtime hardening lands, operators add or re-run these rows (map to harness scenarios to avoid duplicate toil):

| Checklist theme | Operator step (manual) | Harness scenario |
| --- | --- | --- |
| **Partial unpublish** | Fan disables camera with mic on; remote video tile clears promptly | Harness step 4 |
| **Drawer-independent reconnect** | Chat WS drop with SFU up; then SFU WS drop with chat up | Harness steps 5–6; extends existing steps 3–4 |
| **`share_state: stopped`** | Host stops share; guests detach **`host_screen`** only; participant A/V persists | Manual only (prod room WS); assert no full SFU session teardown |
| **Theater ↔ Video Chat** | Mode transition without silent black screen | Manual smoke; not in MVP harness unless Playwright gate expands |
| **Mic-only lifecycle** | Mic-only fan audible, off strip/grid; no frozen frame on camera-off peers | Harness step 4 + checklist step 9 |

Run full checklist (steps 1–16 + multi-publisher section) after **`deploy-turn.yml`** or **`deploy-prod.yml`** when SFU, token mint, or SPA AV error surfaces change.

## Primary code pointers (optional)

- [`apps/web/src/auth/fanHostedUiPkce.ts`](../../apps/web/src/auth/fanHostedUiPkce.ts) — fan **`VITE_COGNITO_*`** consumption pattern
- [`infra/cdk/lib/fan-auth-stack.ts`](../../infra/cdk/lib/fan-auth-stack.ts) — template for staff stack outputs and SES wiring
