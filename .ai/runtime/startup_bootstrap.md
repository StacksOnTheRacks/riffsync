# Startup & bootstrap

## Lambda

- **Cold start:** initialize **AWS SDK clients** once per execution environment; optionally load **Secrets Manager** ARNs lazily per first reconcile invocation.
- **TMDB `/configuration`** cache: in-memory TTL (e.g. 24h) inside reconcile Lambda to avoid hammering TMDB (**`docs/contracts.tmdb.md`**).

## SPA (browser)

- **Bootstrap:** read **`sessionId`** / display name from **localStorage**; configure API Gateway **WebSocket URL** + HTTP **API base URL** from build-time env (**`architecture.frontend.md`**). **Production** SPA canonical page origin is **`https://riffsync.tv`** (**`.ai/runtime/configuration.md`**, **`.ai/project.json`** **`public_domain`**).

## Decisions

| Question | Decision |
| --- | --- |
| Global Dynamo DAX? | **Not** MVP baseline. |

## Primary code pointers (optional)

- `main.tsx` / env injection when SPA exists.
