# Catalog Playback Host

## Introduction

RiffSync catalog episodes can use either **YouTube** or **Custom** as the playback host. Staff choose the host per episode in admin; the SPA and room create flows branch on **`playbackHost`** while guest viewing stays on the existing **WebRTC tab-share** model.

**Audience:** staff curators (admin catalog form), signed-in hosts starting parties, and fans using solo watch.

**Related capabilities:** `catalog-browse-ia` (card actions and browse filters), `public-site-seo` (Custom-only `/watch/:id` sitemap exclusion), `viewer-local-cast` (no Custom iframe on TV receiver in MVP).

**Non-goals:** RiffSync rehosting/transcoding third-party video; YouTube IFrame API sync for Custom URLs; guest-direct load of Custom URLs; anonymous catalog writes; per-room playback host override at create time.

## Functional Specification

### Admin catalog

- Staff set **Playback host** to **YouTube** or **Custom** per episode.
- **YouTube path:** existing watch URL / video id fields; **`embedAllows`** gates YouTube in-app embed.
- **Custom path:** staff enter an **HTTPS** movie-page URL (**any domain**; staff policy: known embeddable pages only).
- YouTube enrichment fields **may coexist** on Custom rows; **`customPlaybackUrl` drives playback** when host is Custom.

### Public catalog and solo watch

- **`GET /v1/catalog`** exposes **`playbackHost`**, **`youtubeWatchUrl`**, and **`customPlaybackUrl`** (when set).
- **`/watch/:catalogEpisodeId`** uses YouTube iframe for YouTube-host rows and a **generic HTTPS iframe** for Custom-host rows.
- Party capture (**`?partyCapture=1`**) uses the same page; host shares the RiffSync capture tab via unchanged tab-share workflow.

### Room create and host presentation

- **`POST /v1/rooms`** applies YouTube video-id validation **only when resolved `playbackHost` is `youtube`** (non-empty id matching **`/^[a-zA-Z0-9_-]{11}$/`**; no live YouTube API probe; **`embedAllows` not checked**).
- Custom-host create requires resolvable catalog row and non-empty **`https://`** **`customPlaybackUrl`**; **`youtubeVideoId` not required**.
- Host **`PATCH /v1/rooms/{roomId}`** re-runs the same gate when **`catalogEpisodeId`** changes.
- Denormalize **`playbackHost`**, **`customPlaybackUrl`**, and optional **`youtubeVideoId`** onto the **Rooms** item; echo on **`GET`**, **`201`**, and **`PATCH` `200`**.
- In-room host presentation keeps the same source-tab/share flow as YouTube. Custom URLs load only in the RiffSync `/watch/:id?partyCapture=1` source tab, then reach guests through host WebRTC capture.

### Guests, Cast, SEO

- Guests watch **host WebRTC screen share**; they do not fetch Custom URLs directly.
- **Cast MVP:** continues **`host_screen` SFU consume**; Custom iframe on TV receiver is out of scope.
- **Custom-only** `/watch/:id` (no YouTube link) stays **excluded from sitemap/index** (same posture as no-YouTube rows today).

### Error semantics

- Iframe embed failure (X-Frame-Options): honest blocked UI; no product runtime fallback beyond staff embeddable-URL policy.
- Missing Custom URL at admin save or playback: validation or playback error per **`error_state.md`** patterns.

## Technical Specification

### Data shape

| Field | When | Notes |
| --- | --- | --- |
| **`playbackHost`** | Always (default **`youtube`** on legacy rows) | **`youtube`** \| **`custom`** |
| **`customPlaybackUrl`** | Required when host is **`custom`** | HTTPS only; **max 2048** chars after NFC; validated at admin save |
| **`youtubeVideoId`**, **`youtubeWatchUrl`** | Optional on Custom rows | May remain for thumbs/metadata |
| **`embedAllows`** | Optional boolean | **YouTube-path only** |

Schema authority: **`data/catalog/catalog.schema.json`** with **`if`/`then`** for host-conditional **`customPlaybackUrl`**.

### Public catalog projection (`catalog-shared.ts`)

| Field | Dynamo → public JSON | Semantics |
| --- | --- | --- |
| **`playbackHost`** | Always emitted | Read-time default **`youtube`** when attribute missing or not **`youtube`** \| **`custom`**. No Dynamo backfill job in M37 projection slice — legacy rows behave as YouTube on read until staff PATCH or seed re-import. |
| **`customPlaybackUrl`** | Always emitted as **`string \| null`** | Same visibility class as **`youtubeWatchUrl`** (not omit-when-null like **`embedAllows`**). Persist normalized HTTPS string from admin save when host is Custom; **`null`** for YouTube-host and legacy rows. |

**Export script:** **`infra/cdk/scripts/export-catalog-dynamodb-to-json.ts`** **`SCHEMA_FIELDS`** includes **`playbackHost`** and **`customPlaybackUrl`** so committed **`episodes.json`** mirrors Dynamo after operator export. Seed and table-copy scripts pass through validated/full items without host-specific logic.

**Admin write persistence:** POST/PATCH handlers persist the validated merged item (**`admin-catalog-validation`**, issue **#389**); projection tests assert Dynamo round-trip through **`GET /v1/catalog`** handlers.

### Admin save validation (`admin-catalog-validation.ts`)

| Layer | Responsibility |
| --- | --- |
| **Writable allowlist** | **`playbackHost`**, **`customPlaybackUrl`** added to **`ADMIN_WRITABLE_KEYS`**. |
| **POST defaults** | Missing **`playbackHost`** → **`youtube`**; missing **`customPlaybackUrl`** → **`null`**. Existing required POST keys (**`youtubeVideoId`**, **`youtubeWatchUrl`**, etc.) unchanged (nullable). |
| **PATCH merge** | Merge writable body onto existing row; default missing **`playbackHost`** on existing legacy rows to **`youtube`** before validation. **Preserve** cross-host fields when switching host unless PATCH explicitly sets them. |
| **AJV (`$defs.episode`)** | Enum, required keys, **`if`/`then`** Custom URL requirement, **`format: uri`**, **`^https://`**, **`maxLength: 2048`**. |
| **Lambda extras** | NFC-normalize **`customPlaybackUrl`** strings before length/scheme checks; persist normalized value. Reject over-length or non-HTTPS with detail **`customPlaybackUrl must be an HTTPS URL (max 2048 characters)`**. |

### Room create / patch gate (`catalog-room-playback-gate.ts`, issue **#392**)

| Concern | Contract |
| --- | --- |
| **Module** | Shared helper used by **`room-create.ts`** and **`room-patch.ts`** (episode-change branch). |
| **`readCatalogPlaybackHost(row)`** | Returns **`youtube`** \| **`custom`**; missing/invalid Dynamo → **`youtube`**. |
| **`validateCatalogRowForRoomSeed(row, catalogEpisodeId)`** | Returns success payload (**`playbackHost`**, **`customPlaybackUrl`**, optional **`youtubeVideoId`**) or failure **`code`**. |
| **YouTube-host gate** | Non-empty trimmed **`youtubeVideoId`** matching **`/^[a-zA-Z0-9_-]{11}$/`**; **no** YouTube API probe; **`embedAllows` ignored**. |
| **Custom-host gate** | Non-empty trimmed **`customPlaybackUrl`** starting with **`https://`**. |
| **Denormalization** | On success, **`room-create`** / **`room-patch`** persist **`playbackHost`**, **`customPlaybackUrl`**, optional **`youtubeVideoId`** on **Rooms**; **`room-get.ts`** echoes on snapshot. |
| **Lobby** | **`lobby-get.ts`** includes **`playbackHost`** on each listed room (optional **`youtubeVideoId`** unchanged). |
| **Deny codes** | **`catalog_episode_not_found`** (**404**); **`catalog_episode_youtube_id_missing`** / **`catalog_episode_custom_url_missing`** (**400**) — body **`{ code, error }`**. |

### Seed bundle migration

- Keep bundle **`version: 1`**. Backfill committed **`data/catalog/episodes.json`** entries with **`playbackHost: youtube`** and **`customPlaybackUrl: null`** so CI schema validation passes.

### Admin catalog form (`AdminCatalogForm.tsx`, issue **#391**)

| Concern | Contract |
| --- | --- |
| **Types** | Extend **`CatalogEpisodeFormValues`**, **`StaffCatalogEpisode`**, **`StaffCatalogEpisodeWrite`** with **`playbackHost`** and **`customPlaybackUrl`**. |
| **Load** | **`catalogEpisodeToFormValues`**: default missing **`playbackHost`** to **`youtube`**; map **`customPlaybackUrl`** to string (empty when null). |
| **Layout** | **Playback** fieldset after **Episode identity** — see **`.ai/interface/presentation.md`** → *Admin catalog playback host* (control order table). |
| **Create POST** | Body includes **`playbackHost`** (default **`youtube`**) and **`customPlaybackUrl`** (NFC-normalized HTTPS or **`null`**). Existing YouTube id/url derivation unchanged when watch URL present. |
| **Edit PATCH** | **`buildPatchBody`** diffs **`playbackHost`** and **`customPlaybackUrl`** against loaded episode; omit unchanged keys. Host toggle without URL edits still PATCHes **`playbackHost`** only. |
| **Client validation** | **`validateCatalogEpisodeForm`**: when **`playbackHost === 'custom'`**, require trimmed URL; NFC-normalize; enforce **`https:`** and max **2048** chars with message **`customPlaybackUrl must be an HTTPS URL (max 2048 characters)`**. YouTube host keeps optional watch URL validation. |
| **Server errors** | Map **`StaffCatalogValidationError`** **`/playbackHost`** and **`/customPlaybackUrl`** paths via existing **`mapValidationDetailsToFieldErrors`**. |
| **Out of scope** | **`AdminCatalogListPage`** playback-host column/badge (optional follow-up). |

### Solo watch and party capture (`SoloWatchPage`, issue **#393**)

| Concern | Contract |
| --- | --- |
| **Module split** | **`SoloCustomIframePlayer`** (`apps/web/src/components/watch/SoloCustomIframePlayer.tsx`) for Custom-host rows; **`SoloYouTubePlayer`** unchanged for YouTube-host. |
| **Page shell** | **`SoloWatchPage.tsx`** branches on **`episode.playbackHost`** (default **`youtube`** when missing). Custom gate: trimmed **`https://`** **`customPlaybackUrl`**; **`embedAllows`** does not apply. YouTube gate unchanged. |
| **Layout CSS** | Reuse **`.riffsync-solo-player`**, **`.riffsync-solo-player__frame`**, **`.riffsync-solo-player__chrome`** — existing party-capture flex rules apply to **`.riffsync-solo-player__frame`**. |
| **Iframe attrs** | **`src={customPlaybackUrl}`**, **`title={episode.title}`**, **`allow="autoplay; fullscreen; encrypted-media"`**. **No **`sandbox`** attribute** (partner players need full script/same-origin behavior; see **`operations/security.md`**). **No** per-iframe **`referrerpolicy`** — inherit CloudFront **`strict-origin-when-cross-origin`**. |
| **Blocked states** | Missing URL and embed failure copy per **`error_state.md`** and **`presentation.md`** *Decisions (M37 — solo watch Custom iframe — #393)*. |
| **`hostSourceTab.ts`** | Extend catalog pick with **`playbackHost`**. Custom → always **`{origin}/watch/{id}?partyCapture=1`**; **`hostSourceOpensOnYoutube`** false. |

### In-room host source-tab flow (`RoomPlaybackPanel`, issue **#394**)

| Concern | Contract |
| --- | --- |
| **Host surface** | **`RoomPlaybackPanel`** publisher branch inside **`riffsync-room-page__player-shell`** shows the same **Open Source Tab** / **Share Source Tab** controls for Custom as for YouTube. |
| **Custom render** | Do **not** render **`SoloCustomIframePlayer`** inside the room. Custom playback belongs to the opened `/watch/:id?partyCapture=1` source tab. |
| **Capture precedence** | When host **`captureStream`** is active, show capture preview **`<video>`**. When inactive, show source-tab share controls. |
| **Playback source** | Room snapshot mirrors **`playbackHost`**, **`customPlaybackUrl`** (**#392**) for durable room state and retarget diffing. The host source tab resolves to `/watch/:id?partyCapture=1`; that watch route loads the catalog playback URL. |
| **Snapshot diff** | **`pickRoomSnapshotMediaFields`** and **`useRoomMediaEngine`** diff key include **`playbackHost`** and **`customPlaybackUrl`** so episode retarget refreshes durable media state without session remount. |
| **Guest branch** | Unchanged SFU **`host_screen`** **`<video>`** — no Custom URL chrome. |
| **TheaterPlayback** | WebRTC audio/video binding only. Custom iframe playback is owned by the `/watch/:id?partyCapture=1` source tab, not **`RoomPlaybackPanel`** or **`setYoutubeMountElement`**. |

### Public catalog browse and card actions (`catalogPlayback.ts`, issue **#396**)

| Concern | Contract |
| --- | --- |
| **Module** | **`apps/web/src/catalog/catalogPlayback.ts`** — **`readCatalogPlaybackHost`**, **`episodeIsPlayableInApp`**, **`catalogEntriesPlayableInApp`**. |
| **Custom playable** | **`playbackHost === 'custom'`** + trimmed **`customPlaybackUrl`** starts with **`https://`**. |
| **YouTube playable (browse)** | Default/missing host + non-empty trimmed **`youtubeVideoId`** (successor to **`episodeHasYoutubeLink`**). **`embedAllows`** not used for browse inclusion. |
| **Tile actions** | **`EpisodeTileActions`**: enable **Watch Solo** (`/watch/:id`) and **Start Party** (`POST /v1/rooms` via **`createRoom`**) when playable; **disabled** when not. Requires **#390** client types and **#392** room gate for Custom **Start Party**. |
| **Surfaces** | **`CatalogPage`** hub grid, **`HomePage`** carousel/spotlight/era/popularity strips; M32 subcategory shells reuse the same helper when routed. |
| **Card copy** | YouTube-only **`embedAllows`** advisory on **`CatalogGridCard`**; host-aware empty-catalog message per **`presentation.md`**. |
| **Out of scope** | Public playback-host badge; SEO sitemap indexability (**#397** — separate **`catalogSeo.ts`** helper). |

### Public site SEO indexability (`catalogSeo.ts`, issue **#397**)

| Concern | Contract |
| --- | --- |
| **Module** | **`apps/web/src/catalog/catalogSeo.ts`** — **`readCatalogPlaybackHost`**, **`episodeIsIndexableForSeo`**, **`catalogEntriesIndexableForSeo`**. |
| **Not playable helper** | Distinct from **`episodeIsPlayableInApp`** (**#396**). Custom-host rows may be playable in-app but **never** SEO-indexable. |
| **Predicate** | Exclude all **`playbackHost === 'custom'`** rows from sitemap/prerender. Include YouTube-host (or legacy default) rows with non-empty trimmed **`youtubeVideoId`**. Optional YouTube metadata on Custom rows does **not** restore indexability. |
| **Consumers** | **`generateSeoArtifacts.ts`**, SEO build/verify/prerender scripts. |
| **Tests** | **`catalogSeo.test.ts`** + extended **`generateSeoArtifacts.test.ts`**. |

### Other client surfaces (indicative)

- **`hostSourceTab.ts`** — capture URL stays on RiffSync watch route for Custom (tests in **#393**).
- **`RoomPlaybackPanel.tsx` / `TheaterPlayback`** — host source-tab controls for Custom and unchanged WebRTC relay (**#394**).

### Operations (CSP — issue **#395**)

| Concern | Contract |
| --- | --- |
| **Module** | **`infra/cdk/lib/static-site-stack.ts`** → **`WebResponseHeadersPolicy`** **`contentSecurityPolicy`** string array. |
| **`frame-src` / `child-src`** | Append scheme source **`https:`** before existing YouTube hostnames: **`frame-src https: https://www.youtube.com https://www.youtube-nocookie.com`**; **`child-src https: https://www.youtube.com https://www.youtube-nocookie.com`**. Permits any HTTPS Custom origin; blocks **`http:`** framing. |
| **Meta CSP** | **Out of scope** — CloudFront response headers only. |
| **Other directives** | Unchanged — do not widen **`script-src`**, **`connect-src`**, or unrelated tokens. |
| **Tests** | Extend **`static-site-stack.test.ts`** to assert **`frame-src`** and **`child-src`** include **`https:`** and retain YouTube hostnames. |
| **Smoke** | After deploy, representative staff embeddable Custom URL loads in solo watch and party-capture iframe without CSP console violations. |

- No new AWS services; URLs are Dynamo catalog fields served via existing CloudFront + SPA.

### Runtime versions

Follow repository **Node.js** and **TypeScript** versions from **`apps/web/package.json`**, **`infra/cdk`**, and CI workflows. No version change is required for this capability boundary.

## Testing Strategy

### Unit / contract

- **`static-site-stack.test.ts`**: **`frame-src`** and **`child-src`** CSP strings include **`https:`** scheme source and retain **`https://www.youtube.com`** / **`https://www.youtube-nocookie.com`** (**#395**).
- **`admin-catalog-validation`**: writable allowlist includes **`playbackHost`** / **`customPlaybackUrl`**; POST defaults; Custom HTTPS accept/reject matrix (missing URL, `http://`, over 2048 chars, valid HTTPS); PATCH host switch preserves cross-host fields; NFC normalization persisted.
- **`validateCatalogEpisodeForm`** / **`AdminCatalogForm.test.tsx`**: Custom URL required when host Custom; rejects `http://` and over-2048 NFC length; accepts valid HTTPS; create POST includes host fields; edit PATCH sends **`playbackHost`** on toggle without clearing YouTube fields in body; host-switch preserves form state; **`embedAllows`** still PATCHable on Custom rows.
- **`staffAdminCatalogApi`**: types include host fields on **`StaffCatalogEpisode`** / write body.
- **`hostSourceTab`**: Custom **`playbackHost`** rows resolve party-capture URL on RiffSync watch route; **`hostSourceOpensOnYoutube`** false (**#393**).
- **`SoloCustomIframePlayer`** / **`SoloWatchPage.test.tsx`**: Custom-host iframe **`src`** and **`title`**; missing URL blocked copy; YouTube-host regression unchanged (**#393**).
- **`RoomPlaybackPanel.test.tsx`**: host Custom source-tab controls when **`!captureStream`**; capture preview **`<video>`** when **`captureStream`** active; guest branch unchanged (**#394**).
- **`roomSnapshotDiff`**: diff key includes **`playbackHost`** and **`customPlaybackUrl`**; episode retarget triggers engine apply (**#394**).
- **`catalogPlayback.test.ts`**: Custom HTTPS / missing URL; YouTube id / empty id; legacy missing **`playbackHost`** defaults **`youtube`**; **`catalogEntriesPlayableInApp`** filter.
- **`catalogSeo.test.ts`**: Custom-host excluded from indexable set; Custom + **`youtubeVideoId`** still excluded; YouTube-host + id included (**#397**).
- **`generateSeoArtifacts.test.ts`**: sitemap XML omits Custom-host watch **`<loc>`** (**#397**).
- **`EpisodeTileActions.test.tsx`**: playable Custom + YouTube rows enable actions; missing Custom URL disables both; **Start Party** still requires fan JWT (existing auth path).
- **`CatalogPage`** / **`HomePage`** tests: Custom-host fixture appears in grid/rows; empty copy uses host-aware string.

### Integration

- **`catalog-room-playback-gate`**: unit matrix for **`readCatalogPlaybackHost`** legacy default; YouTube id shape; Custom HTTPS prefix; missing row vs missing URL codes.
- **`room-create.test.ts`**: YouTube-host success; YouTube missing id → **400** **`catalog_episode_youtube_id_missing`**; Custom success without **`youtubeVideoId`**; Custom missing URL → **400** **`catalog_episode_custom_url_missing`**; unknown id → **404** **`catalog_episode_not_found`**; **`201`** body includes **`playbackHost`** / **`customPlaybackUrl`**.
- **`room-patch.test.ts`**: episode change to Custom and YouTube rows; same deny codes; **`200`** echoes refreshed playback mirrors.
- **`room-get.test.ts`**: snapshot includes playback mirrors for Custom and YouTube fixtures.
- Room create: YouTube-host rejects missing playable id; Custom-host succeeds with HTTPS URL and no YouTube id — **#392**.
- **`GET /v1/catalog`** / **`GET /v1/catalog/{id}`**: **`projectEpisode`** includes **`playbackHost`** (default **`youtube`** for legacy Dynamo rows) and **`customPlaybackUrl`** (**`null`** or HTTPS string).
- Admin POST Custom-host fixture → handler persists item → list/get handlers return projected fields (**`catalog-public-handlers.test.ts`** / **`admin-catalog-write-handlers.test.ts`**).
- **`apps/web`**: **`normalizeEpisode`** parses host fields; missing **`playbackHost`** defaults to **`youtube`** defensively.

### Manual / smoke

- Staff admin UI: create YouTube-host and Custom-host episodes; edit host toggle retains opposite URL in form; reload edit shows persisted host + URLs from **`GET /v1/admin/catalog/episodes/:id`**.
- Solo watch: Custom-host **`/watch/:id`** shows generic HTTPS iframe; missing URL shows blocked copy; known non-embeddable origin shows escape link (**#393**).
- Party capture: **`/watch/:id?partyCapture=1`** with Custom host stretches iframe in capture layout; document title and banner unchanged (**#393**).
- In-room host: Custom-host room shows **Open Source Tab** / **Share Source Tab** before capture; after **Share Source Tab**, guests receive WebRTC capture and host sees preview **`<video>`** (**#394**).
- CSP smoke (**#395**): after CloudFront deploy, open Custom-host **`/watch/:id`** and **`?partyCapture=1`** — iframe loads staff embeddable HTTPS origin; browser devtools show no **`frame-src`** CSP violations; YouTube-host watch still frames YouTube.

## References

- `.ai/business_logic/domain_model.md` — playback host enum, lawful playback invariant, discoverability
- `.ai/data/data_model.md` — catalog playback field group
- `.ai/data/serialization.md` — public catalog JSON fields
- `.ai/integration/api_contracts.md` — room create gate, public catalog exposure
- `.ai/integration/external_systems.md` — YouTube vs Custom vs WebRTC boundaries
- `.ai/interface/presentation.md` — admin form, solo watch, party capture, room presentation
- `.ai/operations/security.md` — CSP and Custom iframe framing
- `data/catalog/catalog.schema.json` — seed and admin validation schema
