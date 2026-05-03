# Authorization

Who may do what, and how identity is represented. Aligns with **`docs/architecture.server.md`**, **`docs/architecture.frontend.md`**, **`architecture.admin.md`**.

## Identity modes

| Mode | Representation | Typical use |
| --- | --- | --- |
| **Anonymous** | Opaque **`sessionId`** (UUID) + **display name** in **`localStorage`** once the user crosses a **server-participant** boundary (**lobby / room create / room join**); sent on WS + room HTTP. | Room guest, anonymous room admin; **not** required for **catalog-only** browsing (**lazy mint**). |
| **Signed-in viewer (optional)** | **Cognito JWT** (**`sub`**, groups/claims); Facebook federation. | Cross-device persona, stronger room-admin binding if product requires it. |
| **Staff / operator** | **Invite-only** Cognito **staff pool** or isolated **app client** + **JWT authorizer** on **`/v1/admin/*`**. | Catalog edits, curated lists, roster/API tools—not fan Facebook login. |

## Enforcement points

| Layer | Behavior |
| --- | --- |
| **HTTP** | JWT authorizers on **admin** routes; public catalog/list reads **open**; room/lobby routes accept **`sessionId`** via **`X-Session-Id`** header (preferred) **or** JSON body field where `POST` bodies are natural; **optional** viewer JWT on routes that opt in—**MVP room-admin** checks stay **`sessionId` vs `hostSessionId`**. |
| **WebSocket** | **`$connect`**: validate **`roomId`** exists or join rules; attach **connectionId → roomId** mapping; **room-admin** publisher actions verified against **`hostSessionId`** on the room item (**optional** future: bind **`sub`** to admin). |

## Rules (domain)

- **Room-admin authority:** only the **current room admin** (per room document) may assume **publisher** role messages and mutate authoritative playback metadata; server validates **`sessionId === hostSessionId`** before relay or durable writes.
- **Moderation:** target **sessionId** or **connectionId** for anonymous; **`sub`** when signed-in (**`docs/architecture.admin.md`**).
- **Principle:** never require Facebook (or any IdP) to **read catalog** or **start playback from the catalog** (rooms remain reachable anonymously).

## Decisions (answered)

| Question | Decision |
| --- | --- |
| Same Cognito pool for fans and staff? | **Avoid** sharing tokens across trust boundaries—**prefer staff-only pool/client**. |
| JWT on WebSocket? | **Optional** MVP; anonymous **`sessionId`** allowed; upgrade path documented in API contracts. |
| Admin role claims MVP? | **`cognito:groups`** on **staff** pool tokens (e.g. **`admin`**, **`curator`**); Lambdas read group membership from the authorizer context. **Custom JWT claims** for roles are **out of scope** until IAM/Cognito needs them. |

## Primary code pointers (optional)

- API Gateway authorizer ARNs; Cognito pool IDs in parameterized config.
