# Index — integration

Scopes **HTTP/WebSocket APIs**, **external providers** (YouTube, TMDB, Meta, AWS surfaces), **authorization modes**, **participant A/V over mediasoup SFU (all environments)**, **friends and 1:1 DM** fan social surfaces (invite/accept, RoomPresence-derived friends online, durable DM delivery), **scheduled/async** integrations, and **realtime hardening** drawer boundaries (room **ChatSession** vs DM plane, chat vs SFU decoupling, typed errors, conformance harness pointer).

- Child contracts: **`api_contracts.md`**, **`external_systems.md`**, **`authorization.md`**, **`messaging_async.md`**.
- Long-form architecture (**all files under `docs/`**): **`docs/architecture.server.md`**, **`docs/architecture.frontend.md`**, **`docs/architecture.admin.md`**, **`docs/architecture.catalog-images.md`**, **`docs/contracts.tmdb.md`** — indexed from **`.ai/knowledge_map.json`** (**repository_architecture**).

## Scope

- Record durable constraints and boundaries for this domain.
- Keep this file aligned with mapped child contracts.
- **Friends / DM** boundaries live primarily in **`api_contracts.md`** (surfaces + plane split), **`authorization.md`** (fan JWT only; mutual remove revoke), and **`messaging_async.md`** (sync-on-open + write-then-fan-out). **`ChatSession`** remains the **room** chat/presence plane.

## Primary code pointers (optional)

- Add stable code directories or modules here when known.
- Keep entries concise and remove stale pointers.
