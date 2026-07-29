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

- **`POST /v1/rooms`** applies YouTube playable / video-id validation **only when `playbackHost` is `youtube`**.
- Custom-host create requires resolvable catalog row and validated **`customPlaybackUrl`**; **`youtubeVideoId` not required**.
- In-room host presentation loads Custom URLs in an iframe (not external-tab-only).

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

### Seed bundle migration

- Keep bundle **`version: 1`**. Backfill committed **`data/catalog/episodes.json`** entries with **`playbackHost: youtube`** and **`customPlaybackUrl: null`** so CI schema validation passes.

### Client surfaces (indicative)

- **`AdminCatalogForm.tsx`** — playback host selector and conditional fields.
- **`SoloWatchPage.tsx`** — host-aware player shell (YouTube vs generic iframe).
- **`hostSourceTab.ts`** — capture URL stays on RiffSync watch route for Custom.
- **`RoomPlaybackPanel.tsx` / `TheaterPlayback`** — host presentation iframe for Custom.

### Operations

- CSP must allow framing **HTTPS Custom origins** consistent with no domain allowlist at validation (**`operations/security.md`**).
- No new AWS services; URLs are Dynamo catalog fields served via existing CloudFront + SPA.

### Runtime versions

Follow repository **Node.js** and **TypeScript** versions from **`apps/web/package.json`**, **`infra/cdk`**, and CI workflows. No version change is required for this capability boundary.

## Testing Strategy

### Unit / contract

- **`catalog.schema.json`**: host-conditional validation (**custom** requires HTTPS **`customPlaybackUrl`**); **`maxLength: 2048`** on URL property; validate committed seed bundle after backfill.
- **`admin-catalog-validation`**: writable allowlist includes **`playbackHost`** / **`customPlaybackUrl`**; POST defaults; Custom HTTPS accept/reject matrix (missing URL, `http://`, over 2048 chars, valid HTTPS); PATCH host switch preserves cross-host fields; NFC normalization persisted.
- **`hostSourceTab`**: Custom rows resolve party-capture URL on RiffSync watch route.

### Integration

- Room create: YouTube-host rejects missing playable id; Custom-host succeeds with HTTPS URL and no YouTube id — **#392**.
- **`GET /v1/catalog`** / **`GET /v1/catalog/{id}`**: **`projectEpisode`** includes **`playbackHost`** (default **`youtube`** for legacy Dynamo rows) and **`customPlaybackUrl`** (**`null`** or HTTPS string).
- Admin POST Custom-host fixture → handler persists item → list/get handlers return projected fields (**`catalog-public-handlers.test.ts`** / **`admin-catalog-write-handlers.test.ts`**).
- **`apps/web`**: **`normalizeEpisode`** parses host fields; missing **`playbackHost`** defaults to **`youtube`** defensively.

### Manual / smoke

- Admin save YouTube vs Custom rows; solo watch iframe render for Custom HTTPS URL.
- Party capture tab share with Custom inner iframe.
- CSP smoke: Custom origin loads in iframe on staging/prod headers.

## References

- `.ai/business_logic/domain_model.md` — playback host enum, lawful playback invariant, discoverability
- `.ai/data/data_model.md` — catalog playback field group
- `.ai/data/serialization.md` — public catalog JSON fields
- `.ai/integration/api_contracts.md` — room create gate, public catalog exposure
- `.ai/integration/external_systems.md` — YouTube vs Custom vs WebRTC boundaries
- `.ai/interface/presentation.md` — admin form, solo watch, party capture, room presentation
- `.ai/operations/security.md` — CSP and Custom iframe framing
- `data/catalog/catalog.schema.json` — seed and admin validation schema
