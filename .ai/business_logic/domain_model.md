# Domain model

Business concepts and rules (language-agnostic). UI maps here via **`docs/architecture.frontend.md`**.

## Core entities

- **Episode (catalog row):** a stable **`id`** and **`experimentNumber`**, MST-flavored **`title`/`era`**, YouTube linkage, enrichment from TMDB and optional YouTube thumb URL.
- **Room:** shared viewing session on **`/room/:id`** with a **mutable current catalog episode** (**`catalogEpisodeId`** / **`videoId`** on the room document — seeded when the **signed-in** host creates the room, then changeable via **in-room picker**); the host (**room admin**) renders **embedded YouTube** for that selection and may **publish** a captured **`MediaStream`** to guests over **WebRTC**; guests consume that stream—**not** parallel iframe timelines kept in sync server-side.
- **Participant:** **`sessionId`** + display name (**anonymous**) or **`sub`** (**signed-in optional**) with optional **`avatarUrl`** (public HTTPS, one image per **`sub`**).
- **Chat message (ephemeral):** room-scoped broadcast with **`messageId`**, kind **`text`** | **`gif`**, sender identity, timestamp; **not** persisted server-side.
- **Chat reaction (ephemeral):** emoji on a **`messageId`**; toggle per signed-in sender; **not** persisted server-side.
- **Room admin:** signed-in participant whose **Cognito `sub`** equals the room’s **`hostSub`** — **exclusive authority** to drive the **embedded player**, **start/stop broadcast capture**, and mutate durable room playback metadata. **Anonymous users cannot host.** **Guest promotion** and token-based **admin reclaim** beyond normal Cognito re-login for the same user are **out of scope** for MVP.

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

- Domain services colocated with Lambda packages when implemented.
