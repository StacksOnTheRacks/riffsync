# Configuration

Deployed settings and secrets—**never** bake secrets into client bundles.

## Environment tiers (cost-conscious)

There is **no hosted `dev`** stack—local development only for spikes (SAM/localstack/offline mocks) so you are not paying for a second full AWS footprint beside staging.

| Tier | Where it runs | Purpose |
| --- | --- | --- |
| **Local** | Developer's machine (or CI without deploy) | `sam local`, unit tests, static catalog from **`data/catalog/episodes.json`**, optional mocks. **$0 AWS** for environment itself; only what's used ad hoc (API calls during dev). |
| **`staging`** | **Single** shared AWS deployment | Integration testing, stakeholder demos, pre-prod config parity with prod at **smaller scale** / TTLs (`STALE_ROOM_MS`, lower concurrency caps, cheaper Dynamo capacity where safe). |
| **`prod`** | AWS | Live traffic; strict IAM, alarms, backups as policy dictates. |

**Decision:** Prefer **staging + prod** hosted in AWS only; avoids duplicate always-on stacks for developer sandboxes.

## Public hostname

| Tier | Hostname |
| --- | --- |
| **prod** | **`riffsync.tv`** — canonical origin **`https://riffsync.tv`** for the fan SPA, **API CORS** allowlists, **Cognito / Meta OAuth** callback URLs, and **YouTube iframe** registration where applicable (**`.forge/project.json`** → **`public_domain`**). |
| **staging** | **IaC choice** (e.g. `staging.riffsync.tv` or CloudFront default); document the chosen origin in the stack README when wired. |
| **Local** | **`http://localhost:…`** (or dev host only); must **not** be assumed in production config. |

SPA builds for **prod** should inject **`https://riffsync.tv`** (or derive it from **`public_domain`**) for absolute share links and OAuth redirect configuration.

## Parameters (non-secret)

Illustrative—final list in IaC:

- **`CATALOG_CACHE_TTL`**, **`STALE_ROOM_MS`**, **`TMDB_IMAGE_POSTER_SIZE`**, **`COGNITO_*` pool ids (public config)**, API base URLs for SPA, **`PUBLIC_WEB_ORIGIN`** / build-time equivalent aligning with **`public_domain`** (**`https://riffsync.tv`** in prod).

## Secrets

| Secret | Consumer |
| --- | --- |
| **TMDB API token** | Reconcile Lambda only (**Secrets Manager**). |
| **Facebook app secret** | **Cognito** configuration (not in Lambda app code if IdP-managed). |

## Decisions (answered)

| Question | Decision |
| --- | --- |
| Feature flags? | **Optional** (SSM, AppConfig, LaunchDarkly); **not** contractually required for MVP. |

## Primary code pointers (optional)

- `.env.example` (local only); **AWS CDK** app context (**`staging` / `prod`** only for hosted stacks).
- **`.github/workflows/`** — **manual** deploy **`main`** → **staging** and **`main`** → **prod** (**`build_packaging.md`**).
