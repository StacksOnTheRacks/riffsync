# Authorization

Who may do what, and how identity is represented. Aligns with **`docs/architecture.server.md`**, **`docs/architecture.frontend.md`**, **`architecture.admin.md`**.

## Identity modes

| Mode | Representation | Typical use |
| --- | --- | --- |
| **Anonymous guest** | Opaque **`sessionId`** (UUID) + **display name** in **`localStorage`** once the user crosses **lobby** or **joins `/room/:id`** (**lazy mint**); **`X-Session-Id`** + WS **`$connect`**. | **Browse**, **join**, **watch**, **chat**—**cannot** create rooms or publish WebRTC. |
| **Signed-in fan (host)** | **Cognito JWT** (**`sub`**, claims); Facebook or other IdP. | **Create room**, **room admin**, **PATCH** authoritative playback, **WebRTC publisher**; **`hostSub`** on room **=** **`sub`**. |
| **Staff / operator** | **Invite-only** Cognito **staff pool** or isolated **app client** + **JWT authorizer** on **`/v1/admin/*`**. | Catalog edits, curated lists, roster/API tools—not fan Facebook login. |

## Enforcement points

| Layer | Behavior |
| --- | --- |
| **HTTP** | JWT authorizers on **`/v1/admin/*`**; **`POST /v1/rooms`** and room-admin **`PATCH`/`PUT`** require **fan JWT** (**`sub`**); **`GET /v1/catalog`**, **`GET /v1/lobby`**, room **read/join** paths accept **`sessionId`** via **`X-Session-Id`** for anonymous guests. |
| **WebSocket** | **`$connect`**: **`roomId`** + **`sessionId`**; **publisher paths** additionally require **JWT** whose **`sub`** matches **`room.hostSub`** (authorizer or Lambda validation). Map **`connectionId → roomId`** (+ optional **`sub`** / **`sessionId`** metadata). |

## Rules (domain)

- **Room-admin authority:** only **`JWT.sub === room.hostSub`** may publish WebRTC signaling or mutate authoritative playback metadata.
- **Moderation:** target **`sessionId`** / **`connectionId`** for anonymous guests; **`sub`** for signed-in hosts (**`docs/architecture.admin.md`**).
- **Principle:** never require an IdP to **browse catalog**, **join**, **watch**, or **guest chat**; **do** require verified identity to **host**.

## Decisions (answered)

| Question | Decision |
| --- | --- |
| Same Cognito pool for fans and staff? | **Avoid** sharing tokens across trust boundaries—**prefer staff-only pool/client**. |
| JWT on WebSocket? | **Required** for **publisher/admin** signaling paths (**`sub === hostSub`**); **guest** subscriptions may be **`sessionId`**-only if architecture keeps signaling separate—document chosen pattern in OpenAPI. |
| Admin role claims MVP? | **`cognito:groups`** on **staff** pool tokens (e.g. **`admin`**, **`curator`**); Lambdas read group membership from the authorizer context. **Custom JWT claims** for roles are **out of scope** until IAM/Cognito needs them. |

## Primary code pointers (optional)

- API Gateway authorizer ARNs; Cognito pool IDs in parameterized config.
