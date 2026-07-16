# RiffSync AWS CDK (`infra/cdk`)

AWS CDK **v2** (TypeScript) for the **hosted production** footprint in AWS. There is **no** billable **`dev`** or **staging** stack—see [`../../.ai/runtime/configuration.md`](../../.ai/runtime/configuration.md) and [`../../.ai/operations/deployment_environments.md`](../../.ai/operations/deployment_environments.md). **Local** development stays on the workstation (or CI `synth` without deploy).

## Decommissioning hosted staging

The CDK app **no longer defines** `RiffSyncFanAuth-staging`, `RiffSyncApi-staging`, or `RiffSyncStatic-staging`. After you migrate any DynamoDB data you need and confirm DNS / clients do not use staging hostnames:

1. Remove Route 53 records and ACM aliases that pointed only at staging, if applicable.
2. Destroy the old stacks via **CloudFormation** ( **`aws cloudformation delete-stack --stack-name …`** ) or the console, in an order that respects dependencies (typically **`RiffSyncStatic-staging`**, then **`RiffSyncApi-staging`**, then **`RiffSyncFanAuth-staging`**). You cannot `cdk destroy` them from this repo revision because they are no longer in the CDK app; use an older git checkout only if you still have a matching synthesized app.

## Layout

| Path | Role |
| --- | --- |
| `bin/riffsync.ts` | App entry; **`--context environment=prod`** (default in `cdk.json`) |
| `lib/static-site-stack.ts` | Private **S3** origin + **CloudFront** with **origin access control (OAC)** |
| `lib/api-catalog-stack.ts` | **Catalog** + **Rooms** + **Connections** Dynamo tables, **HTTP API** (catalog, rooms, lobby), **JWT** (**fan pool**), **WebSocket API** (ping, presence_request, chat, chat_gif, react, share_state, leave), **TMDB reconcile** + schedules |
| `lib/media-server-stack.ts` | **Singleton** **`RiffSyncTurn`** — **one VPC**, **coturn** (**`t3.small`**) + **mediasoup SFU** (**`t3.medium`**), two EIPs, **`riffsync/turn-static-auth-secret`**, S3 bundle deploy for **`services/riffsync-sfu`**, **`riffsync/sfu-join-hmac-secret`** (reference by name) |
| `lib/observability-stack.ts` | **`RiffSyncObservability-prod`** — CloudWatch dashboard **`RiffSync-prod-operations`** (HTTP/WS, Lambda, DynamoDB, chat EMF, SFU EC2) |
| `lib/observability-dashboard.ts` | Dashboard widget definitions (used by **`observability-stack.ts`**) |
| `lib/fan-auth-stack.ts` | **Fan** Cognito **User Pool** + **Hosted UI** domain + SPA app client (**local** email/password sign-up & sign-in, OAuth code + PKCE) |
| `lib/staff-auth-stack.ts` | **Staff** Cognito **User Pool** (invite-only) + **Hosted UI** + SPA app client (**`/admin/*`** OAuth callbacks, **`admin`** / **`curator`** groups) |
| `lib/ses-inbound-stack.ts` | Shared **SES inbound** receipt rule → **SNS** (+ optional Route 53 **MX**) |
| `lambda/catalog-*.ts` | Catalog read handlers (**`Scan`** / **`GetItem`**) |
| `lambda/room-*.ts` | **`POST/PATCH`** room + **`GET`** lobby/read (**`authorization.md`**) |
| `lambda/ws-*.ts` | WebSocket **`$connect`** / **`$disconnect`** / message routes |
| `lambda/webrtc-ice-config.ts` | **`GET /v1/webrtc/ice`** — STUN + TURN REST credentials |
| `lambda/webrtc-sfu-token.ts` | **`POST /v1/webrtc/sfu-token`** — short-lived mediasoup join JWT (**requires** `X-Session-Id` + active WS connection; host uses `Authorization`) |
| `lambda/room-shared.ts` | Shared parsing + **`STALE_ROOM_MS`** (**lobby staleness**) |
| `lambda/tmdb-reconcile-*.ts` | Scheduled **`GET /configuration`**, **`/search/movie`**, **`/movie/{id}`** enrichment (**`docs/contracts.tmdb.md`**) |
| `scripts/copy-catalog-dynamodb.ts` | **`npm run copy:catalog`** — scan one catalog table, **`BatchWriteItem`** into another (e.g. backup → prod) |

### TMDB reconcile (M4+)

| Resource | Notes |
| --- | --- |
| **Secret** | **`TmdbApiTokenSecretArn`** — name **`riffsync/prod/tmdb-api-token`**. Template seeds **`REPLACE_WITH_TMDB_BEARER_TOKEN`**; set a real **[TMDB bearer token](https://developer.themoviedb.org/docs/getting-started)** via **`aws secretsmanager put-secret-value`** (JSON `{"token":"…"}` or plain string). **Never** commit tokens. **Rotation:** update the secret value; next run picks it up (IAM **`secretsmanager:GetSecretValue`** on the secret ARN only). |
| **Schedule** | **EventBridge** **`rate(2 hours)`** targeting **`TmdbReconcileFn`**. **Disable without redeploy:** pause/disabled rule in **EventBridge** console. **Disable via CDK:** **`--context catalogReconcileScheduleEnabled=false`**. **No-op handler:** **`--context catalogReconcileDisabled=true`** sets **`RECONCILE_DISABLED`** (manual invokes return immediately). |
| **Batch** | **`--context catalogReconcileBatchSize=20`** (default **15**, max **50** enforced in handler). Scans catalog for rows with missing **`tmdbArtworkSyncedAt`**; **`tmdbMovieId`** uses **`/movie/{id}`** first; else single-hit **`/search/movie`** only (**ambiguous** or **zero** hits → skipped). |
| **Metrics / logs** | **`RiffSync/Reconcile`** EMF (**Processed**, **Failed**, **Skipped**) + structured JSON logs (**no** token values). |

**Smoke (prod):** after secret + seed, **`aws lambda invoke --function-name <TmdbReconcileFnName> /tmp/out.json`** then read **`GET /v1/catalog`** — enriched fields appear without SPA changes.

### Giphy API key (GIF search)

| Resource | Notes |
| --- | --- |
| **Secret** | **`riffsync/prod/giphy-api-key`** (CDK name `riffsync/${environment}/giphy-api-key`). Template seeds **`REPLACE_WITH_GIPHY_API_KEY`**; set a real key via **[Giphy Developers](https://developers.giphy.com/docs/api/)** and **`aws secretsmanager put-secret-value --secret-id riffsync/prod/giphy-api-key --secret-string 'YOUR_KEY'`** (JSON `{"apiKey":"…"}` or plain string also accepted). **Never** commit keys. **Rotation:** update the secret; next **`GET /v1/giphy/search`** picks it up. |
| **Lambda** | **`GiphySearchFn`** only — **`secretsmanager:GetSecretValue`** on this secret; Dynamo rate-limit table for per-**`sub`** limits. |
| **Route** | **`GET /v1/giphy/search`** — fan Cognito JWT required. |

**Operator runbook (ToS, attribution, smoke):** [`../../docs/operations/giphy.md`](../../docs/operations/giphy.md).

**Deploy IAM:** GitHub OIDC role needs **EventBridge** / **Secrets Manager** (plus existing Lambda/Dynamo) for this stack — extend operator policy when **`cdk deploy`** fails on missing permissions.

**Deferred (follow-up):** optional same-run **`youtubeThumbnailUrl`** **`HEAD`** cascade (**`architecture.catalog-images.md`**) — not in this MVP; track in a new issue if desired.

### Catalog table & HTTP API (M4+)

Hosted stack **`RiffSyncApi-prod`** adds:

- **`AWS::DynamoDB::Table`** — **partition key** **`id`** (string, episode slug). **No sort key.** **`GET /v1/catalog`** uses **`Scan`** (acceptable while the library fits one Lambda scan; add **GSI**, **export**, or **cache** before scale demands it — **`docs/architecture.server.md`**, **`.ai/data/persistence_abstractions.md`**).
- **`AWS::ApiGatewayV2::Api`** (HTTP API) — routes above; **CORS** allows **`https://riffsync.tv`**, **`www`**, **localhost** (for dev against prod API), and any **`fanWebAlternateDomainNames`**. Pass extra origins (e.g. **`https://<distribution>.cloudfront.net`**) at synth/deploy:  
  **`npx cdk deploy --all --context environment=prod --context catalogCorsOrigins=https://d111111abcdef8.cloudfront.net`**
- **`AWS::Lambda::Permission`** — **`lambda:InvokeFunction`** from **`apigateway.amazonaws.com`** per route integration ( **`docs/architecture.server.md`** IAM table).

**Outputs:** **`CatalogTableName`**, **`HttpApiUrl`** (base URL — append **`/v1/catalog`**).

**Seed (operators, after deploy):**

```bash
cd infra/cdk && npm ci && npm run build
export AWS_REGION=us-east-1   # required for AWS CLI and the SDK in seed script if unset on your profile
TABLE_NAME="$(aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name RiffSyncApi-prod \
  --query "Stacks[0].Outputs[?OutputKey=='CatalogTableName'].OutputValue" --output text)"
npm run seed:catalog -- "$TABLE_NAME"
```

**Copy catalog between tables:** When **`DEST`** should receive a full copy from **`SOURCE`** (same **`AWS_REGION`**), see **`scripts/copy-catalog-dynamodb.ts`** header for an example using **`RiffSyncApi-prod`**.

```bash
cd infra/cdk && npm ci && npm run build
export AWS_REGION=us-east-1   # must match both tables
SOURCE="<source_catalog_table_name>"
DEST="$(aws cloudformation describe-stacks --stack-name RiffSyncApi-prod \
  --query "Stacks[0].Outputs[?OutputKey=='CatalogTableName'].OutputValue" --output text)"
npm run copy:catalog -- "$SOURCE" "$DEST"
```

**`PutRequest` overwrites** existing rows with the same **`id`**. For a **clean** prod table, rely on an empty first deploy or truncate items out-of-band; **`copy:catalog` does not delete** rows present only in prod.

**Prefer `seed:catalog` to prod** when **`data/catalog/episodes.json`** is the **source of truth** (CI-friendly, schema-validated).

JSON response shapes: **`docs/api.catalog.md`**.

### Extra SPA hostname (e.g. `www`)

**Typical pattern (same as most public sites):** one **CloudFront** distribution with **two (or more) alternate domain names** on the **same ACM certificate**, and **Route 53 alias A (and AAAA) records** for each name pointing at that distribution. Optional: a **viewer-request CloudFront Function** returns **301** from non-canonical hosts (e.g. `www` → apex) so bookmarks and links consolidate on one hostname; this repo uses optional CDK context **`fanWebCanonicalHostname`** for that redirect.

**You must list both names** in CDK: **`fanWebCustomDomain`** is always set to one hostname, and **`fanWebAlternateDomainNames`** lists the rest (comma-separated). CDK merges them for CloudFront **and** creates **one Route 53 record per name** when **`RIFFSYNC_ROUTE53_*`** is set.

**Production (apex + `www`, canonical apex, `www` 301 → apex):**

| GitHub Actions variable | Example value |
| --- | --- |
| **`PROD_FAN_WEB_HOSTNAME`** | **`riffsync.tv`** |
| **`PROD_FAN_WEB_ALTERNATE_DOMAIN_NAMES`** | **`www.riffsync.tv`** |
| **`PROD_FAN_WEB_CANONICAL_HOSTNAME`** | **`riffsync.tv`** |

Same **`us-east-1`** ACM cert must include **both** DNS names. **`FanWebSiteUrl`** (and CI **`VITE_PUBLIC_ORIGIN`**) follow **`PROD_FAN_WEB_CANONICAL_HOSTNAME`** when set, otherwise **`PROD_FAN_WEB_HOSTNAME`**.

**Local / CLI:**  
`--context fanWebAlternateDomainNames=www.riffsync.tv --context fanWebCanonicalHostname=riffsync.tv` (with **`fanWebCustomDomain=riffsync.tv`**).

CORS and Cognito callback allowlists include prod **`https` origins**, **localhost** dev URLs, and **`fanWebAlternateDomainNames`** from context.

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

Deployed with **`RiffSyncApi-prod`** (same CloudFormation stack as catalog). Depends on **`RiffSyncFanAuth-prod`** (**`bin/riffsync.ts`** synthesizes Fan stack **before** API so JWT issuer + client IDs exist).

**DynamoDB**

| Logical | PK | GSI / SK |
| --- | --- | --- |
| **Rooms** | **`roomId`** | **`PublicLobbyIndex`**: **`lobbyPk=PUBLIC`**, **`lobbySk`** (sortable activity key) |
| **Connections** | **`connectionId`** (**API Gateway**) | Reverse lookup for **`$disconnect`** / stale connection cleanup. |
| **RoomPresence** | **`roomId`** | SK **`presenceKey=sessionId#connectionId`**; strongly consistent room roster / SFU token checks with **TTL** cleanup. |

**HTTP** (JWT = **fan pool access token**, audience = **`FanUserPoolClientId`**)

| Route | Auth | Behavior |
| --- | --- | --- |
| **`POST /v1/rooms`** | **JWT required** (`401` gateway) | Looks up **`catalogEpisodeId`** in **Catalog**, writes **`youtubeVideoId`**, binds **`hostSub = JWT.sub`** |
| **`GET /v1/rooms/{roomId}`** | Anonymous | Reads room snapshot (**client merges catalog** if needed). |
| **`PATCH /v1/rooms/{roomId}`** | JWT | **`403`** unless **`JWT.sub === room.hostSub`**; optimistic **`version`** check (`409`). |
| **`GET /v1/lobby`** | Anonymous (`X-Session-Id` ignored here—reserved for quotas later) | **Query** **`PublicLobbyIndex`** + **`FilterExpression`** hides stale rows (**`lastActivityAt ≤ now − STALE_ROOM_MS`**). Default **`STALE_ROOM_MS`** = **`45 × 60 × 1000`**; synth/deploy **`--context staleRoomMs=…`** or Lambda env **`STALE_ROOM_MS`**. Hydrates **`catalog`** preview via **`BatchGetItem`**. Outputs **`staleRoomMsHint`**, **`cutoffActivityAfter`**. |
| **`GET /v1/webrtc/ice`** | Anonymous | **`iceServers`** for WebRTC (STUN + time-limited TURN when **`turnHost`** context is set — see **Self-hosted TURN**). |
| **`POST /v1/privacy-removal-request`** | Anonymous | JSON body **`contactEmail`**, **`message`** (10–8000 chars), optional honeypot **`website`** (must be empty). Sends mail via **SES** using **`riffsync/<env>/privacy-removal-routing`** (JSON **`notifyEmail`** + SES-verified **`fromEmail`**). Uses environment SES configuration set (**`SesSendingConfigurationSetName`**) so **bounce**/**complaint**/**delivery** events publish to **`SesSendingEventsTopicArn`**. Configure **SES** identities and replace secret placeholders before relying on the SPA form. |

**HTTP — staff admin** (JWT = **staff pool access token**, audience = **`StaffUserPoolClientId`**)

| Route | Auth | Behavior |
| --- | --- | --- |
| **`GET /v1/admin/session`** | **Staff JWT required** (`401` gateway for fan/wrong pool) | Reads authorizer claims; **`403`** **`staff_group_required`** unless **`cognito:groups`** includes **`admin`** or **`curator`**. **200** body: **`sub`**, **`email`**, **`groups`**. |

**WebSocket**: outputs **`WebSocketUrl`** (**`wss://…/prod`**). Contracts: **`../../docs/contracts.websocket.md`**. **`execute-api:ManageConnections`** attaches only to this stack’s WebSocket API (**`…/*/*/@connections/*`**, parameterized by **`WebSocketApiId`**), not arbitrary `*` resources.

**Housekeeping:** lobby staleness uses **read-time filtering** (**US-P0-08**) — optional EventBridge TTL/sweeper deferred.

### Fan avatars (S3 + CloudFront, M7)

Provisioned in **`RiffSyncApi-prod`** ([`lib/api-catalog-stack.ts`](lib/api-catalog-stack.ts)):

| Resource | Notes |
| --- | --- |
| **`FanAvatarsBucket`** | Private **S3** (**block public access**). Object keys **`avatars/{cognitoSub}/…`** (replace-on-upload per fan). **No** bucket CORS in MVP (upload via Lambda proxy, not browser **PUT**). |
| **`FanAvatarsDistribution`** | **CloudFront** + **origin access control (OAC)** — same pattern as [`lib/static-site-stack.ts`](lib/static-site-stack.ts). Anonymous guests read avatars over **HTTPS** only. |
| **`FanAvatarPostFn`** | **`POST /v1/fans/me/avatar`** (multipart field **`file`**, fan JWT). **`FAN_AVATARS_*`**, **`FAN_PROFILES_TABLE_NAME`**. **`s3:PutObject`** / **`s3:DeleteObject`** on **`avatars/*`**. |

**Stack outputs:** **`FanAvatarsBucketName`**, **`FanAvatarsPublicBaseUrl`**, **`FanAvatarsDistributionId`**, **`FanAvatarPostFnName`**.

**Verify after deploy:**

```bash
aws cloudformation describe-stacks --stack-name RiffSyncApi-prod \
  --query "Stacks[0].Outputs[?contains(OutputKey,'FanAvatar')].[OutputKey,OutputValue]" --output table
```

Optional smoke: upload a test object under **`avatars/<sub>/test.png`**, then **`curl -I`** **`{FanAvatarsPublicBaseUrl}/avatars/<sub>/test.png`** and expect **200**.

### Self-hosted media (coturn TURN + mediasoup SFU on EC2)

One account, **one CloudFormation stack** **`RiffSyncTurn`** ([`lib/media-server-stack.ts`](lib/media-server-stack.ts)): **one VPC**, **coturn** on **`t3.small`** + **mediasoup** on **`t3.medium`**, **two** Elastic IPs, **`riffsync/turn-static-auth-secret`**, S3 **BucketDeployment** of [`services/riffsync-sfu`](../../services/riffsync-sfu), and Route 53 **`A`** → SFU EIP when **`sfuProdSignalingHostname`** is set. ICE Lambdas use the TURN secret and **`turnHost`** (TURN EIP or DNS).

**Ordering in [`bin/riffsync.ts`](bin/riffsync.ts):** **`RiffSyncApi-prod`** **depends on** **`RiffSyncTurn`** (turn secret + deploy ordering).

**Deploy:** **[`deploy-prod.yml`](../../.github/workflows/deploy-prod.yml)** runs **media** (`RiffSyncTurn`) and **platform** (**`RiffSyncFanAuth-prod`**, **`RiffSyncStaffAuth-prod`**, static, SES) in **parallel**, then **API** (`--exclusively`). **OAuth/CORS** deploys fan + staff Cognito and API with **`fanAuthOAuthExtras`**, **`staffAuthOAuthExtras`**, and **`catalogCorsOrigins`** from **`FanWebSiteUrl`**; it uses **`--exclusively`** so CDK does not redeploy **`RiffSyncTurn`**. The **fan-spa** job bakes **`VITE_STAFF_*`** from **`RiffSyncStaffAuth-prod`** outputs (see **`.ai/operations/build_packaging.md`**). For **media-only** changes, **[`deploy-turn.yml`](../../.github/workflows/deploy-turn.yml)** runs **`cdk deploy RiffSyncTurn`** (updates **both** EC2 roles; there is no separate SFU stack).

**Migrating from the old `RiffSyncSfu` stack:** CDK no longer defines that stack. If it still exists in AWS: after **`cdk deploy RiffSyncTurn`** succeeds and the **new** SFU in **`RiffSyncTurn`** is healthy (and **`wss://`** / DNS if used), delete the old stack (**`aws cloudformation delete-stack --stack-name RiffSyncSfu`**). If **`UPDATE`/`CREATE` fails** on the signaling **`A`** record because the name is still owned by **`RiffSyncSfu`**, delete **`RiffSyncSfu`** first (expect brief SFU gap), then deploy **`RiffSyncTurn`**.

**Outputs:** **`TurnServerElasticIp`**, **`TurnSharedSecretArn`**, **`SfuElasticIp`**, **`SfuCodeBucketName`**, **`SfuDefaultSignalingWsUrl`**, etc.

**Session Manager:** no inbound **SSH**; use **SSM** for troubleshooting (**`/var/log/cloud-init-output.log`** if UserData fails).

**SFU producer / transport caps:** UserData writes **`/etc/riffsync-sfu.env`** with **`SFU_MAX_PRODUCERS_PER_SESSION=3`**, **`SFU_MAX_PRODUCERS_PER_ROOM=24`**, **`SFU_MAX_WEBRTC_TRANSPORTS_PER_SESSION=8`**, **`SFU_MAX_CONSUMERS_PER_SESSION=64`** (defaults in [`lib/sfu-env-lines.ts`](lib/sfu-env-lines.ts); **`riffsync-sfu`** reads them at startup). Optional CloudWatch alarms on the SFU EC2 instance (no SNS in OSS default — attach a topic in IaC if desired): **`riffsync-sfu-high-cpu`** when **CPUUtilization** exceeds **80%** for **5** minutes; **`riffsync-sfu-status-check-failed`** when **StatusCheckFailed** is **≥ 1** for **2** consecutive minutes.

**Drawer → signal mapping:** SFU stdout EMF (**`TransportLimitRejected`**, **`ConsumerLimitRejected`**, **`ProduceFailure`**) and client **`getDiagnostics()`** health fields are documented in **[`docs/observability-drawer-mapping.md`](../../docs/observability-drawer-mapping.md)** (operator runbook; **`.ai/operations/observability.md`** remains the contract).

### CloudWatch operations dashboard

Stack **`RiffSyncObservability-prod`** creates dashboard **`RiffSync-prod-operations`**: HTTP + WebSocket API Gateway volume/errors, critical Lambda errors/throttles/duration, DynamoDB throttles on Connections/Rooms/RoomPresence/RoomChat, **`RiffSync/Realtime`** chat EMF, **`RiffSync/Media`** **`SfuTokenDenied`**, SFU/TURN EC2 CPU and network, and **`RiffSync/Reconcile`** background metrics.

**Deploy (after API + media stacks exist):**

```bash
cd infra/cdk
npm ci
npx cdk deploy RiffSyncObservability-prod --context environment=prod --require-approval never
```

Stack output **`OperationsDashboardUrl`** opens the console deep link. **Note:** SFU process EMF (transport/consumer limit counters) is stdout on EC2 only until a CloudWatch agent or scrape Lambda ships — use EC2 CPU/network and Lambda **`SfuTokenDenied`** on the dashboard for launch day.

**Worker failure runbook (mediasoup `worker.on('died')`):**

1. Confirm **`curl -sSf "${SFU_HTTP}/healthz"`** shows **`workerAlive: false`** or probe failure.
2. **SSM** into the SFU instance; check **`journalctl -u riffsync-sfu`** for a **`worker died`** JSON line.
3. **Restart** the SFU unit: **`sudo systemctl restart riffsync-sfu`**.
4. Re-probe **`/healthz`** — expect **`workerAlive: true`**, **`routerRoomCount: 0`** until rooms reconnect.
5. If restart fails twice, **reboot** the EC2 instance (**`aws ec2 reboot-instances --instance-ids <id>`** or console).
6. Notify active parties via your community channel if outage persists.

**Secret rotation / first-boot placeholder:** UserData runs **once**. After you set the real value for **`riffsync/turn-static-auth-secret`**, use **Session Manager** to re-fetch into **`/etc/coturn/turnserver.conf`** and **`sudo systemctl restart coturn`**, or replace the instance.

**Migrating from older `RiffSyncTurn-staging` / `RiffSyncTurn-prod`:** delete those stacks after this change, copy secret material from **`riffsync/staging/turn-static-auth-secret`** (or prod) into **`riffsync/turn-static-auth-secret`**, then deploy **`RiffSyncTurn`**. Per-environment turn secrets are **removed** from **`RiffSyncApi-*`** templates (old AWS secrets may **RETAIN** — clean up manually if desired).

Watch-party WebRTC (SFU transports) uses **`GET /v1/webrtc/ice`** for **`iceServers`**.

| Route | Auth | Behavior |
| --- | --- | --- |
| **`GET /v1/webrtc/ice`** | Anonymous | Returns `{ "version": 1, "iceServers": RTCIceServer[] }`. If **`turnHost`** is unset, response is **STUN-only**. If **`turnHost`** is set, the Lambda loads **`riffsync/turn-static-auth-secret`**; placeholder / unreadable value → **`503`** with **`{"error":"ice_unavailable"}`**. |

**GitHub repository Variables** (optional — **Settings → Secrets and variables → Actions → Variables**). When set, workflows pass **`--context`** into **each** prod **`cdk deploy`** step and the follow-up **`RiffSyncFanAuth-prod` / `RiffSyncApi-prod`** deploy that refreshes CORS:

| Variable (production) | CDK context | Notes |
| --- | --- | --- |
| **`PROD_TURN_HOST`** | **`turnHost`** | **`TurnServerElasticIp`** (or DNS to it). **Omit** for STUN-only ICE. |
| **`PROD_TURN_PORT`** | **`turnPort`** | Optional; default **`3478`** (**must match** EC2 **`listening-port`**). |
| **`PROD_TURN_TLS_PORT`** | **`turnTlsPort`** | Optional **Lambda/ICE only**; CDK EC2 does **not** serve **`turns:`** (TLS) yet. Leave unset. |
| **`PROD_TURN_CREDENTIAL_TTL_SECONDS`** | **`turnCredentialTtlSeconds`** | Optional; default **`43200`** (12h). |

**Optional CDK context:** **`turnRealm`** (coturn **`realm`** / **`server-name`**; default **`riffsync-turn`**).

Advanced overrides (**`stunServersJson`**, etc.) use CDK context keys in **`api-catalog-stack.ts`**; extend workflows if needed (mind JSON quoting).

**AWS Secrets Manager — shared secret (not GitHub)**

1. **Name:** **`riffsync/turn-static-auth-secret`** (owned by **`RiffSyncTurn`**; **RETAIN**).
2. **Generate** (example): `openssl rand -base64 32`
3. **Format:** one-line **plaintext**, no JSON wrapper. Lambda rejects **`REPLACE_WITH_TURN`**.
4. **Set** via Console or **`aws secretsmanager put-secret-value --secret-id riffsync/turn-static-auth-secret --secret-string '…'`**

5. **Recommended order:** Deploy **`RiffSyncTurn`** (or **`cdk deploy --all`**), set the **real** secret, ensure coturn has it (SSM if needed), set **`PROD_TURN_HOST`**, re-run the **production** app deploy so Lambdas get **`turnHost`**, then **`curl`** **`/v1/webrtc/ice`**.

**HTTP API throttling:** default stage limits; add **WAF** if needed.

**Manual reference:** [`../coturn/turnserver.conf.example`](../coturn/turnserver.conf.example).

### Fan Cognito Hosted UI (M5+)

Hosted stack **`RiffSyncFanAuth-prod`** provisions a **fan-only** pool suitable for **`POST /v1/rooms`** and room-admin JWTs per **`.ai/integration/authorization.md`** (stable **`sub`** for **`hostSub`**). **Staff** **`/v1/admin/*`** uses a **separate** pool in **`RiffSyncStaffAuth-prod`** (see **Staff Cognito Hosted UI** below).

| Decision | Choice |
| --- | --- |
| **Sign-up / sign-in** | **Hosted UI** — users create a **local** Cognito profile (**email** alias + password). **`selfSignUpEnabled`** is **on**; Cognito sends **verification** and **recovery** email via **SES** (see next row). |
| **Outbound sending events** | **SES configuration set** **`riffsync-ses-send-prod`** publishes **bounce**, **complaint**, **delivery**, **reject**, **renderingFailure**, **deliveryDelay** to SNS topic **`riffsync-ses-send-events-prod`**. Cognito verification/recovery mail and **`PrivacyRemovalRequestFn`** **`SendEmail`** both use this set (**CloudWatch** reputation metrics enabled; **suppression**: bounces + complaints). Subscribe (email/SQS/Lambda) to **`SesSendingEventsTopicArn`** for auditing. |
| **Transactional email** | **Amazon SES** via **`UserPoolEmail.withSES`** — **`EmailSendingAccount` DEVELOPER**. Defaults: verified domain **`riffsync.tv`**, **`From`** **`RiffSync <noreply@riffsync.tv>`**, SES identity ARN in the **same Region** as the pool (see optional **`fanAuthSes*`** context keys below). Uses stack-managed configuration set (**`SesSendingConfigurationSetName`** output). **SES sandbox:** only verified recipient addresses receive mail until production access is granted. |
| **App client** | **Public** SPA client (**no** secret); **`ALLOW_USER_SRP_AUTH`** + **`ALLOW_USER_PASSWORD_AUTH`** enabled for Hosted UI; **`supportedIdentityProviders`** = **COGNITO** only. |
| **Callback / sign-out URLs** | **`https://riffsync.tv/`**, **`www`**, **localhost** dev URLs, **`fanWebAlternateDomainNames`**, and optional **`--context fanAuthOAuthExtras=…`** (e.g. CloudFront default hostname during bring-up). |
| **Hosted domain prefix** | Default **`riffsync-fan-prod`** (must be **unique** in the Region). Override collision: **`--context fanAuthCognitoDomainPrefix=your-prefix`**. |

**SES prerequisites:** Verify **`riffsync.tv`** (or override domain) as an SES identity **in the deploy Region** before relying on sign-up / forgot-password mail. Cognito wires **`SourceArn`** to **`arn:aws:ses:<region>:<account>:identity/<domain>`** — Amazon Cognito manages the IAM trust to send via SES when using **`DEVELOPER`** mode.

**Optional CDK context** (all strings):

| Context key | Purpose |
| --- | --- |
| **`fanAuthSesVerifiedDomain`** | SES verified domain (**default `riffsync.tv`**) |
| **`fanAuthSesFromEmail`** | Local-part must live on that domain (**default `noreply@<domain>`**) |
| **`fanAuthSesFromName`** | Display name (**default `RiffSync`**) |
| **`fanAuthSesRegion`** | SES identity Region if different from stack Region |

**Legacy:** **`fanAuthSesConfigurationSet`** is ignored — **`riffsync-ses-send-prod`** is provisioned and bound automatically (**outputs** **`SesSendingConfigurationSetName`**).

**Smoke (prod pool):** build the **`/oauth2/authorize`** link with **PKCE** (response_type **`code`**, client_id **`FanUserPoolClientId`**, redirect_uri **must** match an allowlisted SPA URL, scope **`openid email profile`** — **omit** **`identity_provider`** so Hosted UI shows the pool sign-in / sign-up pages). Complete sign-up, verify email, sign in, exchange the code at **`/oauth2/token`**, then inspect **`access_token`** (`sub` is the host id). **Do not** commit tokens.

**Deploy IAM:** the OIDC deploy role needs **Cognito** create/update permissions for this stack (extend the role if **`cdk deploy`** fails on **`cognito-idp:*`**).

### Staff Cognito Hosted UI (M11+)

Hosted stack **`RiffSyncStaffAuth-prod`** provisions an **invite-only** operator pool distinct from **`riffsync-fan-prod`**. Synthesized **after** **`RiffSyncFanAuth-prod`** so outbound mail reuses the shared SES configuration set **`riffsync-ses-send-prod`** (no duplicate SES resources in the staff stack). **First operator provisioning** (console invite, groups, smoke): [`../../docs/operations/operator-onboarding.md`](../../docs/operations/operator-onboarding.md) — not IaC.

| Decision | Choice |
| --- | --- |
| **Sign-up / sign-in** | **Hosted UI** — **`selfSignUpEnabled: false`** (console invite only). First operator account is a **manual console invite** ([#67](https://github.com/StacksOnTheRacks/riffsync/issues/67)); **no** IaC bootstrap user in this stack. |
| **Outbound sending events** | Reuses **`riffsync-ses-send-prod`** from **`RiffSyncFanAuth-prod`** (**`UserPoolEmail.withSES`**). |
| **Transactional email** | Same SES identity defaults as fan (**`riffsync.tv`**, **`noreply@riffsync.tv`**, **`RiffSync`**) via optional **`staffAuthSes*`** context keys. |
| **App client** | **Public** SPA client **`riffsync-staff-web-prod`**; OAuth authorization code + PKCE; **COGNITO** IdP only. |
| **Callback / sign-out URLs** | **`https://<host>/admin/auth/callback`** and **`https://<host>/admin/login`** for prod hostnames (**`riffsync.tv`**, **`www`**, **`fanWebAlternateDomainNames`**, optional **`staffAuthOAuthExtras`**). Local dev: **`localhost:5173`**, **`127.0.0.1:5173`**, **`localhost:3000`**, **`https://localhost:5173`** with **`/admin/*`** paths. |
| **Hosted domain prefix** | Default **`riffsync-staff-prod`**. Override: **`--context staffAuthCognitoDomainPrefix=your-prefix`**. |
| **Groups** | **`admin`**, **`curator`** (**`CfnUserPoolGroup`**) for **`cognito:groups`** on staff JWTs. |
| **MFA** | **`OPTIONAL`** at pool level (MVP). |

**Optional CDK context** (all strings):

| Context key | Purpose |
| --- | --- |
| **`staffAuthSesVerifiedDomain`** | SES verified domain (**default `riffsync.tv`**) |
| **`staffAuthSesFromEmail`** | Local-part must live on that domain (**default `noreply@<domain>`**) |
| **`staffAuthSesFromName`** | Display name (**default `RiffSync`**) |
| **`staffAuthSesRegion`** | SES identity Region if different from stack Region |
| **`staffAuthOAuthExtras`** | Comma-separated extra callback / logout URLs |
| **`staffAuthCognitoDomainPrefix`** | Hosted UI domain prefix override |

**Stack outputs:** **`StaffUserPoolId`**, **`StaffUserPoolArn`**, **`StaffUserPoolClientId`**, **`StaffHostedUiDomainPrefix`**, **`StaffHostedUiBaseUrl`**.

**Smoke (prod pool, after deploy):**

1. AWS Console → Cognito → **`riffsync-staff-prod`** exists and is **not** **`riffsync-fan-prod`**
2. App client **`riffsync-staff-web-prod`** lists **`https://riffsync.tv/admin/auth/callback`** (and localhost admin callback URLs)
3. Groups **`admin`** and **`curator`** visible on the pool
4. CloudFormation outputs **`StaffUserPoolId`**, **`StaffUserPoolClientId`**, **`StaffHostedUiBaseUrl`** readable from stack **`RiffSyncStaffAuth-prod`**

**Deploy IAM:** extend the OIDC deploy role with **Cognito** permissions for **`RiffSyncStaffAuth-prod`** if **`cdk deploy`** fails on **`cognito-idp:*`**.

**Pipeline wiring:** **`deploy-prod.yml`** deploys this stack in the **platform** wave and refreshes **`staffAuthOAuthExtras`** in the **OAuth/CORS** job; SPA publish reads **`StaffHostedUiBaseUrl`** and **`StaffUserPoolClientId`** into **`VITE_STAFF_*`** (see **Deploy** and **Fan SPA publish** below).

### SES inbound → SNS (receive mail — shared)

Stack **`RiffSyncSesInbound`** is **environment-agnostic**: one **SNS** topic (**`riffsync-ses-inbound`**), one receipt rule set (**`riffsync-ses-inbound`**). It is **always** synthesized with the app.

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
npx cdk synth --all --context environment=prod
```

Shortcut: `npm run synth` or `npm run synth:prod`.

**Quality gate (optional):** after synth, run [cfn-lint](https://github.com/aws-cloudformation/cfn-lint) on `cdk.out/**/*.template.json`.

## What M1 provisions

- **`AWS::S3::Bucket`** — **private** (block public access, default encryption). **No** public read ACL/policy; object access is via **CloudFront** only, with **`AWS:SourceArn`** scoped to the distribution in the bucket policy.
- **`AWS::CloudFront::OriginAccessControl`** + **`AWS::CloudFront::Distribution`** — HTTPS, `defaultRootObject: index.html`. **Custom error responses** map **403** and **404** to **`/index.html`** (HTTP **200**) so **SPA** deep links and hard refreshes work once assets are published (**M2**).
- **Artifacts:** the bucket may be **empty** for M1; CI or deploy steps in **M2+** publish `index.html` and static assets.

Production uses **retain** + **versioning** on the static-site bucket; **empty the bucket** before stack deletion if policy changes.

## IAM baseline vs `docs/architecture.server.md`

Full server IAM (Lambda, API Gateway, EventBridge, DynamoDB, Cognito, Secrets Manager, `execute-api:ManageConnections`, CloudWatch `PutMetricData`, etc.) is described in [`../../docs/architecture.server.md`](../../docs/architecture.server.md) (**[Delivery pipeline §](../../docs/architecture.server.md#delivery-pipeline-github-actions)** and **[IaC & permission notes §](../../docs/architecture.server.md#iac--permission-notes)**). **This repo’s CDK app provisions (by stack):**

- **`RiffSyncStatic-prod` —** **S3 bucket policy** statements: deny insecure transport; allow **`s3:GetObject`** for **CloudFront** via OAC (**resource-based**, not a standalone IAM role).
- **`RiffSyncStatic-prod` —** **CloudFront** service-managed roles for the distribution (implicit in **`AWS::CloudFront::Distribution`**).
- **`RiffSyncApi-prod` —** **HTTP API** (**catalog**, **rooms**, **lobby**) + **WebSocket API**; **JWT** (**HTTP** + **`aws-jwt-verify`** on **`$connect`**); DynamoDB (**catalog**, **rooms**, **connections**, **fan profiles**); **fan avatars** private **S3** + **CloudFront OAC**; **`execute-api:ManageConnections`** on **this stack’s WebSocket API** only; **TMDB** reconcile (**Secrets Manager**, **EventBridge**); **`cloudwatch:PutMetricData`** optional when emitting **EMF** in **`stdout`**.
- **`RiffSyncFanAuth-prod` —** **Cognito User Pool** + **UserPoolDomain** + **UserPoolClient** (OAuth authorization code grant for the SPA). Pool **`EmailConfiguration`** sends verification / recovery mail through **Amazon SES** (**`DEVELOPER`** / **`SourceArn`** `identity/<domain>`); verify that identity **in the deploy Region** before go-live. **SES configuration set + SNS topic** for outbound reputation events (**outputs** **`SesSendingEventsTopicArn`**, **`SesSendingConfigurationSetName`**).
- **`RiffSyncStaffAuth-prod` —** **Invite-only** staff **Cognito User Pool** + **Hosted UI** + SPA client (**`/admin/*`** OAuth URLs); **`admin`** / **`curator`** groups; reuses **`SesSendingConfigurationSetName`** from fan auth (depends on **`RiffSyncFanAuth-prod`**).
- **`RiffSyncSesInbound` —** shared **SNS** topic + **SES** **`ReceiptRuleSet`** / **`ReceiptRule`** + **`AwsCustomResource`** (**`ses:SetActiveReceiptRuleSet`**) + optional Route 53 **MX** when hosted-zone context aligns with **`sesInboundMailDomain`**. Deploy role needs **`ses:*`** receipt-rule APIs for your organization policies.

Older milestone copy: **M1** alone only created the static stack.

**Follow-ups (later milestones):**

- **GitHub Actions → AWS** deploy identity — prefer **OIDC** to IAM roles over long-lived access keys ([Delivery pipeline §](../../docs/architecture.server.md#delivery-pipeline-github-actions); [`.ai/operations/build_packaging.md`](../../.ai/operations/build_packaging.md)).
- **Runtime** IAM for **Lambda**, **API Gateway**, **WebSocket `@connections`**, **DynamoDB** writers (admin/catalog jobs), **Secrets Manager**, and **CloudWatch** custom metrics — extend policies as new routes and jobs ship.

## GitHub Actions (CI — no AWS credentials required)

[**`.github/workflows/ci.yml`**](../../.github/workflows/ci.yml) runs on **`pull_request`** and **`push`** to **`main`** when **`infra/cdk`**, **`apps/web`**, or workflow files change. The **`infra-cdk`** job runs **`npm ci`**, **`npm run build`**, **`cdk synth`** (**`environment=prod`**), then **`cfn-lint`** on **`cdk.out/**/*.template.json`**. The **`web-app`** job runs **`npm ci`**, **`npm run build`**, and **`npm run lint`** under **`apps/web`**.

This satisfies the **pull-request CI only** stance in **`docs/architecture.server.md`** (Delivery pipeline §): **PRs synthesize templates; they do not deploy.**

## Deploy (operators)

Deployment policy (**`.ai/operations/build_packaging.md`**, **`deployment_environments.md`**, **`docs/architecture.server.md`** Delivery pipeline §):

| Target | Trigger | Notes |
| --- | --- | --- |
| **Production** | Manual workflow [**`deploy-prod.yml`**](../../.github/workflows/deploy-prod.yml) (**`workflow_dispatch`**) | **Ref must be `main`**. **Parallel** CDK jobs where safe (see workflow file), then **`aws s3 sync`** and CloudFront invalidation. |
| **Media EC2 (TURN + SFU)** | Manual [**`deploy-turn.yml`**](../../.github/workflows/deploy-turn.yml) | **`cdk deploy RiffSyncTurn`** (**`main`**). Uses **`AWS_DEPLOY_ROLE_ARN_PROD`**. |
| **Local** | **AWS CLI credential profile** via **`cdk deploy`** + manual **`s3 sync`** | Matches how engineers run **`cdk bootstrap`** / **`deploy`** interactively outside CI. |

### Fan SPA publish (S3 sync + invalidation)

After **`cdk deploy`**, **`deploy-prod.yml`** reads **CloudFormation outputs** from **`RiffSyncStatic-prod`**:

| Output | Use |
| --- | --- |
| **`BucketName`** | `aws s3 sync apps/web/dist/ s3://$Bucket/` (**`--delete`** keeps the bucket aligned with the latest build) |
| **`DistributionId`** | `aws cloudfront create-invalidation --paths "/*"` |
| **`DistributionDomainName`** | **CloudFront** hostname; **`FanWebSiteUrl`** is preferred when a custom domain is configured. |
| **`HttpApiUrl`** ( **`RiffSyncApi-prod`** ) | **`VITE_PUBLIC_API_BASE_URL`** — catalog + rooms REST |
| **`WebSocketUrl`** ( **`RiffSyncApi-prod`** ) | Build-time **`VITE_PUBLIC_WS_URL`** (**`wss://…`**) once SPA subscribes to realtime (**`contracts.websocket`**). |
| **`StaffHostedUiBaseUrl`** ( **`RiffSyncStaffAuth-prod`** ) | **`VITE_STAFF_COGNITO_HOSTED_UI_DOMAIN`** — strip **`https://`** from output |
| **`StaffUserPoolClientId`** ( **`RiffSyncStaffAuth-prod`** ) | **`VITE_STAFF_COGNITO_CLIENT_ID`** |

**IAM for the GitHub OIDC deploy role** must allow, in addition to CDK/CloudFormation permissions:

- **`cloudformation:DescribeStacks`** on **`RiffSyncStatic-prod`** (or `*` conditioned appropriately).
- **`s3:PutObject`**, **`s3:DeleteObject`**, **`s3:ListBucket`** on the **web bucket** (the **`BucketName`** output).
- **`cloudfront:CreateInvalidation`** on **`arn:aws:cloudfront::ACCOUNT:distribution/DistributionId`**.

Prefer scoping to those ARNs instead of `*` once ARNs are known from a first deploy.

### Production smoke checks (operators)

**Public site SEO (M31):** after M27–M29 are deployed, run the full SEO smoke band and complete Search Console / Bing DNS verification per **[`docs/operations/public-site-seo.md`](../../docs/operations/public-site-seo.md)**. From the repo root:

```bash
npm run smoke:production
```

The script asserts apex reachability, **`www`** → apex **301**, **`robots.txt`** / **`sitemap.xml`** **200**, apex canonical **`<link>`** on **`/`** and fixture **`/watch/101-the-crawling-eye`**, and no **`www.riffsync.tv`** absolute URLs in shipped home HTML. Search Console / Bing **Verified** status is a separate operator checklist row in that runbook (not asserted by the script).

**SPA shell (baseline):** after **Deploy CDK (production)** completes:

1. Resolve the URL: **`https://<DistributionDomainName>/`** (stack output, or **AWS Console** → **CloudFormation** → **Outputs**).
2. **`curl -I`** — expect **`200`** for **`/`** and for **`/lobby`** (SPA fallback must return **`index.html`**, not S3 **`403`**).
3. In a browser, open **`/room/demo-room`**, refresh — still the shell app (**client-side route**).

**Local dry run (no AWS):**

```bash
cd apps/web && npm ci && npm run build && ls -la dist
node --check ../../scripts/launch-readiness/smoke-production.mjs
```

### Repository configuration (preferred: OIDC → IAM role)

Prefer **OIDC federation** (**GitHub → AWS**) over long-lived access keys (**`architecture.server.md`**, **`.ai/operations/build_packaging.md`**). Configure the **repository Variables** on GitHub (**Settings → Secrets and variables → Actions → Variables**, or org-level equivalents):

| Variable | Used by |
| --- | --- |
| **`AWS_DEPLOY_ROLE_ARN_PROD`** | IAM role ARN assumable via OIDC for **production** **`cdk deploy`** (**`deploy-prod.yml`** and **`deploy-turn.yml`**) |
| **`AWS_REGION`** (optional) | Target region (**default `us-east-1`** when unset — override as needed.) |

**Optional — stable SPA hostname on CloudFront** (set on GitHub as **Variables**; certificate must be in **us-east-1**):

| Variable | Purpose |
| --- | --- |
| **`PROD_FAN_WEB_HOSTNAME`** | e.g. **`riffsync.tv`** or **`www.riffsync.tv`** (production deploy workflow) |
| **`PROD_FAN_WEB_CERTIFICATE_ARN`** | **`us-east-1`** ACM ARN covering production hostname(s) |
| **`PROD_FAN_WEB_ALTERNATE_DOMAIN_NAMES`** | Optional; comma-separated extra hostnames on the **same** cert (e.g. **`www.riffsync.tv`** when **`PROD_FAN_WEB_HOSTNAME`** is apex **`riffsync.tv`**) — CloudFront aliases, Route 53 A, CORS, Cognito URLs |
| **`PROD_FAN_WEB_CANONICAL_HOSTNAME`** | Optional; when set (e.g. apex **`riffsync.tv`**), CloudFront **301** from any **other** custom alias to this host (**`FanWebSiteUrl`** / **`VITE_PUBLIC_ORIGIN`** use this too) |
| **`RIFFSYNC_ROUTE53_HOSTED_ZONE_ID`** | Public hosted zone for **`RIFFSYNC_ROUTE53_ZONE_NAME`** (optional) |
| **`RIFFSYNC_ROUTE53_ZONE_NAME`** | e.g. **`riffsync.tv`** — with zone id; CDK creates Route 53 alias **A** records for **`fanWebCustomDomain`** and each **`fanWebAlternateDomainNames`** host |
| **`PROD_TURN_HOST`** | Public **`turn:`** hostname or IP for coturn. See **Self-hosted TURN** — omit until EC2 + secret are ready. |
| **`PROD_TURN_PORT`** | Optional; overrides default **`3478`**. |
| **`PROD_TURN_TLS_PORT`** | Optional; e.g. **`5349`** for **`turns:`**. |
| **`PROD_TURN_CREDENTIAL_TTL_SECONDS`** | Optional; TURN username lifetime (default **`43200`**). |
| **`PROD_SFU_PUBLIC_WS_URL`** | Optional; sets CDK **`sfuPublicWsUrl`**. **Overrides** the **`wss://`** default built from **`PROD_SFU_SIGNALING_HOSTNAME`**. For production with Caddy, use the same host as signaling (e.g. **`wss://signal.riffsync.tv`**) or omit this variable so the default is **`wss://<PROD_SFU_SIGNALING_HOSTNAME>`**. Do not use raw **`IP:3000`** for **`wss://`** when the fan site is **`https://`**. |
| **`PROD_SFU_SIGNALING_HOSTNAME`** | e.g. **`signal.riffsync.tv`** — single label under **`RIFFSYNC_ROUTE53_ZONE_NAME`**. CDK creates **`A`** → SFU EIP and Caddy terminates **`wss://`** on that name. Should match **`PROD_SFU_PUBLIC_WS_URL`** if you set the latter (same host, **`wss://`**). |

**Prod signaling:** set **`PROD_SFU_SIGNALING_HOSTNAME=signal.riffsync.tv`**, and either omit **`PROD_SFU_PUBLIC_WS_URL`** or set **`PROD_SFU_PUBLIC_WS_URL=wss://signal.riffsync.tv`**. Remove any **`sfu.riffsync.tv`** values if you have moved to **`signal`**.

**DNS:** If **`PROD_*_FAN_WEB_HOSTNAME`** (and cert) are set but **`RIFFSYNC_ROUTE53_*`** are **omitted**, the stack **still** attaches custom domains to CloudFront, but it **does not** create or retain Route 53 records — **`FanWebSiteUrl`** will show the custom URL while **`FanWebRoute53AliasRecordCount`** output is **`0`**. A later deploy that drops the zone vars can **remove** previously managed records from the template. Set **both** Route 53 variables whenever you want this stack to own the aliases.

Request the ACM cert in **us-east-1**, complete **DNS validation**, then run the **Deploy CDK** workflow for that environment. Omit the Route 53 variables if you create the **CNAME/alias** yourself. **Stack output `FanWebSiteUrl`** is the canonical **`https://…`** used for **`VITE_PUBLIC_ORIGIN`** and API/Cognito allowlists (workflows read it from CloudFormation).

**Local `cdk deploy` (operators):** engineers may run **`npx cdk`** from a workstation for debugging or bootstrap; **production** should track **`main`** via **`deploy-prod.yml`**.

Local deploy with custom hostname:

```bash
npx cdk deploy --all --context environment=prod \
  --context fanWebCustomDomain=riffsync.tv \
  --context fanWebCertificateArn=arn:aws:acm:us-east-1:ACCOUNT:certificate/UUID \
  --context fanWebHostedZoneId=Z0123456789ABCDEFGHIJ \
  --context fanWebZoneName=riffsync.tv
# Optional www on the same ACM cert (see README § Extra SPA hostname):
#   --context fanWebAlternateDomainNames=www.riffsync.tv --context fanWebCanonicalHostname=riffsync.tv
```

IAM trust policy (**sketch**) for each role (`sts:AssumeRoleWithWebIdentity`):

- Audience / issuer **`token.actions.githubusercontent.com`**
- **Subject / `sub` claim** restricted to this repository (e.g. `repo:OWNER/riffsync:ref:refs/heads/main` or an environment-scoped claim if you tighten after policy review)
- Map **`aud`** to `sts.amazonaws.com` per AWS guidance for GitHub’s OIDC token

Role permissions must allow **CDK deploy** for the stacks in this app (CloudFormation, S3, CloudFront, IAM pass-through for CDK bootstrap assets, etc.). **Until these roles exist**, workflows still **validate** (CI synth + `cfn-lint`); deploy runs fail fast with a clear message if the variables are unset.

**No repository secrets are required for PR CI** (synth + lint). Optional short-lived keys are only an escape hatch if OIDC is not configured yet — not the default path.

### `cdk deploy` (CI and local)

GitHub deploy jobs use **non-interactive** approval:

```bash
npx cdk deploy --all --context environment=prod --require-approval never
```

**`--require-approval never`** is appropriate for **automated** runs after changes are reviewed on **`main`** / via **tags**. For **local** interactive deploys, prefer **`broadening`** or **`any-change`** so IAM or security-group broadening prompts are visible before you press **y**.

**One-time per account/region:**

```bash
cd infra/cdk
npm ci && npm run build
npx cdk bootstrap aws://ACCOUNT/REGION   # uses your CLI profile credentials
```

**Context:** `cdk.json` defaults **`environment`** to **`prod`**.

**Exact operator sequence (local profile, production):**

```bash
git checkout main && git pull
cd infra/cdk && npm ci && npm run build && npx cdk deploy --all --context environment=prod
```

## CloudFormation **`UPDATE_FAILED`** (operators)

When a deploy rolls back, open **CloudFormation** → failed stack → **Events** and find the **first** resource in **`UPDATE_FAILED`** (the stack-level message is often generic). Compare with **`cdk diff --all --context environment=prod`** using the same **`--context`** flags as CI/deploy workflows.

**Follow-up (optional):** routine deploys can target explicit stack lists (e.g. app stacks only) instead of **`cdk deploy --all`** to shrink rollback blast radius—see roadmap discussion in the repo if adopted.

## Naming & tiers

Hosted tier is **`prod`**; **`local`** has no AWS footprint (**`.ai/runtime/configuration.md`**). Production web hostname is **`riffsync.tv`** ([**`.ai/project.json`**](../../.ai/project.json) **`public_domain`**). Prefer stack output **`FanWebSiteUrl`** (custom domain or default **`*.cloudfront.net`**) for the live **`https://`** origin.
