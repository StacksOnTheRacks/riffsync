# Index — operations

Scopes **build/deploy** (**AWS CDK**, TypeScript Lambdas, serverless-first packaging), **`GitHub Actions`** delivery (**manual** `main` → **prod**), **environments**, **observability** (CloudWatch-first), **security** posture.

Participant camera/microphone in watch-party rooms extends the existing **`RiffSyncTurn`** mediasoup SFU + coturn footprint; **no** new deployment tier or hosted staging stack. **Realtime hardening:** SFU-only media path (mesh retired), PR-blocking **`realtime-conformance`** harness on isolated disposable SFU + TURN, drawer-labeled observability.

Public site discoverability (**`robots.txt`**, **`sitemap.xml`**, build-time prerender, canonical hostname alignment) extends the existing **`apps/web`** → **`RiffSyncStatic-prod`** static build/publish pipeline; **no** new deployment tier, edge compute surface, or hosted staging footprint. Catalog subcategory routes (**`/catalog/mst3k`**, **`/catalog/community`**, **`/catalog/riff-ready`**, **`/catalog/movie-night`**) join the same indexable sitemap/prerender set as hub **`/catalog`** (**nine** static routes total); see **`build_packaging.md`**.

- Child contracts: **`build_packaging.md`**, **`deployment_environments.md`**, **`observability.md`**, **`security.md`**.

## Scope

- Record durable constraints and boundaries for this domain.
- **`build_packaging.md`** is the authoritative place for CI/CD workflows and bundle shape; **`deployment_environments.md`** defines promotion (**`main`/tags**).
- Keep this file aligned with mapped child contracts.

## Primary code pointers (optional)

- Add stable code directories or modules here when known.
- Keep entries concise and remove stale pointers.
