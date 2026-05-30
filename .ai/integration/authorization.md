# Authorization

Who may do what, and how identity is represented. Aligns with **`docs/architecture.server.md`**, **`docs/architecture.frontend.md`**, **`architecture.admin.md`**.

## Identity modes

| Mode | Representation | Typical use |
| --- | --- | --- |
| **Anonymous guest** | Opaque **`sessionId`** (UUID) + **display name** in **`localStorage`** once the user crosses **lobby** or **joins `/room/:id`** (**lazy mint**); **`X-Session-Id`** + WS **`$connect`**. | **Browse**, **join**, **watch**, **view room chat** (text, GIFs, reactions, avatars)—**cannot** **send** chat, **react**, upload avatars, create rooms, or publish WebRTC. |
| **Signed-in fan (host)** | **Cognito JWT** (**`sub`**, claims); Facebook or other IdP. | **Create room**, **room admin**, **PATCH** authoritative playback, **WebRTC publisher**; **`hostSub`** on room **=** **`sub`**. |
| **Staff / operator** | **Invite-only** Cognito **staff user pool** (distinct from the fan pool) + **staff JWT authorizer** on **`/v1/admin/*`**. Tokens live in a **separate browser namespace** from fan auth; fan and staff sessions may **coexist** in one browser. | Catalog edits, curated lists, roster/API tools—not fan Facebook login. |

## Staff pool (operator)

| Property | Contract |
| --- | --- |
| **Pool boundary** | **Dedicated staff user pool** and **public SPA app client** (no client secret). **Do not** reuse fan pool tokens or app client for **`/v1/admin/*`**. |
| **Provisioning** | **`selfSignUpEnabled: false`** — operators are **invite-only** (console **`AdminCreateUser`**, CLI, or IaC). MVP accepts **manual Cognito console** invites plus **`admin`** / **`curator`** group assignment. |
| **IdP** | **COGNITO only** on the staff pool (no Facebook / Meta IdP). |
| **Roles (MVP)** | **`cognito:groups`** on staff JWTs — predefined groups **`admin`** and **`curator`**. **Custom JWT role claims** are **out of scope**. |
| **SPA sign-in** | **Cognito Hosted UI + PKCE** (mirror fan pattern). OAuth redirect **`/admin/auth/callback`** on the **same SPA origins** as fan auth; logout URLs aligned with **`/admin/*`**. Staff tokens stored under **`riffsync.staff*`** keys; fan **`/auth/callback`** and **`riffsync.fan*`** keys unchanged. |
| **Discoverability** | **`/admin/login`** is **unlisted** (bookmark/direct URL only; no links from fan catalog or room chrome). |
| **MFA** | **Optional** at pool level for MVP (recommended where practical; not a hard gate). |
| **Transactional email** | Staff pool verification/invite email reuses the **same SES From** and configuration set as fan auth (**`noreply@riffsync.tv`**, shared **`riffsync-ses-send-prod`** pattern). |

## Dual JWT authorizers (same HTTP API)

| Authorizer | Issuer / audience | Routes |
| --- | --- | --- |
| **Fan JWT** | Fan pool id + fan SPA client id | **`POST /v1/rooms`**, room-admin **`PATCH`/`PUT`**, **`/v1/fans/*`**, **`GET /v1/giphy/search`**, publisher WebSocket paths requiring **`sub === hostSub`**. |
| **Staff JWT** | Staff pool id + staff SPA client id | **`/v1/admin/*`** only. |

- **Cross-pool rejection:** API Gateway validates **issuer** and **jwt audience** per route binding. A fan token on **`/v1/admin/*`** or a staff token on fan-gated routes **fails at the authorizer** (typically **401**) without Lambda involvement.
- **Group enforcement:** The staff authorizer proves **pool + client** only. Lambdas (or route-specific authorizer logic) **must** read **`cognito:groups`** from authorizer context and return **403** when the JWT is valid but **required group membership** is missing (auth slice: **`admin`** or **`curator`** suffices on probe routes; finer **`admin` vs `curator`** splits land with catalog handlers).

## Enforcement points

| Layer | Behavior |
| --- | --- |
| **HTTP** | **Staff JWT authorizer** on **`/v1/admin/*`**; **fan JWT authorizer** on fan-gated routes; **`POST /v1/rooms`** and room-admin **`PATCH`/`PUT`** require **fan JWT** (**`sub`**); **`GET /v1/catalog`**, **`GET /v1/lobby`**, room **read/join** paths accept **`sessionId`** via **`X-Session-Id`** for anonymous guests. |
| **WebSocket** | **`$connect`**: **`roomId`** + **`sessionId`**; **publisher paths** additionally require **JWT** whose **`sub`** matches **`room.hostSub`** (authorizer or Lambda validation). Map **`connectionId → roomId`** (+ optional **`sub`** / **`sessionId`** metadata). |

## Rules (domain)

- **Room-admin authority:** only **`JWT.sub === room.hostSub`** may publish WebRTC signaling or mutate authoritative playback metadata.
- **Moderation:** target **`sessionId`** / **`connectionId`** for anonymous guests; **`sub`** for signed-in hosts (**`docs/architecture.admin.md`**).
- **Principle:** never require an IdP to **browse catalog**, **join**, **watch**, or **read** room chat; **do** require **fan JWT** to **send** chat (text/emoji/GIF), **react**, **upload avatar**, or **host**.

## Decisions (answered)

| Question | Decision |
| --- | --- |
| Same Cognito pool for fans and staff? | **No** — **separate staff user pool** and staff SPA client; independent token stores in the browser. |
| Fan + staff session in one browser? | **Allow coexistence** — staff sign-out clears **staff** tokens only; fan hosting and guest **`sessionId`** continue unaffected. |
| Who enforces **`cognito:groups`**? | **Lambdas** (and future route guards) after API Gateway staff JWT validation; authorizer does **not** filter by group. |
| JWT on WebSocket? | **Required** for **publisher/admin** signaling paths (**`sub === hostSub`**); **guest** subscriptions may be **`sessionId`**-only if architecture keeps signaling separate—document chosen pattern in OpenAPI. |
| Admin role claims MVP? | **`cognito:groups`** on **staff** pool tokens (e.g. **`admin`**, **`curator`**); Lambdas read group membership from the authorizer context. **Custom JWT claims** for roles are **out of scope** until IAM/Cognito needs them. |

## Primary code pointers (optional)

- API Gateway authorizer ARNs; Cognito pool IDs in parameterized config.
