# Configuration

Deployed settings and secrets—**never** bake secrets into client bundles.

## Environment tiers (cost-conscious)

There is **no hosted `dev`** stack and **no hosted staging** stack—**local development** only besides **production** AWS, so you are not paying for duplicate full footprints.

| Tier | Where it runs | Purpose |
| --- | --- | --- |
| **Local** | Developer's machine (or CI without deploy) | `sam local`, unit tests, static catalog from **`data/catalog/episodes.json`**, optional mocks. **$0 AWS** for environment itself; only what's used ad hoc (API calls during dev). |
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

## SFU (EC2) configuration surface

Non-secret env knobs on the **`riffsync-sfu`** process (exact names in IaC):

- **Capacity:** max WebRTC transports per session, max consumers per session, mediasoup RTC port range, announced public IP for ICE.
- **Room lifecycle:** room idle timeout before SFU tears down empty signaling room state.
- **Multi-publisher:** per-room or per-session producer caps enforced at SFU request handling (403 or error response), not client-only.

SPA build-time: **`VITE_PUBLIC_WS_URL`**, **`VITE_PUBLIC_API_BASE_URL`**, SFU WebSocket URL (or token-embedded **`wsUrl`**). Participant AV uses the **same** SFU signaling host as host screen share; no separate media endpoint.

## Open implementation decisions

- New SFU env vars for max producers per room/session; defaults safe for target party scale (~8 concurrent AV publishers per room).
- Whether SPA needs a new build-time flag for participant AV feature gate beyond existing **`VITE_WEBRTC_USE_MEDIASOU_SFU`**.
- CDK wiring for **`SFU_PUBLIC_WS_URL`** unchanged; document that participant path shares host signaling URL.

## Primary code pointers (optional)

- `.env.example` (local only); **AWS CDK** app context (**`prod`** for hosted stacks; default in **`infra/cdk/cdk.json`**).
- **`.github/workflows/`** — **manual** deploy **`main`** → **prod** (**`build_packaging.md`**).
