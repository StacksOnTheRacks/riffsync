# Interaction flow

Primary navigation aligned with **`docs/architecture.frontend.md`**.

## Routes (MVP)

| Route | Flow |
| --- | --- |
| **`/` / catalog** | Grid/list → **Sign in to host** → **`POST /v1/rooms`** → **`/room/:id`** as admin with episode seed; **anonymous** visitors browse or follow join links only. |
| **`/watch/:catalogId`** *(optional)* | Prefer **redirect** to **`/room/:...`** so playback logic stays unified; if retained briefly, must not fork drift-prone parallel-sync assumptions. |
| **`/room/:roomId`** | **Admin (`JWT.sub === hostSub`):** picker + embed + broadcast. **Guests:** Lazy **`sessionId`**, inbound **`MediaStream`**, **Now watching**, chat (**`authorization.md`**). |
| **`/lobby`** | Public rooms from **`GET` lobby API** → navigate to **`/room/:id`**. |
| **`/admin/*` (optional)** | **Staff** SPA or gated routes — catalog, lists, roster; charts primarily **AWS console**. |

## Session establishment

**Lazy creation (cost-first):** Do **not** mint **`sessionId`** for pure catalog browsing. When the user **joins lobby or a room as a guest**—**opening `/lobby`**, **joining `/room/:id`**—generate **`sessionId`** + random **display name** (**`authorization.md`**). **Hosts** authenticate via **Cognito JWT** for **`POST /v1/rooms`** and publisher actions (**no anonymous host binding**).

1. **Client:** generate **`sessionId`** + display name at that first boundary; keep stable until site data cleared (**`architecture.frontend.md`**).
2. **WebSocket `$connect`:** send **`roomId` + sessionId`** (+ **`Authorization`** if signed in).

## Decisions (answered)

| Question | Decision |
| --- | --- |
| Deep-link `/watch` vs `/room`? | **Room-first:** prefer **`/room/...`**; **`/watch`** only as temporary alias → redirect. |
| When is `sessionId` minted? | **Lazy:** first **lobby** or **`/room/:id` join** — **not** catalog browse alone; room **create** does **not** mint anonymous host (**JWT host instead**). |

## Primary code pointers (optional)

- Router config when SPA exists.
