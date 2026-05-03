# TMDB HTTP contracts — RiffSync (public)

Normative summary of **[The Movie Database (TMDB)](https://www.themoviedb.org/documentation/api)** endpoints and JSON fields **RiffSync** uses server-side during **catalog reconciliation**. This document is intentionally **credential-free**: API keys live only in **`Secrets Manager` / Lambda env** (**`architecture.server.md`**). Canonical **product flow** stays in **`architecture.catalog-images.md`**.

**Upstream references:** **[Getting started](https://developer.themoviedb.org/docs/getting-started)**, **[Image basics](https://developer.themoviedb.org/docs/image-basics)**, **[API terms](https://www.themoviedb.org/documentation/api/terms-of-use)** (attribution + logo rules).

---

## Base URL & API version

| Constant | Value |
| --- | --- |
| Host | `api.themoviedb.org` |
| Prefix | **`/3`** (TMDB HTTP API **v3**) |
| Base | `https://api.themoviedb.org/3` |

All paths below are relative to **`/3`**.

---

## Authentication (requests from RiffSync → TMDB)

| Mechanism | How |
| --- | --- |
| **Recommended** | HTTP header **`Authorization: Bearer <ACCESS_TOKEN>`** using a **[v4 read-access token](https://developer.themoviedb.org/docs/getting-started)** (or TMDB-supported equivalent your account issues). |

TMDB documents alternative patterns (e.g. **`api_key` query**) in their **[Auth](https://developer.themoviedb.org/docs/authentication-application)** docs. Implementations **must not** bake tokens into repos, markdown, or browsers.

Standard headers for JSON:

- **`accept: application/json`**

---

## Endpoints under contract

### 1. Configuration (image sizes & base URLs)

| Method & path | Use in RiffSync | Query | Primary response paths |
| --- | --- | --- | --- |
| **`GET /configuration`** | Discover **`secure_base_url`** and **allowed** **`poster_sizes`**, **`backdrop_sizes`** for building CDN URLs (**see Image link building**). | none | `images.secure_base_url`, `images.poster_sizes[]`, `images.backdrop_sizes[]` |

Official reference: **[Configuration details](https://developer.themoviedb.org/reference/configuration-details)**.

**Caching policy:** Re-fetch on a **TTL** (e.g. weekly) or on **cold start + in-memory cache** inside the reconcile worker; persistence in **SSM**, **tiny Dynamo**, or Lambda memory is acceptable. The returned size lists occasionally change — **prefer choosing a size present in the array** over hard coding unknown tokens.

---

### 2. Search movies (discovery when **`tmdbMovieId`** is unset)

| Method & path | Use | Query parameters (subset RiffSync uses) | Notes |
| --- | --- | --- | --- |
| **`GET /search/movie`** | Resolve a **`movie_id`** candidate from MST episode **movie title**. | **`query`** (required, UTF-8 title string), **`include_adult`**: `false` (default policy), **`language`**: e.g. `en-US`, **`page`**: `1` unless paginating ambiguity | Responses are **thin** versus movie details — **always** follow with **`GET /movie/{movie_id}`** after choosing an id. |

Official reference: **[Search movies](https://developer.themoviedb.org/reference/search-movie)**.

**Result fields consulted (per hit in `results[]`):**

| TMDB JSON field | Purpose |
| --- | --- |
| **`id`** | Candidate **`movie_id`**. |
| **`title`** | Disambiguation / logging when choosing a hit (not persisted — catalog **`title`** stays curator-owned). |
| **`release_date`** | Optional curator disambiguation (future **`release_year` hint** in catalog). |

**Ambiguity:** If multiple plausible hits, reconcile should **prefer curator lock**, **log**, or persist a **`needsReview`** marker — avoid silent wrong film.

---

### 3. Movie details (authoritative enrichment row)

| Method & path | Use | Path / query | Fields consumed by RiffSync |
| --- | --- | --- | --- |
| **`GET /movie/{movie_id}`** | **Single source** for poster/backdrop paths, **`tagline`**, **`overview`**, **`popularity`**, **`id`** after search or curator pin. Path param **`movie_id`** (integer TMDB **movie** id). Query: **`language`** (e.g. `en-US`); **`append_to_response`** **omitted by default** (keep payloads small). |

Official reference: **[Movie details](https://developer.themoviedb.org/reference/movie-details)**.

**Titles:** TMDB’s **`title`** / **`original_title`** appear on this response but are **not** persisted — the episode display name is the catalog **`title`** already curated for MST; TMDB is only for artwork, tagline, synopsis/popularity, and **`tmdbMovieId`**.

| TMDB JSON field | RiffSync persistence target (conceptual) |
| --- | --- |
| **`id`** | **`tmdbMovieId`** (integer). |
| **`overview`** | **`tmdbOverview`**. |
| **`popularity`** | **`tmdbPopularity`** (number). |
| **`tagline`** | **`tagline`** (aligned with **`data/catalog/catalog.schema.json`** when exported). |
| **`poster_path`** | Raw path + derived **`posterImageUrl`** (**Image link building**). |
| **`backdrop_path`** | Raw path + derived **`backdropImageUrl`**. |

**Null handling:** **`poster_path`**, **`backdrop_path`**, **`tagline`**, **`overview`** may be **`null`** or omitted in edge cases — store **`null`**s, enqueue retry, skip URL build when path missing.

Fields **not required** / **not persisted** by this contract include **`title`**, **`original_title`**, **`production_companies`**, **`casts`**, credits, **`belongs_to_collection`**, **`videos`** — do not depend on them for reconciliation unless you widen the contract deliberately.

---

### 4. Movie images *(optional extended contract)*

| Method & path | Use | When |
| --- | --- | --- |
| **`GET /movie/{movie_id}/images`** | Alternate **`file_path`** for poster/backdrop from **`posters[]`** / **`backdrops[]`**. | Only if product chooses non-default artwork; never use **`logos[]`** as episode art per **`architecture.catalog-images.md`**. |

Official reference (namespace): **[Movie images](https://developer.themoviedb.org/reference/movie-images)**.

Payload entries relevant to URLs generally expose **`file_path`** (+ **`aspect_ratio`**, **`width`/`height`** for picker UX). Resolution rules identical to **`/movie/{id}`** paths — still composed via **`Image link building`**.

---

## Image link building strategy

Goal: deterministic **HTTPS** URLs persisted on catalog rows (**`posterImageUrl`**, **`backdropImageUrl`**) without clients calling TMDB.

### Inputs

| Input | Source |
| --- | --- |
| **`secure_base_url`** | `GET /configuration` → `images.secure_base_url` (prefer over `base_url`; always **HTTPS** in practice). TMDB’s published example ends with **`/t/p/`** (e.g. `https://image.tmdb.org/t/p/`). |
| **`size`** | Literal from **`poster_sizes`** / **`backdrop_sizes`** (e.g. **`w342`**, **`w500`** for posters; **`w780`**, **`w1280`** for backdrops — product choice below). Use **`original`** only when bandwidth/storage policy allows — largest payload. |
| **`file_path`** | From **`GET /movie/{id}`** (or **`images`** subset). TMDB returns a **slash-leading** relative path such as **`/abcdef.jpg`**. May be **`null`** — produce no URL. |

### Composition rule

**Canonical URL:**

```text
<secure_base_url> + <size> + <file_path>
```

Concrete example (token sizes only — use configuration-backed values in implementation):

```text
https://image.tmdb.org/t/p/w500/6FfCtAuVAW8XJjZ7eWeLibRLWTw.jpg
```

Normalization:

1. If **`file_path`** is **`null`** or empty, **omit** **`posterImageUrl`** / **`backdropImageUrl`** (set **`null`** in catalog).
2. Ensure **no duplicated slashes**: `secure_base_url` already ends **`/`**, **`size`** is **no** surrounding slashes (**`w500`**), **`file_path`** begins **`/`**. Final path segment pattern is **`…/t/p/` + `w500` + `/file.jpg`** which TMDB documents as valid.
3. **Do not** re-encode `file_path` beyond what TMDB emits unless your HTTP client demands it — paths are predominantly ASCII.

Official overview: **[Image basics](https://developer.themoviedb.org/docs/image-basics)**.

### RiffSync-recommended defaults (editable)

These are **project defaults**, not TMDB mandates — pick sizes that fit card vs hero layouts.

| Role | Typical **`size`** token | Typical use |
| --- | --- | --- |
| **Poster → catalog cards / grids** | **`w342`** or **`w500`** | Must exist in **`images.poster_sizes`** from **`/configuration`**. **`w185`** thumbnails if bandwidth tight. |
| **Backdrop → wide / hero chrome** | **`w780`** or **`w1280`** | Must exist in **`images.backdrop_sizes`**. **`original`** for marketing-only surfaces. |

**Fallback when configuration fetch fails:** Log and optionally use **documented literals** **`https://image.tmdb.org/t/p/`** plus the same **`w500`** / **`w1280`** tokens (matches historical TMDB CDN layout) — reconcile should **repair** URLs on the **next configuration-backed** run (**`architecture.catalog-images.md`**, broken-link **`HEAD`** pass).

Persist **both** **`tmdbPosterPath`** / **`tmdbBackdropPath`** (raw **`file_path`**) **and** fully resolved **`posterImageUrl`** / **`backdropImageUrl`** in Dynamo where you need offline URL rebuild without re-reading movie rows.

---

## Sync stamp & idempotency

After a successful reconcile write to the catalog row, persist **`tmdbArtworkSyncedAt`** as UTC **`date-time` (RFC 3339)**. Worklist retries should treat missing paths, failed HTTP to TMDB, or **`HEAD`** failure on CDN as **eligible for re-queue**.

---

## Rate limits & errors

- Honor TMDB-documented limits and respond with **bounded concurrency + exponential backoff**. See **[Getting started — rate limiting](https://developer.themoviedb.org/docs/getting-started)**.
- **4xx / 5xx** from TMDB: log **`movie_id`**, status, **safely truncated** response body — never log bearer tokens.

---

## Legal & attribution

RiffSync must comply with **[TMDB API terms](https://www.themoviedb.org/documentation/api/terms-of-use)** — including required **credit** copy and **[logo / branding guidelines](https://developer.themoviedb.org/docs/logo)** surfaced in your app or marketing surfaces as applicable.

---

## Related repository docs

| File | Role |
| --- | --- |
| [`architecture.catalog-images.md`](architecture.catalog-images.md) | Reconcile job wiring, exclusions (no cast headshots/logos galleries), Dynamo columns. |
| [`data/catalog/catalog.schema.json`](../data/catalog/catalog.schema.json) | Git-shaped episode fields (**`tagline`**, **`posterImageUrl`**, **`backdropImageUrl`**, **`tmdbMovieId`**, **`tmdbArtworkSyncedAt`**). |
