# Build & packaging

## CDK application

| Aspect | Contract |
| --- | --- |
| **IaC** | **AWS CDK v2**, **TypeScript** project (`cdk.json`, `bin/*.ts`, `lib/*.ts`). |
| **Environments** | **Production** hosted stack only (**`.forge/runtime/configuration.md`**); ARNs/secrets use **`riffsync/prod/…`** names where applicable. |

## CI / CD — GitHub Actions

**CI is GitHub Actions.** **Deployment is on command** ( **`workflow_dispatch`** by default—no automatic prod deploy on every push unless you later choose otherwise).

| Workflow (conceptual) | Trigger | Target | Versioning |
| --- | --- | --- | --- |
| **Deploy production** | **Manual** (**`workflow_dispatch`**) against **`main`** only | **`cdk deploy`** for prod stacks + fan SPA publish | Deploys **commit SHA** at workflow run (not necessarily a tag). |
| **Deploy TURN only** | **Manual** | **`RiffSyncTurn`** | For coturn/UserData changes without full app deploy. |

**Practice**

- **Optional:** **semver tags** / **GitHub Releases** remain useful for changelog and communication; they no longer gate the production deploy workflow.
- **OIDC** federation from GitHub Actions → AWS IAM role is preferred over long-lived **AWS_ACCESS_KEY_ID** in secrets (implement in first pipeline story).
- **`cdk synth` / `diff` / tests** on **`pull_request`** to **`main`** recommended; does not deploy.

## Lambda bundles

| Aspect | Contract |
| --- | --- |
| **Language** | **TypeScript**; compile with **`tsc`** and/or **`esbuild`** (via **`NodejsFunction`** construct or **`@aws-cdk/aws-lambda-nodejs`**) so deploy artifacts are trimmed tree-shaken JS. |
| **Dependencies** | Prefer **minimal** **`node_modules`** per function where feasible; AWS SDK v3 modular imports. |

## Client

| Aspect | Contract |
| --- | --- |
| **SPA** | Vite/Next/CRA per frontend doc; **TypeScript**; build output to **S3 + CloudFront** (or host elsewhere) — wired from CDK or separate pipeline (document in stack README when added). |

## Pull-request CI (recommended)

- **`cdk synth`** with **`--context environment=prod`** (and optionally **`cdk diff`** against the prod account).
- **`cfn-lint`** on synthesized templates.
- **`npm test` / `vitest`** for handler and unit tests.

## Primary code pointers (optional)

- `.github/workflows/` (`deploy-prod.yml`, `deploy-turn.yml`, `ci.yml`).
- `package.json` workspaces: `infra/cdk`, `apps/web` (example layout—finalize when scaffolding).
