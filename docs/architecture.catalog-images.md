# Catalog enrichment — TMDB artwork & movie copy (draft)

Backend plan for enriching library rows from TMDB **`GET /movie/{id}`**: **poster** / **backdrop** art (resolved CDN URLs plus raw paths) and lightweight **movie copy** — **`overview`**, **`popularity`**, **`tagline`** — alongside **`id`**. Episode **`title`** stays **curator-owned**; TMDB film titles are **not** stored. The SPA consumes enrichment from **`GET /v1/catalog`** without hitting TMDB directly.

**Public HTTP contracts** (methods, queries, JSON field mapping, image URL algebra): **`docs/contracts.tmdb.md`**.

The **canonical store** keeps curator-owned playback fields (**`youtubeVideoId`**, titles, eras, ids) and optional curator hints in Dynamo (**`movieSearchTitle`**, **`embedAllows`**, **`curatorNotes`**, …) that are **not** required columns in git. **`data/catalog/episodes.json`** is a bootstrap seed constrained by **`catalog.schema.json`** — slim rows expose **`tagline`**, **`posterImageUrl`**, **`backdropImageUrl`**, **`tmdbMovieId`**, **`tmdbArtworkSyncedAt`** (often **`null`** until reconcile) alongside YouTube identifiers. Dynamo and **`GET /v1/catalog`** may still persist and return broader TMDB-derived copy (below) independent of what you commit as JSON seeds.

The **scheduled reconcile job** (**Lambda**, **EventBridge** — **`architecture.server.md`**) loads canonical rows from **DynamoDB**, resolves each underlying film (**`GET /movie/{id}`** after **[search](https://developer.themoviedb.org/reference/search-movie)** or curator lock), writes TMDB fields (**`tmdbOverview`**, **`tmdbPopularity`**, **`tagline`**, **`tmdbPosterPath` / `posterImageUrl`**, **`tmdbBackdropPath` / `backdropImageUrl`**, **`tmdbMovieId`**, **`tmdbArtworkSyncedAt`**) onto catalog items, and may **in the same run** resolve **YouTube still** URLs from **`youtubeVideoId`** (**YouTube thumbnails** below). **`GET /v1/catalog`** returns the merged row (optional **ElastiCache** read-through).

### What we still do *not* ingest

- **`profile_path`** or any **person/cast/still** imagery (`/person/**`, using cast as catalog art).
- **`logo_path`** / production-company marks, the **`logos`** slice from **`/movie/{id}/images`**, or unrelated branding tiles.
- Treating **alternate** poster/backdrop galleries as required—**primary** **`poster_path`** and **`backdrop_path`** on the movie details response are enough unless you later cherry-pick from **`/movie/{id}/images`** ( **`posters`** / **`backdrops`** only — never **`logos`** ).

---

## Goals

| Goal | Approach |
| --- | --- |
| **Fast client** | Persist **`overview`**, **`popularity`**, **`tagline`**, poster/backdrop **paths**, and resolved **image URLs** on each catalog item—no client-side TMDB on read; display **`title`** remains from the catalog row. |
| **Server-side only** | TMDB credentials stay in **Secrets Manager / env** on the reconcile job; nothing secret in git or browser. |
| **Reconciliation not on-request** | Scheduled **[EventBridge rule](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/AWS_Events.html)** (`AWS::Events::Rule` + **`ScheduleExpression`**) invoking Lambda (**`AWS::Lambda::Permission`**, **`Principal`**: **`events.amazonaws.com`**) processes a batch; alternatively **EventBridge Scheduler** (`AWS::Scheduler::Schedule`). |
| **Self-healing** | Re-queue rows with **missing** enrichment (art URLs and/or TMDB metadata), stale **`tmdbArtworkSyncedAt`**, failed search, or failed **HEAD** checks on CDN image URLs. |

---

## Split: canonical catalog rows vs enriched artifact

- **Canonical (DynamoDB):** system of record for `youtubeVideoId`, display **`title`**, **`era`**, stable **`id`**, optional curator hints (**`movieSearchTitle`**, **`tmdbMovieId`**, **`embedAllows`**, **`curatorNotes`**). During early development this may be seeded from **`data/catalog/episodes.json`**; afterward treat JSON as fixtures / exports only.
- **Enriched columns (same store):** reconcile persists **`overview`**, **`popularity`**, **`tagline`**, **`poster_path`** and **`backdrop_path`**, **`tmdbMovieId`**, resolved poster/backdrop URLs, and **`tmdbArtworkSyncedAt`** onto **DynamoDB** catalog items. Optional **S3** snapshots are **ops-only**, not the live read path.

**`GET /v1/catalog`** is served by HTTP Lambda reading **DynamoDB** (and optional **ElastiCache**, see **`architecture.server.md`**). Clients must not rely on **`data/catalog/episodes.json`** after migration — keep JSON only for **seeds**, **exports**, and **fixture validation**.

---

## TMDB APIs (summary)

Detailed **routes, parameter lists, consumed JSON paths, URL composition, and normalization** live in **`[contracts.tmdb.md](contracts.tmdb.md)`** (version in git for reviewers and integrations).

Operational resolution order stays:

1. **`tmdbMovieId` from catalog** (curator lock) → **`GET /movie/{id}`** → read artwork paths, **`tagline`**, copy fields.
2. Else **`GET /search/movie`** using curator **`movieSearchTitle`** if present, else episode **`title`**, then **`GET /movie/{id}`** once an id is chosen (search **`results[]`** are not authoritative for artwork).
3. Ambiguous search → curator lock, **`tmdbNeedsReview`**, or documented tie-break (e.g. **`release_year` hint** later).

Optional **`GET /movie/{id}/images`** — only **`posters`** / **`backdrops`** subsets; never **`logos`** for episode art (**see `contracts.tmdb.md`**).

---

## Reconciliation workflow

```mermaid
flowchart LR
  CRON[EventBridge schedule] --> JOB[Reconcile Lambda / job]
  SRC[(Canonical catalog\nDB + optional seed export)]
  ENR[(DynamoDB catalog rows\n(update TMDB attrs))]
  TMDB[TMDb API]

  JOB --> SRC
  JOB -->|"batch missing /\nbroken"| TMDB
  JOB --> ENR
```

**Per-run algorithm (batch, rate-limited):**

1. Load full **canonical** catalog snapshot from the **primary catalog store** (database export or read-through batch). For local/dev only, you may substitute an imported JSON seed while the DB is empty.
2. Load prior enrichment snapshot (URLs, synopsis, timestamps).
3. Build worklist: missing **`posterImageUrl` / `backdropImageUrl`**, **`tagline`**, **`tmdbOverview`**, **`tmdbPopularity`**, OR stale **`tmdbArtworkSyncedAt`**, OR **HEAD** failures on CDN image URLs.
4. For each chunk (respect **TMDB API rate limits** — see [Getting started](https://developer.themoviedb.org/docs/getting-started)):
   - Resolve **`movie_id`** (search pipeline or curator lock).
   - **`GET /movie/{id}`** → read **`overview`**, **`popularity`**, **`tagline`**, **`poster_path`**, **`backdrop_path`** (field contract: **`contracts.tmdb.md`**); ignore TMDB **`title`** / **`original_title`** for persistence.
   - If artwork paths missing, persist text fields anyway; retry images next run.
   - Write **`tmdbOverview`**, **`tmdbPopularity`**, **`tagline`**, **`tmdbPosterPath`**, **`posterImageUrl`**, **`tmdbBackdropPath`**, **`backdropImageUrl`**, **`tmdbMovieId`**, **`tmdbArtworkSyncedAt`**.
5. **Atomic publish**: **`BatchWriteItem`** / **`TransactWriteItems`** (or chunked updates with retries) against **DynamoDB** catalog items; optionally bump a **catalog version** or **invalidate ElastiCache** if you cache **`GET /v1/catalog`** payload.
6. Emit metrics: **processed**, **failed**, **skipped (locked ambiguity)**.

---

## YouTube thumbnails *(same scheduled job, no Uploads API required)*

Thumbnails for grid / fallback art can be **materialized in reconcile** from **`youtubeVideoId`** so **`GET /v1/catalog`** returns **ready-to-use** image URLs without the browser calling YouTube APIs.

| Idea | Detail |
| --- | --- |
| **URL pattern** | Google serves stills at **`https://img.youtube.com/vi/{VIDEO_ID}/{name}.jpg`** where **`name`** is typically **`maxresdefault`**, **`sddefault`**, **`hqdefault`**, **`mqdefault`**, **`default`**. |
| **Reliability** | **`maxresdefault`** is **not** always present (older or low-res uploads may **404**). Reconcile should **`HEAD`** (or ordered GET with short timeout) and **fall back** down the list (e.g. **`maxresdefault` → hqdefault → mqdefault**), then persist the **first** that returns **200**. |
| **Persistence** | Store a single resolved URL on the catalog row (e.g. **`youtubeThumbnailUrl`**) **or** only the chosen **`{name}`** suffix if you prefer to rebuild URLs client-side — **persisting the full URL** matches the TMDB pattern and simplifies the SPA. |
| **When it runs** | Same **EventBridge** batch as TMDB: rows with non-null **`youtubeVideoId`** and missing/stale thumb URL (or failed prior **`HEAD`**) join the worklist. **No** OAuth or **Data API** quota is required for **`img.youtube.com`** fetches from Lambda. |
| **Policy** | Treat as **supplement** to TMDB poster/backdrop: e.g. card thumbs when you want **episode-specific** art that always matches the **actual** YouTube upload; TMDB stays **film** key art for hero/backdrop/copy. Respect **YouTube / Google Terms** for your product use (linking/embed + reasonable automated checks is standard; scraping beyond documented image URLs is out of scope here). |

If you later add **`youtubeThumbnailUrl`** (or equivalent) to **Dynamo** and **`GET /v1/catalog`**, extend **`catalog.schema.json`** / seed shape only when you want that field in git exports — Dynamo-only is fine initially.

---

## Broken-link handling

TMDB-hosted images rarely “break”, but reconcile should still:

- Optionally **`HEAD`** stored **`posterImageUrl`** / **`backdropImageUrl`** (short timeout); on **hard failure**, clear the failed URL(s) and enqueue **retry** next run **or** re-fetch movie by `tmdbMovieId`.
- Apply the same idea to **`youtubeThumbnailUrl`** (or persisted YouTube still URL) against **`img.youtube.com`** — on failure, rerun the **tiered `HEAD`** fallback chain for that **`youtubeVideoId`**.
- Prefer **immutable path + fixed size suffix** — if breakage is CDN-only, swapping the size segment may fix.

---

## Security & ops

| Concern | Mitigation |
| --- | --- |
| **Secret leak** | Store TMDB Bearer token in **AWS Secrets Manager**; inject into Lambdas/tasks; never log full token. |
| **Quota / cost** | Batch + backoff; nightly or hourly cron is enough early on. |
| **Attribution** | TMDB **[terms](https://www.themoviedb.org/documentation/api/terms-of-use)** require appropriate **credit** (“This product uses the TMDB API but is not endorsed or certified by TMDB”) plus logo placement per their branding rules — bake into site footer/settings. |

---

## Optional HTTP surface for app

Expose **single** authenticated or public endpoint the SPA calls:

`GET /v1/catalog` → returns curator columns (**including display **`title`**) plus **`tagline`**, **`tmdbOverview`**, **`tmdbPopularity`**, **`tmdbMovieId`**, **`tmdbPosterPath`**, **`posterImageUrl`**, **`tmdbBackdropPath`**, **`backdropImageUrl`**, **`tmdbArtworkSyncedAt`** (optional **ElastiCache** in front — **`architecture.server.md`**).

Keeps frontend dumb and cacheable (`ETag`, CDN).

---

## Related files

| File | Purpose |
| --- | --- |
| [`contracts.tmdb.md`](contracts.tmdb.md) | **Public TMDB HTTP contracts**: endpoints, consumed fields, **image URL building** rule |
| [`data/catalog/catalog.schema.json`](../data/catalog/catalog.schema.json) | Enforces the **committed** seed episode shape (**`youtubeVideoId`**, **`youtubeWatchUrl`**, **`tagline`**, **`posterImageUrl`**, **`backdropImageUrl`**, **`tmdbMovieId`**, **`tmdbArtworkSyncedAt`**) with extra Dynamo-only reconcile fields documented in this doc, not encoded in seeds |
| [`data/catalog/README.md`](../data/catalog/README.md) | JSON **seed + schema** for early authoring; migrating rows into DB is **`architecture.server.md`** |
| [`architecture.server.md`](architecture.server.md) | Where reconcile job fits beside API Lambdas |

Update this doc if you introduce **alternate image selection** (`/movie/{id}/images`), **CDN edge caching**, or non-Dynamo enrichment stores.
