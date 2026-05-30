# Build and Packaging

## Artifacts

| Artifact | Source | Publish target |
| --- | --- | --- |
| **Fan + staff SPA** | **`apps/web`** — single Vite build (**`npm run build`** → **`dist/`**) | **`RiffSyncStatic-prod`** S3 bucket + CloudFront invalidation |
| **Lambda handlers** | **`infra/cdk/lambda/`** — bundled by CDK | **`RiffSyncApi-prod`** (and other stacks as defined in IaC) |
| **CDK templates** | **`infra/cdk`** — **`cdk synth`** | CloudFormation deploy via GitHub Actions or operator **`cdk deploy`** |

The **admin UI** is **gated routes** under **`/admin/*`** in the **same** SPA as the fan catalog and rooms — **one** build, **one** CloudFront origin. Staff OAuth uses path **`/admin/auth/callback`** on the same **`FanWebSiteUrl`** origin as fan **`/auth/callback`**.

## SPA build-time configuration

Vite bakes public config at **`npm run build`**; the browser bundle does **not** fetch Cognito ids from S3 or SSM at runtime.

### Fan auth (existing)

Read from **`RiffSyncFanAuth-prod`** CloudFormation outputs in **[`deploy-prod.yml`](../../.github/workflows/deploy-prod.yml)**:

| Output | Vite env |
| --- | --- |
| **`FanHostedUiBaseUrl`** (host only) | **`VITE_COGNITO_HOSTED_UI_DOMAIN`** |
| **`FanUserPoolClientId`** | **`VITE_COGNITO_CLIENT_ID`** |

Also from **`RiffSyncStatic-prod`** / **`RiffSyncApi-prod`**: **`VITE_PUBLIC_ORIGIN`**, **`VITE_PUBLIC_API_BASE_URL`**, **`VITE_PUBLIC_WS_URL`**, optional **`VITE_PUBLIC_SFU_WS_URL`**.

### Staff auth (same build)

Read from **`RiffSyncStaffAuth-prod`** outputs in the **same** SPA build step (parallel to fan reads):

| Output | Vite env |
| --- | --- |
| **`StaffHostedUiBaseUrl`** (host only) | **`VITE_STAFF_COGNITO_HOSTED_UI_DOMAIN`** |
| **`StaffUserPoolClientId`** | **`VITE_STAFF_COGNITO_CLIENT_ID`** |

**Namespace separation:** staff vars are distinct from fan **`VITE_COGNITO_*`** so the SPA preserves separate trust boundaries in token storage (**`riffsync.staff*`** vs fan keys). **No** SPA client secret in the bundle.

**Local dev:** **`.env.local`** under **`apps/web`** may set staff **`VITE_*`** vars pointing at the prod staff pool (localhost OAuth callbacks mirror fan **`localDevCallbackLogoutBase`**). Missing staff env should fail loudly on admin login entry only; fan flows remain usable.

### Deploy ordering vs build

Staff Cognito outputs must exist **before** the SPA build that includes admin routes:

1. Deploy **`RiffSyncStaffAuth-prod`**
2. Deploy **`RiffSyncApi-prod`** (staff authorizer)
3. Refresh OAuth/CORS (staff + fan allowlists include **`/admin/auth/callback`**)
4. **`npm run build`** with fan + staff **`VITE_*`**, then S3 sync + invalidation

See **[`deployment_environments.md`](deployment_environments.md)** for the full production sequence.

## CI expectations

| Job | Scope |
| --- | --- |
| **`infra-cdk`** | **`cdk synth`**, **`cfn-lint`** on **`cdk.out`** |
| **`web-app`** | **`apps/web`** **`npm run build`** + lint (may use placeholder env in CI; production deploy reads live Cfn outputs) |

PR CI **does not deploy** to AWS.

## Release and delivery

- **Production:** manual **[`deploy-prod.yml`](../../.github/workflows/deploy-prod.yml)** on **`main`** only.
- **Deploy identity:** GitHub OIDC → IAM role (**`AWS_DEPLOY_ROLE_ARN_PROD`**) — prefer over long-lived access keys ([`docs/architecture.server.md`](../../docs/architecture.server.md) Delivery pipeline §).

## Primary code pointers (optional)

- [`apps/web/src/auth/fanHostedUiPkce.ts`](../../apps/web/src/auth/fanHostedUiPkce.ts) — fan **`VITE_COGNITO_*`** consumption pattern
- [`infra/cdk/lib/fan-auth-stack.ts`](../../infra/cdk/lib/fan-auth-stack.ts) — template for staff stack outputs and SES wiring
