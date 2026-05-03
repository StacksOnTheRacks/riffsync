# Catalog artwork — TMDB reconciliation (draft)

Backend plan for enriching library rows with **movie poster and backdrop** images from TMDB—**`poster_path`** (card / grid / portrait-friendly) and **`backdrop_path`** (wide hero / blurred chrome)—plus stable HTTPS **URLs** the web client reads without calling TMDB.



The **canonical store** keeps curator-owned playback fields (**`youtubeVideoId`**, titles, eras, ids, notes). **`data/catalog/episodes.json`** serves as a bootstrap seed early on; migrated production traffic reads **from your catalog database**.

The **scheduled reconcile job** (**Lambda**, **EventBridge** — **`architecture.server.md`**) loads canonical rows from **DynamoDB**, resolves each underlying film (`GET /movie/{id}` after discovery or lock), and writes **`tmdbPosterPath` / `posterImageUrl`**, **`tmdbBackdropPath` / `backdropImageUrl`**, **`tmdbMovieId`**, **`tmdbArtworkSyncedAt`** back onto **the same DynamoDB catalog items**. **`GET /v1/catalog`** reads those attributes (optionally via **ElastiCache** read-through).

### What we still do *not* ingest

- **`profile_path`** or any **person/cast/still** imagery (`/person/**`, using cast as catalog art).
- **`logo_path`** / production-company marks, the **`logos`** slice from **`/movie/{id}/images`**, or unrelated branding tiles.
- Treating **alternate** poster/backdrop galleries as required—**primary** **`poster_path`** and **`backdrop_path`** on the movie details response are enough unless you later cherry-pick from **`/movie/{id}/images`** ( **`posters`** / **`backdrops`** only — never **`logos`** ).

---

## Goals

| Goal | Approach |
| --- | --- |
| **Fast client** | Persist **resolved poster and backdrop URLs** beside each catalog key so the SPA does not call TMDB. |
| **Server-side only** | TMDB credentials stay in **Secrets Manager / env** on the reconcile job; nothing secret in git or browser. |
| **Reconciliation not on-request** | Scheduled **[EventBridge rule](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/AWS_Events.html)** (`AWS::Events::Rule` + **`ScheduleExpression`**) invoking Lambda (**`AWS::Lambda::Permission`**, **`Principal`**: **`events.amazonaws.com`**) processes a batch; alternatively **EventBridge Scheduler** (`AWS::Scheduler::Schedule`). |
| **Self-healing** | Re-queue rows with **missing** poster/backdrop URLs, failed search, stale sync, or **failed HEAD checks** after verification. |

---

## Split: canonical catalog rows vs enriched artifact

- **Canonical (DynamoDB):** system of record for `youtubeVideoId`, display **`title`**, **`era`**, stable **`id`**, optional curator hints (**`movieSearchTitle`**, **`tmdbMovieId`**, **`embedAllows`**, **`curatorNotes`**). During early development this may be seeded from **`data/catalog/episodes.json`**; afterward treat JSON as fixtures / exports only.
- **Enriched columns (same store):** the reconcile Lambda **updates TMDB-derived attributes** on the **DynamoDB** catalog partition(s). There is **no separate “enrichment blob store” required** unless you voluntarily export snapshots to **S3** for ops/analytics.

**`GET /v1/catalog`** is served by HTTP Lambda reading **DynamoDB** (and optional **ElastiCache**, see **`architecture.server.md`**). Clients must not rely on **`data/catalog/episodes.json`** after migration — keep JSON only for **seeds**, **exports**, and **fixture validation**.

---

## TMDB APIs

### Search (discovery)

Resolve a film candidate from MST-style **movie** title:

```http
GET https://api.themoviedb.org/3/search/movie
    ?query=…
    &include_adult=false
    &language=en-US
    &page=1
Authorization: Bearer <TMDB_ACCESS_TOKEN_OR_API_READ_KEY>
accept: application/json
```

Prefer:

1. **`tmdbMovieId` from catalog** (curator-provided lock) → **skip search**, call **`GET /movie/{id}`** and read **`poster_path`**, **`backdrop_path`**, **`id`**.
2. Else search with **`movieSearchTitle` if present**, else **`title`** (`GET /search/movie` …).
3. If multiple results → pick closest **release year** if you later add **`releaseYearHint`** optional field; otherwise take **top result + log ambiguity** or mark `tmdbNeedsReview`.

Optional `GET /movie/{id}/images` when you want a **non-default** still (e.g. better aspect or language). That payload mixes **`posters`**, **`backdrops`**, and **`logos`** — read only **`posters`** / **`backdrops`** entries (each exposes `file_path`); **never** persist **`logos`**.

### Images (URLs)

Follow [TMDB image basics](https://developer.themoviedb.org/docs/image-basics): combine **`base_url`**, **`file_size`**, **`file_path`**.

Operational pattern:

1. **Cache `/configuration`** (images **`base_url`**, **poster** and **backdrop** size lists) in the worker (**Parameter Store**, small Dynamo row, or in-memory Lambda if cold-start acceptable ~ daily). Refresh weekly.
2. When writing enriched output, persist **two resolved HTTPS URLs**, for example:  
   `https://image.tmdb.org/t/p/w500{poster_path}`  
   `https://image.tmdb.org/t/p/w1280{backdrop_path}`  

   Typical sizes: posters **`w342` / `w500`**, backdrops **`w780` / `w1280` / `original`**. Tune for layout (cards vs hero).

Hardcoding `https://image.tmdb.org/t/p/` is common if you accept minor operational risk versus always joining configuration.

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
2. Load prior enriched map (to detect **missing** URLs / stale rows).
3. Build worklist: entries where **`posterImageUrl` / `backdropImageUrl`** (or raw paths) **absent**, OR **`tmdbArtworkSyncedAt` older than N days**, OR **HEAD check failed** on a stored image URL (rare for TMDB, but rotates happen).
4. For each chunk (respect **TMDB API rate limits** — see [Getting started](https://developer.themoviedb.org/docs/getting-started)):
   - Search or fetch by ID → read **`poster_path`**, **`backdrop_path`**, **`id`**.
   - If either path is **null** (TMDB gap), store what you have; retry on a later run.
   - Compose **`posterImageUrl`** and **`backdropImageUrl`**, mirror **`tmdbPosterPath`** / **`tmdbBackdropPath`** if the enriched row tracks raw paths → set **`tmdbMovieId`**, **`tmdbArtworkSyncedAt`**.
5. **Atomic publish**: **`BatchWriteItem`** / **`TransactWriteItems`** (or chunked updates with retries) against **DynamoDB** catalog items; optionally bump a **catalog version** or **invalidate ElastiCache** if you cache **`GET /v1/catalog`** payload.
6. Emit metrics: **processed**, **failed**, **skipped (locked ambiguity)**.

---

## Broken-link handling

TMDB-hosted images rarely “break”, but reconcile should still:

- Optionally **`HEAD`** stored **`posterImageUrl`** / **`backdropImageUrl`** (short timeout); on **hard failure**, clear the failed URL(s) and enqueue **retry** next run **or** re-fetch movie by `tmdbMovieId`.
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

`GET /v1/catalog` → merges **canonical fields from the DynamoDB catalog** with **poster URLs, backdrop URLs, and TMDB movie id** already materialized on those items (**optional ElastiCache** in front — **`architecture.server.md`**).

Keeps frontend dumb and cacheable (`ETag`, CDN).

---

## Related files

| File | Purpose |
| --- | --- |
| [`data/catalog/catalog.schema.json`](../data/catalog/catalog.schema.json) | Optional curator + TMDB enrichment fields validated in CI once scripts exist |
| [`data/catalog/README.md`](../data/catalog/README.md) | JSON **seed + schema** for early authoring; migrating rows into DB is **`architecture.server.md`** |
| [`architecture.server.md`](architecture.server.md) | Where reconcile job fits beside API Lambdas |

Update this doc if you introduce **alternate image selection** (`/movie/{id}/images`), **CDN edge caching**, or non-Dynamo enrichment stores.
