# External systems

Outbound and third-party boundaries. Legal posture: **unofficial fan app**; honor each provider’s ToS.

## YouTube (Google)

| Use | Mechanism | Contract |
| --- | --- | --- |
| **Playback (admin)** | **IFrame / IFrame API** on **room admin** client; `videoId` from catalog / room snapshot. | No download/rehost by RiffSync; embed eligibility may change per video—UI handles failures. |
| **Guest viewing** | **WebRTC** **`MediaStream`** subscribed from admin’s capture — signaling via your HTTP/WebSocket stack; optional **STUN/TURN**. | Media path is peer-mediated; honor browser permission and autoplay policies; consider managed **SFU** when mesh insufficient. |
| **Thumbnails (optional)** | **`https://img.youtube.com/vi/{id}/{hqdefault|maxresdefault|…}.jpg`** | Reconcile job **`HEAD`** fallback chain; persist resolved URL on catalog row (**`docs/architecture.catalog-images.md`**). No YouTube Data API required for thumbs. |

## TMDB (The Movie Database)

| Use | Mechanism | Contract |
| --- | --- | --- |
| **Metadata & art** | Server-side **v3** HTTP only; **`docs/contracts.tmdb.md`** is normative. | **No** persistence of TMDB **`title`** / **`original_title`**; catalog **`title`** is curator-owned. Persist **`tagline`**, **`overview`**, **`popularity`**, **`poster_path`/`backdrop_path`** (or resolved URLs), **`tmdbMovieId`**, **`tmdbArtworkSyncedAt`**. |
| **Credentials** | **Secrets Manager** (or env from secret); **never** browser. | Attribution and logo rules per TMDB. |

## Meta (Facebook) — optional

| Use | Mechanism | Contract |
| --- | --- | --- |
| **Viewer login** | **Cognito User Pool** + **Facebook IdP** → JWT to clients. | **Required** to **host**; **optional** for guests who want continuity—must **not** block catalog browse or joining rooms (**`authorization.md`**). |

## AWS (platform)

**Provisioning:** **`AWS CDK`** (TypeScript) — **`cdk deploy`** drives CloudFormation updates. **Lambdas:** **TypeScript** → Node.js bundles. **Prefer serverless** primitives below over always-on compute.

| Service | Role |
| --- | --- |
| **API Gateway v2** | HTTP + WebSocket front door. |
| **Lambda** | Sync handlers + scheduled workers. |
| **DynamoDB** | System of record: catalog, rooms, connections, optional lists/profiles/events. |
| **EventBridge / Scheduler** | Sweeper, TMDB + YouTube thumb reconcile. |
| **Secrets Manager** | TMDB, optional other backend secrets. |
| **CloudWatch** | Metrics, dashboards, logs, alarms (**`docs/architecture.server.md`** Observability). |
| **Cognito** | Optional fan JWT; **separate** staff pool/client for **`/v1/admin/*`**. |
| **ElastiCache** | Optional read-through cache for catalog/lobby. |

## Decisions (answered)

| Question | Decision |
| --- | --- |
| Client calls TMDB? | **No**; only reconcile + **`GET /v1/catalog`**. |
| Record sessions to S3? | **No** MVP — **no** server-side recording of WebRTC as default product posture; future lawful backends remain pluggable. |

## Primary code pointers (optional)

- **`docs/contracts.tmdb.md`**, **`docs/architecture.catalog-images.md`**.
