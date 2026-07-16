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

**`VITE_PUBLIC_ORIGIN` sourcing (M27):** production **`deploy-prod.yml`** reads CloudFormation output **`FanWebSiteUrl`** from **`RiffSyncStatic-prod`** and exports it as **`VITE_PUBLIC_ORIGIN`** for **`npm run build`**. That output reflects **`fanWebCanonicalHostname`** (apex **`riffsync.tv`**) when GitHub Actions repository variables and CDK context are aligned (**[`deployment_environments.md`](deployment_environments.md)** → *Public site SEO deployment readiness*). Browser code consumes it via **`getPublicOrigin()`** (**`apps/web/src/config/publicOrigin.ts`**). The static **`apps/web/index.html`** shell must use the same apex origin for hardcoded canonical/OG/Twitter URLs until M29 per-route head tags replace the shell defaults.

**SFU-only media path:** **No** mesh WebRTC fallback. Retire **`VITE_WEBRTC_USE_MEDIASOU_SFU`** and mesh branches from **`apps/web`** this milestone. Local dev and CI use disposable SFU + TURN profiles per **[`deployment_environments.md`](deployment_environments.md)** — same mediasoup + coturn topology as production **`RiffSyncTurn`**, not a second code path.

### Staff auth (same build)

Read from **`RiffSyncStaffAuth-prod`** outputs in the **same** SPA build step (parallel to fan reads):

| Output | Vite env |
| --- | --- |
| **`StaffHostedUiBaseUrl`** (host only) | **`VITE_STAFF_COGNITO_HOSTED_UI_DOMAIN`** |
| **`StaffUserPoolClientId`** | **`VITE_STAFF_COGNITO_CLIENT_ID`** |

**Namespace separation:** staff vars are distinct from fan **`VITE_COGNITO_*`** so the SPA preserves separate trust boundaries in token storage (**`riffsync.staff*`** vs fan keys). **No** SPA client secret in the bundle.

**Local dev:** **`.env.local`** under **`apps/web`** may set staff **`VITE_*`** vars pointing at the prod staff pool (localhost OAuth callbacks mirror fan **`localDevCallbackLogoutBase`**). Missing staff env should fail loudly on admin login entry only; fan flows remain usable.

### Viewer-local Cast receiver (same build)

The SPA build includes the custom receiver route and public receiver app id configuration for optional viewer-local Cast.

| Concern | Contract |
| --- | --- |
| **Receiver route** | **`/cast/receiver`** is part of the same Vite SPA artifact and must be reachable from the production CloudFront origin over HTTPS. |
| **Receiver app id** | Public build-time value **`VITE_CAST_RECEIVER_APP_ID`**. Production deploy wiring reads the Cast Developer Console app id from a non-secret GitHub Actions variable such as **`PROD_CAST_RECEIVER_APP_ID`** and exports it as **`VITE_CAST_RECEIVER_APP_ID`** for the SPA build. It is safe in the bundle and must not be handled as a secret. |
| **Sender SDK** | The production bundle may load Google's Cast sender SDK from **`www.gstatic.com`** with **`loadCastFramework=1`**. Build and CSP policy must permit the required script path where Cast is enabled. |
| **Custom receiver** | Release readiness requires the Cast SDK Developer Console app id to point at the deployed receiver URL and any applicable sender origin allowlist to include **`https://riffsync.tv`**. |
| **Missing prod app id** | Missing production **`VITE_CAST_RECEIVER_APP_ID`** does not fail unrelated room deploys. The SPA must hide or locally fail Cast availability, and #306 release readiness records the missing app id as a blocker before announcing Cast-ready production behavior. |

### Deploy ordering vs build

Staff Cognito outputs must exist **before** the SPA build that includes admin routes:

1. Deploy **`RiffSyncStaffAuth-prod`**
2. Deploy **`RiffSyncApi-prod`** (staff authorizer)
3. Refresh OAuth/CORS (staff + fan allowlists include **`/admin/auth/callback`**)
4. **`npm run build`** with fan + staff **`VITE_*`**, then S3 sync + invalidation

See **[`deployment_environments.md`](deployment_environments.md)** for the full production sequence.

## Public site SEO artifacts

Search-engine and social-share surfaces for the fan SPA — **`robots.txt`**, **`sitemap.xml`**, per-route prerendered HTML, and per-route head tags — are **build-time generated artifacts**, not hand-maintained static files or a new runtime component. They ship through the **existing** **`apps/web`** → **`RiffSyncStatic-prod`** S3 sync + CloudFront invalidation pipeline (Artifacts table above) — no new publish target, no new CI job.

| Artifact | Generation | Source |
| --- | --- | --- |
| **`robots.txt`** | New step in **`apps/web`** **`npm run build`**, emitted into **`dist/`** | Static policy (below), keyed to the route matrix in **[`business_logic/domain_model.md`](../business_logic/domain_model.md)** → *Public discoverable surface* |
| **`sitemap.xml`** | Same build step; enumerates the static indexable routes plus one **`<url>`** entry per catalog episode passing **`episodeHasYoutubeLink`** | **`data/catalog/episodes.json`** (or **`GET /v1/catalog`** at build time) |
| **Per-route prerendered HTML** | Build-time prerender step renders static HTML snapshots for each indexable route into **`dist/`** alongside the SPA shell — served directly by the existing S3 + CloudFront static pipeline; **no** CloudFront Function / Lambda@Edge bot detection, **no** new edge compute surface | Vite build output plus the indexable route list |
| **Per-route head tags** (**`<title>`**, description, canonical, OG/Twitter) | Baked into each prerendered route's HTML at the same build step | **[`interface/presentation.md`](../interface/presentation.md)** → *Public site head tags and heading semantics* |

All absolute URLs in these artifacts (canonical links, **`Sitemap:`** line, OG/Twitter **`url`**/**`image`**) use the canonical production origin — **`https://riffsync.tv`** (apex) — sourced from the same **`public_domain`** / **`PUBLIC_WEB_ORIGIN`** build-time value already used for SPA absolute URLs (**[`runtime/configuration.md`](../runtime/configuration.md)**). Non-canonical **`www.riffsync.tv`** redirects to apex (**[`deployment_environments.md`](deployment_environments.md)** → *Public site SEO deployment readiness*); no artifact emits **`www`** absolute URLs.

**`robots.txt`** policy:

| Directive | Paths |
| --- | --- |
| **Disallow** | **`/room/`**, **`/lobby`**, **`/account`**, **`/admin/`**, **`/cast/receiver`**, **`/privacy/data-removal`**, **`/auth/callback`**, **`/admin/auth/callback`** |
| **Allow** (default) | **`/`**, **`/catalog`**, **`/watch/`**, **`/how-to-host-a-watchparty`**, **`/terms`**, **`/privacy`** |
| **`Sitemap:`** | **`https://riffsync.tv/sitemap.xml`** |

No hosted staging/dev SEO footprint — consistent with the prod-only environment policy in **[`deployment_environments.md`](deployment_environments.md)**; these artifacts ship only to **`RiffSyncStatic-prod`**.

## CI expectations

| Job | Scope | Blocking |
| --- | --- | --- |
| **`infra-cdk`** | **`cdk synth`**, **`cfn-lint`** on **`cdk.out`** | PR |
| **`web-app`** | **`apps/web`** **`npm run build`** + unit tests + lint (may use placeholder env in CI; production deploy reads live Cfn outputs). Build step must also produce **`robots.txt`**, **`sitemap.xml`**, and prerendered HTML for indexable routes without failing; missing catalog data at build time fails the build rather than shipping an empty or stale sitemap. | PR |
| **`realtime-conformance`** | Disposable SFU + TURN integration harness (see below) | **PR** when path filters match |

Viewer-local Cast browser/unit tests live under the **`web-app`** job. Physical Google Cast discovery and receiver launch are manual smoke checks because CI cannot reliably emulate Cast devices.

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
5. **Reconnect — chat WS** — force room WebSocket drop while SFU signaling stays open; chat plane recovers independently; media session persists per drawer-independent contract. Assert **`getDiagnostics().drawers.chat`** transitions **`connected` → `reconnecting` → `connected`** while **`drawers.sfuSignaling.state`** and **`drawers.sfuSignaling.health.connectivity.state`** stay **`connected`**.
6. **Reconnect — SFU WS** — force SFU signaling drop while room WebSocket stays open; token refetch + SFU reconnect recovers media; chat plane unaffected. Assert **`drawers.sfuSignaling`** (and health sub-fields) recover while **`drawers.chat.state`** stays **`connected`**.
7. **Typing fan-out** — harness peer sends **`typing_start`**; room WS stub observes **`typing`** fan-out to peers; **`typing_stop`** or peer disconnect clears typing for that **`sessionId`**. Optional signed-in fan stub **`chat_system`** **`join`** line — not required for pass.
8. **Active rehydrate** — qualifying **`ping`** inside active window; **`presence_request`** returns roster with expected **`lastActiveAt`** and **`active`** badges per M22 contract.
9. **`host_screen` survival** — with **`host_screen`** and **`participant_av`** publishing, close **`participant_av`** video producer only; **`host_screen`** consumer remains attached within **2s**; audio consumer may remain; SFU signaling stays **`open`** (M23 #247).

Harness failures must name the **drawer** (chat, signaling, connectivity, produce/consume) in CI output. See **[`observability.md`](observability.md)** and operator runbook **[`docs/observability-drawer-mapping.md`](../../docs/observability-drawer-mapping.md)**.

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
| **Job wiring owner** | **#153** adds **`realtime-conformance`** steps that call bootstrap; **#154** ships **[`bootstrap-media.sh`](../../tests/realtime-conformance/bootstrap-media.sh)** + **[`tests/realtime-conformance/README.md`](../../tests/realtime-conformance/README.md)** operator notes. |
| **Incremental ship** | Bootstrap runs even when **`run.sh`** is absent — job passes after **`wait`** succeeds post-SFU compile (**#153** interim gate). |

## Decisions (realtime-conformance harness runner — #155)

| Topic | Decision |
| --- | --- |
| **Package root** | **`tests/realtime-conformance/`** — own **`package.json`**, **`README.md`**, **`run.sh`** entry invoked by **#153** job after **#154** bootstrap. |
| **Harness driver** | **Node** dual-peer **`mediasoup-client`** with **`@koush/wrtc`** WebRTC polyfill for steps **1–4** (join / publish / consume / partial unpublish). Playwright browser **`getUserMedia`** fidelity **deferred** post-MVP. |
| **Drawer reconnect steps** | Steps **5–6** run as **vitest** + **`happy-dom`** suite under **`tests/realtime-conformance/`** importing **`RoomRealtimeSdk`** from **`apps/web`** — asserts normative **`getDiagnostics()`** drawer independence against live loopback SFU + room WS stub. |
| **Join JWT mint** | In-process **`signSfuJoinToken`** from **`infra/cdk/lambda/sfu-join-token-sign.ts`**; read **`SFU_JWT_SECRET`** from bootstrap fixture env — **no** mocked **`POST /v1/webrtc/sfu-token`** Lambda and **no** prod Cognito material. |
| **Room WS stub** | Minimal in-process **`ws`** server at **`tests/realtime-conformance/lib/room-ws-stub.ts`** — ack connect, **`ping`/`pong`**, **`chat`** fan-out, canned **`presence_request`** response; **not** testcontainers or API Gateway emulation. |
| **ICE / TURN** | Harness peers use coturn static credentials from bootstrap fixture **`turnserver.conf`**; ICE servers JSON injected via env — same loopback posture as **#154**. |
| **Partial unpublish assertion** | Publisher closes **video** producer only; consumer observes video consumer count **0** within **2s** wall clock; **audio** consumer remains attached; SFU signaling session stays **`open`** — no full session rebuild. |
| **Step timeouts** | **90s** wall clock per ordered scenario step; **0** automatic retries per step in MVP (fail fast). |
| **Job timeout** | **`realtime-conformance`** job sets **`timeout-minutes: 12`** when **`run.sh`** is present (**#153** integrator). |
| **Failure artifacts** | Runner writes **`harness-summary.json`** at repo root on failure (drawer/code/step/outcome rows per **#153**); optional tail of SFU container logs (**last 200** lines) appended when step **≥ 1** fails. HAR capture **deferred**. |
| **`run.sh` contract** | Bash, **`set -euo pipefail`**; exit **0** only when all **nine** steps pass when M24 #252 is merged; **six** steps until then. Prints **`[drawer=…] code=… step=…`** to stderr on failure for step summary ingestion. |

## Decisions (M24 harness steps 7–9 — #252)

| Topic | Decision |
| --- | --- |
| **Package owner** | Extend **`tests/realtime-conformance/`** **`run.sh`** and vitest drawer suite from **#155** — same Node + **`happy-dom`** posture as steps 5–6. |
| **Step 7 driver** | Room WS stub records **`typing`** envelopes; assert fan-out count and **`typing_stop`** / **`$disconnect`** clear. |
| **Step 8 driver** | Send qualifying **`ping`** then **`presence_request`**; assert stub roster JSON includes **`lastActiveAt`** + **`active`**. |
| **Step 9 driver** | Dual-peer mediasoup scenario: active **`host_screen`** + **`participant_av`**; close video producer only; assert **`host_screen`** consumer count **≥ 1** within **2s**. |
| **Job timeout** | Increase **`realtime-conformance`** **`timeout-minutes`** to **15** when steps 7–9 ship (was **12** for six steps). |
| **Incremental ship** | Steps 7–9 may land after steps 1–6; job fails only on steps present in **`run.sh`** manifest. |
| **Checklist mapping** | Add **`PR: step 7`**, **`PR: step 8`**, **`PR: step 9`** tags to **`docs/sfu-deploy-checklist.md`**; update summary table linking steps **1–9**. |

## Release and delivery

- **Production:** manual **[`deploy-prod.yml`](../../.github/workflows/deploy-prod.yml)** on **`main`** only.
- **Deploy identity:** GitHub OIDC → IAM role (**`AWS_DEPLOY_ROLE_ARN_PROD`**) — prefer over long-lived access keys ([`docs/architecture.server.md`](../../docs/architecture.server.md) Delivery pipeline §).

### Viewer-local Cast release readiness

Before announcing Cast-ready production behavior, operators verify:

| Check | Contract |
| --- | --- |
| **Developer Console** | Custom Web Receiver app is registered, published for the intended test/prod audience, and its application id matches the public SPA build value. |
| **Receiver URL** | Registered URL reaches **`https://riffsync.tv/cast/receiver`** over TLS from a network a Cast device can access. |
| **Origin policy** | Sender origin allowlist, if configured, includes **`https://riffsync.tv`** and any approved test origins. |
| **Headers / CSP** | CloudFront/S3 response headers allow the receiver route, Google Cast sender/receiver scripts, required framing or embed behavior, and YouTube/player resources needed by the receiver presentation. |
| **Physical smoke** | A Cast-capable Chrome sender opens the chooser from normal room view, launches the custom receiver on a physical Cast device, receives render confirmation, enters **`Now Casting`**, stops or recovers locally, and leaves chat/SFU/other participants unaffected. |

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

Superseded by **Decisions (SFU deploy checklist harness mapping — #156)** below and tagged rows in **[`docs/sfu-deploy-checklist.md`](../../docs/sfu-deploy-checklist.md)**. Run checklist steps **1–17** plus **Hardening verification** (**H1–H2**) after **`deploy-turn.yml`** or **`deploy-prod.yml`** when SFU, token mint, or SPA AV error surfaces change.

## Decisions (SFU deploy checklist harness mapping — #156)

**Goal:** Operators see which **`docs/sfu-deploy-checklist.md`** rows are covered by PR **`realtime-conformance`** vs which always need full prod verification — reducing duplicate toil without replacing post-deploy smoke.

### Tag vocabulary (normative)

| Tag | Meaning |
| --- | --- |
| **`PR: step N`** | Scenario **N** in the harness (**#155** steps **1–6**, **#252** steps **7–9**) exercises the same drawer/produce contract on **isolated loopback** SFU + TURN. |
| **`Abbreviated`** | When the **merged PR** had a green **`realtime-conformance`** run, operator runs a **short prod smoke** (minutes) instead of a full multi-window soak for that row. |
| **`Manual only`** | Always requires **full prod** verification — harness does not cover prod UX, API Gateway room WS, Cognito-signed flows, or operator drills. |

Harness **complements** checklist — it never mutates prod **`RiffSyncTurn`**.

### Per-row mapping (`docs/sfu-deploy-checklist.md`)

| Checklist row | Tag | Harness / operator note |
| --- | --- | --- |
| **1 Happy path** | **Abbreviated** | **PR: steps 1–3** cover join/publish/consume at protocol level; prod still confirms host **tab share** + two guest browsers. |
| **2 Mid-join** | **Abbreviated** | **PR: step 3** (consume attach); prod confirms fresh guest mid-stream with live **`host_screen`**. |
| **3 Fan WebSocket drop** | **PR: step 5** | Drawer-independent chat reconnect; **Abbreviated** prod: ~5s offline throttle smoke when PR green. |
| **4 SFU signaling drop** | **PR: step 6** | Single-producer reconnect; **Abbreviated** prod smoke when PR green. |
| **5 Host stop share** | **Manual only** | **`share_state: stopped`** fan-out — not in MVP harness. |
| **6 Server health** | **Manual only** | Prod **`curl "${SFU_HTTP}/healthz"`**; CI bootstrap **`wait`** is pre-scenario gate only (**#154**). |
| **7 Misconfiguration** | **Manual only** | Missing **`VITE_PUBLIC_SFU_WS_URL`** / token **`wsUrl`** visible error — SPA build/config surface. |
| **8 Local SFU down** | **Manual only** | **`LOCAL_SFU_UNREACHABLE`** against **local** disposable profile (**#137**). |
| **H1 Partial unpublish** (new hardening row) | **PR: step 4** | Fan camera off, mic on; remote video tile clears within **2s**; mic audible — insert in checklist **Hardening verification** subsection. |
| **H2 Drawer reconnect** (new hardening row) | **PR: steps 5–6** | Cross-ref checklist steps **3–4**; single subsection avoids duplicate prose. |
| **H3 Typing / active rehydrate** (M24 row) | **PR: steps 7–8** | Typing fan-out + **`presence_request`** **`lastActiveAt`** / **`active`** — insert in **Hardening verification** subsection. |
| **H4 `host_screen` survival** (M24 row) | **PR: step 9** | **`participant_av`** video off while **`host_screen`** consumer attached — complements **H1** partial unpublish. |
| **9 N fans publish** | **Manual only** | Harness uses **dual-peer** fixture, not three signed-in fans + strip UI. |
| **10 Theater mixed audio** | **Manual only** | Client Web Audio mix; server-side mix deferred. |
| **11 Video Chat grid** | **Manual only** | **`roomMode: videoChat`** layout — not in MVP harness. |
| **12 Host AV kill switch** | **Manual only** | SFU admin teardown + **`av_disabled`** token denial. |
| **13 Mid-party join with publishers** | **Abbreviated** | **PR: steps 1–3**; prod confirms third fan with two incumbents publishing. |
| **14 Publisher cap** | **Manual only** | Ninth publisher **`publisher_cap_exceeded`** inline copy. |
| **15 SFU drop (multi-producer)** | **PR: step 6** | Same signaling drawer reconnect with multiple remote producers; **Abbreviated** prod when PR green. |
| **16 Post-deploy health** | **Manual only** | Prod **`/healthz`** + optional CloudWatch gauges. |
| **17 Worker failure drill** | **Manual only** | Optional SSM / **`systemctl restart`** runbook. |

### Checklist doc structure (#156 deliverable)

1. Intro paragraph: PR harness vs post-deploy bands (**`.ai/operations/build_packaging.md`** CI vs prod table).
2. **Legend** block defining **`PR: step N`**, **`Abbreviated`**, **`Manual only`** (same vocabulary as above).
3. Inline tag on **each** numbered step **1–17** (prefix or suffix, e.g. **`[Abbreviated · PR: 1–3]`**).
4. New **`## Hardening verification`** section after step **8** with rows **H1–H4** (partial unpublish, drawer reconnect, typing/active rehydrate, **`host_screen`** survival).
5. Summary table at top of checklist linking harness steps **1–9** → checklist rows (mirror this decisions table).

The informal **SFU deploy checklist — hardening deltas** table above is superseded — this **Decisions (#156)** block is authoritative.

## Primary code pointers (optional)

- [`apps/web/src/auth/fanHostedUiPkce.ts`](../../apps/web/src/auth/fanHostedUiPkce.ts) — fan **`VITE_COGNITO_*`** consumption pattern
- [`infra/cdk/lib/fan-auth-stack.ts`](../../infra/cdk/lib/fan-auth-stack.ts) — template for staff stack outputs and SES wiring

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### chromecast-build-packaging
- No open decisions remain for sender availability build packaging. Production wiring uses a non-secret GitHub Actions variable exported as **`VITE_CAST_RECEIVER_APP_ID`** for the SPA build; the current pre-release UI additionally requires the existing room experimental feature opt-in; missing app id or disabled experimental opt-in hides or locally fails Cast and blocks release readiness, not unrelated room deploys; #301 web-app tests cover SDK loader, app id, **`CastContext.setOptions`**, availability UI, and no room-authority side effects, while #317 adds focused web coverage for the experimental exposure gate. Receiver route rendering tests belong to #303, and physical-device smoke evidence belongs to #306.

### public-site-seo
- Exact sitemap/robots generation script location and tooling (Node script inside the **`apps/web`** build vs a small CDK custom resource).
- Exact prerender tooling choice (custom Node script rendering routes to static HTML vs a Vite prerender plugin) — must integrate with the existing single **`npm run build`**, not a second build pipeline.
- CloudFront/S3 response headers and cache-control for **`robots.txt`** / **`sitemap.xml`** (bypass the SPA's aggressive **`index.html`** no-cache pattern vs a short TTL for post-catalog-update freshness).
- Whether the Search Console / Bing verification DNS record is added to the existing Route 53 zone via CDK or documented as a manual operator step (**[`deployment_environments.md`](deployment_environments.md)**).
