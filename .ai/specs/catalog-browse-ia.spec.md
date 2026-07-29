# Catalog Browse Information Architecture

## Introduction

Fans browse the RiffSync catalog through a hub at `/catalog` plus four dedicated subcategory routes so each browse intent (MST3K host catalogs, Community, Riff Material, Movie Night) has a stable URL and a shared page shell. This capability defines the public catalog information architecture: navigation, hub vs subcategory responsibilities, display grouping of existing `catalog` values, and the Riff Material label/slug mapping. It does not redefine catalog data storage or invent a new HTTP API.

**Audience:** public fans discovering titles; maintainers extending subcategory pages in later milestones.

**Related capabilities:** `public-site-seo` (indexable route matrix, sitemap/prerender/head tags for these paths); `catalog-playback-host` (Custom-host card actions and in-app watch when `customPlaybackUrl` is set); `viewer-local-cast` (unrelated presentation layer).

**Non-goals:** per-subcategory visual redesign beyond the shared Streamlab-style header + subtitle + title-search/sort + title grid; admin/operator catalog tooling changes; API or persisted `catalog` enum renames; watch-party, lobby, or SEO packaging (M33 owns sitemap/prerender/head tags for subcategory routes).

## Functional Specification

### Routes and responsibilities

| Route | Browse responsibility |
| --- | --- |
| `/catalog` | Hub: four large text entry links (no imagery) in the page-header subtitle slot above title-search / sort and the mixed/all-titles catalog grid; no public catalog-chip toggles. |
| `/catalog/mst3k` | Filtered grid for `catalog` = `mst3k`. Header subtitle: **`"Push the button, Frank"`**. Renders **Era** and **Season** tag pill groups derived from loaded **in-app playable** rows (**`catalogEntriesPlayableInApp`**, **#396**; includes Custom-host with valid HTTPS URL). No Joel/Mike/Jonah/Emily catalog-enum chips. Multiple selections within one namespace OR together; Era and Season combine with AND; title/tag/label search combines with AND against selected pills. |
| `/catalog/community` | Filtered grid for `catalog` = `community`. Header subtitle: **Community Made Riffs**. |
| `/catalog/riff-material` | Filtered grid for `catalog` = `riff_material`; public label **Riff Material**. Header subtitle: **Cheesy Flicks Ready to Riff**. |
| `/catalog/movie-night` | Filtered grid for `catalog` = `movie_night`. Header subtitle: **Pull the Family Together for a Movie Night**. |

Staff-only `other` never appears on hub links, nav dropdown items, or public subcategory grids.

### Navigation

Main-nav **Catalog** remains a navigable link to the `/catalog` hub and exposes a dropdown to the four subcategory destinations in order **MST3K → Community → Riff Material → Movie Night** (display names only; no helper microcopy). On narrow viewports, Catalog expands as an **inline accordion** inside the existing hamburger `navbar-collapse` (not a nested flyout, not hover-only). Hub entry links use the same order and labels.

### Subcategory page shell

Each subcategory page uses a shared shell: page header with category display name as H1, the route-fixed subtitle listed above, the same title-search and sort chrome as the hub (scoped to the route-fixed `catalogs` set), then the existing title/card grid pattern. Per-subcategory visual customization is deferred to later milestones; routes and nav stay stable so later customization does not redo IA.

### Naming

Public UI shows **Riff Material**. Route slug is `riff-ready`. Persisted and wire `catalog` value remains `riff_material` (see data contracts).

### Access and empty states

All hub and subcategory routes are public and require no authentication (same posture as today's catalog browse). An empty filtered grid uses the existing empty-catalog presentation; no new error class.

### Discoverability

The hub and four subcategory routes are part of the public discoverable (indexable) surface. Sitemap, prerender, and per-route head tags follow `public-site-seo` and operations build packaging (M33 packaging work is out of scope for this capability's M32 delivery).

## Technical Specification

**Stack:** `apps/web` fan SPA (React 19.2, Vite 8, react-router-dom 7) under SiteLayout; no new backend service.

**Data flow:** Runtime catalog rows continue to load via public `GET /v1/catalog`. Subcategory pages apply client-side `filterCatalogEntries({ catalogs })` with a route-fixed `catalogs` constant (single value or the MST3K four-value union). Hub mixed grid uses no catalog constraint (`catalogs: []` / unfiltered). Title-search and sort on subcategory pages operate on the already catalog-filtered set. No new catalog query parameters for catalog filtering.

**Grouping model:** Episode rows keep a single flat `catalog` field. MST3K aggregation is a browse-IA constant over existing enum values (`joel|mike|jonah|emily`), not a new persisted group field.

### Component ownership (M32)

| Surface | Ownership (implement in `apps/web`) |
| --- | --- |
| **Hub entry links** | `CatalogPage` (or a small hub-only child): four large text links in the page-header subtitle slot above search/sort + mixed grid; remove public catalog-chip UI from `CatalogFilterBar` / hub chrome. |
| **Catalog nav dropdown (desktop)** | `SiteHeader` (or adjacent site-nav module): Catalog parent remains a link to `/catalog`; disclosure lists the four subcategory destinations in fixed order with display names only. |
| **Catalog hamburger accordion** | Same site-nav module: inside `navbar-collapse`, Catalog expands inline to reveal the four subcategory links (accordion pattern, not nested flyout). |
| **Shared subcategory shell** | Router entries for the four subcategory paths; shared shell/layout component owning header (H1 = display name), route-fixed subtitle, title-search/sort chrome, and grid wiring to `CatalogGridCard` + empty-catalog presentation. |
| **Filter wiring** | Route-fixed `catalogs` constants passed into existing `filterCatalogEntries`; reuse public catalog fetch (no new API client). |

**SEO packaging:** Route strings may be added to the SPA router in M32. Sitemap, prerender, and head-tag packaging for subcategory paths belong to M33 (`public-site-seo` / `build_packaging.md`) and are not required for M32 browse-IA acceptance.

**UI contracts:** Hub links, nav dropdown/accordion, subcategory shell, subtitles, Riff Material copy: `.ai/interface/presentation.md`, `interaction_flow.md`, `accessibility.md`, `input_handling.md`.

## Testing Strategy

**Unit/component:**

- Hub renders four subcategory entry links in order MST3K → Community → Riff Material → Movie Night as large text links in the page-header subtitle slot above search/sort; no public catalog chips; mixed grid retained.
- Subcategory routes render header (display-name H1), route-fixed subtitle, title-search/sort chrome, and a grid filtered to the expected `catalogs` set.
- MST3K includes the four host catalogs and excludes `community` / `riff_material` / `movie_night` / `other`.
- Riff Material label appears in nav/hub/subcategory chrome while filter logic still keys on `riff_material`.
- Catalog nav parent targets `/catalog`; desktop dropdown and hamburger accordion list the four paths in the same order with display names only (no helper microcopy).
- Keyboard reachability for Catalog disclosure (Enter/Space open, Escape closes to trigger) and hub category links; poster alts continue `alt={title}` on `CatalogGridCard`.
- Focus after hub/dropdown navigation: browser default (no custom restore-to-header assertion required).

**Build/CI:** SEO verify asserts sitemap/prerender coverage for the four subcategory paths as part of the shared static route list (ten static routes + YouTube-linked watch pages after `/download`; fixture head tags per `public-site-seo` / `build_packaging.md`).

**Manual/smoke:** Post-deploy **`npm run smoke:production`** includes **`https://riffsync.tv/catalog/mst3k`** **200** with apex canonical (normative under `public-site-seo` / M33 — #341); not PR-CI-wired.

## References

- `.ai/business_logic/domain_model.md` — Public discoverable surface, Catalog browse IA, Invariants 10 and 11
- `.ai/business_logic/user_stories.md` — Catalog browse / subcategory browse stories
- `.ai/data/data_model.md` — Episode `catalog` enum and public omission of `other`
- `.ai/interface/presentation.md` — Hub, subcategory shell, M32 decisions
- `.ai/interface/interaction_flow.md` — Routes and Catalog nav / accordion
- `.ai/interface/accessibility.md` — Public catalog surfaces
- `.ai/interface/input_handling.md` — Keyboard baselines for nav
- `.ai/integration/api_contracts.md` — `GET /v1/catalog` reuse, no new catalog query params
- `.ai/operations/build_packaging.md` — Sitemap/prerender static route list (M33 packaging)
- `.ai/specs/public-site-seo.spec.md` — Indexable matrix and SEO pipeline (M33)
