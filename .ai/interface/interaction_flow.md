# Interaction flow

Primary navigation aligned with **`docs/architecture.frontend.md`**.

## Routes (MVP)

| Route | Flow |
| --- | --- |
| **`/` / catalog** | Grid/list → **Sign in to host** → **`POST /v1/rooms`** → **`/room/:id`** as admin with episode seed; **anonymous** visitors browse or follow join links only. |
| **`/watch/:catalogId`** *(optional)* | Prefer **redirect** to **`/room/:...`** so playback logic stays unified; if retained briefly, must not fork drift-prone parallel-sync assumptions. |
| **`/room/:roomId`** | **Admin (`JWT.sub === hostSub`):** picker + embed + broadcast. **Guests:** Lazy **`sessionId`**, inbound **`MediaStream`**, **Now watching**, chat (**`authorization.md`**). |
| **`/lobby`** | Public rooms from **`GET` lobby API** → navigate to **`/room/:id`**. |
| **`/admin/login`** | **Unlisted** operator gate (bookmark or direct URL only; no links from catalog or room chrome). Primary action starts **staff** Cognito Hosted UI + PKCE; copy makes clear this is **operators only**, not fan Facebook sign-in. |
| **`/admin/auth/callback`** | Staff OAuth code exchange; on success navigates to stored **`returnTo`** or **`/admin`**; on failure shows **recoverable** error with **retry sign-in** (no silent blank shell). |
| **`/admin` / `/admin/*`** | **Staff JWT required** in the SPA before rendering protected admin chrome. Unauthenticated visitors redirect to **`/admin/login`** with intended path preserved for post-login return. **Auth slice:** minimal session probe at **`/admin`** (operator identity / group sanity check) and **Sign out**; catalog, lists, and roster UI are **out of scope** until later initiatives. |

Staff operator routes ship as **gated routes in the existing `apps/web` SPA** (one Vite build, one CloudFront origin). Fan routes (**`/auth/callback`**, catalog **Sign in to host**, room host flows) are unchanged.

## Staff operator auth (token and session boundaries)

**Login mechanism:** Cognito Hosted UI + PKCE, mirroring the fan pattern (`fanHostedUiPkce.ts` reference implementation). No custom username/password form in MVP.

| Storage | Namespace | Used for |
| --- | --- | --- |
| **localStorage** | **`riffsync.staff*`** (access, refresh, expiry keys) | Staff access token attached to **`/v1/admin/*`** as **`Authorization: Bearer`** |
| **sessionStorage** | **`riffsync.staff.*`** (PKCE verifier, OAuth state, **`returnTo`**) | Ephemeral staff OAuth round-trip only; must not collide with fan **`riffsync.pkceVerifier`** / **`riffsync.oauthState`** keys |

Fan token keys (**`riffsync.fan*`**) and fan PKCE session keys remain **untouched** by staff flows.

**Fan + staff coexistence:** Both sessions **may be active independently** in one browser (separate pools, separate storage). Opening **`/admin`** while hosting a room as a fan does not clear fan tokens; staff sign-out does not end fan hosting or anonymous guest **`sessionId`**. Admin HTTP calls send the **staff** bearer only; the fan token is **never** sent to **`/v1/admin/*`** even when both sessions exist.

**Staff sign-out:** Clears the **`riffsync.staff*`** namespace and navigates to **`/admin/login`**. Does **not** clear fan tokens, fan PKCE state, or anonymous **`sessionId`**. Cognito Hosted UI global logout is **not** required for the auth slice MVP.

**Unauthenticated admin access:** Any protected **`/admin/*`** request without a valid staff token redirects to **`/admin/login`** with **`returnTo`** capturing the intended path (query or sessionStorage at sign-in start, per implementation). After OAuth success, land on the saved path when it remains under **`/admin/*`**, otherwise **`/admin`**.

## Session establishment

**Lazy creation (cost-first):** Do **not** mint **`sessionId`** for pure catalog browsing. When the user **joins lobby or a room as a guest**—**opening `/lobby`**, **joining `/room/:id`**—generate **`sessionId`** + random **display name** (**`authorization.md`**). **Hosts** authenticate via **Cognito JWT** for **`POST /v1/rooms`** and publisher actions (**no anonymous host binding**).

1. **Client:** generate **`sessionId`** + display name at that first boundary; keep stable until site data cleared (**`architecture.frontend.md`**).
2. **WebSocket `$connect`:** send **`roomId` + sessionId`** (+ **`Authorization`** if signed in).

## Decisions (answered)

| Question | Decision |
| --- | --- |
| Deep-link `/watch` vs `/room`? | **Room-first:** prefer **`/room/...`**; **`/watch`** only as temporary alias → redirect. |
| When is `sessionId` minted? | **Lazy:** first **lobby** or **`/room/:id` join** — **not** catalog browse alone; room **create** does **not** mint anonymous host (**JWT host instead**). |
| Admin UI delivery shape? | **Gated `/admin/*` routes** in the existing **`apps/web` SPA** (one build, one origin); not a separate admin SPA deploy target. |
| Fan + staff sessions in one browser? | **Coexist independently**; staff sign-out clears staff tokens only. |
| Discoverability of `/admin/login`? | **Unlisted** — bookmark/direct URL only; no public SPA links from fan surfaces. |

## Primary code pointers (optional)

- Router config when SPA exists.
- **`apps/web/src/auth/fanHostedUiPkce.ts`**, **`fanTokens.ts`** — fan OAuth/PKCE and **`riffsync.fan*`** storage pattern to mirror for staff (**`/admin/auth/callback`**, **`riffsync.staff*`**).
