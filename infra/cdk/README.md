# RiffSync AWS CDK (`infra/cdk`)

AWS CDK **v2** (TypeScript) for **hosted** environments only: **`staging`** and **`prod`**. There is **no** billable **`dev`** stack in AWS—see [`../../.forge/runtime/configuration.md`](../../.forge/runtime/configuration.md) and [`../../.forge/operations/deployment_environments.md`](../../.forge/operations/deployment_environments.md). **Local** development stays on the workstation (or CI `synth` without deploy).

## Layout

| Path | Role |
| --- | --- |
| `bin/riffsync.ts` | App entry; validates `environment` context |
| `lib/static-site-stack.ts` | Private **S3** origin + **CloudFront** with **origin access control (OAC)** |

## Prerequisites

- **Node.js** LTS (**≥ 20**)
- **AWS CDK CLI** — `npm install -g aws-cdk` or `npx cdk` (this package lists `aws-cdk` as a devDependency)
- AWS credentials only if you **deploy**; **`cdk synth` does not require a live account**

## Synth (required contexts)

From this directory:

```bash
npm ci
npm run build
npx cdk synth --all --context environment=staging
npx cdk synth --all --context environment=prod
```

Shortcuts: `npm run synth:staging` and `npm run synth:prod`.

**Quality gate (optional):** after synth, run [cfn-lint](https://github.com/aws-cloudformation/cfn-lint) on `cdk.out/**/*.template.json`.

## What M1 provisions

- **`AWS::S3::Bucket`** — **private** (block public access, default encryption). **No** public read ACL/policy; object access is via **CloudFront** only, with **`AWS:SourceArn`** scoped to the distribution in the bucket policy.
- **`AWS::CloudFront::OriginAccessControl`** + **`AWS::CloudFront::Distribution`** — HTTPS, `defaultRootObject: index.html`. **SPA** deep-linking / error-to-`index.html` behavior can be layered in when the web app is wired (**M2+**).
- **Artifacts:** the bucket may be **empty** for M1; CI or deploy steps in **M2+** publish `index.html` and static assets.

Staging uses **`RemovalPolicy.DESTROY`** on the bucket so stacks can be torn down in non-prod accounts; **empty the bucket** before `cdk destroy` if objects were published. Production uses **retain** + **versioning**.

## IAM baseline vs `docs/architecture.server.md`

Full server IAM (Lambda, API Gateway, EventBridge, DynamoDB, Cognito, Secrets Manager, `execute-api:ManageConnections`, CloudWatch `PutMetricData`, etc.) is described in [`../../docs/architecture.server.md`](../../docs/architecture.server.md) (**[Delivery pipeline §](../../docs/architecture.server.md#delivery-pipeline-github-actions)** and **[IaC & permission notes §](../../docs/architecture.server.md#iac--permission-notes)**). **This milestone only creates:**

- **S3 bucket policy** statements: deny insecure transport; allow **`s3:GetObject`** for **CloudFront** via OAC (**resource-based**, not a standalone IAM role).
- **CloudFront** service-managed roles for the distribution (implicit in the **`AWS::CloudFront::Distribution`** resource).

**Follow-ups (later milestones):**

- **GitHub Actions → AWS** deploy identity — prefer **OIDC** to IAM roles over long-lived access keys ([Delivery pipeline §](../../docs/architecture.server.md#delivery-pipeline-github-actions); [`.forge/operations/build_packaging.md`](../../.forge/operations/build_packaging.md)).
- **Runtime** IAM for **Lambda**, **API Gateway**, **WebSocket `@connections`**, **DynamoDB**, **Secrets Manager**, and **CloudWatch** custom metrics — add when those resources are provisioned (**M2+**).

## GitHub Actions (CI — no AWS credentials required)

[**`.github/workflows/ci.yml`**](../../.github/workflows/ci.yml) runs on **`pull_request`** and **`push`** to **`main`** when **`infra/cdk`** or workflow files change. It executes **`npm ci`**, **`npm run build`**, **`cdk synth`** for **`staging`** and **`prod`** contexts (fails the job on synth errors), then **`cfn-lint`** on **`cdk.out/**/*.template.json`**.

This satisfies the **pull-request CI only** stance in **`docs/architecture.server.md`** (Delivery pipeline §): **PRs synthesize templates; they do not deploy.**

## Deploy (operators)

Deployment policy (**`.forge/operations/build_packaging.md`**, **`deployment_environments.md`**, **`docs/architecture.server.md`** Delivery pipeline §):

| Target | Trigger | Notes |
| --- | --- | --- |
| **Staging** | Manual workflow [**`deploy-staging.yml`**](../../.github/workflows/deploy-staging.yml) (**`workflow_dispatch`**) | **Ref must be `main`**. Ships integrated **`main`** to the **staging** CDK context. |
| **Production** | Manual workflow [**`deploy-prod.yml`**](../../.github/workflows/deploy-prod.yml) (**`workflow_dispatch`**) | **Input must be an existing semver tag** matching **`vMajor.Minor.Patch`** (`v`-prefixed digits only — e.g. `v1.0.0`). **No deploy from arbitrary branch SHAs.** |
| **Local** | **AWS CLI credential profile** via **`cdk deploy`** | Matches how engineers run **`cdk bootstrap`** / **`deploy`** interactively outside CI. |

### Repository configuration (preferred: OIDC → IAM role)

Prefer **OIDC federation** (**GitHub → AWS**) over long-lived access keys (**`architecture.server.md`**, **`.forge/operations/build_packaging.md`**). Configure two **repository Variables** on GitHub (**Settings → Secrets and variables → Actions → Variables**, or org-level equivalents):

| Variable | Used by |
| --- | --- |
| **`AWS_DEPLOY_ROLE_ARN_STAGING`** | IAM role ARN assumable via OIDC for **staging** **`cdk deploy`** |
| **`AWS_DEPLOY_ROLE_ARN_PROD`** | IAM role ARN assumable via OIDC for **production** **`cdk deploy`** |
| **`AWS_REGION`** (optional) | Target region (**default `us-east-1`** when unset — override as needed.) |

IAM trust policy (**sketch**) for each role (`sts:AssumeRoleWithWebIdentity`):

- Audience / issuer **`token.actions.githubusercontent.com`**
- **Subject / `sub` claim** restricted to this repository (e.g. `repo:StacksOnTheRacks/riffsync:ref:refs/heads/main` for staging runs, and `repo:StacksOnTheRacks/riffsync:environment:production` or tag-scoped claims if you tighten further after policy review)
- Map **`aud`** to `sts.amazonaws.com` per AWS guidance for GitHub’s OIDC token

Role permissions must allow **CDK deploy** for the stacks in this app (CloudFormation, S3, CloudFront, IAM pass-through for CDK bootstrap assets, etc.). **Until these roles exist**, workflows still **validate** (CI synth + `cfn-lint`); deploy runs fail fast with a clear message if the variables are unset.

**No repository secrets are required for PR CI** (synth + lint). Optional short-lived keys are only an escape hatch if OIDC is not configured yet — not the default path.

### `cdk deploy` (CI and local)

GitHub deploy jobs use **non-interactive** approval:

```bash
npx cdk deploy --all --context environment=staging --require-approval never
npx cdk deploy --all --context environment=prod   --require-approval never
```

**`--require-approval never`** is appropriate for **automated** runs after changes are reviewed on **`main`** / via **tags**. For **local** interactive deploys, prefer **`broadening`** or **`any-change`** so IAM or security-group broadening prompts are visible before you press **y**.

**One-time per account/region:**

```bash
cd infra/cdk
npm ci && npm run build
npx cdk bootstrap aws://ACCOUNT/REGION   # uses your CLI profile credentials
```

**Exact operator sequence (staging, local profile):**

```bash
cd infra/cdk && npm ci && npm run build && npx cdk deploy --all --context environment=staging
```

Production from a workstation should **checkout the semver tag**, then **`cdk deploy`** with **`--context environment=prod`**:

```bash
git fetch --tags && git checkout v1.2.0
cd infra/cdk && npm ci && npm run build && npx cdk deploy --all --context environment=prod
```

## Naming & tiers

Hosted tiers (**`staging`**, **`prod`**) and **`local`** (no AWS footprint) match [`.forge/runtime/configuration.md`](../../.forge/runtime/configuration.md). Production web hostname on the canonical domain is documented there (`public_domain` in [`.forge/project.json`](../../.forge/project.json)); **`staging`** hostname/alternate domain naming is chosen when ACM and DNS are wired—until then use the **`DistributionDomainName`** stack output.
