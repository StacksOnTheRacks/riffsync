# RiffSync AWS CDK (`infra/cdk`)

AWS CDK **v2** (TypeScript) for **hosted** environments only: **`staging`** and **`prod`**. There is **no** billable **`dev`** stack in AWS—see [`../../.forge/runtime/configuration.md`](../../.forge/runtime/configuration.md) and [`../../.forge/operations/deployment_environments.md`](../../.forge/operations/deployment_environments.md). **Local** development stays on the workstation (or CI `synth` without deploy).

## Layout

| Path | Role |
| --- | --- |
| `bin/riffsync.ts` | App entry; validates `environment` context |
| `lib/static-site-stack.ts` | Private **S3** origin + **CloudFront** with **origin access control (OAC)** |
| `lib/api-catalog-stack.ts` | **DynamoDB Catalog** table + **HTTP API** + **Lambda** — **`GET /v1/catalog`**, **`GET /v1/catalog/{id}`** |
| `lambda/catalog-*.ts` | Catalog read handlers (**`Scan`** list, **`GetItem`** by `id`) |
| `scripts/seed-catalog-from-json.ts` | Validates **`data/catalog/episodes.json`** against **`catalog.schema.json`**, **`BatchWriteItem`** into the deployed table |

### Catalog table & HTTP API (M4+)

Hosted stacks **`RiffSyncApi-staging`** / **`RiffSyncApi-prod`** add:

- **`AWS::DynamoDB::Table`** — **partition key** **`id`** (string, episode slug). **No sort key.** **`GET /v1/catalog`** uses **`Scan`** (acceptable while the library fits one Lambda scan; add **GSI**, **export**, or **cache** before scale demands it — **`docs/architecture.server.md`**, **`.forge/data/persistence_abstractions.md`**).
- **`AWS::ApiGatewayV2::Api`** (HTTP API) — routes above; **CORS** allows **`https://riffsync.tv`** in **prod**; **staging** adds **localhost** dev origins and **`https://riffsync.tv`**. Pass extra origins (e.g. **`https://<distribution>.cloudfront.net`**) at synth/deploy:  
  **`npx cdk deploy --all --context environment=staging --context catalogCorsOrigins=https://d111111abcdef8.cloudfront.net`**
- **`AWS::Lambda::Permission`** — **`lambda:InvokeFunction`** from **`apigateway.amazonaws.com`** per route integration ( **`docs/architecture.server.md`** IAM table).

**Outputs:** **`CatalogTableName`**, **`HttpApiUrl`** (base URL — append **`/v1/catalog`**).

**Seed (operators, after deploy):**

```bash
cd infra/cdk && npm ci && npm run build
TABLE_NAME="$(aws cloudformation describe-stacks --stack-name RiffSyncApi-staging \
  --query "Stacks[0].Outputs[?OutputKey=='CatalogTableName'].OutputValue" --output text)"
npm run seed:catalog -- "$TABLE_NAME"
```

JSON response shapes: **`docs/api.catalog.md`**.

**Tests:** `npm test` (Vitest for catalog projection helpers).

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
- **`AWS::CloudFront::OriginAccessControl`** + **`AWS::CloudFront::Distribution`** — HTTPS, `defaultRootObject: index.html`. **Custom error responses** map **403** and **404** to **`/index.html`** (HTTP **200**) so **SPA** deep links and hard refreshes work once assets are published (**M2**).
- **Artifacts:** the bucket may be **empty** for M1; CI or deploy steps in **M2+** publish `index.html` and static assets.

Staging uses **`RemovalPolicy.DESTROY`** on the bucket so stacks can be torn down in non-prod accounts; **empty the bucket** before `cdk destroy` if objects were published. Production uses **retain** + **versioning**.

## IAM baseline vs `docs/architecture.server.md`

Full server IAM (Lambda, API Gateway, EventBridge, DynamoDB, Cognito, Secrets Manager, `execute-api:ManageConnections`, CloudWatch `PutMetricData`, etc.) is described in [`../../docs/architecture.server.md`](../../docs/architecture.server.md) (**[Delivery pipeline §](../../docs/architecture.server.md#delivery-pipeline-github-actions)** and **[IaC & permission notes §](../../docs/architecture.server.md#iac--permission-notes)**). **This repo’s CDK app provisions (by stack):**

- **`RiffSyncStatic-*` —** **S3 bucket policy** statements: deny insecure transport; allow **`s3:GetObject`** for **CloudFront** via OAC (**resource-based**, not a standalone IAM role).
- **`RiffSyncStatic-*` —** **CloudFront** service-managed roles for the distribution (implicit in **`AWS::CloudFront::Distribution`**).
- **`RiffSyncApi-*` —** **Lambda** execution roles with **`dynamodb:GetItem` / `Scan`** (read) scoped to the **Catalog** table; **`AWS::Lambda::Permission`** for **API Gateway HTTP API** invoke (**`docs/architecture.server.md`**).

Older milestone copy: **M1** alone only created the static stack.

**Follow-ups (later milestones):**

- **GitHub Actions → AWS** deploy identity — prefer **OIDC** to IAM roles over long-lived access keys ([Delivery pipeline §](../../docs/architecture.server.md#delivery-pipeline-github-actions); [`.forge/operations/build_packaging.md`](../../.forge/operations/build_packaging.md)).
- **Runtime** IAM for **Lambda**, **API Gateway**, **WebSocket `@connections`**, **DynamoDB** writers (admin/catalog jobs), **Secrets Manager**, and **CloudWatch** custom metrics — extend policies as new routes and jobs ship.

## GitHub Actions (CI — no AWS credentials required)

[**`.github/workflows/ci.yml`**](../../.github/workflows/ci.yml) runs on **`pull_request`** and **`push`** to **`main`** when **`infra/cdk`**, **`apps/web`**, or workflow files change. The **`infra-cdk`** job runs **`npm ci`**, **`npm run build`**, **`cdk synth`** (**`staging`** and **`prod`**), then **`cfn-lint`** on **`cdk.out/**/*.template.json`**. The **`web-app`** job runs **`npm ci`**, **`npm run build`**, and **`npm run lint`** under **`apps/web`**.

This satisfies the **pull-request CI only** stance in **`docs/architecture.server.md`** (Delivery pipeline §): **PRs synthesize templates; they do not deploy.**

## Deploy (operators)

Deployment policy (**`.forge/operations/build_packaging.md`**, **`deployment_environments.md`**, **`docs/architecture.server.md`** Delivery pipeline §):

| Target | Trigger | Notes |
| --- | --- | --- |
| **Staging** | Manual workflow [**`deploy-staging.yml`**](../../.github/workflows/deploy-staging.yml) (**`workflow_dispatch`**) | **Ref must be `main`**. Runs **`cdk deploy`** for **staging**, then **builds `apps/web`**, **`aws s3 sync`** to the stack bucket (**`--delete`**), and **CloudFront invalidation** (`/*`). |
| **Production** | Manual workflow [**`deploy-prod.yml`**](../../.github/workflows/deploy-prod.yml) (**`workflow_dispatch`**) | **Input must be an existing semver tag** matching **`vMajor.Minor.Patch`**. Deploys **prod** CDK, then publishes the SPA with **`VITE_PUBLIC_ORIGIN=https://riffsync.tv`**, **`s3 sync`**, and invalidation. **No deploy from arbitrary branch SHAs.** |
| **Local** | **AWS CLI credential profile** via **`cdk deploy`** + manual **`s3 sync`** | Matches how engineers run **`cdk bootstrap`** / **`deploy`** interactively outside CI. |

### Fan SPA publish (S3 sync + invalidation)

After **`cdk deploy`**, the deploy workflows read **CloudFormation outputs** from **`RiffSyncStatic-staging`** / **`RiffSyncStatic-prod`**:

| Output | Use |
| --- | --- |
| **`BucketName`** | `aws s3 sync apps/web/dist/ s3://$Bucket/` (**`--delete`** keeps the bucket aligned with the latest build) |
| **`DistributionId`** | `aws cloudfront create-invalidation --paths "/*"` |
| **`DistributionDomainName`** | **Staging** build-time **`VITE_PUBLIC_ORIGIN`** (`https://<distribution>`) so client-side absolute URLs match the live host. **Production** uses **`https://riffsync.tv`** until a follow-up wires **ACM** + **DNS** at the distribution (then keep **`VITE_PUBLIC_ORIGIN`** aligned with the public hostname operators configure). |

**IAM for the GitHub OIDC deploy role** must allow, in addition to CDK/CloudFormation permissions:

- **`cloudformation:DescribeStacks`** on **`RiffSyncStatic-staging`** / **`RiffSyncStatic-prod`** (or `*` conditioned appropriately).
- **`s3:PutObject`**, **`s3:DeleteObject`**, **`s3:ListBucket`** on the **web bucket** (the **`BucketName`** output).
- **`cloudfront:CreateInvalidation`** on **`arn:aws:cloudfront::ACCOUNT:distribution/DistributionId`**.

Prefer scoping to those ARNs instead of `*` once ARNs are known from a first deploy.

### Staging smoke checks (operators)

After **Deploy CDK (staging)** completes:

1. Resolve the URL: **`https://<DistributionDomainName>/`** (stack output, or **AWS Console** → **CloudFormation** → **Outputs**).
2. **`curl -I`** — expect **`200`** for **`/`** and for **`/lobby`** (SPA fallback must return **`index.html`**, not S3 **`403`**).
3. In a browser, open **`/room/demo-room`**, refresh — still the shell app (**client-side route**).

**Local dry run (no AWS):**

```bash
cd apps/web && npm ci && npm run build && ls -la dist
```

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
