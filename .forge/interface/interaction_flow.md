# Interaction flow

Primary navigation aligned with **`docs/architecture.frontend.md`**.

## Routes (MVP)

| Route | Flow |
| --- | --- |
| **`/` / catalog** | Grid/list of episodes → **Open episode** → create/open **`/room/:id`** with selection (product defines always-new vs reuse). |
| **`/watch/:catalogId`** *(optional)* | Prefer **redirect** to **`/room/:...`** so playback logic stays unified; if retained briefly, must not fork drift-prone parallel-sync assumptions. |
| **`/room/:roomId`** | Join WebSocket; **admin** sees **in-room catalog picker** (defaults to episode used when room was opened), embed + broadcast controls; **guests** see inbound **`MediaStream`** + **Now watching** from room metadata + chat; **`sessionId === hostSessionId`** gates picker + publisher actions. |
| **`/lobby`** | Public rooms from **`GET` lobby API** → navigate to **`/room/:id`**. |
| **`/admin/*` (optional)** | **Staff** SPA or gated routes — catalog, lists, roster; charts primarily **AWS console**. |

## Session establishment

**Lazy creation (cost-first):** Do **not** mint **`sessionId`** for pure catalog browsing (no server participant identity needed). When the user first needs a **server-visible participant**—**opening `/lobby`**, **creating/opening a room**, **joining `/room/:id`**, or any HTTP that carries **`sessionId`** per **`authorization.md`**—generate an opaque **`sessionId`** (UUID) + random **display name** and persist in **`localStorage`**.

1. **Client:** generate **`sessionId`** + display name at that first boundary; keep stable until site data cleared (**`architecture.frontend.md`**).
2. **WebSocket `$connect`:** send **`roomId` + sessionId`** (+ **`Authorization`** if signed in).

## Decisions (answered)

| Question | Decision |
| --- | --- |
| Deep-link `/watch` vs `/room`? | **Room-first:** prefer **`/room/...`**; **`/watch`** only as temporary alias → redirect. |
| When is sessionId minted? | **Lazy:** first **lobby / room create / room join** (or first API that requires it)—**not** on catalog browse alone. |

## Primary code pointers (optional)

- Router config when SPA exists.
