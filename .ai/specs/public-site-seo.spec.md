# Public Site SEO

## Introduction

RiffSync's public catalog, marketing, and official Live surfaces - home, catalog hub, catalog subcategory browse pages, app install instructions, episode watch pages, enabled **`/live/:slug`** channels, host-help, and legal pages - are discoverable by search engines and shareable with rich social previews (Discord, Reddit, Mastodon, and similar unfurlers), without changing the SPA's existing visual design and without extending discoverability to ephemeral user-created room state.

**Audience:** fans searching for riff-style watch parties and episode discovery; community sharers posting catalog, watch, and official Live links.

**Related capabilities:** `catalog-browse-ia` (hub and subcategory browse routes, nav, and display grouping); `official-live-channels` (indexable hostless `/live/:slug`); `viewer-local-cast` (separate optional per-viewer presentation layer; not part of this capability).

**Non-goals:** indexing `/room/*` or `/lobby`; indexing `catalog: live` rows as `/watch/:id`; a server-side rendering framework migration; CloudFront-based bot-detection or edge compute for dynamic rendering; per-subcategory visual SEO campaigns beyond unique head tags and sitemap/prerender entries for the shared subcategory shell.

## Functional Specification

### Indexable vs noindex route matrix

| Indexable | `noindex` |
| --- | --- |
| `/`, `/catalog`, `/catalog/mst3k`, `/catalog/community`, `/catalog/riff-material`, `/catalog/movie-night`, `/download`, `/watch/:catalogEpisodeId` (non-`live` YouTube-host), `/live/:slug` (enabled official Live channels), `/how-to-host-a-watchparty`, `/terms`, `/privacy` | `/room/:roomId` (+ `/room/:roomId/experimental/:experimental`), `/lobby`, `/account`, `/admin/*`, `/cast/receiver`, `/privacy/data-removal`, `/auth/callback`, `/admin/auth/callback` |

Catalog subcategory routes are first-class indexable entries alongside the `/catalog` hub. `/download` is a durable public app install instructions page and joins the same sitemap/prerender/head-tag pipeline. Enabled official Live slugs join the same pipeline as durable public hangouts (not ephemeral `/room/*`). Browse IA is owned by `catalog-browse-ia`; Live channel behavior by `official-live-channels`; this capability owns discoverability packaging for those paths.

`/watch/:catalogEpisodeId` is indexable only for **YouTube-host** episodes with a non-empty trimmed **`youtubeVideoId`** that are **not** **`catalog: live`** — evaluated by **`episodeIsIndexableForSeo`** in **`apps/web/src/catalog/catalogSeo.ts`** (issue **#397**, extended for Live). **Custom-host** rows and **`catalog: live`** rows are **never** indexable as `/watch/:id`, including when optional YouTube enrichment coexists for thumbs/metadata. Official Live SEO belongs on **`/live/:slug`**. Rows without a YouTube video id (YouTube-host or legacy) carry no surface worth summarizing under today's SEO packaging and are excluded from indexing and the sitemap. Custom playback alone does not add `/watch/:id` to the sitemap.

### Per-route head tags

Each indexable route gets a unique `<title>`, meta description, canonical `<link>`, and Open Graph/Twitter tags, replacing today's single static `index.html` shell applied to every route. `/watch/:catalogEpisodeId` sources title/description/OG from the catalog `title` field (never TMDB `title`/`original_title`) plus `tagline`, `posterImageUrl`, and `backdropImageUrl` when present. Catalog subcategory routes carry unique static head tags and apex canonicals for their paths. All non-indexable routes carry the generic app-shell title/description plus a `noindex` robots meta tag - no per-instance head tags. Full per-route table: `.ai/interface/presentation.md` → *Public site head tags and heading semantics*.

### `robots.txt` and `sitemap.xml`

Both are build-time-generated artifacts reflecting the current catalog, not hand-maintained static files. `robots.txt` disallows ephemeral/authenticated/receiver-only paths and allows the indexable set; it publishes a `Sitemap:` line pointing at `sitemap.xml`. `sitemap.xml` enumerates the static indexable routes plus one `<url>` entry per YouTube-linked catalog episode. Full policy table: `.ai/operations/build_packaging.md` → *Public site SEO artifacts*.

### Build-time prerender

A build step renders static HTML snapshots for each indexable route into `dist/` alongside the SPA shell. Crawlers and unfurlers that do not execute JavaScript receive meaningful HTML; users still get the interactive React SPA. No CloudFront Function or Lambda@Edge bot-detection is introduced — the artifact ships through the existing S3 + CloudFront static pipeline with no new edge compute surface.

### Canonical hostname alignment

The canonical production origin is the apex hostname `https://riffsync.tv`. Non-canonical `https://www.riffsync.tv` redirects to apex at the edge, preserving path and query. Every absolute URL this capability produces — canonical `<link>`, sitemap entries, OG/Twitter `url`/`image` — uses apex; none emit `www`.

### Home heading and catalog image accessibility

`/` gets **exactly one** static, visually-hidden (`sr-only`) `<h1>RiffSync</h1>` at the top of `HomePage` output, immediately before `HomeHeroBanner` on the happy path - no visible layout change to the hero, carousel, or spotlight banner. `CatalogGridCard` poster images on the catalog hub and subcategory browse grids use `alt={episode.title}` (catalog `title` field). `/watch/:catalogEpisodeId`'s existing `sr-only` `<h1>{episode.title}</h1>` on `SoloWatchPage` is unchanged. `HomeMovieCard` home-row thumbnails are out of scope for M30.

### Search Console verification

Search Console / Bing Webmaster verification uses a DNS TXT record on the existing Route 53 hosted zone already managing `riffsync.tv` — not an HTML file upload or meta-tag step.

## Technical Specification

**Stack:** `apps/web` — React 19.2, Vite 8, react-router-dom 7, single Vite build (`npm run build` → `dist/`) published to the `RiffSyncStatic-prod` private S3 + CloudFront (OAC) origin via the existing GitHub Actions `deploy-prod.yml` pipeline (Node/CI toolchain per `.ai/operations/build_packaging.md`).

**Build pipeline:** the SEO artifact generation (robots/sitemap/prerender/head-tags) is a new step inside the existing `apps/web` `npm run build` invocation — not a second build pipeline, not a new CI job.

**M28 (`robots.txt` / `sitemap.xml` — #325):**

| Concern | Contract |
| --- | --- |
| **Module layout** | Pure functions in `apps/web/src/seo/generateSeoArtifacts.ts`; CLI `apps/web/scripts/generate-seo-artifacts.mjs` writes `dist/robots.txt` and `dist/sitemap.xml` after `vite build`. |
| **Catalog read** | Committed `data/catalog/episodes.json` only — no `GET /v1/catalog` at build time. |
| **Filter** | **`episodeIsIndexableForSeo`** / **`catalogEntriesIndexableForSeo`** from **`apps/web/src/catalog/catalogSeo.ts`** (**#397**). Legacy **`episodeHasYoutubeLink`** remains for non-SEO browse helpers until **#396** retires fan-path usage. |
| **Static sitemap paths** | `/`, `/catalog`, `/catalog/mst3k`, `/catalog/community`, `/catalog/riff-material`, `/catalog/movie-night`, `/download`, `/how-to-host-a-watchparty`, `/terms`, `/privacy` plus `/watch/{catalogEpisodeId}` per filtered episode. Official Live adds `/live/{id}` paths for `catalog: live` rows. |
| **Origin** | `VITE_PUBLIC_ORIGIN` at build when set, else `https://riffsync.tv`. |
| **Deploy cache** | S3 `Cache-Control: public, max-age=3600` on both objects in `deploy-prod.yml` (see `build_packaging.md` M28 decisions). |
| **CI** | `web-app` asserts both files exist; sitemap `<url>` count = 10 static routes + YouTube-linked episode count. |

Full detail: `.ai/operations/build_packaging.md` → *Decisions (M28 — robots.txt and sitemap.xml — #325)*.

**M29 (per-route head tags + prerender — #326):**

| Concern | Contract |
| --- | --- |
| **Module layout** | Shared **`indexableRoutes.ts`**, **`routeHeadTags.ts`**, **`buildPrerenderDocument.ts`** under **`apps/web/src/seo/`**; CLI **`apps/web/scripts/prerender-indexable-routes.mjs`**. |
| **Build order** | Last step after M28 SEO artifact generation: **`… && node scripts/generate-seo-artifacts.mjs && node scripts/prerender-indexable-routes.mjs`**. |
| **Head-tag copy** | Normative strings in **`.ai/interface/presentation.md`** → *Public site head tags* table and *Decisions (M29 — per-route head tags — #326)*. |
| **Prerender paths** | **`dist/index.html`** (home), **`dist/{route}/index.html`** for static indexable paths (including **`dist/catalog/index.html`**, **`dist/catalog/{mst3k,community,riff-material,movie-night}/index.html`**, and **`dist/download/index.html`**), **`dist/watch/{catalogEpisodeId}/index.html`** per YouTube-linked episode, **`dist/spa-shell.html`** (generic **`noindex`** fallback). |
| **Clean URL serving / SPA fallback** | **`cloudfront-canonical-redirect.ts`** viewer-request Function rewrites clean indexable paths to their prerendered S3 keys before origin fetch (for example **`/catalog`** → **`/catalog/index.html`**, **`/watch/{id}`** → **`/watch/{id}/index.html`**) while leaving extensioned objects unchanged. **`static-site-stack.ts`** maps true **403/404** misses to **`/spa-shell.html`** so **`/room/*`**, **`/lobby`**, and other non-prerendered paths do not inherit home canonical metadata. |
| **Catalog / filter** | Same committed catalog file; **`catalogEntriesIndexableForSeo`** filter (**#397**). |
| **Origin** | **`VITE_PUBLIC_ORIGIN`** at build when set, else **`https://riffsync.tv`**. |
| **CI** | **`web-app`** verifies prerender file count and spot-checks head tags on **`/`** plus a fixture **`/watch/{id}`**; unit tests cover **`routeHeadTags`** for all indexable route shapes. |

Full detail: `.ai/operations/build_packaging.md` → *Decisions (M29 — per-route head tags and prerender — #326)*.

**M30 (home sr-only H1 and catalog card alt — #327):**

| Concern | Contract |
| --- | --- |
| **Home H1** | `HomePage.tsx`: `<h1 className="sr-only">RiffSync</h1>` once per render tree; before `HomeHeroBanner` when hero renders; also on loading/error/empty branches. |
| **Home H1 copy** | Static **`RiffSync`** — `SITE_DOCUMENT_TITLE` in `apps/web/src/config/documentTitle.ts`; not carousel slide title. |
| **Catalog alt** | `CatalogPage.tsx` **`CatalogGridCard`**: `alt={episode.title}` on poster `<img>` (replace `alt=""`). |
| **Out of scope** | `HomeMovieCard`, `SoloWatchPage` heading, M28/M29 build artifacts, visible layout or heading-level changes on hero/spotlight. |
| **Tests** | `HomePage.test.tsx`: exactly one `h1.sr-only` with text `RiffSync`. `CatalogPage.test.tsx` (or equivalent): rendered card poster `img` has non-empty `alt` matching fixture episode title. |

Full detail: `.ai/interface/presentation.md` → *Decisions (M30 — home sr-only H1 and catalog card alt — #327)*.

**Canonical origin sourcing:** the same `public_domain` / `PUBLIC_WEB_ORIGIN` build-time value already used for `VITE_PUBLIC_ORIGIN` (`.ai/runtime/configuration.md`) is the single source for all absolute URLs this capability emits.

**Canonical hostname redirect:** GitHub Actions repository variables (`PROD_FAN_WEB_HOSTNAME`, `PROD_FAN_WEB_ALTERNATE_DOMAIN_NAMES`, `PROD_FAN_WEB_CANONICAL_HOSTNAME`) and matching CDK context on `RiffSyncStatic-prod` (`infra/cdk/lib/static-site-stack.ts`) set apex `riffsync.tv` as canonical with `www.riffsync.tv` as an alternate. The existing `cloudfront-canonical-redirect.ts` CloudFront Function **301**-redirects any non-canonical custom alias (including `www.riffsync.tv`) to apex, preserving path and query, then rewrites clean canonical-host requests to prerendered `index.html` object keys before origin fetch.

**M27 static shell:** `apps/web/index.html` canonical `<link>`, `og:url`, `og:image`, and `twitter:image` absolute URLs must use apex `https://riffsync.tv` (not `www`). Production `VITE_PUBLIC_ORIGIN` comes from `FanWebSiteUrl` CloudFormation output via `deploy-prod.yml`.

**Publish target:** artifacts ship through the existing `apps/web` → `RiffSyncStatic-prod` S3 sync + CloudFront invalidation (`deploy-prod.yml` phase 5). No new stack, no new environment tier, no hosted staging footprint.

**Search Console verification:** operator adds DNS TXT record(s) to the existing Route 53 hosted zone (`fanWebZoneName`) via manual console step — not CDK, not HTML file, not meta tag. Maintainer procedure: `docs/operations/public-site-seo.md`; TXT values in team ops secret store only.

**M31 (Search Console verification and release smoke — #328):**

| Concern | Contract |
| --- | --- |
| **Operator runbook** | New **`docs/operations/public-site-seo.md`** — Search Console + Bing Webmaster property setup, Route 53 TXT steps, verification checklist, smoke invocation. Linked from **`infra/cdk/README.md`** → *Production smoke checks*. |
| **DNS TXT** | Manual Route 53 console on zone **`riffsync.tv`** (`fanWebZoneName`). One TXT per vendor when tokens differ. Values never committed. |
| **Smoke script** | **`scripts/launch-readiness/smoke-production.mjs`** — Node ESM, zero deps; root **`npm run smoke:production`**. |
| **Smoke timing** | After **`deploy-prod.yml`** phase 5 when M27–M29 (and M33 subcategory prerender) are live; not CI. |
| **Fixture watch path** | **`/watch/101-the-crawling-eye`** (committed catalog entry with YouTube link). |
| **Subcategory smoke path (M33)** | Clean URL **`/catalog/mst3k`** — **200** plus MST3K prerender **`<title>`**, apex canonical **`<link>`**, and no **`noindex`**. |

**Static indexable route extensions:** **`STATIC_INDEXABLE_ROUTES`** contains ten paths: the original public surfaces, the four **`/catalog/*`** subcategory routes, and **`/download`**. Prerender/sitemap/CI follow list length; head-tag strings match **`presentation.md`** table as-is. Full detail: `.ai/operations/build_packaging.md` → *Decisions (M33 — catalog subcategory SEO packaging — #341)* and *Decisions (M31 — Search Console verification and release smoke — #328)*.

**M37 (host-aware SEO indexable filter — #397):**

| Concern | Contract |
| --- | --- |
| **Module** | **`apps/web/src/catalog/catalogSeo.ts`** — **`readCatalogPlaybackHost`**, **`episodeIsIndexableForSeo`**, **`catalogEntriesIndexableForSeo`**. Separate from browse **`catalogPlayback.ts`** (**#396**). |
| **Predicate** | **`false`** when **`readCatalogPlaybackHost(ep) === 'custom'`** (even if **`youtubeVideoId`** is present). Otherwise **`true`** only when trimmed **`youtubeVideoId`** is non-empty (YouTube-host or legacy default host). **`embedAllows`** and **`customPlaybackUrl`** do not affect indexability. |
| **Consumers** | **`generateSeoArtifacts.ts`**, **`generate-seo-artifacts.mjs`**, **`prerender-indexable-routes.mjs`**, **`verify-seo-artifacts.mjs`** — replace **`catalogEntriesWithYoutubeLink`** imports. |
| **`robots.txt`** | Unchanged disallow list; Custom-only **`/watch/:id`** has no prerender artifact and falls through to **`spa-shell.html`** (**`noindex`**). |
| **Tests** | **`catalogSeo.test.ts`**: Custom-host excluded; Custom + YouTube metadata excluded; YouTube-host + id included; blank id excluded. Extend **`generateSeoArtifacts.test.ts`** with Custom-host fixture asserting no **`<loc>`**. |
| **Out of scope** | Making Custom-only watch pages indexable; static head-tag marketing copy refresh. |

Full detail: `.ai/operations/build_packaging.md` → *Decisions (M37 — host-aware SEO indexable filter — #397)*.

## Testing Strategy

**Unit/component:** home `sr-only` H1 renders exactly once (M30); catalog card `alt` text is non-empty (M30); **`routeHeadTags`** produces expected title/description/canonical/OG/Twitter for each of the **ten** static indexable routes (including the four catalog subcategory paths and **`/download`**) and for `/watch/:id` with and without `tagline`/poster art (M29/M33).

**Build/CI (M28):** the `web-app` CI job asserts `robots.txt` and `sitemap.xml` exist after `npm run build`; sitemap `<url>` count equals 10 static indexable routes plus the count of catalog episodes passing **`episodeIsIndexableForSeo`**; the build fails when catalog data is unavailable or counts mismatch.

**Build/CI (M29):** after `npm run build`, `web-app` (via `verify:seo-artifacts` or dedicated verify script) asserts `spa-shell.html` contains `noindex`; prerendered `index.html` exists for `/`, `/catalog`, `/catalog/mst3k`, `/catalog/community`, `/catalog/riff-material`, `/catalog/movie-night`, `/download`, `/how-to-host-a-watchparty`, `/terms`, `/privacy`; `watch/{id}/index.html` count matches **`catalogEntriesIndexableForSeo`** episodes; spot checks validate apex canonical on `/` and episode title/canonical on a fixture watch route.

**Unit (M37 #397):** **`catalogSeo.test.ts`** covers host-aware indexable matrix; **`generateSeoArtifacts.test.ts`** asserts Custom-host fixtures produce no watch **`<loc>`** in sitemap XML.

**Manual/smoke (post-deploy, production only — M31 #328 + M33 #341):** run **`npm run smoke:production`** from repo root after M27–M29 and M33 subcategory prerender are deployed. The script asserts:

1. **`https://riffsync.tv/`** returns **200**
2. **`https://www.riffsync.tv/lobby`** returns **301** with **`Location: https://riffsync.tv/lobby`**
3. **`https://riffsync.tv/robots.txt`** and **`https://riffsync.tv/sitemap.xml`** return **200**
4. **`/`** response HTML includes home **`<title>`**, apex canonical **`<link>`**, no **`noindex`**, and no **`www.riffsync.tv`** absolute URLs
5. **`/catalog`** returns **200** at the clean URL with catalog prerender **`<title>`**, apex canonical, and no **`noindex`**
6. **`/catalog/mst3k`** returns **200** at the clean URL with MST3K prerender **`<title>`**, apex canonical, and no **`noindex`**
7. **`/watch/101-the-crawling-eye`** returns **200** at the clean URL with episode prerender **`<title>`**, apex canonical, and no **`noindex`**
8. **`index.html`** body contains no **`www.riffsync.tv`** absolute URLs

Operator separately confirms Search Console and Bing Webmaster show **Verified** after DNS TXT propagation (checklist in **`docs/operations/public-site-seo.md`**). Peer prior art for script shape: `control9/control9-www`'s `smoke-production.mjs` (reference only).

**M27 unit/CI:** add or extend a test that asserts `apps/web/index.html` contains no `www.riffsync.tv` host strings; `npm run verify:push:web` passes after changes.

## References

- `.ai/business_logic/domain_model.md` - Public discoverable surface, Invariant 1 (lawful playback), Invariant 9 (catalog title), Invariant 11 (public discoverability boundary)
- `.ai/business_logic/user_stories.md` - US-P1-08, US-P1-09
- `.ai/interface/presentation.md` - Public site head tags and heading semantics
- `.ai/interface/accessibility.md` - Public catalog and marketing surfaces
- `.ai/operations/build_packaging.md` - Public site SEO artifacts
- `.ai/operations/deployment_environments.md` - Public site SEO deployment readiness
- `.ai/runtime/configuration.md` - Public hostname, Public site SEO build-time config
- `.ai/specs/catalog-browse-ia.spec.md` - Catalog hub and subcategory browse IA
