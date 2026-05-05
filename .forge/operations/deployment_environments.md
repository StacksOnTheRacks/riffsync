# Deployment environments

RiffSync **hosted** footprints are deliberately minimal for **cost control**.

## Hosted (AWS)

| Environment | Role | Notes |
| --- | --- | --- |
| **Staging** | **Only** shared non-production cloud environment | Mirrors prod topology at **lower cost** (throughput limits, TTLs, optional cheaper Dynamo billing mode); real Cognito/API/Dynamo/EventBridge Lambdas so integration behaves like prod. Use for QA, demos, and pre-release checks. |
| **Production** | Live users | Strong alarms, tighter IAM review, CDN/cache as shipped. |

## Promotion model (GitHub Actions)

| Path | Policy |
| --- | --- |
| **`main` → staging** | **Manual** workflow run ( **`workflow_dispatch`** ); deploys **current `main` HEAD** to staging. Intended for “ship latest integrated work to shared env” without burning prod. |
| **`main` → production** | **Manual** workflow run (**`workflow_dispatch`**), same promotion model as staging: deploys **current `main` HEAD** to production. Ref input must stay **`main`** (enforced in the workflow). |

**Not automatic by default:** neither staging nor prod continuous deploy on every push unless product policy changes—keeps costs and surprise releases down (**`.forge/operations/build_packaging.md`**).

## Not used

Long-lived **`dev`** or per-developer stacks in AWS—developers use **local** workflows (**`.forge/runtime/configuration.md`**).

## Local (not “an environment bill”)

- SAM/local, vite against **mock** or pointed at **staging** APIs when needed (coordinate to avoid destructive tests).
- No requirement to parity every AWS peripheral locally on day one.

## Primary code pointers (optional)

- CDK **context** / CLI **`--context environment=staging|prod`** (or separate stacks `RiffSyncStaging`, `RiffSyncProd`).
- Repo **`.github/workflows/`**.
