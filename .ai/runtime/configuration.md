# Configuration

Deployed settings and secrets—**never** bake secrets into client bundles.

## Environment tiers (cost-conscious)

There is **no hosted `dev`** stack and **no hosted staging** stack—**local development** only besides **production** AWS, so you are not paying for duplicate full footprints.

| Tier | Where it runs | Purpose |
| --- | --- | --- |
| **Local** | Developer's machine | Unit tests, static catalog from **`data/catalog/episodes.json`**, **disposable SFU + TURN** for watch-party media (mandatory for A/V dev). **$0 AWS** for environment itself; prod API pools may still be used for HTTP/WS control plane per existing pattern. |
| **CI** | GitHub Actions (ephemeral) | **`infra-cdk`** synth/lint/tests, SPA build/unit/lint, **PR-blocking realtime conformance harness** against isolated disposable SFU+TURN when **`apps/web/**`** or **`services/riffsync-sfu/**`** change — **`.ai/operations/build_packaging.md`**. |
| **`prod`** | AWS | Live traffic; strict IAM, alarms, backups as policy dictates. |

**Decision:** Prefer **prod only** hosted in AWS; local covers pre-release work.

## Public hostname

| Tier | Hostname |
| --- | --- |
| **prod** | **`riffsync.tv`** — canonical origin **`https://riffsync.tv`** for the fan SPA, **API CORS** allowlists, **Cognito / Meta OAuth** callback URLs, and **YouTube iframe** registration where applicable (**`.ai/project.json`** → **`public_domain`**). |
| **Local** | **`http://localhost:…`** (or dev host only); must **not** be assumed in production config. |

SPA builds for **prod** should inject **`https://riffsync.tv`** (or derive it from **`public_domain`**) for absolute share links and OAuth redirect configuration.

## Parameters (non-secret)

Illustrative—final list in IaC:

- **`CATALOG_CACHE_TTL`**, **`STALE_ROOM_MS`**, **`TMDB_IMAGE_POSTER_SIZE`**, API base URLs for SPA, **`PUBLIC_WEB_ORIGIN`** / build-time equivalent aligning with **`public_domain`** (**`https://riffsync.tv`** in prod).
- **Fan Cognito (public):** fan user pool id and SPA client id for Lambdas and legacy **`COGNITO_*`** env on fan-scoped handlers (WebSocket, SFU, fan profile).
- **Staff Cognito (public):** staff user pool id and SPA client id for API Gateway staff JWT authorizer issuer/audience at synth time; **not** interchangeable with fan pool ids.

## SPA build-time config (fan + staff)

The **single** fan SPA artifact (**`RiffSyncStatic-prod`**, **`https://riffsync.tv`**) receives **two parallel Vite namespaces** at **`npm run build`**, both **public and non-secret**:

| Namespace | Injected at build | Consumed by |
| --- | --- | --- |
| **Fan** | Hosted UI domain + fan SPA client id (today’s **`VITE_COGNITO_*`** pattern) | Fan Hosted UI PKCE, **`/auth/callback`**, fan API calls |
| **Staff** | Staff Hosted UI domain + staff SPA client id (distinct **`VITE_*`** prefix from fan) | Staff Hosted UI PKCE, **`/admin/auth/callback`**, **`/v1/admin/*`** HTTP calls |

**Contract:** Cognito ids for the browser are **build-time only** (CloudFormation outputs in the prod deploy pipeline). There is **no** runtime fetch from S3, SSM, or a config endpoint for pool or client ids.

**Local tier:** Developers point staff **`VITE_*`** at the **prod staff pool** (same pattern as fan local dev against **`riffsync-fan-prod`**), with **localhost** OAuth callbacks registered on the staff app client. Missing staff build-time config must **fail loudly** on admin login entry, not silently degrade fan routes.

**Prod tier:** Production SPA build must include **both** fan and staff namespaces once staff auth is in scope; deploy reads **`RiffSyncFanAuth-prod`** and **`RiffSyncStaffAuth-prod`** outputs (exact output keys are implementation detail).

**Secrets:** Staff uses a **public PKCE SPA client** (no client secret in the bundle). Invite, MFA, and group assignment stay in Cognito/operations, not in SPA config.

## Secrets

| Secret | Consumer |
| --- | --- |
| **TMDB API token** | Reconcile Lambda only (**Secrets Manager**). |
| **Facebook app secret** | **Cognito** configuration (not in Lambda app code if IdP-managed). |

## Decisions (answered)

| Question | Decision |
| --- | --- |
| Feature flags? | **Optional** (SSM, AppConfig, LaunchDarkly); **not** contractually required for MVP. |

## Watch-party media (SFU-only)

| Topic | Contract |
| --- | --- |
| **Path** | **SFU mandatory** in local, CI, and prod. **Mesh WebRTC removed** — no peer-to-peer fallback branch in SPA. |
| **Removed flag** | **`VITE_WEBRTC_USE_MEDIASOU_SFU`** and any mesh toggle **retired** in issue **#134**; SPA always uses mediasoup-client against configured SFU **`wss://`**. |
| **Mesh removal checklist (#134)** | Delete **`apps/web/src/config/mediasoupSfuFeature.ts`**; delete **`apps/web/src/room/sharing/**`**; delete mesh-only helpers **`shareDiag.ts`**, **`hostRenegotiationPolicy.ts`**; remove **`RTCPeerConnection`** and room-WebSocket **`signaling`** handler branches from **`RoomPage.tsx`**; remove **`VITE_WEBRTC_USE_MEDIASOU_SFU`** from **`vite-env.d.ts`**; grep-clean **`VITE_WEBRTC_USE_MEDIASOU_SFU`**, **`isMeshWatchPartyMediaEnabled`**, **`isMediasoupSfuEnabled`**, **`shareSessionFsm`**, mesh copy in **`docs/architecture.frontend.md`** and **`docs/sfu-deploy-checklist.md`**. |
| **Mesh removal checklist (#135)** | Remove **`signaling`** from **`api-catalog-stack.ts`** WebSocket route list and API description; delete **`routeKey === 'signaling'`** branch in **`infra/cdk/lambda/ws-route.ts`**; grep-clean API Gateway mesh signaling from **`docs/contracts.websocket.md`**, **`docs/architecture.server.md`**, and **`infra/cdk/README.md`**. **Safe to deploy after #134** — SPA no longer sends or handles mesh **`signaling`** envelopes. |
| **Signaling URL** | **`SFU_PUBLIC_WS_URL`** (prod) or disposable SFU URL (local/CI). Participant and host share the same signaling endpoint. |
| **Local disposable profile (#136)** | **`infra/local-media/`** compose + **`apps/web/.env.example`** / **`.env.local`**: **`VITE_PUBLIC_SFU_WS_URL`**, **`VITE_WEBRTC_ICE_SERVERS_JSON`**, prod API/WS vars unchanged. Startup order in **`startup_bootstrap.md`**. |

## SFU (EC2) configuration surface

Non-secret env knobs on the **`riffsync-sfu`** process (exact names in IaC):

- **Capacity:** max WebRTC transports per session, max consumers per session, mediasoup RTC port range, announced public IP for ICE.
- **Room lifecycle:** room idle timeout before SFU tears down empty signaling room state.
- **Multi-publisher:** per-room or per-session producer caps enforced at SFU request handling (403 or error response), not client-only.

SPA build-time: **`VITE_PUBLIC_WS_URL`**, **`VITE_PUBLIC_API_BASE_URL`**, SFU WebSocket URL. Participant AV uses the **same** SFU signaling host as host screen share; no separate media endpoint. **No mesh feature gate.**

**Local SFU URL precedence (#136):** When **`VITE_PUBLIC_SFU_WS_URL`** is set, SPA uses it for mediasoup signaling **instead of** token-embedded **`wsUrl`** from **`POST /v1/webrtc/sfu-token`**. Enables prod control plane + disposable local SFU without API changes.

| Local env var | Purpose |
| --- | --- |
| **`VITE_PUBLIC_SFU_WS_URL`** | Disposable SFU signaling base (e.g. **`ws://127.0.0.1:3000`**). |
| **`VITE_WEBRTC_ICE_SERVERS_JSON`** | Optional JSON array overriding **`GET /v1/webrtc/ice`** when local coturn credentials differ from prod TURN. |

## SFU producer cap env vars

| Variable | Default | Contract |
| --- | --- | --- |
| **`SFU_MAX_PRODUCERS_PER_SESSION`** | **3** | Max mediasoup producers one signaling session may create (host screen + participant video + participant audio on one tab). |
| **`SFU_MAX_PRODUCERS_PER_ROOM`** | **24** | Max producers per **`env:roomId`** router (~8 fans × 2 tracks + host screen + headroom). |
| **`SFU_MAX_WEBRTC_TRANSPORTS_PER_SESSION`** | **8** | Max WebRTC transports per signaling session (producer + consumer paths). |
| **`SFU_MAX_CONSUMERS_PER_SESSION`** | **64** | Max mediasoup consumers per session (theater grid + strip). |
| **`SFU_ADMIN_SECRET`** | (required prod) | Shared secret for **`POST /admin/teardown-producers`**; also on room **`PATCH`** Lambda env. |

## Decisions (local env — #136)

| Question | Decision |
| --- | --- |
| Local SFU URL env name? | **`VITE_PUBLIC_SFU_WS_URL`** only — same name as prod SPA build; no **`VITE_SFU_WS_URL`** alias. |
| CI harness env injection? | **Out of #136** — harness milestone documents per-run HMAC and GitHub Actions secrets. |

## Open implementation decisions

- (none for #136 local disposable profile scope)

## Primary code pointers (optional)

- [`apps/web/.env.example`](../../apps/web/.env.example) — local disposable media + prod control plane vars
- [`infra/local-media/.env.example`](../../infra/local-media/.env.example) — SFU + coturn secrets (gitignored **`.env`** at runtime)
- **AWS CDK** app context (**`prod`** for hosted stacks; default in **`infra/cdk/cdk.json`**).
- **`.github/workflows/`** — **manual** deploy **`main`** → **prod** (**`build_packaging.md`**).
