# Official Live Channels

## Introduction

RiffSync hosts **official Live channels**: durable, hostless watch surfaces at **`/live/:slug`** where every viewer loads the same staff-bound YouTube live embed locally and shares room chat. Channels are not user-created watch parties. There is no room admin, no Share Source Tab, and no SFU **`host_screen`** movie path.

**Audience:** fans joining a continuous live hangout; staff curators who keep the YouTube live id current via catalog admin; maintainers extending additional slugs later.

**Related capabilities:** `catalog-playback-host` (YouTube embed playback and **`embedAllows`**); `catalog-browse-ia` (public catalog omit rules); `public-site-seo` (indexable **`/live/:slug`** packaging); friends/DM remain orthogonal (fan JWT social plane).

**Non-goals (v1):** Live-channels admin CRUD UI; Live hub listing many channels; participant A/V on Live surfaces; Cast on Live; promoting a Live channel into a host-tab-share watch party; server-side rehost/transcode of the live feed; indexing **`catalog: live`** rows as normal **`/watch/:id`** catalog landings.

## Functional Specification

### Public route and nav

| Surface | Contract |
| --- | --- |
| **Route** | **`/live/:slug`**, where **`slug`** is the **`catalog: live`** episode id. |
| **Main nav** | Header links to **Lobby**; there is no separate **Live** nav item. |
| **Discovery** | Official Live channels are listed dynamically from **`catalog: live`** rows on the public **`/lobby`** above host-created parties with a red live indicator. They are **not** listed on **`/catalog`**, subcategory grids, or home carousel/spotlight. |

### Hostless live party mode

| Concern | Contract |
| --- | --- |
| **Playback** | Every joiner loads the bound catalog episode’s **YouTube iframe** locally (guest-local embed). Sync comes from the live stream itself. |
| **No host** | No **`hostSub`** authority, no Open/Share Source Tab, no host control bar, no durable **`roomMode`** / **`avDisabled`** / **`broadcastCaptureActive`** UX on this surface. |
| **No SFU movie** | Guests do **not** consume **`host_screen`**. SFU is unused for the Live movie path in v1. |
| **Chat** | Same **RoomChat** plane as watch-party rooms: same TTL, rate limits, GIF/reaction rules. |
| **Members** | Signed-in fans may **send** chat, react, and type (existing fan JWT gates). |
| **Anonymous** | May **watch** and **read** chat; compose shows existing **Sign In to Chat** posture; cannot send, react, or type. |
| **People / Friends / A/V** | v1 may omit participant A/V toggles and keep chrome chat-primary. Friends/DM remain available only where fan JWT chrome already allows (optional; not required for Live acceptance). |

### Catalog category `live`

| Concern | Contract |
| --- | --- |
| **Enum** | Persisted **`catalog`** gains **`live`**. |
| **Admin** | Staff create/edit Live **source episodes** in admin catalog (category filter **Live**). Same episode form fields as YouTube-host rows (**`youtubeVideoId`**, **`embedAllows`**, artwork, title). |
| **Public catalog** | **`live`** is **never** shown on hub, subcategory routes, Catalog nav dropdown, or public title grids — same posture as staff-only **`other`**. |
| **Home** | Live rows must not appear in carousel/spotlight even if flags are set (treat as non-public library rows). |
| **Start party** | Public “start watch party” / create-room tile flows are **not** offered for Live rows. |
| **Helper copy (admin)** | Live sources are not shown on public catalog pages; bind them to a Live channel registry entry to publish at **`/live/:slug`**. |

### Live channel catalog rows

A **`catalog: live`** row maps URL slug → playback + chat partition. The catalog episode **`id`** is the public slug and the stable chat room id is derived as **`live-{id}`**.

| Field | Role |
| --- | --- |
| **`id`** | URL key and catalog episode id (for example **`mst3k-forever-a-thon`**). |
| **`roomId`** | Stable derived **system** room id for RoomChat / RoomPresence: **`live-{id}`**. |
| **`catalog`** | Must be **`live`** to publish under **`/live/{id}`**. |
| **SEO title / description** | Derived from the catalog episode **`title`** / **`tagline`**. |

**Day-to-day ops:** staff publish a Live channel by creating or editing a **`catalog: live`** episode. When the YouTube live id rotates, staff **Admin → Catalog → Live → edit episode → save**. No code deploy is required.

**Later:** explicit publish/draft, sort order, or custom slug fields if staff need private Live drafts or custom ordering.

### SEO and `/watch` boundary

| Surface | Contract |
| --- | --- |
| **`/live/:slug`** | **Indexable** when the channel is enabled and bound to a playable YouTube-host Live episode. Sitemap, prerender, canonical, and OG/Twitter tags apply. |
| **`catalog: live` `/watch/:id`** | **Not** a primary SEO landing. Prefer **redirect** to the bound **`/live/:slug`** when a registry binding exists; otherwise honest unavailable / not in sitemap. **`episodeIsIndexableForSeo`** must **not** treat Live-category rows as normal watch landings. |
| **Contrast** | User-created **`/room/:roomId`** remains **`noindex`**. Official Live is durable public content, not ephemeral party state. |

### System room lifecycle

| Concern | Contract |
| --- | --- |
| **Create** | System **`roomId`** is seeded or ensured on first join / deploy — not via fan **`POST /v1/rooms`**. |
| **Lobby** | Official Live rooms are **not** subject to host-disconnect lobby hide (**`HOST_DISCONNECT_GRACE_MS`**) or stale-host sweeper removal. They appear as official Live entries, not ordinary host-created lobby parties. |
| **Chat retention** | Reuse existing RoomChat TTL and rate limits; no special permanent transcript class in v1. |

## Technical Specification

### Resolution flow

1. Fan opens **`/live/:slug`** (or follows a Lobby Live entry).
2. Client/API resolves the catalog row by **`id === slug`**.
3. If missing/disabled → honest unavailable status.
4. Load catalog episode by **`catalogEpisodeId`**; require **`catalog === live`**, YouTube playback fields, and embeddable posture (**`embedAllows !== false`**).
5. Render YouTube iframe from episode **`youtubeVideoId`** (or agreed live embed URL shape).
6. Join system **`roomId`** over the existing room WebSocket with lazy **`sessionId`** for guests; fan JWT for send paths.
7. ChatSession behavior matches room chat; TheaterPlayback is **local iframe only** (no host capture compartment).

### Data and admin touchpoints

| Layer | Change |
| --- | --- |
| **Schema** | **`data/catalog/catalog.schema.json`** **`catalog`** enum adds **`live`**. |
| **Client types** | **`CatalogCategory`** / **`CATALOG_CATEGORIES`** / labels add Live; **`PUBLIC_CATALOG_CATEGORIES`** stays without **`live`**. |
| **Admin form** | Category select includes **Live**. |
| **Public filters** | Hub mixed grid and subcategory filters exclude **`live`** (and continue to exclude **`other`**). |
| **Live list API** | **`GET /v1/live`** lists **`catalog: live`** rows as official Live channels. |
| **SEO** | Add **`catalog: live`** ids to dynamic **`/live/{id}`** sitemap/prerender output; keep them out of **`/watch/{id}`**. |

### Authorization

| Actor | Live surface |
| --- | --- |
| **Anonymous guest** | Join system room; watch embed; read chat; **no** send/react/typing. |
| **Signed-in fan** | Same watch + full room-chat send surface (existing gates). |
| **Room admin** | **N/A** — hostless mode. |
| **Staff** | Curate **`catalog: live`** episodes via **`/v1/admin/*`**; v1 registry edits are deploy/seed, not staff API. |

### Error / empty states

| Condition | UX |
| --- | --- |
| Unknown slug | Not found / unavailable (no soft fall-through to catalog). |
| Disabled channel | Honest **channel unavailable** copy. |
| Missing episode or non-**`live`** binding | Staff misconfig; honest unavailable. |
| **`embedAllows === false`** or missing **`youtubeVideoId`** | Honest playback blocked; staff fix via catalog. |
| Chat plane down | Existing chat drawer status; video iframe may continue. |

## Acceptance Criteria

- Lobby lists **`catalog: live`** rows as **`/live/{id}`** entries with a red live indicator.
- Anonymous viewer sees YouTube live embed and can read chat; cannot send.
- Signed-in fan can send chat under existing RoomChat rules.
- No Share Source Tab / host controls on the Live page.
- Admin can create an episode with **`catalog: live`**; it does not appear on public catalog hub/subcategory grids.
- Editing the bound episode’s **`youtubeVideoId`** updates Live playback without changing the slug.
- **`/live/{id}`** is indexable (sitemap + prerender + non-**`noindex`** head tags) for **`catalog: live`** rows.
- Live-category episodes are excluded from normal **`/watch/:id`** sitemap indexability.
- System live room is not removed by host-disconnect lobby cleanup.

## Open implementation decisions

| Topic | Notes |
| --- | --- |
| Live ordering | Current ordering follows catalog **`experimentNumber`**; add a Live-specific sort field if needed. |
| Draft/private Live rows | Current contract treats **`catalog: live`** as published; add a publish flag if staff need drafts. |
| Ensure-room API | Dedicated **`GET /v1/live/:slug`** vs reuse room GET after seed. |
| CloudFront rewrite | Confirm clean **`/live/{slug}`** → prerender key pattern alongside existing catalog/watch rules. |

## Related docs

- `.ai/business_logic/domain_model.md` — LiveChannel entity, hostless mode, discoverability
- `.ai/business_logic/user_stories.md` — Live join / chat / staff curation stories
- `.ai/data/data_model.md` — **`catalog: live`**, LiveChannel registry
- `.ai/interface/presentation.md` / **`interaction_flow.md`** — nav, Live shell, head tags
- `.ai/integration/authorization.md` / **`api_contracts.md`** — guest vs fan on Live
- `.ai/specs/public-site-seo.spec.md` / **`catalog-browse-ia.spec.md`** — indexable Live vs omitted catalog category
- `.ai/operations/build_packaging.md` — sitemap/prerender packaging for Live slugs
