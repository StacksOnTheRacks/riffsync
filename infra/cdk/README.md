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

## Naming & tiers

Hosted tiers (**`staging`**, **`prod`**) and **`local`** (no AWS footprint) match [`.forge/runtime/configuration.md`](../../.forge/runtime/configuration.md). Production web hostname on the canonical domain is documented there (`public_domain` in [`.forge/project.json`](../../.forge/project.json)); **`staging`** hostname/alternate domain naming is chosen when ACM and DNS are wired—until then use the **`DistributionDomainName`** stack output.
