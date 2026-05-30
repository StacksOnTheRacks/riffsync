# Execution model

Runtime topology: **AWS serverless MVP** (**`docs/architecture.server.md`**).

## Infrastructure delivery

| Choice | Contract |
| --- | --- |
| **IaC** | **AWS CDK** (TypeScript) as the canonical way to declare stacks, synth to CloudFormation, deploy via **`cdk deploy`**. |
| **Lambda language** | **TypeScript** source → bundle/transpile → **Node.js** Lambda runtime (**`nodejs22.x`** or current LTS at ship time—pin in CDK **`Runtime`**). |

**Prefer serverless** managed services (**API Gateway, Lambda, DynamoDB, EventBridge/Scheduler, Cognito, CloudWatch**) for all default paths; add **VPC + ElastiCache** or similar only where the architecture docs already justify it.

## Compute

| Unit | Behavior |
| --- | --- |
| **Lambda** | **Stateless** **TypeScript** request handlers; concurrency scales with API Gateway / EventBridge. Assume **cold starts**; avoid long init (cache TMDB config in global with TTL). **Admin HTTP** handlers on **`/v1/admin/*`** trust **staff authorizer context** (`sub`, **`cognito:groups`**) at the edge; they do **not** repurpose the fan-only JWT verifier module bound to fan **`COGNITO_*`** env. WebSocket/SFU Lambdas keep fan pool env unchanged. |
| **API Gateway HTTP** | Routes to Lambda integration; **fan JWT authorizer** on fan-protected routes; **staff JWT authorizer** on **`/v1/admin/*`** only (second authorizer, staff pool issuer + staff SPA client audience). Cross-pool tokens fail at the gateway. |
| **API Gateway WebSocket** | **`$connect` / `$disconnect`** + route selection to Lambdas; **`PostToConnection`** for broadcast. |

## Client

| Unit | Behavior |
| --- | --- |
| **Browser SPA (or SSR)** | Single TypeScript SPA (React per **`docs/architecture.frontend.md`**): fan catalog/rooms plus **gated `/admin/*`** operator surfaces in one build and one CloudFront origin; YouTube iframe per tab; WebSocket loop for parties; **no** privileged secrets. |

## Background

| Unit | Behavior |
| --- | --- |
| **Scheduled Lambda** | Reconcile + sweeper — TypeScript Lambdas — **bounded time** batch; continuation via next schedule or pagination cursors (**implementation**). |

## Decisions (answered)

| Question | Decision |
| --- | --- |
| IaC SAM vs CDK? | **CDK** as project standard. SAM/local still fine for **local** invoke/debug of individual handlers. |
| Lambda Python/Go? | **Not** default; **TypeScript** end-to-end for backend handlers unless a future component forces another runtime. |

## Primary code pointers (optional)

- CDK **`lib/`** stacks; **`src/handlers/**/*.ts`** (or repo convention TBD).
