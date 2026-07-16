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

## Public site SEO build-time config

**`robots.txt`**, **`sitemap.xml`**, prerendered route HTML, and per-route canonical/OG/Twitter URLs (**`operations/build_packaging.md`**, **`interface/presentation.md`**) source the canonical origin from the **same** **`public_domain`** / **`PUBLIC_WEB_ORIGIN`** build-time value above — **`https://riffsync.tv`** (apex) in prod. There is **no** second, parallel "public origin" config value for SEO artifacts. Non-canonical **`https://www.riffsync.tv`** redirects to apex at the edge (**`deployment_environments.md`** → *Public site SEO deployment readiness*); no SEO artifact emits **`www`** absolute URLs.

These artifacts are static or build-time-generated content served by the existing CloudFront/S3 static-hosting runtime — they introduce **no** new runtime process, execution boundary, or secret.

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

## Viewer-local Cast build-time config

The Cast receiver application id is public build-time configuration for the SPA. It is not a secret and must not be loaded from Secrets Manager or a runtime config endpoint in the browser.

| Config | Contract |
| --- | --- |
| **Receiver app id** | The public Vite value is **`VITE_CAST_RECEIVER_APP_ID`**. Missing or invalid configuration hides or locally fails Cast; it must not degrade room bootstrap, chat, SFU media, host controls, expanded view, or normal playback. |
| **Receiver URL** | Production registration points to the Custom Web Receiver route on the canonical apex origin, **`https://riffsync.tv/cast/receiver`**. Local/dev physical Cast tests require a Cast-device-reachable HTTPS origin; ordinary **`localhost`** Vite dev is suitable for unit/component tests but is not a physical receiver target unless tunneled or otherwise exposed over trusted TLS. |
| **Sender SDK** | The sender loads the Google Cast sender SDK with **`loadCastFramework=1`**, assigns **`window.__onGCastApiAvailable`** before appending the SDK script, and configures **`CastContext`** from the build-time receiver app id with **`chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED`** before exposing the normal-view **Cast to TV** start action. |
| **Experimental exposure gate** | Until Cast is repaired and release-ready, **Cast to TV** also requires the existing room experimental feature opt-in from **`detectExperimentalRoomFeatures()`**. `?experimental=true` or `/experimental/true` enables and persists the opt-in; `?experimental=false` or `/experimental/false` clears it. This flag gates only the Cast entry point and other experimental room UI, not room bootstrap, chat, SFU media, host controls, expanded view, or normal playback. |
| **No secrets** | Receiver app id and public origin values may appear in the browser bundle. They must not be treated as credentials or included in private secret rotation plans. |

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

## Visible SFU configuration errors (#137)

When mediasoup signaling cannot be reached, the SPA surfaces an **honest configuration or deployment error** — **never** a silent mesh fallback.

| Failure class | Detection (client) | UX surface |
| --- | --- | --- |
| **`SFU_RELAY_URL_MISSING`** | Resolved WS base is empty (no token **`wsUrl`** and no **`VITE_PUBLIC_SFU_WS_URL`**) | Page **`role="alert"`** + video-relay status; copy references CDK **`sfuPublicWsUrl`** / build-time **`VITE_PUBLIC_SFU_WS_URL`**. |
| **`LOCAL_SFU_UNREACHABLE`** | Signaling host is local disposable (**`127.0.0.1`**, **`localhost`**, **`host.docker.internal`**) and **2** consecutive WebSocket open failures **or** first open failure when optional **`GET {httpBase}/healthz`** fails with connection error | Page alert + video-relay status; copy references **`npm run media:local`** and **`curl -sSf http://127.0.0.1:3000/healthz`**. |
| **`SFU_RELAY_UNREACHABLE`** | Prod (non-local) signaling host and **4** consecutive WebSocket open failures | Page alert + video-relay status; copy references **`docs/sfu-deploy-checklist.md`** (**`/healthz`**). |

**Reconnect policy:** Classified configuration errors stay visible through backoff retries; clear only after **`session.ready`**. Chat (room WebSocket) continues independently.

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
| CI harness env injection? | **#154** — bootstrap copies **`.env.example`** / **`turnserver.conf.example`** with fixture secrets; **no** GitHub Actions secrets or prod HMAC in CI logs. |

## Decisions (visible SFU config error — #137)

| Question | Decision |
| --- | --- |
| Mesh fallback when SFU down? | **Never** — SFU-only error surfaces; mesh branches removed in **#134**. |
| Clear error on reconnect attempt? | **No** — clear on successful **`session.ready`** only. |
| Local vs prod copy? | **Branch on signaling hostname** — local disposable hosts get compose/bootstrap remediation; prod hosts get deploy checklist remediation. |
| Optional health probe? | **`GET /healthz`** derived from WS base (http/https swap) may classify local config failure before second WS attempt. |

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### chromecast-configuration
- No open decisions remain for sender availability configuration. The public app id env var is **`VITE_CAST_RECEIVER_APP_ID`**; the current pre-release exposure gate is the existing room experimental feature opt-in from **`detectExperimentalRoomFeatures()`**; missing prod configuration or disabled experimental opt-in keeps Cast hidden or locally unavailable and is a release-readiness blocker before announcing Cast-ready behavior, not a room bootstrap failure; local physical Cast testing requires reachable TLS rather than ordinary **`localhost`**.

### public-site-seo
- **Canonical origin wiring (M27):** **`VITE_PUBLIC_ORIGIN`** is the single build-time origin env var for all absolute URLs this capability emits. Production **`deploy-prod.yml`** sets it from CloudFormation output **`FanWebSiteUrl`** on **`RiffSyncStatic-prod`**, which reflects **`fanWebCanonicalHostname`** (apex **`riffsync.tv`**) when GitHub Actions repository variables and CDK context are aligned. Browser/runtime code reads **`import.meta.env.VITE_PUBLIC_ORIGIN`** via **`getPublicOrigin()`** in **`apps/web/src/config/publicOrigin.ts`**; when unset in production builds, the fallback is **`https://riffsync.tv`** (**.ai/project.json`** → **`public_domain`**). The static **`apps/web/index.html`** shell must not hardcode **`www`** absolute URLs.
- **Future SEO build scripts (M28/M29):** Node-side steps inside **`npm run build`** read the same **`VITE_PUBLIC_ORIGIN`** value injected at build time (**`process.env.VITE_PUBLIC_ORIGIN`**). There is **no** separate Node env or parallel read of **`public_domain`** for SEO artifacts.

## Primary code pointers (optional)

- [`apps/web/.env.example`](../../apps/web/.env.example) — local disposable media + prod control plane vars
- [`infra/local-media/.env.example`](../../infra/local-media/.env.example) — SFU + coturn secrets (gitignored **`.env`** at runtime)
- **AWS CDK** app context (**`prod`** for hosted stacks; default in **`infra/cdk/cdk.json`**).
- **`.github/workflows/`** — **manual** deploy **`main`** → **prod** (**`build_packaging.md`**).
