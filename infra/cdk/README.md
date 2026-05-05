# RiffSync AWS CDK (`infra/cdk`)

AWS CDK **v2** (TypeScript) for **hosted** environments only: **`staging`** and **`prod`**. There is **no** billable **`dev`** stack in AWS—see [`../../.forge/runtime/configuration.md`](../../.forge/runtime/configuration.md) and [`../../.forge/operations/deployment_environments.md`](../../.forge/operations/deployment_environments.md). **Local** development stays on the workstation (or CI `synth` without deploy).

## Layout

| Path | Role |
| --- | --- |
| `bin/riffsync.ts` | App entry; validates `environment` context |
| `lib/static-site-stack.ts` | Private **S3** origin + **CloudFront** with **origin access control (OAC)** |
| `lib/api-catalog-stack.ts` | **Catalog** + **Rooms** + **Connections** Dynamo tables, **HTTP API** (catalog, rooms, lobby), **JWT** (**fan pool**), **WebSocket API** (ping/chat/signaling), **TMDB reconcile** + schedules |
| `lib/fan-auth-stack.ts` | **Fan** Cognito **User Pool** + **Hosted UI** domain + SPA app client (**local** email/password sign-up & sign-in, OAuth code + PKCE) |
| `lib/ses-inbound-stack.ts` | Shared **SES inbound** receipt rule → **SNS** (+ optional Route 53 **MX**) — **one** topic/rule set for all tiers; synthesized only with **`environment=prod`** |
| `lambda/catalog-*.ts` | Catalog read handlers (**`Scan`** / **`GetItem`**) |
| `lambda/room-*.ts` | **`POST/PATCH`** room + **`GET`** lobby/read (**`authorization.md`**) |
| `lambda/ws-*.ts` | WebSocket **`$connect`** / **`$disconnect`** / message routes |
| `lambda/room-shared.ts` | Shared parsing + **`STALE_ROOM_MS`** (**lobby staleness**) |
| `lambda/tmdb-reconcile-*.ts` | Scheduled **`GET /configuration`**, **`/search/movie`**, **`/movie/{id}`** enrichment (**`docs/contracts.tmdb.md`**) |
| `scripts/copy-catalog-dynamodb.ts` | **`npm run copy:catalog`** — scan one catalog table, **`BatchWriteItem`** into another (staging → prod migration) |

### TMDB reconcile (M4+)

| Resource | Notes |
| --- | --- |
| **Secret** | **`TmdbApiTokenSecretArn`** — name **`riffsync/staging/tmdb-api-token`** or **`riffsync/prod/tmdb-api-token`**. Template seeds **`REPLACE_WITH_TMDB_BEARER_TOKEN`**; set a real **[TMDB bearer token](https://developer.themoviedb.org/docs/getting-started)** via **`aws secretsmanager put-secret-value`** (JSON `{"token":"…"}` or plain string). **Never** commit tokens. **Rotation:** update the secret value; next run picks it up (IAM **`secretsmanager:GetSecretValue`** on the secret ARN only). |
| **Schedule** | **EventBridge** **`rate(6 hours)`** targeting **`TmdbReconcileFn`**. **Disable without redeploy:** pause/disabled rule in **EventBridge** console. **Disable via CDK:** **`--context catalogReconcileScheduleEnabled=false`**. **No-op handler:** **`--context catalogReconcileDisabled=true`** sets **`RECONCILE_DISABLED`** (manual invokes return immediately). |
| **Batch** | **`--context catalogReconcileBatchSize=20`** (default **15**, max **50** enforced in handler). Scans catalog for rows with missing **`tmdbArtworkSyncedAt`**; **`tmdbMovieId`** uses **`/movie/{id}`** first; else single-hit **`/search/movie`** only (**ambiguous** or **zero** hits → skipped). |
| **Metrics / logs** | **`RiffSync/Reconcile`** EMF (**Processed**, **Failed**, **Skipped**) + structured JSON logs (**no** token values). |

**Smoke (staging):** after secret + seed, **`aws lambda invoke --function-name <TmdbReconcileFnName> /tmp/out.json`** then read **`GET /v1/catalog`** — enriched fields appear without SPA changes.

**Deploy IAM:** GitHub OIDC role needs **EventBridge** / **Secrets Manager** (plus existing Lambda/Dynamo) for this stack — extend operator policy when **`cdk deploy`** fails on missing permissions.

**Deferred (follow-up):** optional same-run **`youtubeThumbnailUrl`** **`HEAD`** cascade (**`architecture.catalog-images.md`**) — not in this MVP; track in a new issue if desired.

### Catalog table & HTTP API (M4+)

Hosted stacks **`RiffSyncApi-staging`** / **`RiffSyncApi-prod`** add:

- **`AWS::DynamoDB::Table`** — **partition key** **`id`** (string, episode slug). **No sort key.** **`GET /v1/catalog`** uses **`Scan`** (acceptable while the library fits one Lambda scan; add **GSI**, **export**, or **cache** before scale demands it — **`docs/architecture.server.md`**, **`.forge/data/persistence_abstractions.md`**).
- **`AWS::ApiGatewayV2::Api`** (HTTP API) — routes above; **CORS** allows **`https://riffsync.tv`** plus any **`fanWebAlternateDomainNames`** (e.g. **`www.riffsync.tv`**) in **prod**. **Staging** adds **localhost** and **`https://staging.riffsync.tv`**. Pass extra origins (e.g. **`https://<distribution>.cloudfront.net`**) at synth/deploy:  
  **`npx cdk deploy --all --context environment=staging --context catalogCorsOrigins=https://d111111abcdef8.cloudfront.net`**
- **`AWS::Lambda::Permission`** — **`lambda:InvokeFunction`** from **`apigateway.amazonaws.com`** per route integration ( **`docs/architecture.server.md`** IAM table).

**Outputs:** **`CatalogTableName`**, **`HttpApiUrl`** (base URL — append **`/v1/catalog`**).

**Seed (operators, after deploy):**

```bash
cd infra/cdk && npm ci && npm run build
export AWS_REGION=us-east-1   # required for AWS CLI and the SDK in seed script if unset on your profile
TABLE_NAME="$(aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name RiffSyncApi-staging \
  --query "Stacks[0].Outputs[?OutputKey=='CatalogTableName'].OutputValue" --output text)"
npm run seed:catalog -- "$TABLE_NAME"
```

**Copy catalog between tables (staging → production):** When prod should match **live staging** data (not just git `episodes.json`), use credentials that can **read** staging and **write** prod in the same **`AWS_REGION`**:

```bash
cd infra/cdk && npm ci && npm run build
export AWS_REGION=us-east-1   # must match both tables
SOURCE="$(aws cloudformation describe-stacks --stack-name RiffSyncApi-staging \
  --query "Stacks[0].Outputs[?OutputKey=='CatalogTableName'].OutputValue" --output text)"
DEST="$(aws cloudformation describe-stacks --stack-name RiffSyncApi-prod \
  --query "Stacks[0].Outputs[?OutputKey=='CatalogTableName'].OutputValue" --output text)"
npm run copy:catalog -- "$SOURCE" "$DEST"
```

**`PutRequest` overwrites** existing rows with the same **`id`**. For a **clean** prod table, rely on an empty first deploy or truncate items out-of-band; **`copy:catalog` does not delete** rows present only in prod.

**Prefer `seed:catalog` to prod** when **`data/catalog/episodes.json`** is the **source of truth** (CI-friendly, schema-validated).

JSON response shapes: **`docs/api.catalog.md`**.

### Extra SPA hostname (e.g. `www`)

**Typical pattern (same as most public sites):** one **CloudFront** distribution with **two (or more) alternate domain names** on the **same ACM certificate**, and **Route 53 alias A (and AAAA) records** for each name pointing at that distribution. Optional: a **viewer-request CloudFront Function** returns **302** from non-canonical hosts (e.g. apex → `www`) so bookmarks and links consolidate on one hostname; this repo uses optional CDK context **`fanWebCanonicalHostname`** for that redirect.

**You must list both names** in CDK: **`fanWebCustomDomain`** is always set to one hostname, and **`fanWebAlternateDomainNames`** lists the rest (comma-separated). CDK merges them for CloudFront **and** creates **one Route 53 record per name** when **`RIFFSYNC_ROUTE53_*`** is set.

**Production (apex + `www`, canonical `www`, apex 302 → `www`):**

| GitHub Actions variable | Example value |
| --- | --- |
| **`PROD_FAN_WEB_HOSTNAME`** | **`www.riffsync.tv`** |
| **`PROD_FAN_WEB_ALTERNATE_DOMAIN_NAMES`** | **`riffsync.tv`** |
| **`PROD_FAN_WEB_CANONICAL_HOSTNAME`** | **`www.riffsync.tv`** |

Same **`us-east-1`** ACM cert must include **both** DNS names. **`FanWebSiteUrl`** (and CI **`VITE_PUBLIC_ORIGIN`**) follow **`PROD_FAN_WEB_CANONICAL_HOSTNAME`** when set, otherwise **`PROD_FAN_WEB_HOSTNAME`**.

**Staging (one hostname is enough; wildcard cert is fine):**

| Variable | Example |
| --- | --- |
| **`STAGING_FAN_WEB_HOSTNAME`** | **`staging.riffsync.tv`** |
| **`STAGING_FAN_WEB_ALTERNATE_DOMAIN_NAMES`** | *(omit)* — use only if you truly need a **second** name on the same distribution |
| **`STAGING_FAN_WEB_CANONICAL_HOSTNAME`** | *(omit)* unless you set an alternate and want one to 302 to the other |

With a **wildcard** ACM cert (**`*.riffsync.tv`**), a single name like **`staging.riffsync.tv`** is still covered; you do not need a second staging URL for that reason alone.

**If Route 53 only shows one alias:** **`PROD_FAN_WEB_ALTERNATE_DOMAIN_NAMES`** / **`STAGING_…`** is almost certainly **empty** while **`…_HOSTNAME`** is set to a **single** name (often `www` only). The fix is to put the **other** hostname in **`…_ALTERNATE_DOMAIN_NAMES`** (not to rely on “apex is implicit”).

**Local / CLI:**  
`--context fanWebAlternateDomainNames=riffsync.tv --context fanWebCanonicalHostname=www.riffsync.tv` (with **`fanWebCustomDomain=www.riffsync.tv`**).

CORS and Cognito callback allowlists include **`https://www.riffsync.tv`** and **`https://www-staging.riffsync.tv`** by default; **`fanWebAlternateDomainNames`** still adds any other names on the cert.

### Route 53 + CloudFormation: `DELETE_IN_PROGRESS` and when **both** apex + `www` disappear

CDK creates one **`AWS::Route53::RecordSet`** per hostname. **Avoid renaming** the CDK construct id for these records after go-live, or use the **two-phase** recovery below.

- **`DELETE_IN_PROGRESS` on old-looking logical ids** is usually CloudFormation removing **superseded** resources after a construct / logical id change.
- **Both records vanish after one deploy:** old and new logical resources target the **same** DNS names (`riffsync.tv`, `www.riffsync.tv`). CloudFormation **creates** the new `RecordSet` entries (you see records appear), then **deletes** the **old** logical resources. Each delete removes that **name** in Route 53. Because old and new share the **same** name, deleting the **old** logical resource often **wipes** the row the **new** resource just upserted — so you can see apex created, then **both** gone.

**This repo:** keep stable **`FanWebDnsAlias${hostnameSuffix}`** ids. We **do not** use `ARecord.node.addDependency(distribution)`; the alias target already depends on the distribution.

**Recovery if Route 53 is empty but the stack still lists `RecordSet` resources:**

1. **Fast:** Re-create the A **alias** records (console or CLI) pointing at your CloudFront distribution (alias hosted zone **`Z2FDTNDATAQYW2`** for CloudFront in **`aws`** partition), or  
2. **IaC-only (two-phase):** (a) Remove the `ARecord` loop from **`static-site-stack.ts`**, deploy **`RiffSyncStatic-prod`**, (b) restore the loop, deploy again — clean creates with **no** overlapping old logical ids.

**Do not** hand-delete the same records during a stack update — that adds **drift** on top of the above.

**Tests:** `npm test` (Vitest — catalog + **room parsers** + TMDB reconcile core with mocked **`fetch`**).

### Rooms, lobby & WebSocket (M5+)

Deployed with **`RiffSyncApi-{staging|prod}`** (same CloudFormation stack as catalog). Depends on **`RiffSyncFanAuth-*`** (**`bin/riffsync.ts`** synthesizes Fan stack **before** API so JWT issuer + client IDs exist).

**DynamoDB**

| Logical | PK | GSI |
| --- | --- | --- |
| **Rooms** | **`roomId`** | **`PublicLobbyIndex`**: **`lobbyPk=PUBLIC`**, **`lobbySk`** (sortable activity key) |
| **Connections** | **`connectionId`** (**API Gateway**) | **`RoomConnectionsIndex`**: **`roomId`**, **`connectionId`** (fan-out queries) |

**HTTP** (JWT = **fan pool access token**, audience = **`FanUserPoolClientId`**)

| Route | Auth | Behavior |
| --- | --- | --- |
| **`POST /v1/rooms`** | **JWT required** (`401` gateway) | Looks up **`catalogEpisodeId`** in **Catalog**, writes **`youtubeVideoId`**, binds **`hostSub = JWT.sub`** |
| **`GET /v1/rooms/{roomId}`** | Anonymous | Reads room snapshot (**client merges catalog** if needed). |
| **`PATCH /v1/rooms/{roomId}`** | JWT | **`403`** unless **`JWT.sub === room.hostSub`**; optimistic **`version`** check (`409`). |
| **`GET /v1/lobby`** | Anonymous (`X-Session-Id` ignored here—reserved for quotas later) | **Query** **`PublicLobbyIndex`** + **`FilterExpression`** hides stale rows (**`lastActivityAt ≤ now − STALE_ROOM_MS`**). Default **`STALE_ROOM_MS`** = **`45 × 60 × 1000`**; synth/deploy **`--context staleRoomMs=…`** or Lambda env **`STALE_ROOM_MS`**. Hydrates **`catalog`** preview via **`BatchGetItem`**. Outputs **`staleRoomMsHint`**, **`cutoffActivityAfter`**. |
| **`POST /v1/privacy-removal-request`** | Anonymous | JSON body **`contactEmail`**, **`message`** (10–8000 chars), optional honeypot **`website`** (must be empty). Sends mail via **SES** using **`riffsync/<env>/privacy-removal-routing`** (JSON **`notifyEmail`** + SES-verified **`fromEmail`**). Uses environment SES configuration set (**`SesSendingConfigurationSetName`**) so **bounce**/**complaint**/**delivery** events publish to **`SesSendingEventsTopicArn`**. Configure **SES** identities and replace secret placeholders before relying on the SPA form. |

**WebSocket**: outputs **`WebSocketUrl`** (**`wss://…/{staging|prod}`**). Contracts: **`../../docs/contracts.websocket.md`**. **`execute-api:ManageConnections`** attaches only to this stack’s WebSocket API (**`…/*/*/@connections/*`**, parameterized by **`WebSocketApiId`**), not arbitrary `*` resources.

**Housekeeping:** lobby staleness uses **read-time filtering** (**US-P0-08**) — optional EventBridge TTL/sweeper deferred.

### Fan Cognito Hosted UI (M5+)

Hosted stacks **`RiffSyncFanAuth-staging`** / **`RiffSyncFanAuth-prod`** provision a **fan-only** pool suitable for **`POST /v1/rooms`** and room-admin JWTs per **`.forge/integration/authorization.md`** (stable **`sub`** for **`hostSub`**). **Staff** `/v1/admin/*` pool remains a **separate** future stack.

| Decision | Choice |
| --- | --- |
| **Sign-up / sign-in** | **Hosted UI** — users create a **local** Cognito profile (**email** alias + password). **`selfSignUpEnabled`** is **on**; Cognito sends **verification** and **recovery** email via **SES** (see next row). |
| **Outbound sending events** | Per-environment **SES configuration set** **`riffsync-ses-send-{staging|prod}`** publishes **bounce**, **complaint**, **delivery**, **reject**, **renderingFailure**, **deliveryDelay** to SNS topic **`riffsync-ses-send-events-{staging|prod}`**. Cognito verification/recovery mail and **`PrivacyRemovalRequestFn`** **`SendEmail`** both use this set (**CloudWatch** reputation metrics enabled; **suppression**: bounces + complaints). Subscribe (email/SQS/Lambda) to **`SesSendingEventsTopicArn`** for auditing. |
| **Transactional email** | **Amazon SES** via **`UserPoolEmail.withSES`** — **`EmailSendingAccount` DEVELOPER**. Defaults: verified domain **`riffsync.tv`**, **`From`** **`RiffSync <noreply@riffsync.tv>`**, SES identity ARN in the **same Region** as the pool (see optional **`fanAuthSes*`** context keys below). Uses stack-managed configuration set (**`SesSendingConfigurationSetName`** output). **SES sandbox:** only verified recipient addresses receive mail until production access is granted. |
| **App client** | **Public** SPA client (**no** secret); **`ALLOW_USER_SRP_AUTH`** + **`ALLOW_USER_PASSWORD_AUTH`** enabled for Hosted UI; **`supportedIdentityProviders`** = **COGNITO** only. |
| **Callback / sign-out URLs** | **Prod:** **`https://riffsync.tv/`** and **`https://riffsync.tv/auth/callback`** (SPA route; must match **`fanHostedUiPkce`** **`redirect_uri`**). **Staging:** those plus **`https://staging.riffsync.tv/*`**, **localhost** Vite ports, and optional extras via **`--context fanAuthOAuthExtras=https://d111111abcdef8.cloudfront.net/,https://d111111abcdef8.cloudfront.net/auth/callback`**. |
| **Hosted domain prefix** | Default **`riffsync-fan-staging`** / **`riffsync-fan-prod`** (must be **unique** in the Region). Override collision: **`--context fanAuthCognitoDomainPrefix=your-prefix`**. |

**SES prerequisites:** Verify **`riffsync.tv`** (or override domain) as an SES identity **in the deploy Region** before relying on sign-up / forgot-password mail. Cognito wires **`SourceArn`** to **`arn:aws:ses:<region>:<account>:identity/<domain>`** — Amazon Cognito manages the IAM trust to send via SES when using **`DEVELOPER`** mode.

**Optional CDK context** (all strings):

| Context key | Purpose |
| --- | --- |
| **`fanAuthSesVerifiedDomain`** | SES verified domain (**default `riffsync.tv`**) |
| **`fanAuthSesFromEmail`** | Local-part must live on that domain (**default `noreply@<domain>`**) |
| **`fanAuthSesFromName`** | Display name (**default `RiffSync`**) |
| **`fanAuthSesRegion`** | SES identity Region if different from stack Region |

**Legacy:** **`fanAuthSesConfigurationSet`** is ignored — **`riffsync-ses-send-{environment}`** is provisioned and bound automatically (**outputs** **`SesSendingConfigurationSetName`**).

**Smoke (staging):** build the **`/oauth2/authorize`** link with **PKCE** (response_type **`code`**, client_id **`FanUserPoolClientId`**, redirect_uri **must** match an allowlisted SPA URL, scope **`openid email profile`** — **omit** **`identity_provider`** so Hosted UI shows the pool sign-in / sign-up pages). Complete sign-up, verify email, sign in, exchange the code at **`/oauth2/token`**, then inspect **`access_token`** (`sub` is the host id). **Do not** commit tokens.

**Deploy IAM:** the OIDC deploy role needs **Cognito** create/update permissions for this stack (extend the role if **`cdk deploy`** fails on **`cognito-idp:*`**).

### SES inbound → SNS (receive mail — shared)

Stack **`RiffSyncSesInbound`** is **environment-agnostic**: one **SNS** topic (**`riffsync-ses-inbound`**), one receipt rule set (**`riffsync-ses-inbound`**), shared by staging and prod **applications**. It appears **only** when **`cdk synth|deploy`** runs with **`--context environment=prod`** (staging assemblies omit it entirely).

| Piece | Behavior |
| --- | --- |
| **Receipt rule** | Matching **`recipients`** (default **`riffsync.tv`** → all addresses on that domain) → **`Sns`** (**UTF-8** notification body) → **`Stop`** |
| **Active rule set** | **`AwsCustomResource`** calls **`ses:SetActiveReceiptRuleSet`** (CloudFormation **`AWS::SES::ActiveReceiptRuleSet`** is not available in every Region/spec — e.g. **cfn-lint E3006** in **`us-east-1`**). Skip with **`sesInboundActivateRuleSet`** = **`false`** / **`none`**. **Only one** active inbound rule set per Region/account. |
| **MX** | If **`fanWebHostedZoneId`** / **`fanWebZoneName`** are set **and** **`sesInboundMailDomain`** is the zone apex or a subdomain of **`fanWebZoneName`**, CDK creates **`MxRecord`** priority **10** → **`inbound-smtp.<region>.amazonaws.com`**. |

**Outputs:** **`SesInboundTopicArn`**, **`SesInboundReceiptRuleSetName`**, **`SesInboundSesMxHint`**.

**Optional CDK context:**

| Context | Purpose |
| --- | --- |
| **`sesInboundActivateRuleSet`** | **`false`** \| **`none`** — skip **`ses:SetActiveReceiptRuleSet`** custom resource (default: activate after rules exist). |
| **`sesInboundMailDomain`** | Verified receive domain (default **`riffsync.tv`**). |
| **`sesInboundRecipients`** | Comma-separated domains / addresses for the receipt rule (default **`sesInboundMailDomain`** only). |
| **`sesInboundRuleSetName`** | Override receipt rule set name (default **`riffsync-ses-inbound`**). |

SES **must** treat the domain as authorized for **receiving** (console verification). Subscribe **Lambda**, **SQS**, email, etc. to **`SesInboundTopicArn`** for validation workflows.

Migrating from the older **`RiffSyncSesInbound-prod`** stack: destroy that stack (or remove its resources manually) after adopting **`RiffSyncSesInbound`** to avoid duplicate topics/rule sets; update any SNS subscriptions to the new **`SesInboundTopicArn`** output.

## Prerequisites

- **Node.js** LTS (**≥ 20**) on your machine for **`npm`/`cdk`**; synthesized **Lambda** runtimes are **Node.js 24** (matches **`cfn-lint`** / AWS deprecation policy).
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
- **`RiffSyncApi-*` —** **HTTP API** (**catalog**, **rooms**, **lobby**) + **WebSocket API**; **JWT** (**HTTP** + **`aws-jwt-verify`** on **`$connect`**); DynamoDB (**catalog**, **rooms**, **connections**); **`execute-api:ManageConnections`** on **this stack’s WebSocket API** only; **TMDB** reconcile (**Secrets Manager**, **EventBridge**); **`cloudwatch:PutMetricData`** optional when emitting **EMF** in **`stdout`**.
- **`RiffSyncFanAuth-*` —** **Cognito User Pool** + **UserPoolDomain** + **UserPoolClient** (OAuth authorization code grant for the SPA). Pool **`EmailConfiguration`** sends verification / recovery mail through **Amazon SES** (**`DEVELOPER`** / **`SourceArn`** `identity/<domain>`); verify that identity **in the deploy Region** before go-live. **SES configuration set + SNS topic** for outbound reputation events (**outputs** **`SesSendingEventsTopicArn`**, **`SesSendingConfigurationSetName`**).
- **`RiffSyncSesInbound` —** shared **SNS** topic + **SES** **`ReceiptRuleSet`** / **`ReceiptRule`** + **`AwsCustomResource`** (**`ses:SetActiveReceiptRuleSet`**) + optional Route 53 **MX** when hosted-zone context aligns with **`sesInboundMailDomain`** (emitted only from **`environment=prod`** synth). Deploy role needs **`ses:*`** receipt-rule APIs for your organization policies.

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
| **Production** | Manual workflow [**`deploy-prod.yml`**](../../.github/workflows/deploy-prod.yml) (**`workflow_dispatch`**) | **Ref must be `main`** (same pattern as staging). Deploys **prod** CDK, then **`aws s3 sync`** and CloudFront invalidation using stack outputs (**`FanWebSiteUrl`** for **`VITE_PUBLIC_ORIGIN`** and related env at build time). |
| **Local** | **AWS CLI credential profile** via **`cdk deploy`** + manual **`s3 sync`** | Matches how engineers run **`cdk bootstrap`** / **`deploy`** interactively outside CI. |

### Fan SPA publish (S3 sync + invalidation)

After **`cdk deploy`**, the deploy workflows read **CloudFormation outputs** from **`RiffSyncStatic-staging`** / **`RiffSyncStatic-prod`**:

| Output | Use |
| --- | --- |
| **`BucketName`** | `aws s3 sync apps/web/dist/ s3://$Bucket/` (**`--delete`** keeps the bucket aligned with the latest build) |
| **`DistributionId`** | `aws cloudfront create-invalidation --paths "/*"` |
| **`DistributionDomainName`** | **Staging** build-time **`VITE_PUBLIC_ORIGIN`** (`https://<distribution>`) so client-side absolute URLs match the live host. **Production** uses **`https://riffsync.tv`** until a follow-up wires **ACM** + **DNS** at the distribution (then keep **`VITE_PUBLIC_ORIGIN`** aligned with the public hostname operators configure). |
| **`HttpApiUrl`** ( **`RiffSyncApi-*`** ) | **`VITE_PUBLIC_API_BASE_URL`** — catalog + rooms REST |
| **`WebSocketUrl`** ( **`RiffSyncApi-*`** ) | Build-time **`VITE_PUBLIC_WS_URL`** (**`wss://…`**) once SPA subscribes to realtime (**`contracts.websocket`**). |

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

**Optional — stable SPA hostname on CloudFront** (set on GitHub as **Variables**; certificate must be in **us-east-1**):

| Variable | Purpose |
| --- | --- |
| **`STAGING_FAN_WEB_HOSTNAME`** | e.g. **`staging.riffsync.tv`** |
| **`STAGING_FAN_WEB_CERTIFICATE_ARN`** | **`arn:aws:acm:us-east-1:…:certificate/…`** covering the staging hostname |
| **`PROD_FAN_WEB_HOSTNAME`** | e.g. **`riffsync.tv`** (production deploy workflow) |
| **`PROD_FAN_WEB_CERTIFICATE_ARN`** | **`us-east-1`** ACM ARN covering production hostname |
| **`PROD_FAN_WEB_ALTERNATE_DOMAIN_NAMES`** | Optional; comma-separated extra hostnames on the **same** cert (e.g. apex **`riffsync.tv`** when **`PROD_FAN_WEB_HOSTNAME`** is **`www.riffsync.tv`**) — CloudFront aliases, Route 53 A, CORS, Cognito URLs |
| **`PROD_FAN_WEB_CANONICAL_HOSTNAME`** | Optional; when set (e.g. **`www.riffsync.tv`**), CloudFront **302** from any **other** custom alias to this host (**`FanWebSiteUrl`** / **`VITE_PUBLIC_ORIGIN`** use this too) |
| **`STAGING_FAN_WEB_ALTERNATE_DOMAIN_NAMES`** | Optional; omit for a **single** staging hostname (typical). Set only if you need extra names on the same wildcard/cert (same behavior as prod). |
| **`STAGING_FAN_WEB_CANONICAL_HOSTNAME`** | Optional; same behavior as prod (usually omit for staging) |
| **`RIFFSYNC_ROUTE53_HOSTED_ZONE_ID`** | Public hosted zone for **`RIFFSYNC_ROUTE53_ZONE_NAME`** (optional) |
| **`RIFFSYNC_ROUTE53_ZONE_NAME`** | e.g. **`riffsync.tv`** — with zone id; CDK creates Route 53 alias **A** records for **`fanWebCustomDomain`** and each **`fanWebAlternateDomainNames`** host |

**DNS:** If **`STAGING_*/PROD_*_FAN_WEB_HOSTNAME`** (and cert) are set but **`RIFFSYNC_ROUTE53_*`** are **omitted**, the stack **still** attaches custom domains to CloudFront, but it **does not** create or retain Route 53 records — **`FanWebSiteUrl`** will show the custom URL while **`FanWebRoute53AliasRecordCount`** output is **`0`**. A later deploy that drops the zone vars can **remove** previously managed records from the template. Set **both** Route 53 variables whenever you want this stack to own the aliases.

Request the ACM cert in **us-east-1**, complete **DNS validation**, then run the deploy workflow. Omit the Route 53 variables if you create the **CNAME/alias** yourself. **Stack output `FanWebSiteUrl`** is the canonical **`https://…`** used for **`VITE_PUBLIC_ORIGIN`** and API/Cognito allowlists (workflows read it from CloudFormation).

Local deploy with custom hostname:

```bash
npx cdk deploy --all --context environment=staging \
  --context fanWebCustomDomain=staging.riffsync.tv \
  --context fanWebCertificateArn=arn:aws:acm:us-east-1:ACCOUNT:certificate/UUID \
  --context fanWebHostedZoneId=Z0123456789ABCDEFGHIJ \
  --context fanWebZoneName=riffsync.tv
# Optional apex on the same ACM cert (see README § Extra SPA hostname):
#   --context fanWebAlternateDomainNames=riffsync.tv --context fanWebCanonicalHostname=www.riffsync.tv
```

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

**Context:** `cdk.json` defaults **`environment`** to **`staging`**, so bootstrap does not need `--context`. CLI **`--context environment=prod`** overrides that for prod synth/deploy.

**Exact operator sequence (staging, local profile):**

```bash
cd infra/cdk && npm ci && npm run build && npx cdk deploy --all --context environment=staging
```

Production from a workstation should **checkout `main`** (or whatever commit CI would deploy), then **`cdk deploy`** with **`--context environment=prod`**:

```bash
git checkout main && git pull
cd infra/cdk && npm ci && npm run build && npx cdk deploy --all --context environment=prod
```

## Naming & tiers

Hosted tiers (**`staging`**, **`prod`**) and **`local`** (no AWS footprint) match [`.forge/runtime/configuration.md`](../../.forge/runtime/configuration.md). Production web hostname is **`riffsync.tv`** ([**`.forge/project.json`**](../../.forge/project.json) **`public_domain`**). Prefer stack output **`FanWebSiteUrl`** (custom domain or default **`*.cloudfront.net`**) for the live **`https://`** origin.
