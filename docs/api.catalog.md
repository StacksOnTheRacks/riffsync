# Catalog HTTP API (draft)

Anonymous **`GET`** routes backed by **DynamoDB** (**`architecture.server.md`**). OpenAPI TBD.

## `GET /v1/catalog`

Query parameters:

| Param | Values | Effect |
| --- | --- | --- |
| **`carousel`** | **`true`** or **`1`** | Response **`entries`** only include rows where **`carousel`** is **`true`** in storage (still sorted by **`experimentNumber`**). Omit for the full catalog. |

Returns a bundle aligned with **`data/catalog/episodes.json`**:

| Field | Type | Notes |
| --- | --- | --- |
| **`version`** | `number` | Currently **`1`** (bundle schema version). |
| **`entries`** | `CatalogEpisode[]` | Sorted by **`experimentNumber`** ascending. |

### `CatalogEpisode`

| Field | Type | Notes |
| --- | --- | --- |
| **`id`** | `string` | Stable slug (partition key in DynamoDB). |
| **`experimentNumber`** | `number` | Classic experiment ordering. |
| **`title`** | `string` | Display title (**not** TMDB `title`). |
| **`era`** | string enum | `joel` \| `mike` \| `jonah` \| `emily` \| `other`. |
| **`youtubeVideoId`** | `string \| null` | |
| **`youtubeWatchUrl`** | `string \| null` | |
| **`tagline`** | `string \| null` | Often filled by reconcile. |
| **`posterImageUrl`** | `string \| null` | |
| **`backdropImageUrl`** | `string \| null` | |
| **`tmdbMovieId`** | `number \| null` | |
| **`tmdbArtworkSyncedAt`** | `string \| null` | ISO-8601 when enrichment last wrote artwork/tagline. |
| **`carousel`** | `boolean` | **`true`** when the row is curated for home carousels; omitted in git seed is stored/fetched as **`false`**. |
| **`tmdbOverview`** | `string \| optional` | Present when reconcile persisted copy (**`architecture.catalog-images.md`**). |
| **`tmdbPopularity`** | `number \| optional` | |
| **`tmdbPosterPath`** | `string \| optional` | Raw TMDB path; **`posterImageUrl`** is the resolved CDN URL when set. |
| **`tmdbBackdropPath`** | `string \| optional` | |

Clients should treat optional / **`null`** enrichment fields as "not yet available."

### Optional SPA hints (not in git seed)

| Field | Type | Notes |
| --- | --- | --- |
| **`embedAllows`** | `boolean` | Operator-writable via admin catalog **POST**/**PATCH**; included on public **`CatalogEpisode`** when stored (especially **`false`**). When **`false`**, SPA should not offer in-app YouTube embed (see **`architecture.frontend.md`**). |
| **`movieSearchTitle`** | `string \| null` | Staff-only TMDB search hint; admin API and staff reads only, not public projection. |
| **`curatorNotes`** | `string \| null` | Staff-only curator notes; admin API and staff reads only, not public projection. |
| **`playbackExpectation`** | `"premium"` \| `"ad_supported"` \| `"unknown"` | Honor-system advisory for **US-P0-07**; not verified server-side. |

## `GET /v1/catalog/{id}`

| Field | Type |
| --- | --- |
| **`entry`** | `CatalogEpisode` |

**`404`** when the **`id`** is unknown.

## HTTP caching (M13)

Public catalog reads use a monotonic **`catalogGeneration`** counter stored on the Catalog table meta row (**`id: "_meta"`**). Admin catalog create, patch, and delete bump the counter after a successful Dynamo write so clients and intermediaries can revalidate without scanning for **`max(updatedAt)`**.

### Response headers

| Header | Rule |
| --- | --- |
| **`ETag`** | Weak validator: **`W/"{generation}-{variant}"`**. Variants: **`full`** (list), **`carousel`** (**`?carousel=true`**), **`episode-{id}`** (single entry). |
| **`Cache-Control`** | **`public, max-age=<seconds>`** — default **60**; Lambda env **`CATALOG_HTTP_MAX_AGE_SECONDS`** (integer, clamped **0–86400**). |

### Conditional requests

Send **`If-None-Match`** with the **`ETag`** from a prior response (weak prefix optional). When the generation and variant match, the API returns **`304 Not Modified`** with an empty body and the same cache headers. List **`304`** avoids a full table **`Scan`**.

After an admin catalog mutation, generation increments; repeat **`GET`** with the old **`If-None-Match`** returns **`200`** and a new **`ETag`**.

### Meta row

| Attribute | Type | Notes |
| --- | --- | --- |
| **`catalogGeneration`** | non-negative integer | Starts at **`1`** on first bump; defaults to **`1`** when the row is absent (pre-M13 tables). |

Reconcile/TMDB batch writers should call the same bump helper when they mutate catalog rows (not wired in the initial M13 slice).

## Infrastructure

- **Table:** **`RiffSyncApi-prod`** stack output **`CatalogTableName`** — PK **`id`** (string). No sort key; list route uses **`Scan`** (see **`infra/cdk/README.md`**). Reserved meta PK **`_meta`** holds **`catalogGeneration`**.
- **Seed:** **`infra/cdk`** → **`npm run seed:catalog -- <CatalogTableName>`** after deploy (validates against **`catalog.schema.json`**).
