# Domain model

Business concepts and rules (language-agnostic). UI maps here via **`docs/architecture.frontend.md`**.

## Core entities

- **Episode (catalog row):** a stable **`id`** and **`experimentNumber`**, MST-flavored **`title`/`era`**, YouTube linkage, enrichment from TMDB and optional YouTube thumb URL.
- **Room:** shared viewing session on **`/room/:id`** with a **mutable current catalog episode** (**`catalogEpisodeId`** / **`videoId`** on the room document — seeded when the **signed-in** host creates the room, then changeable via **in-room picker**); the host (**room admin**) renders **embedded YouTube** for that selection and may **publish** a captured **`MediaStream`** to guests over **WebRTC**; guests consume that stream—**not** parallel iframe timelines kept in sync server-side.
- **Participant:** **`sessionId`** + display name (**anonymous**) or **`sub`** (**signed-in optional**) with optional **`avatarUrl`** (public HTTPS, one image per **`sub`**).
- **Chat message (ephemeral):** room-scoped broadcast with **`messageId`**, kind **`text`** | **`gif`**, sender identity, timestamp; **not** persisted server-side.
- **Chat reaction (ephemeral):** emoji on a **`messageId`**; toggle per signed-in sender; **not** persisted server-side.
- **Room admin:** signed-in participant whose **fan-pool Cognito `sub`** equals the room’s **`hostSub`** — **exclusive authority** to drive the **embedded player**, **start/stop broadcast capture**, and mutate durable room playback metadata. **Anonymous users cannot host.** **Guest promotion** and token-based **admin reclaim** beyond normal Cognito re-login for the same user are **out of scope** for MVP.
- **Operator (staff):** invite-only principal in the **staff** Cognito pool, provisioned **out-of-band** (console, CLI, or IaC). When authorized, carries **`cognito:groups`** including **`admin`** and/or **`curator`**. **Distinct** from **Participant** and **Room admin** — operator identity does **not** grant fan **`hostSub`** authority, room publisher role, or participant chat identity unless the same person also holds a separate **fan** session.

## Identity modes and trust boundary

Three coexisting modes (see **`integration/authorization.md`**):

| Mode | Pool / credential | Satisfies |
| --- | --- | --- |
| **Anonymous guest** | **`sessionId`** (no JWT) | Public catalog read, guest room join, chat read |
| **Signed-in fan (host-capable)** | **Fan** pool JWT | Room create/host, publisher paths, chat send/react, avatar |
| **Operator (staff)** | **Staff** pool JWT | **`/v1/admin/*`** only in this slice |

**Rules:**

1. **Separate pools:** Staff tokens **must not** satisfy fan-gated routes. Fan tokens **must not** satisfy **`/v1/admin/*`**.
2. **Dual sessions:** Fan and staff sessions **may coexist** in one browser with **separate token stores**; authorities do **not** merge (signing in as operator does not make someone room admin, and hosting as fan does not grant admin API access).
3. **Invite-only staff:** No self-service operator registration in MVP; group assignment is out-of-band.
4. **Group gate (MVP auth slice):** Valid staff JWT with **`admin`** **or** **`curator`** suffices for admin API probe routes; **no route-level split** between those groups until catalog/list handlers ship.
5. **Room domain unchanged:** **Room admin** remains **`JWT.sub === hostSub`** on the **fan** pool only. Staff auth does not add operator room takeover or bypass **lost admin / stale room** rules.

## Enumerations

- **`playbackExpectation`:** **`premium`** | **`free-ad-supported`** — **advisory**; not verified subscription state.

## Invariants

1. **Lawful playback:** app never hosts MST episode files as a communal CDN; the **admin** uses **official embeds** (or future lawful backends), and guests receive **browser-mediated realtime media** derived from that viewing surface—not a separate licensed file library operated by RiffSync.
2. **Admin control:** guests cannot assume **publisher** role or change **authoritative** room metadata (except leave room / chat per policy).
3. **Catalog title:** never replaced by TMDB **`title`** / **`original_title`**.
4. **Public catalog read** does not require authentication.

## Decisions (answered)

| Question | Decision |
| --- | --- |
| Vote-to-skip ads? | **Out of scope** — no server-side ad manipulation. |
| Multiple simultaneous episodes in one room / split-screen? | **Out of scope** MVP — **one stream / one current episode** at a time; **switching** that episode **in-session** **is** in scope for the room admin. |
| Guest promotion / admin reclaim token? | **Out of scope** MVP — admin is **`JWT.sub === hostSub`**; **lost admin** = timeout + ended room (**`error_state.md`**). |
| GIF provider? | **Giphy** — server search, Giphy CDN renditions in chat; no RiffSync-hosted GIF uploads. |
| Anonymous reactions? | **No** — reactions require fan JWT (same gate as send). |
| Avatar visibility? | **Public HTTPS** URLs so anonymous guests can render avatars in chat. |
| Staff vs room admin? | **Separate** — operator identity does not grant room admin; room admin remains fan **`JWT.sub === hostSub`**. |
| Operator onboarding (MVP)? | **Invite-only** — manual Cognito console invite and group assignment acceptable; no in-app “request access” flow. |
| `admin` vs `curator` on routes? | **Deferred** until catalog/list handlers — auth slice treats either group as authorized for staff API probe. |
| Operator moderation of rooms? | **Out of scope** for auth slice; when it ships, remains a **staff** capability separate from **room admin** capture authority. |

- Domain services colocated with Lambda packages when implemented.
