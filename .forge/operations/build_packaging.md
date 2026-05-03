# Build & packaging

## CDK application

| Aspect | Contract |
| --- | --- |
| **IaC** | **AWS CDK v2**, **TypeScript** project (`cdk.json`, `bin/*.ts`, `lib/*.ts`). |
| **Environments** | **`staging`** and **`prod`** hosted stacks (**`.forge/runtime/configuration.md`**); context or env-specific CDK qualifiers for ARNs/secrets IDs. |

## CI / CD — GitHub Actions

**CI is GitHub Actions.** **Deployment is on command** ( **`workflow_dispatch`** by default—no automatic prod deploy on every push unless you later choose otherwise).

| Workflow (conceptual) | Trigger | Target | Versioning |
| --- | --- | --- | --- |
| **Deploy staging** | **Manual** (“Run workflow”) against **`main`** | **`cdk deploy`** (or equivalent) to **staging** account/region/context | Deploys **commit SHA** at workflow run (not necessarily a tag). |
| **Deploy production** | **Manual** workflow that **requires a semver git tag** (`vMajor.Minor.Patch`, e.g. **`v1.2.0`**) — commonly `workflow_dispatch` with **tag name input** validated by regex, **or** discrete “deploy this ref” after tag push | **`cdk deploy`** to **prod** | **[Semantic versioning](https://semver.org/)** defines what is releasable to prod; branch-only deploys to prod are **out of policy**. |

**Practice**

- **Tags** are the **release artifacts** for production; **GitHub Releases** may mirror tags for notes (optional).
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

- **`cdk synth`** (and optionally **`cdk diff`** against staging).
- **`cfn-lint`** on synthesized templates.
- **`npm test` / `vitest`** for handler and unit tests.

## Primary code pointers (optional)

- `.github/workflows/` (`deploy-staging.yml`, `deploy-prod.yml`, `ci.yml`).
- `package.json` workspaces: `infra/cdk`, `packages/api-handlers`, `apps/web` (example layout—finalize when scaffolding).
