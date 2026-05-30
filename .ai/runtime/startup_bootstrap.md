# Startup & bootstrap

## Lambda

- **Cold start:** initialize **AWS SDK clients** once per execution environment; optionally load **Secrets Manager** ARNs lazily per first reconcile invocation.
- **TMDB `/configuration`** cache: in-memory TTL (e.g. 24h) inside reconcile Lambda to avoid hammering TMDB (**`docs/contracts.tmdb.md`**).

## SPA (browser)

### Fan and guest paths (unchanged)

- **Bootstrap:** read **`sessionId`** / display name from **localStorage**; configure API Gateway **WebSocket URL** + HTTP **API base URL** from build-time env (**`architecture.frontend.md`**). **Production** SPA canonical page origin is **`https://riffsync.tv`** (**`.ai/runtime/configuration.md`**, **`.ai/project.json`** **`public_domain`**).
- **Fan auth:** Hosted UI + PKCE on **`/auth/callback`**; fan tokens in the fan **localStorage** namespace; fan refresh and API attachment independent of staff.

### Staff admin paths (`/admin/*`)

- **Scope:** Routes under **`/admin/*`** (including **`/admin/login`**, **`/admin/auth/callback`**, protected admin shell) run a **separate bootstrap** from fan/guest bootstrap. Fan **`sessionId`**, fan JWT refresh, and room flows must **not** clear or overwrite staff tokens.
- **Order:** On navigation to a protected **`/admin/*`** route, (1) read **staff** token storage (distinct keys from fan), (2) refresh staff access token via staff Hosted UI token endpoint if stale, (3) if absent, redirect to staff Hosted UI PKCE (unlisted entry; bookmark/direct URL only).
- **OAuth isolation:** Staff PKCE uses **`/admin/auth/callback`** and staff-namespaced **sessionStorage** PKCE state so fan **`/auth/callback`** and fan PKCE keys never collide.
- **Coexistence:** Fan and staff sessions may **both** be present in one browser; staff sign-out clears staff storage only and returns to **`/admin/login`** without tearing down fan session or **`sessionId`**.
- **API calls:** **`/v1/admin/*`** requests attach **staff** Bearer tokens only; fan tokens must not be sent on admin routes.

## Decisions

| Question | Decision |
| --- | --- |
| Global Dynamo DAX? | **Not** MVP baseline. |

## Primary code pointers (optional)

- `main.tsx` / env injection when SPA exists.
