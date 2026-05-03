# Domain model

Business concepts and rules (language-agnostic). UI maps here via **`docs/architecture.frontend.md`**.

## Core entities

- **Episode (catalog row):** a stable **`id`** and **`experimentNumber`**, MST-flavored **`title`/`era`**, YouTube linkage, enrichment from TMDB and optional YouTube thumb URL.
- **Room:** shared viewing session on **`/room/:id`** with a **mutable current catalog episode** ( **`catalogEpisodeId`** / **`videoId`** on the room document — seeded from how the room was opened, then changeable by the **room admin** via in-room picker); **room admin** renders **embedded YouTube** for that selection and may **publish** a captured **`MediaStream`** to guests over **WebRTC**; guests consume that stream—**not** parallel iframe timelines kept in sync server-side.
- **Participant:** **`sessionId`** + display name (**anonymous**) or **`sub`** (**signed-in optional**).
- **Room admin:** participant whose **`sessionId`** equals the room’s **`hostSessionId`** — **exclusive authority** to drive the **embedded player**, **start/stop broadcast capture**, and mutate durable room playback metadata. **Guest promotion** and token-based **admin reclaim** beyond “same browser **`sessionId`** came back” are **out of scope** for MVP.

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
| Guest promotion / admin reclaim token? | **Out of scope** MVP — admin is **`sessionId === hostSessionId`**; **lost admin** = timeout + ended room (**`error_state.md`**). |

- Domain services colocated with Lambda packages when implemented.
