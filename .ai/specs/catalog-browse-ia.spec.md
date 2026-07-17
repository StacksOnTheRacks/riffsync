# Catalog Browse Information Architecture

## Introduction

Fans browse the RiffSync catalog through a hub at `/catalog` plus four dedicated subcategory routes so each browse intent (MST3K host eras, Community, Riff-Ready, Movie Night) has a stable URL and a shared page shell. This capability defines the public catalog information architecture: navigation, hub vs subcategory responsibilities, display grouping of existing `era` values, and the Riff-Ready label/slug mapping. It does not redefine catalog data storage or invent a new HTTP API.

**Audience:** public fans discovering titles; maintainers extending subcategory pages in later milestones.

**Related capabilities:** `public-site-seo` (indexable route matrix, sitemap/prerender/head tags for these paths); `viewer-local-cast` (unrelated presentation layer).

**Non-goals:** per-subcategory visual redesign beyond the shared Streamlab-style header + breadcrumbs + title grid; admin/operator catalog tooling changes; API or persisted `era` enum renames; watch-party, lobby, or SEO overhaul beyond adding the new indexable routes to the existing SEO pipeline.

## Functional Specification

### Routes and responsibilities

| Route | Browse responsibility |
| --- | --- |
| `/catalog` | Hub: four large horizontal entry links into subcategory pages; mixed/all-titles catalog grid; shared chrome such as title search (no public era-chip toggles). |
| `/catalog/mst3k` | Aggregated grid of episodes whose `era` is `joel`, `mike`, `jonah`, or `emily`. No secondary host-era chips on this page for this capability. |
| `/catalog/community` | Filtered grid for `era` = `community`. |
| `/catalog/riff-ready` | Filtered grid for `era` = `riffable`; public label **Riff-Ready**. |
| `/catalog/movie-night` | Filtered grid for `era` = `movie_night`. |

Staff-only `other` never appears on hub links, nav dropdown items, or public subcategory grids.

### Navigation

Main-nav **Catalog** remains a navigable link to the `/catalog` hub and exposes a dropdown to the four subcategory destinations. On narrow viewports, subcategory links nest inside the existing hamburger menu collapse (not hover-only).

### Subcategory page shell

Each subcategory page uses a shared shell: page header with category display name, breadcrumb trail that includes the Catalog hub and the current subcategory, then the existing title/card grid pattern. Per-subcategory visual customization is deferred to later milestones; routes and nav stay stable so later customization does not redo IA.

### Naming

Public UI shows **Riff-Ready**. Route slug is `riff-ready`. Persisted and wire `era` value remains `riffable` (see data contracts).

### Access and empty states

All hub and subcategory routes are public and require no authentication (same posture as today's catalog browse). An empty filtered grid uses the existing empty-catalog presentation; no new error class.

### Discoverability

The hub and four subcategory routes are part of the public discoverable (indexable) surface. Sitemap, prerender, and per-route head tags follow `public-site-seo` and operations build packaging.

## Technical Specification

**Stack:** `apps/web` fan SPA (React 19.2, Vite 8, react-router-dom 7) under SiteLayout; no new backend service.

**Data flow:** Runtime catalog rows continue to load via public `GET /v1/catalog`. Subcategory pages apply client-side `filterCatalogEntries({ eras })` with a route-fixed `eras` constant (single value or the MST3K four-value union). Hub mixed grid uses no era constraint. No new catalog query parameters for era filtering.

**Grouping model:** Episode rows keep a single flat `era` field. MST3K aggregation is a browse-IA constant over existing enum values, not a new persisted group field.

**SEO packaging:** The four subcategory paths join `STATIC_INDEXABLE_ROUTES` (nine static routes total) alongside `/catalog`. Sitemap, prerender, CI counts, and head-tag emission are owned by `public-site-seo` / operations build packaging (M33 — #341). Head-tag title/description/canonical/OG strings match the `presentation.md` public-site head-tag table as-is.

**UI contracts:** Hub links, nav dropdown, subcategory shell, Riff-Ready copy, and head-tag rows live in `presentation.md`, `interaction_flow.md`, `accessibility.md`, and `input_handling.md`.

## Testing Strategy

**Unit/component:** Hub renders four subcategory entry links and no public era chips; subcategory routes render header, breadcrumbs, and a grid filtered to the expected `eras` set; MST3K includes the four host eras and excludes community / riffable / movie_night / other; Riff-Ready label appears in nav/hub/subcategory chrome while filter logic still keys on `riffable`; Catalog nav parent targets `/catalog` and dropdown targets the four paths; keyboard reachability for dropdown and breadcrumbs.

**Build/CI:** SEO verify asserts sitemap/prerender coverage for the four subcategory paths (nine static routes + YouTube-linked watch pages; fixture head tags per `public-site-seo` / `build_packaging.md`).

**Manual/smoke:** Post-deploy **`npm run smoke:production`** includes **`https://riffsync.tv/catalog/mst3k`** **200** with apex canonical (normative under `public-site-seo` / M33 — #341); not PR-CI-wired.

## References

- `.ai/business_logic/domain_model.md` — Public discoverable surface, Catalog browse IA, Invariants 10 and 11
- `.ai/business_logic/user_stories.md` — Catalog browse / subcategory browse stories
- `.ai/data/data_model.md` — Episode `era` enum and public omission of `other`
- `.ai/interface/presentation.md` — Hub, subcategory shell, head tags
- `.ai/interface/interaction_flow.md` — Routes and Catalog nav
- `.ai/interface/accessibility.md` — Public catalog surfaces
- `.ai/interface/input_handling.md` — Keyboard baselines for nav and breadcrumbs
- `.ai/integration/api_contracts.md` — `GET /v1/catalog` reuse, no new era query params
- `.ai/operations/build_packaging.md` — Sitemap/prerender static route list
- `.ai/specs/public-site-seo.spec.md` — Indexable matrix and SEO pipeline
