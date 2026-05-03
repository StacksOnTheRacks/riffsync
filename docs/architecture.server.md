# RiffSync — server-side architecture (draft)

Companion to the repo README: **AWS serverless baseline** for HTTP rooms/lobby, WebSocket realtime, catalog, and housekeeping. **Lambda** sits behind **API Gateway (HTTP API + WebSocket API)**; durable state is **DynamoDB**.

**ElastiCache** — **Redis OSS–compatible** (ElastiCache for Redis or ElastiCache Serverless for **Valkey** depending on what you enable in account/region) — is **optional**. Use it for read-through caches on **`GET /v1/catalog`**, lobby list snapshots, etc. Any Lambda that talks to ElastiCache joins a **VPC** (ENIs → **cold-start and burst** trade-offs). Cache is **never** authoritative: **DynamoDB** remains the system of record.

Infrastructure-as-code specifics below align with **[Amazon API Gateway HTTP APIs and WebSocket APIs](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html)** (prefer **`AWS::ApiGatewayV2::Api`**, `ProtocolType`: **`HTTP`** or **`WEBSOCKET`**, vs legacy **`AWS::ApiGateway::RestApi`**) and the **[ApiGatewayV2 template reference](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-apigatewayv2-api.html)**. Lint with **`cfn-lint`** (**[Installing and using](https://github.com/aws-cloudformation/cfn-lint)**) and **`validate_cloudformation_template`** from Cursor’s AWS IaC MCP (**`search_cloudformation_documentation`** for resource properties).

---

## Serverless resource decisions (baseline)

| Resource | Role |
| --- | --- |
| **API Gateway HTTP API** (`ProtocolType: HTTP`) | BFF JSON: **`GET /v1/catalog`**, create/fetch room, lobby list, health. |
| **API Gateway WebSocket API** (`ProtocolType: WEBSOCKET`) | Realtime paths: `$connect` / `$disconnect`, playback, chat, ping, **`execute-api:ManageConnections`** fan-out. |
| **AWS Lambda** | All synchronous route handlers + **EventBridge** consumers (sweeper, TMDB catalog reconciliation). |
| **Amazon DynamoDB** | **All durable application state:** at least **rooms** (playback + `lastActivityAt`), **WebSocket connection index** (`connectionId → roomId`), and **catalog** (canonical episode fields + reconciled TMDB image attributes). Use **separate tables** or a **single-table** key design in IaC — pick for operational clarity; splitting tables is fine for MVP. |
| **Amazon EventBridge** (`AWS::Events::Rule` or **`AWS::Scheduler::Schedule`**) | Schedules for **stale-room housekeeping** and **TMDB reconciliation** batch jobs. |
| **AWS Secrets Manager** | TMDB (and similar) API credentials. |
| **Amazon ElastiCache (optional)** | Redis/Valkey-compatible **cache** — e.g. serialized **full catalog** or lobby denorm. **Invalidate** or **short TTL** when catalog rows change. Not required to ship. |
| **Amazon S3 (optional)** | **Static site** hosting for the SPA, or **offline exports** — **not** part of the catalog **write path** once DynamoDB owns merged rows. |

**Out of scope for this baseline:** **ECS/Fargate**, long-lived **EC2** app tiers, or alternative WebSocket stacks — API Gateway + Lambda is the default.

---

## Component diagram

```mermaid
flowchart TB
  subgraph clients["Clients (browser)"]
    FB[SPA / SSR app]
  end

  subgraph edge["Edge"]
    HTTP["HTTP API\n(ApiGateway v2 HTTP)"]
    WS["WebSocket API\n(ApiGateway v2 WEBSOCKET)"]
  end

  subgraph compute["Compute — Lambda"]
    HREST["HTTP handlers\n/catalog / rooms / lobby"]
    HWSC["WS $connect / $disconnect"]
    HWSR["WS routes:\nplayback / chat / ping"]
    HSWP["Sweeper + TMDB reconcile\n(EventBridge schedules)"]
  end

  subgraph data["DynamoDB tables"]
    TROOMS[(Rooms)]
    TCONN[(Connections)]
    TCAT[(Catalog)]
  end

  subgraph optcache["Optional — VPC"]
    EC[(ElastiCache\nRedis / Valkey)]
  end

  FB -->|"HTTPS"| HTTP
  FB <-->|"WebSocket"| WS

  HTTP --> HREST
  WS --> HWSC
  WS --> HWSR

  HREST --> TROOMS
  HREST --> TCAT

  HWSC --> TCONN
  HWSC --> TROOMS
  HWSR --> TROOMS
  HWSR --> TCONN
  HWSR -->|"PostToConnection"| WS

  HSWP --> TROOMS
  HSWP --> TCAT

  EB[["EventBridge"]] --> HSWP

  HREST -.->|optional cache| EC
```

---

## Responsibilities by area

| Area | Responsibility |
| --- | --- |
| **HTTP API** | **`GET /v1/catalog`** (assemble from **DynamoDB** catalog items; optional **ElastiCache** read-through). Room create/read, **live public** lobby list using **`lastActivityAt`**. |
| **WebSocket API** | **`$connect` / `$disconnect`** write the **connection → room** mapping; message routes update **authoritative room items** in DynamoDB, then **`PostToConnection`** to room members. |
| **DynamoDB (rooms)** | Source of truth: video / party fields, **`hostId`/session**, **`playbackExpectation`**, **`lastActivityAt`**, **`roomId`**, optional reclaim token. |
| **DynamoDB (connections)** | **`connectionId → roomId`** (and optional **`sessionId`**) for targeting fan-out and teardown. |
| **DynamoDB (catalog)** | Canonical **`youtubeVideoId`**, **`title`**, **`era`**, **`id`**, curator hints; reconciliation **writes TMDB paths/URLs + `tmdbArtworkSyncedAt`** on the same items (or paired access pattern). **`data/catalog/episodes.json`** seeds this table during bootstrap only. |
| **Sweeper / TTL** | Remove or hide stale lobby entries (**EventBridge → Lambda**; **Dynamo TTL** where appropriate). |
| **Catalog enrichment (TMDB)** | Scheduled **Lambda** reads catalog items, calls TMDB, **updates DynamoDB** — **`docs/architecture.catalog-images.md`**. |
| **ElastiCache (optional)** | Reduce Dynamo read load and latency for **catalog** and optionally **lobby**; **VPC** Lambda + security groups to cluster/serverless cache endpoint. |

---

## IaC & permission notes

Aligned with **[`AWS::ApiGatewayV2::Api`](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-apigatewayv2-api.html)** and the **[WebSocket API guide](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-overview.html)**.

| Topic | Notes |
| --- | --- |
| **Lambda ← API Gateway** | Declare **`AWS::Lambda::Permission`**: **`Action`**: `lambda:InvokeFunction`, **`Principal`**: **`apigateway.amazonaws.com`**, **`SourceArn`** scoped to this API’s **`execute-api`** ARN ([**Lambda permissions**](https://docs.aws.amazon.com/lambda/latest/dg/lambda-permissions.html)). |
| **`PostToConnection` broadcast** | WebSocket handler IAM needs **`execute-api:ManageConnections`** on **`…execute-api:…/@connections/*`** ([**@connections API**](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-how-to-call-websocket-api-connections.html)). |
| **`AWS::Events::Rule` / Scheduler** | EventBridge **`rate()` / `cron()`** (or **`AWS::Scheduler::Schedule`**) invoking Lambda requires **`events.amazonaws.com`** (**or Scheduler principal**) **`lambda:InvokeFunction`** permission ([**Events rule**](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-events-rule.html)). |
| **DynamoDB TTL** | **`TimeToLiveSpecification`** on TTL attribute — deletes are **eventual**; keep **`lastActivityAt`** for live queries ([**TTL**](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html)). |
| **Secrets Manager** | TMDB secret; Lambda **`secretsmanager:GetSecretValue`** ([**retrieve**](https://docs.aws.amazon.com/secretsmanager/latest/userguide/manage_retrieve-secret.html)). |
| **ElastiCache** | Lambda in **VPC** subnets that reach the cache; security group allows client port; expect **longer cold starts**. Prefer **subnet groups** documented for [ElastiCache](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/elasticache-intro.html); consider **Serverless** cache to defer cluster sizing. |
| **IaC tooling** | **`cfn-lint`**; Cursor AWS IaC MCP **`validate_cloudformation_template`**, **`search_cloudformation_documentation`**, and the **[CloudFormation resource reference](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-template-resource-reference.html)**. |

---

## When to add ElastiCache

Add when **CloudWatch** shows **sustained hot reads** on catalog or lobby (RCU cost, p99 latency) and a **short-lived cache** fits your consistency model — not as default complexity on day one.
