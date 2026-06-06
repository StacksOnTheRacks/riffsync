# External systems

Outbound and third-party boundaries. Legal posture: **unofficial fan app**; honor each provider’s ToS.

## YouTube (Google)

| Use | Mechanism | Contract |
| --- | --- | --- |
| **Playback (admin)** | **IFrame / IFrame API** on **room admin** client; `videoId` from catalog / room snapshot. | No download/rehost by RiffSync; embed eligibility may change per video—UI handles failures. |
| **Guest viewing** | **WebRTC** **`MediaStream`** from host tab-capture and, when enabled, **participant A/V** over **self-hosted mediasoup SFU** on **`RiffSyncTurn`** — **`POST /v1/webrtc/sfu-token`** + **coturn**. | **Production** uses SFU; mesh **dev-only**. Multi-producer registry (host screen + N participant cameras/mics). Theater audio mixing is **client-side**. Honor browser permission and autoplay policies. |
| **Thumbnails (optional)** | **`https://img.youtube.com/vi/{id}/{hqdefault|maxresdefault|…}.jpg`** | Reconcile job **`HEAD`** fallback chain; persist resolved URL on catalog row (**`docs/architecture.catalog-images.md`**). No YouTube Data API required for thumbs. |

## TMDB (The Movie Database)

| Use | Mechanism | Contract |
| --- | --- | --- |
| **Metadata & art** | Server-side **v3** HTTP only; **`docs/contracts.tmdb.md`** is normative. | **No** persistence of TMDB **`title`** / **`original_title`**; catalog **`title`** is curator-owned. Persist **`tagline`**, **`overview`**, **`popularity`**, **`poster_path`/`backdrop_path`** (or resolved URLs), **`tmdbMovieId`**, **`tmdbArtworkSyncedAt`**. |
| **Credentials** | **Secrets Manager** (or env from secret); **never** browser. | Attribution and logo rules per TMDB. |

## Giphy

| Use | Mechanism | Contract |
| --- | --- | --- |
| **GIF search & post** | Server-side **Giphy API** via **`GET /v1/giphy/search`** (JWT); chat posts reference **Giphy-hosted** rendition URLs in **`chat_gif`** WebSocket payloads. | **No** Giphy API key in browser; honor **Giphy ToS** and attribution requirements. **No** user-uploaded GIF files to RiffSync storage in this slice. **Operator runbook:** [`docs/operations/giphy.md`](../../docs/operations/giphy.md). |

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
| **Secrets Manager** | TMDB, **Giphy**, optional other backend secrets. |
| **S3** | Catalog assets, **fan avatars** (public HTTPS delivery). |
| **CloudWatch** | Metrics, dashboards, logs, alarms (**`docs/architecture.server.md`** Observability). |
| **Cognito (fan pool)** | **Fan user pool** + public SPA app client: optional **fan JWT** for hosting, **`/v1/fans/*`**, Giphy proxy; **self-sign-up enabled**; **COGNITO-only** IdP in current CDK (Facebook IdP remains **optional** per product—see Meta row). Hosted UI + PKCE; OAuth callback **`/auth/callback`**. Room **host** authority remains **`JWT.sub === room.hostSub`** on **fan** tokens only. |
| **Cognito (staff pool)** | **Separate invite-only staff user pool** + staff SPA app client for **`/v1/admin/*`**: **`selfSignUpEnabled: false`**, **COGNITO-only** (no Facebook IdP), predefined groups **`admin`** / **`curator`**, **second HTTP JWT authorizer** (staff issuer + staff client audience) on the **same HTTP API** as fan routes. Hosted UI + PKCE; OAuth callback **`/admin/auth/callback`** on **same SPA origins** as fan. Staff verification/invite email reuses fan **SES From** (**`noreply@riffsync.tv`**) and shared configuration set. Operator onboarding MVP: **manual console invite** acceptable. |
| **ElastiCache** | Optional read-through cache for catalog/lobby. |
| **EC2 (`RiffSyncTurn`)** | **mediasoup SFU** + **coturn** on shared VPC instances; **`POST /v1/webrtc/sfu-token`** mints HMAC join JWTs; browsers connect **`wss://`** for RTP. Multi-producer rooms replace single **`producersByKind`** slot model. |

## SFU admin teardown (kill switch)

| Topic | Contract |
| --- | --- |
| **Surface** | Internal HTTP on the SFU EC2 process: **`POST /admin/teardown-producers`**. |
| **Auth** | Shared **`SFU_ADMIN_SECRET`** header; bind to loopback or VPC-only callers. |
| **Body** | **`{ env, roomId, producerClass?: "participant_av" }`** — omit **`producerClass`** to tear down all **`participant_av`** producers in the room; **`host_screen`** is never torn down by kill switch. |
| **Caller** | Room **`PATCH`** Lambda after durable **`avDisabled: true`** write (#101 / #102). Idempotent close-by-**`sessionId`** / **`producerId`**. |
| **Failure** | Log + metric; room state remains **`avDisabled`**; token mint denial prevents re-publish. |

## Decisions (answered)

| Question | Decision |
| --- | --- |
| Client calls TMDB? | **No**; only reconcile + **`GET /v1/catalog`**. |
| Record sessions to S3? | **No** MVP — **no** server-side recording of WebRTC as default product posture; future lawful backends remain pluggable. |

## Primary code pointers (optional)

- **`docs/contracts.tmdb.md`**, **`docs/architecture.catalog-images.md`**.
