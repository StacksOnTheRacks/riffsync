# Deployment environments

RiffSync **hosted** footprint is **production only** in AWS (plus **local** development).

## Hosted (AWS)

| Environment | Role | Notes |
| --- | --- | --- |
| **Production** | **Only** shared hosted environment | Live Cognito, HTTP/WebSocket APIs, DynamoDB, Lambdas, CloudFront fan SPA, shared TURN/SFU EC2. |

## Promotion model (GitHub Actions)

| Path | Policy |
| --- | --- |
| **`main` → production** | **Manual** workflow run (**`workflow_dispatch`**): deploys **current `main` HEAD** to production. Ref input must stay **`main`** (enforced in the workflow). |

**Not automatic by default:** production does not continuous deploy on every push unless product policy changes—keeps costs and surprise releases down (**`.ai/operations/build_packaging.md`**).

## Removed: hosted staging

The former **staging** stacks (`RiffSyncFanAuth-staging`, `RiffSyncApi-staging`, `RiffSyncStatic-staging`) are **not** defined in CDK anymore. Operators should delete those stacks via **CloudFormation** after migrating any needed data and confirming DNS/clients no longer point at staging. See **`infra/cdk/README.md`** (Decommissioning hosted staging).

## Not used

Long-lived **`dev`** or per-developer app stacks in AWS—developers use **local** workflows (**`.ai/runtime/configuration.md`**).

## Local (not “an environment bill”)

- SAM/local, Vite against **mock** or pointed at **production** APIs when needed (treat as **production traffic**: avoid destructive tests without coordination).
- No requirement to parity every AWS locally on day one.

## Primary code pointers (optional)

- CDK **context** / CLI **`--context environment=prod`** (default in **`cdk.json`**).
- Repo **`.github/workflows/`** (`deploy-prod.yml`, `deploy-turn.yml`, `ci.yml`}.
